import * as path from "path";
import type { Entity, TelegramConfig, TelegramIndexEntry } from "./baseTypes";
import { FakeFs } from "./fsAll";
import { httpRequest } from "./http";
import { delay, getFolderLevels } from "./misc";

const TELEGRAM_INDEX_MARKER = "[AXIOM_SYNC_INDEX_V1]";
const TELEGRAM_INDEX_FILENAME = "axiom-sync-index-v1.json";
const TELEGRAM_DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const DEFAULT_TELEGRAM_CONFIG: TelegramConfig = {
  botToken: "",
  chatId: "",
  apiBaseUrl: "https://api.telegram.org",
  remoteBaseDir: "",
  maxUploadBytes: TELEGRAM_DEFAULT_MAX_UPLOAD_BYTES,
  indexMessageId: 0,
  indexByKey: {},
};

interface TelegramApiResp<T> {
  ok: boolean;
  result: T;
  description?: string;
}

interface TelegramUpdateChat {
  id: number;
  type?: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdateEnvelope {
  message?: { chat?: TelegramUpdateChat };
  edited_message?: { chat?: TelegramUpdateChat };
  channel_post?: { chat?: TelegramUpdateChat };
  edited_channel_post?: { chat?: TelegramUpdateChat };
  callback_query?: { message?: { chat?: TelegramUpdateChat } };
}

export interface TelegramChatCandidate {
  id: string;
  label: string;
}

interface TelegramMessage {
  message_id: number;
  caption?: string;
  document?: {
    file_id: string;
    file_size?: number;
  };
}

interface TelegramChat {
  id: number;
  pinned_message?: TelegramMessage;
}

interface TelegramFileInfo {
  file_id: string;
  file_path?: string;
}

interface TelegramRemoteIndex {
  version: 1;
  marker: string;
  generatedAt: number;
  indexByKey: Record<string, TelegramIndexEntry>;
}

const normApiBaseUrl = (apiBaseUrl: string) => {
  let u = (apiBaseUrl ?? "").trim().replace(/\/+$/, "");
  if (u === "") {
    u = "https://api.telegram.org";
  }
  if (!(u.startsWith("https://") || u.startsWith("http://"))) {
    u = `https://${u}`;
  }
  return u;
};

const normalizeRemoteBaseDir = (remoteBaseDir?: string) => {
  let p = path.posix.normalize((remoteBaseDir ?? "").trim());
  if (p === "" || p === "." || p === "/") {
    return "";
  }
  if (p.startsWith("/")) {
    p = p.slice(1);
  }
  if (!p.endsWith("/")) {
    p = `${p}/`;
  }
  return p;
};

const normalizeKey = (key: string, isFolder = false): string => {
  let p = path.posix.normalize((key ?? "").trim());
  if (p.startsWith("/")) {
    p = p.slice(1);
  }
  if (p === "" || p === "." || p === "/") {
    return "";
  }
  if (isFolder && !p.endsWith("/")) {
    p = `${p}/`;
  }
  if (!isFolder && p.endsWith("/")) {
    p = p.slice(0, p.length - 1);
  }
  return p;
};

const isFolderKey = (key: string) => key.endsWith("/");

const shouldRetryStatus = (status: number) => status === 429 || status >= 500;

const getRetryAfterMs = (
  retryAfterFromHeaders: string | null,
  description?: string
) => {
  const fromHeader =
    retryAfterFromHeaders === null
      ? Number.NaN
      : Number.parseFloat(retryAfterFromHeaders);
  if (!Number.isNaN(fromHeader) && fromHeader >= 0) {
    return Math.ceil(fromHeader * 1000);
  }
  const match = (description ?? "").match(/retry after (\d+)/i);
  if (match !== null) {
    const seconds = Number.parseInt(match[1]);
    if (!Number.isNaN(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }
  return undefined;
};

const toUint8Array = (input: string | Uint8Array | ArrayBuffer) => {
  if (typeof input === "string") {
    return new TextEncoder().encode(input);
  }
  if (input instanceof Uint8Array) {
    return input;
  }
  return new Uint8Array(input);
};

const concatUint8Array = (parts: (string | Uint8Array | ArrayBuffer)[]) => {
  const arrays = parts.map((x) => toUint8Array(x));
  const total = arrays.reduce((s, a) => s + a.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.byteLength;
  }
  return merged.buffer;
};

const formDataToMultipart = async (formData: FormData) => {
  const boundary = `----axiom-sync-${Date.now().toString(16)}-${Math.random()
    .toString(16)
    .slice(2)}`;
  const chunks: (string | Uint8Array | ArrayBuffer)[] = [];
  for (const [name, value] of formData.entries()) {
    chunks.push(`--${boundary}\r\n`);
    if (typeof value === "string") {
      chunks.push(
        `Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
      );
      continue;
    }

    const filename = (value as File).name ?? "blob";
    const contentType =
      (value as Blob).type === ""
        ? "application/octet-stream"
        : (value as Blob).type;
    chunks.push(
      `Content-Disposition: form-data; name="${name}"; filename="${filename}"\r\n`
    );
    chunks.push(`Content-Type: ${contentType}\r\n\r\n`);
    chunks.push(await (value as Blob).arrayBuffer());
    chunks.push("\r\n");
  }
  chunks.push(`--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: concatUint8Array(chunks),
  };
};

export const getTelegramChatCandidatesFromUpdates = async (
  botToken: string,
  apiBaseUrl: string
): Promise<TelegramChatCandidate[]> => {
  const token = (botToken ?? "").trim();
  if (token === "") {
    throw Error("telegram: bot token is empty");
  }
  const url = `${normApiBaseUrl(apiBaseUrl)}/bot${token}/getUpdates`;
  let data: TelegramApiResp<TelegramUpdateEnvelope[]>;
  try {
    const rsp = await httpRequest(url, { method: "GET" });
    data = await rsp.json<TelegramApiResp<TelegramUpdateEnvelope[]>>();
    if (!rsp.ok) {
      throw Error(data.description ?? rsp.statusText);
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "network error";
    throw Error(
      `telegram getUpdates request failed: ${message}`
    );
  }
  if (data.ok !== true) {
    throw Error(
      `telegram api getUpdates failed: ${data.description ?? "unknown error"}`
    );
  }

  const chatsMap = new Map<string, TelegramChatCandidate>();
  const addChat = (chat?: TelegramUpdateChat) => {
    if (chat?.id === undefined || chat?.id === null) {
      return;
    }
    const id = `${chat.id}`;
    const title =
      chat.title ||
      [chat.first_name, chat.last_name]
        .filter((x) => !!x)
        .join(" ")
        .trim() ||
      (chat.username ? `@${chat.username}` : "") ||
      "Unknown chat";
    const usernameHint = chat.username ? ` @${chat.username}` : "";
    const typeHint = chat.type ? ` (${chat.type})` : "";
    chatsMap.set(id, {
      id,
      label: `${title}${usernameHint}${typeHint} [${id}]`,
    });
  };

  for (const upd of data.result ?? []) {
    addChat(upd.message?.chat);
    addChat(upd.edited_message?.chat);
    addChat(upd.channel_post?.chat);
    addChat(upd.edited_channel_post?.chat);
    addChat(upd.callback_query?.message?.chat);
  }
  return [...chatsMap.values()];
};

export class FakeFsTelegram extends FakeFs {
  kind: "telegram";
  telegramConfig: TelegramConfig;
  vaultName: string;
  saveUpdatedConfigFunc: () => Promise<void>;

  remoteIndexLoaded: boolean;
  remoteIndexLoadPromise?: Promise<void>;
  remoteIndexDirty: boolean;
  remoteIndexFlushPromise?: Promise<void>;
  remoteIndexFlushTimer?: ReturnType<typeof setTimeout>;
  constructor(
    telegramConfig: TelegramConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<void>
  ) {
    super();
    this.kind = "telegram";
    this.telegramConfig = telegramConfig;
    this.vaultName = vaultName;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.remoteIndexLoaded = false;
    this.remoteIndexDirty = false;
  }

  private getApiBaseUrl() {
    return normApiBaseUrl(this.telegramConfig.apiBaseUrl);
  }

  private getBotToken() {
    const token = (this.telegramConfig.botToken ?? "").trim();
    if (token === "") {
      throw Error("telegram: bot token is empty");
    }
    return token;
  }

  private getChatId() {
    const chatId = (this.telegramConfig.chatId ?? "").trim();
    if (chatId === "") {
      throw Error("telegram: chat id is empty");
    }
    return chatId;
  }

  private getNamespacePrefix() {
    const configured = normalizeRemoteBaseDir(
      this.telegramConfig.remoteBaseDir
    );
    if (configured !== "") {
      return configured;
    }
    return normalizeRemoteBaseDir(this.vaultName);
  }

  private toStoredKey(key: string, isFolder = false) {
    const normalized = normalizeKey(key, isFolder);
    if (normalized === "") {
      return "";
    }
    return `${this.getNamespacePrefix()}${normalized}`;
  }

  private fromStoredKey(storedKey: string) {
    const prefix = this.getNamespacePrefix();
    if (prefix === "") {
      return storedKey;
    }
    if (!storedKey.startsWith(prefix)) {
      return undefined;
    }
    return storedKey.slice(prefix.length);
  }

  private getMaxUploadBytes() {
    const configured = this.telegramConfig.maxUploadBytes;
    if (configured === undefined || configured <= 0) {
      return TELEGRAM_DEFAULT_MAX_UPLOAD_BYTES;
    }
    return configured;
  }

  private async callApi<T>(
    method: string,
    initFactory?: () => RequestInit
  ): Promise<TelegramApiResp<T>> {
    const token = this.getBotToken();
    const url = `${this.getApiBaseUrl()}/bot${token}/${method}`;
    const retryMs = [0, 1000, 2000, 4000, 8000];

    let lastError: Error | undefined;
    for (let idx = 0; idx < retryMs.length; ++idx) {
      if (idx !== 0) {
        await delay(retryMs[idx]);
      }

      try {
        const init = initFactory?.() ?? {};
        let status = 0;
        let data: TelegramApiResp<T> | undefined = undefined;
        let retryAfterHeader: string | null = null;
        let body = init.body;
        let contentType: string | undefined;
        let headers: Record<string, string> | undefined;
        if (init.headers instanceof Headers) {
          headers = Object.fromEntries(init.headers.entries());
        } else if (Array.isArray(init.headers)) {
          headers = Object.fromEntries(init.headers);
        } else if (init.headers !== undefined) {
          headers = Object.fromEntries(
            Object.entries(init.headers).map(([k, v]) => [k, String(v)])
          );
        }
        contentType = headers?.["content-type"] ?? headers?.["Content-Type"];
        if (
          body instanceof FormData &&
          globalThis.__axiomSyncRequestUrl !== undefined
        ) {
          const transformed = await formDataToMultipart(body);
          body = transformed.body;
          contentType = transformed.contentType;
        }
        const rsp = await httpRequest(url, {
          method: init.method,
          headers,
          body:
            body instanceof ArrayBuffer ||
            body instanceof FormData ||
            typeof body === "string"
              ? body
              : body instanceof Uint8Array
                ? body
                : undefined,
          contentType,
        });
        status = rsp.status;
        retryAfterHeader = rsp.headers["retry-after"] ?? null;
        try {
          data = await rsp.json<TelegramApiResp<T>>();
        } catch {
          data = undefined;
        }

        if (status >= 200 && status < 300 && data?.ok === true) {
          return data;
        }

        if (shouldRetryStatus(status)) {
          const extraWait = getRetryAfterMs(
            retryAfterHeader,
            data?.description
          );
          if (extraWait !== undefined) {
            await delay(extraWait);
          }
          lastError = Error(
            `telegram api ${method} failed: ${
              data?.description ?? `status ${status}`
            }`
          );
          continue;
        }

        throw Error(
          `telegram api ${method} failed: ${
            data?.description ?? `status ${status}`
          }`
        );
      } catch (e: unknown) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }

    throw lastError ?? Error(`telegram api ${method} failed`);
  }

  private async getBinaryByUrl(url: string): Promise<ArrayBuffer> {
    const retryMs = [0, 1000, 2000, 4000, 8000];
    let lastError: Error | undefined;

    for (let idx = 0; idx < retryMs.length; ++idx) {
      if (idx !== 0) {
        await delay(retryMs[idx]);
      }
      try {
        const rsp = await httpRequest(url, { method: "GET" });
        if (rsp.ok) {
          return await rsp.arrayBuffer();
        }
        if (shouldRetryStatus(rsp.status)) {
          const extraWait = getRetryAfterMs(rsp.headers["retry-after"] ?? null);
          if (extraWait !== undefined) {
            await delay(extraWait);
          }
          lastError = Error(`telegram download failed: ${rsp.status}`);
          continue;
        }
        throw Error(`telegram download failed: ${rsp.status}`);
      } catch (e: unknown) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
    throw lastError ?? Error(`telegram download failed`);
  }

  private buildEntityFromEntry(entry: TelegramIndexEntry): Entity {
    if (entry.kind === "folder" || isFolderKey(entry.key)) {
      const folderKey = normalizeKey(entry.key, true);
      return {
        key: folderKey,
        keyRaw: folderKey,
        mtimeCli: entry.mtimeCli,
        mtimeSvr: entry.mtimeCli,
        ctimeCli: entry.ctimeCli,
        size: 0,
        sizeRaw: 0,
      };
    }
    const fileKey = normalizeKey(entry.key, false);
    return {
      key: fileKey,
      keyRaw: fileKey,
      mtimeCli: entry.mtimeCli,
      mtimeSvr: entry.mtimeCli,
      ctimeCli: entry.ctimeCli,
      size: entry.sizeRaw,
      sizeRaw: entry.sizeRaw,
    };
  }

  private getEntriesForCurrentNamespace() {
    const filtered: TelegramIndexEntry[] = [];
    for (const [storedKey, value] of Object.entries(
      this.telegramConfig.indexByKey ?? {}
    )) {
      const localKey = this.fromStoredKey(storedKey);
      if (localKey === undefined || localKey === "") {
        continue;
      }
      filtered.push({
        ...value,
        key: localKey,
      });
    }
    return filtered;
  }

  private async tryLoadRemoteIndexFromPinnedMessage() {
    const chatId = this.getChatId();
    const chatRsp = await this.callApi<TelegramChat>("getChat", () => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
      }),
    }));

    const pinned = chatRsp.result.pinned_message;
    if (
      pinned === undefined ||
      pinned.document?.file_id === undefined ||
      pinned.caption?.startsWith(TELEGRAM_INDEX_MARKER) !== true
    ) {
      return;
    }

    const fileRsp = await this.callApi<TelegramFileInfo>("getFile", () => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        file_id: pinned.document!.file_id,
      }),
    }));
    if (fileRsp.result.file_path === undefined) {
      throw Error("telegram: no file_path in getFile response");
    }
    const token = this.getBotToken();
    const fileUrl = `${this.getApiBaseUrl()}/file/bot${token}/${
      fileRsp.result.file_path
    }`;
    const fileContent = await this.getBinaryByUrl(fileUrl);
    const payloadRaw = new TextDecoder().decode(fileContent);
    const payload = JSON.parse(payloadRaw) as TelegramRemoteIndex;
    if (payload.marker !== TELEGRAM_INDEX_MARKER || payload.version !== 1) {
      throw Error("telegram: remote index format is unsupported");
    }

    this.telegramConfig.indexByKey = Object.assign(
      {},
      this.telegramConfig.indexByKey,
      payload.indexByKey ?? {}
    );
    this.telegramConfig.indexMessageId = pinned.message_id;
    await this.saveUpdatedConfigFunc();
  }

  private scheduleRemoteIndexFlush() {
    if (this.remoteIndexFlushTimer !== undefined) {
      globalThis.clearTimeout(this.remoteIndexFlushTimer);
      this.remoteIndexFlushTimer = undefined;
    }
    this.remoteIndexFlushTimer = globalThis.setTimeout(() => {
      this.remoteIndexFlushTimer = undefined;
      void this.flushRemoteIndexNow();
    }, 1500);
  }

  private async ensureRemoteIndexLoaded() {
    if (this.remoteIndexLoaded) {
      return;
    }
    if (this.remoteIndexLoadPromise !== undefined) {
      await this.remoteIndexLoadPromise;
      return;
    }
    this.remoteIndexLoadPromise = (async () => {
      await this.tryLoadRemoteIndexFromPinnedMessage();
      this.remoteIndexLoaded = true;
    })();
    await this.remoteIndexLoadPromise;
  }

  private async flushRemoteIndexNow() {
    if (!this.remoteIndexDirty) {
      return;
    }
    if (this.remoteIndexFlushPromise !== undefined) {
      await this.remoteIndexFlushPromise;
      return;
    }

    this.remoteIndexFlushPromise = (async () => {
      const payload: TelegramRemoteIndex = {
        version: 1,
        marker: TELEGRAM_INDEX_MARKER,
        generatedAt: Date.now(),
        indexByKey: this.telegramConfig.indexByKey,
      };
      const chatId = this.getChatId();
      const body = JSON.stringify(payload);
      const oldMessageId = this.telegramConfig.indexMessageId ?? 0;

      const sent = await this.callApi<TelegramMessage>("sendDocument", () => {
        const formData = new FormData();
        formData.append("chat_id", chatId);
        formData.append("caption", TELEGRAM_INDEX_MARKER);
        formData.append(
          "document",
          new Blob([body], { type: "application/json" }),
          TELEGRAM_INDEX_FILENAME
        );
        return {
          method: "POST",
          body: formData,
        };
      });

      const newMessageId = sent.result.message_id;
      this.telegramConfig.indexMessageId = newMessageId;
      this.remoteIndexDirty = false;

      try {
        await this.callApi<boolean>("pinChatMessage", () => ({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: newMessageId,
            disable_notification: true,
          }),
        }));
      } catch (e) {
        console.warn("telegram: pinChatMessage failed", e);
      }

      if (oldMessageId > 0 && oldMessageId !== newMessageId) {
        try {
          await this.callApi<boolean>("deleteMessage", () => ({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: oldMessageId,
            }),
          }));
        } catch (e) {
          console.warn("telegram: old index cleanup failed", e);
        }
      }
      await this.saveUpdatedConfigFunc();
    })();

    try {
      await this.remoteIndexFlushPromise;
    } finally {
      this.remoteIndexFlushPromise = undefined;
    }
  }

  private async saveIndex() {
    this.remoteIndexDirty = true;
    await this.saveUpdatedConfigFunc();
    this.scheduleRemoteIndexFlush();
  }

  async walk(): Promise<Entity[]> {
    await this.ensureRemoteIndexLoaded();

    const rawEntries = this.getEntriesForCurrentNamespace();
    const entities: Entity[] = [];
    const folderSet = new Set<string>();

    for (const entry of rawEntries) {
      if (entry.kind === "folder" || isFolderKey(entry.key)) {
        const key = normalizeKey(entry.key, true);
        folderSet.add(key);
        entities.push({
          key: key,
          keyRaw: key,
          size: 0,
          sizeRaw: 0,
        });
      } else {
        const key = normalizeKey(entry.key, false);
        for (const folder of getFolderLevels(key, true)) {
          folderSet.add(folder);
        }
        entities.push(this.buildEntityFromEntry({ ...entry, key }));
      }
    }

    for (const folder of folderSet) {
      if (!entities.some((e) => e.keyRaw === folder)) {
        entities.push({
          key: folder,
          keyRaw: folder,
          size: 0,
          sizeRaw: 0,
          synthesizedFolder: true,
        });
      }
    }

    entities.sort((a, b) => a.keyRaw.localeCompare(b.keyRaw));
    return entities;
  }

  walkPartial(): Promise<Entity[]> {
    return this.walk();
  }

  async stat(key: string): Promise<Entity> {
    await this.ensureRemoteIndexLoaded();

    const folder = isFolderKey(key);
    const normalized = normalizeKey(key, folder);
    const storedKey = this.toStoredKey(normalized, folder);
    const record = this.telegramConfig.indexByKey[storedKey];
    if (record !== undefined) {
      return this.buildEntityFromEntry({ ...record, key: normalized });
    }
    if (folder) {
      const hasChild = Object.keys(this.telegramConfig.indexByKey).some((k) =>
        k.startsWith(storedKey)
      );
      if (hasChild) {
        return {
          key: normalized,
          keyRaw: normalized,
          size: 0,
          sizeRaw: 0,
          synthesizedFolder: true,
        };
      }
    }
    throw Error(`telegram: key not found: ${key}`);
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    await this.ensureRemoteIndexLoaded();

    const normalized = normalizeKey(key, true);
    const storedKey = this.toStoredKey(normalized, true);
    this.telegramConfig.indexByKey[storedKey] = {
      key: normalized,
      kind: "folder",
      sizeRaw: 0,
      mtimeCli: mtime,
      ctimeCli: ctime,
    };
    await this.saveIndex();
    return await this.stat(normalized);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    await this.ensureRemoteIndexLoaded();

    const maxUploadBytes = this.getMaxUploadBytes();
    if (content.byteLength > maxUploadBytes) {
      throw Error(
        `telegram: file too large (${content.byteLength} bytes), limit is ${maxUploadBytes} bytes`
      );
    }

    const normalized = normalizeKey(key, false);
    const storedKey = this.toStoredKey(normalized, false);
    const chatId = this.getChatId();

    const resp = await this.callApi<TelegramMessage>("sendDocument", () => {
      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append(
        "document",
        new Blob([content]),
        path.posix.basename(key)
      );
      return {
        method: "POST",
        body: formData,
      };
    });

    this.telegramConfig.indexByKey[storedKey] = {
      key: normalized,
      kind: "file",
      sizeRaw: content.byteLength,
      mtimeCli: mtime,
      ctimeCli: ctime,
      messageId: resp.result.message_id,
      fileId: resp.result.document?.file_id,
    };
    await this.saveIndex();
    return await this.stat(normalized);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this.ensureRemoteIndexLoaded();

    const normalized = normalizeKey(key, false);
    const storedKey = this.toStoredKey(normalized, false);
    const record = this.telegramConfig.indexByKey[storedKey];
    if (record === undefined || record.fileId === undefined) {
      throw Error(`telegram: file not found in index: ${key}`);
    }

    const fileResp = await this.callApi<TelegramFileInfo>("getFile", () => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        file_id: record.fileId,
      }),
    }));
    if (fileResp.result.file_path === undefined) {
      throw Error("telegram: no file_path in getFile response");
    }

    const token = this.getBotToken();
    const fileUrl = `${this.getApiBaseUrl()}/file/bot${token}/${
      fileResp.result.file_path
    }`;
    return await this.getBinaryByUrl(fileUrl);
  }

  async rename(key1: string, key2: string): Promise<void> {
    await this.ensureRemoteIndexLoaded();

    const k1Folder = isFolderKey(key1);
    const normalized1 = normalizeKey(key1, k1Folder);
    const normalized2 = normalizeKey(key2, k1Folder);
    if (k1Folder) {
      const stored1 = this.toStoredKey(normalized1, true);
      const stored2 = this.toStoredKey(normalized2, true);
      const moved: Record<string, TelegramIndexEntry> = {};

      for (const [storedKey, value] of Object.entries(
        this.telegramConfig.indexByKey
      )) {
        if (storedKey === stored1 || storedKey.startsWith(stored1)) {
          const suffix = storedKey.slice(stored1.length);
          const nextKey = `${stored2}${suffix}`;
          const localKey = this.fromStoredKey(nextKey);
          if (localKey !== undefined && localKey !== "") {
            moved[nextKey] = {
              ...value,
              key: localKey,
            };
          }
          delete this.telegramConfig.indexByKey[storedKey];
        }
      }
      Object.assign(this.telegramConfig.indexByKey, moved);
      await this.saveIndex();
      return;
    }

    const source = await this.readFile(normalized1);
    const sourceMeta = await this.stat(normalized1);
    await this.writeFile(
      normalized2,
      source,
      sourceMeta.mtimeCli ?? Date.now(),
      sourceMeta.ctimeCli ?? Date.now()
    );
    await this.rm(normalized1);
  }

  async rm(key: string): Promise<void> {
    await this.ensureRemoteIndexLoaded();

    const folder = isFolderKey(key);
    const normalized = normalizeKey(key, folder);
    const storedKey = this.toStoredKey(normalized, folder);
    const toDelete = new Set<string>();

    if (folder) {
      for (const k of Object.keys(this.telegramConfig.indexByKey)) {
        if (k === storedKey || k.startsWith(storedKey)) {
          toDelete.add(k);
        }
      }
    } else {
      toDelete.add(storedKey);
    }

    const chatId = this.getChatId();
    for (const k of toDelete) {
      const v = this.telegramConfig.indexByKey[k];
      if (v?.messageId !== undefined) {
        try {
          await this.callApi<boolean>("deleteMessage", () => ({
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: v.messageId,
            }),
          }));
        } catch (e) {
          console.warn(`telegram: deleteMessage failed for ${k}`, e);
        }
      }
      delete this.telegramConfig.indexByKey[k];
    }
    await this.saveIndex();
  }

  async checkConnect(callbackFunc?: (error: unknown) => void): Promise<boolean> {
    try {
      await this.callApi<{ id: number; username?: string }>("getMe");
      await this.ensureRemoteIndexLoaded();
      return true;
    } catch (err) {
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName(): Promise<string> {
    const rsp = await this.callApi<{ username?: string; first_name?: string }>(
      "getMe"
    );
    return rsp.result.username || rsp.result.first_name || "telegram-bot";
  }

  revokeAuth(): Promise<void> {
    return Promise.resolve();
  }

  allowEmptyFile(): boolean {
    return false;
  }
}

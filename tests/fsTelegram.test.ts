import { strict as assert } from "assert";
import type { TelegramConfig } from "../src/baseTypes";
import { DEFAULT_TELEGRAM_CONFIG, FakeFsTelegram } from "../src/fsTelegram";

interface StoredMessage {
  messageId: number;
  chatId: string;
  caption?: string;
  fileId?: string;
  filePath?: string;
  bytes?: ArrayBuffer;
  deleted: boolean;
}

class TelegramMockServer {
  token: string;
  nextMessageId: number;
  nextFileId: number;
  pinnedMessageId: number;
  messages: Map<number, StoredMessage>;
  failNextSendDocument429: number;

  constructor(token: string) {
    this.token = token;
    this.nextMessageId = 1;
    this.nextFileId = 1;
    this.pinnedMessageId = 0;
    this.messages = new Map<number, StoredMessage>();
    this.failNextSendDocument429 = 0;
  }

  private json(status: number, body: any) {
    return new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
      },
    });
  }

  private async parseJsonBody(init?: RequestInit) {
    const body = (init?.body ?? "") as string;
    if (body === "") {
      return {};
    }
    return JSON.parse(body);
  }

  async fetch(urlRaw: string, init?: RequestInit): Promise<Response> {
    const url = new URL(urlRaw);

    const filePrefix = `/file/bot${this.token}/`;
    if (url.pathname.startsWith(filePrefix)) {
      const filePath = url.pathname.slice(filePrefix.length);
      const found = [...this.messages.values()].find(
        (m) => m.filePath === filePath && !m.deleted
      );
      if (found?.bytes === undefined) {
        return new Response("not found", { status: 404 });
      }
      return new Response(found.bytes, { status: 200 });
    }

    const botPrefix = `/bot${this.token}/`;
    if (!url.pathname.startsWith(botPrefix)) {
      return this.json(404, { ok: false, description: "unknown path" });
    }

    const method = url.pathname.slice(botPrefix.length);
    if (method === "getMe") {
      return this.json(200, {
        ok: true,
        result: {
          id: 123456,
          username: "mock_bot",
        },
      });
    }

    if (method === "getChat") {
      const pinned = this.messages.get(this.pinnedMessageId);
      return this.json(200, {
        ok: true,
        result: {
          id: 1,
          pinned_message:
            pinned === undefined || pinned.deleted
              ? undefined
              : {
                  message_id: pinned.messageId,
                  caption: pinned.caption,
                  document:
                    pinned.fileId === undefined
                      ? undefined
                      : {
                          file_id: pinned.fileId,
                        },
                },
        },
      });
    }

    if (method === "sendDocument") {
      if (this.failNextSendDocument429 > 0) {
        this.failNextSendDocument429 -= 1;
        return this.json(429, {
          ok: false,
          description: "Too Many Requests: retry after 0",
        });
      }

      const form = init?.body as FormData;
      const chatId = `${form.get("chat_id") ?? ""}`;
      const caption = `${form.get("caption") ?? ""}` || undefined;
      const document = form.get("document") as Blob;
      const bytes = await document.arrayBuffer();
      const fileId = `file_${this.nextFileId++}`;
      const filePath = `docs/${fileId}.bin`;
      const messageId = this.nextMessageId++;

      this.messages.set(messageId, {
        messageId,
        chatId,
        caption,
        fileId,
        filePath,
        bytes,
        deleted: false,
      });

      return this.json(200, {
        ok: true,
        result: {
          message_id: messageId,
          document: {
            file_id: fileId,
            file_size: bytes.byteLength,
          },
        },
      });
    }

    if (method === "getFile") {
      const payload = await this.parseJsonBody(init);
      const fileId = payload.file_id as string;
      const found = [...this.messages.values()].find(
        (m) => m.fileId === fileId && !m.deleted
      );
      if (found?.filePath === undefined) {
        return this.json(404, { ok: false, description: "file not found" });
      }
      return this.json(200, {
        ok: true,
        result: {
          file_id: fileId,
          file_path: found.filePath,
        },
      });
    }

    if (method === "deleteMessage") {
      const payload = await this.parseJsonBody(init);
      const messageId = payload.message_id as number;
      const found = this.messages.get(messageId);
      if (found !== undefined) {
        found.deleted = true;
      }
      if (this.pinnedMessageId === messageId) {
        this.pinnedMessageId = 0;
      }
      return this.json(200, { ok: true, result: true });
    }

    if (method === "pinChatMessage") {
      const payload = await this.parseJsonBody(init);
      const messageId = payload.message_id as number;
      this.pinnedMessageId = messageId;
      return this.json(200, { ok: true, result: true });
    }

    return this.json(404, { ok: false, description: "unknown method" });
  }
}

const createTelegramConfig = (): TelegramConfig => ({
  ...DEFAULT_TELEGRAM_CONFIG,
  botToken: "token-1",
  chatId: "12345",
  indexByKey: {},
});

describe("fsTelegram adapter", function () {
  this.timeout(15000);

  let originalFetch: typeof fetch | undefined = undefined;
  let server: TelegramMockServer;

  beforeEach(() => {
    originalFetch = global.fetch;
    server = new TelegramMockServer("token-1");
    global.fetch = server.fetch.bind(server) as any;
  });

  afterEach(() => {
    if (originalFetch !== undefined) {
      global.fetch = originalFetch;
    }
  });

  it("supports write/walk/read/rename/rm with remote index for cross-device", async () => {
    const cfg1 = createTelegramConfig();
    const fs1 = new FakeFsTelegram(cfg1, "vault-a", async () => {});

    const originalText = "hello telegram";
    const content = new TextEncoder().encode(originalText).buffer;
    await fs1.writeFile("a.txt", content, 1, 1);
    await (fs1 as any).flushRemoteIndexNow();

    const cfg2 = createTelegramConfig();
    const fs2 = new FakeFsTelegram(cfg2, "vault-a", async () => {});

    const listed = await fs2.walk();
    assert.ok(listed.some((x) => x.keyRaw === "a.txt"));

    const loaded = await fs2.readFile("a.txt");
    assert.equal(new TextDecoder().decode(loaded), originalText);

    await fs2.rename("a.txt", "dir/b.txt");
    await (fs2 as any).flushRemoteIndexNow();

    const cfg3 = createTelegramConfig();
    const fs3 = new FakeFsTelegram(cfg3, "vault-a", async () => {});
    const listedAfterRename = await fs3.walk();
    assert.ok(listedAfterRename.some((x) => x.keyRaw === "dir/b.txt"));
    assert.ok(listedAfterRename.some((x) => x.keyRaw === "dir/"));

    await fs3.rm("dir/");
    await (fs3 as any).flushRemoteIndexNow();

    const cfg4 = createTelegramConfig();
    const fs4 = new FakeFsTelegram(cfg4, "vault-a", async () => {});
    const listedAfterDelete = await fs4.walk();
    assert.ok(!listedAfterDelete.some((x) => x.keyRaw === "dir/b.txt"));
  });

  it("rejects files larger than configured maxUploadBytes", async () => {
    const cfg = createTelegramConfig();
    cfg.maxUploadBytes = 5;
    const fs = new FakeFsTelegram(cfg, "vault-a", async () => {});

    const tooLarge = new TextEncoder().encode("123456").buffer;
    await assert.rejects(
      async () => await fs.writeFile("large.bin", tooLarge, 1, 1),
      /file too large/
    );
  });

  it("retries sendDocument on 429 rate-limit", async () => {
    server.failNextSendDocument429 = 1;
    const cfg = createTelegramConfig();
    const fs = new FakeFsTelegram(cfg, "vault-a", async () => {});
    const content = new TextEncoder().encode("retry").buffer;
    const written = await fs.writeFile("retry.txt", content, 1, 1);
    assert.equal(written.keyRaw, "retry.txt");
  });
});

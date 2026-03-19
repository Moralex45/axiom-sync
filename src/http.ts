import type { RequestUrlParam } from "obsidian";
import { headersToRecord } from "./misc";

type NativeFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: BodyInit | null;
  }
) => Promise<Response>;

type RequestUrlFn = (request: RequestUrlParam) => Promise<{
  status: number;
  text: string;
  json?: unknown;
  arrayBuffer: ArrayBuffer;
  headers: Record<string, string>;
}>;

declare global {
  var __axiomSyncRequestUrl: RequestUrlFn | undefined;
}

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | FormData;
  contentType?: string;
}

export interface HttpResponseLike {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

const getNativeFetch = (): NativeFetch | undefined => {
  const candidate = Reflect.get(globalThis, "fetch");
  if (typeof candidate !== "function") {
    return undefined;
  }
  return (candidate as NativeFetch).bind(globalThis);
};

const getInjectedRequestUrl = (): RequestUrlFn | undefined => {
  return globalThis.__axiomSyncRequestUrl;
};

const toBodyInit = (body: HttpRequestOptions["body"]): BodyInit | null => {
  if (body === undefined) {
    return null;
  }
  if (body instanceof Uint8Array) {
    return body as unknown as BodyInit;
  }
  return body;
};

const toArrayBuffer = (body: Uint8Array): ArrayBuffer => {
  const copied = new Uint8Array(body.byteLength);
  copied.set(body);
  return copied.buffer;
};

export const httpRequest = async (
  url: string,
  options: HttpRequestOptions = {}
): Promise<HttpResponseLike> => {
  if (options.body instanceof FormData) {
    const nativeFetch = getNativeFetch();
    if (nativeFetch === undefined) {
      throw new Error("FormData requests require fetch support");
    }
    const fallback = await nativeFetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    });
    return {
      ok: fallback.ok,
      status: fallback.status,
      statusText: fallback.statusText,
      headers: headersToRecord(fallback.headers),
      text: async () => fallback.text(),
      json: async <T>() => fallback.json() as Promise<T>,
      arrayBuffer: async () => fallback.arrayBuffer(),
    };
  }

  const request: RequestUrlParam = {
    url,
    method: options.method,
    headers: options.headers,
    contentType: options.contentType,
    body:
      options.body instanceof Uint8Array
        ? toArrayBuffer(options.body)
        : options.body,
  };

  try {
    const requestUrl = getInjectedRequestUrl();
    if (requestUrl === undefined) {
      throw new Error("requestUrl is unavailable");
    }
    const response = await requestUrl(request);
    const responseText = response.text;
    const responseBuffer = response.arrayBuffer;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: `${response.status}`,
      headers: response.headers ?? {},
      text: async () => responseText,
      json: async <T>() => {
        if (response.json !== undefined) {
          return response.json as T;
        }
        return JSON.parse(responseText) as T;
      },
      arrayBuffer: async () => responseBuffer,
    };
  } catch (error) {
    const nativeFetch = getNativeFetch();
    if (nativeFetch === undefined) {
      throw error;
    }

    const fallback = await nativeFetch(url, {
      method: options.method,
      headers: options.headers,
      body: toBodyInit(options.body),
    });
    return {
      ok: fallback.ok,
      status: fallback.status,
      statusText: fallback.statusText,
      headers: headersToRecord(fallback.headers),
      text: async () => fallback.text(),
      json: async <T>() => fallback.json() as Promise<T>,
      arrayBuffer: async () => fallback.arrayBuffer(),
    };
  }
};

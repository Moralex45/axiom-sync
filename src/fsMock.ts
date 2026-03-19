import type { Entity } from "./baseTypes";
import { type ErrorCallback, FakeFs } from "./fsAll";

export class FakeFsMock extends FakeFs {
  kind: "mock";

  constructor() {
    super();
    this.kind = "mock";
  }

  walk(): Promise<Entity[]> {
    return Promise.reject(new Error("Method not implemented."));
  }

  walkPartial(): Promise<Entity[]> {
    return this.walk();
  }

  stat(_key: string): Promise<Entity> {
    return Promise.reject(new Error("Method not implemented."));
  }

  mkdir(_key: string, _mtime: number, _ctime: number): Promise<Entity> {
    return Promise.reject(new Error("Method not implemented."));
  }

  writeFile(
    _key: string,
    _content: ArrayBuffer,
    _mtime: number,
    _ctime: number
  ): Promise<Entity> {
    return Promise.reject(new Error("Method not implemented."));
  }

  readFile(_key: string): Promise<ArrayBuffer> {
    return Promise.reject(new Error("Method not implemented."));
  }

  rename(_key1: string, _key2: string): Promise<void> {
    return Promise.reject(new Error("Method not implemented."));
  }

  rm(_key: string): Promise<void> {
    return Promise.reject(new Error("Method not implemented."));
  }

  checkConnect(callbackFunc?: ErrorCallback): Promise<boolean> {
    return this.checkConnectCommonOps(callbackFunc);
  }

  getUserDisplayName(): Promise<string> {
    return Promise.reject(new Error("Method not implemented."));
  }

  revokeAuth(): Promise<void> {
    return Promise.reject(new Error("Method not implemented."));
  }

  allowEmptyFile(): boolean {
    throw new Error("Method not implemented.");
  }
}

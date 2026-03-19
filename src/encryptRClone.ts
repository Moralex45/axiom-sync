import {
  Cipher as CipherRCloneCryptPack,
  encryptedSize,
} from "@fyears/rclone-crypt";

// @ts-ignore
import EncryptWorker from "./encryptRClone.worker";

interface RecvMsg {
  status: "ok" | "error";
  outputName?: string;
  outputContent?: ArrayBuffer;
  error?: unknown;
}

const getWorkerErrorMessage = (op: string, err: unknown) => {
  if (err instanceof Error && err.message !== "") {
    return `${op}: ${err.message}`;
  }
  if (typeof err === "string" && err.trim() !== "") {
    return `${op}: ${err}`;
  }
  if (err !== undefined) {
    try {
      const text = JSON.stringify(err);
      if (text !== undefined && text !== "{}" && text !== "null") {
        return `${op}: ${text}`;
      }
    } catch {
      // ignore and fallback below
    }
    return `${op}: ${Object.prototype.toString.call(err)}`;
  }
  return `${op}: worker returned unknown error`;
};

export const getSizeFromOrigToEnc = encryptedSize;

export class CipherRclone {
  readonly password: string;
  readonly cipher: CipherRCloneCryptPack;
  readonly workers: Worker[];
  init: boolean;
  workerIdx: number;
  constructor(password: string, workerNum: number) {
    this.password = password;
    this.init = false;
    this.workerIdx = 0;

    // console.debug("begin creating CipherRCloneCryptPack");
    this.cipher = new CipherRCloneCryptPack("base64");
    // console.debug("finish creating CipherRCloneCryptPack");

    // console.debug("begin creating EncryptWorker");
    this.workers = [];
    for (let i = 0; i < workerNum; ++i) {
      this.workers.push(new (EncryptWorker as new () => Worker)());
    }

    // console.debug("finish creating EncryptWorker");
  }

  closeResources() {
    for (let i = 0; i < this.workers.length; ++i) {
      this.workers[i].terminate();
    }
  }

  async prepareByCallingWorker(): Promise<void> {
    if (this.init) {
      return;
    }
    // console.debug("begin prepareByCallingWorker");
    await this.cipher.key(this.password, "");
    // console.debug("finish getting key");

    const res: Promise<void>[] = [];
    for (let i = 0; i < this.workers.length; ++i) {
      res.push(
        new Promise((resolve, reject) => {
          const channel = new MessageChannel();

          channel.port2.onmessage = (event) => {
            // console.debug("main: receiving msg in prepare");
            const { status, error } = event.data as RecvMsg;
            if (status === "ok") {
              // console.debug("main: receiving init ok in prepare");
              this.init = true;
              resolve(); // return the class object itself
            } else {
              reject(new Error(getWorkerErrorMessage("prepare", error)));
            }
          };

          channel.port2.onmessageerror = (event) => {
            // console.debug("main: receiving error in prepare");
            reject(new Error(`prepare message error: ${event.type}`));
          };

          // console.debug("main: before postMessage in prepare");
          this.workers[i].postMessage(
            {
              action: "prepare",
              dataKeyBuf: this.cipher.dataKey.buffer,
              nameKeyBuf: this.cipher.nameKey.buffer,
              nameTweakBuf: this.cipher.nameTweak.buffer,
            },
            [channel.port1 /* buffer no transfered because we need to copy */]
          );
        })
      );
    }
    await Promise.all(res);
  }

  async encryptNameByCallingWorker(inputName: string): Promise<string> {
    // console.debug("main: start encryptNameByCallingWorker");
    await this.prepareByCallingWorker();
    // console.debug(
    //   "main: really start generate promise in encryptNameByCallingWorker"
    // );
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in encryptNameByCallingWorker");
        const { outputName, status, error } = event.data as RecvMsg;
        if (status === "error") {
          reject(new Error(getWorkerErrorMessage("encryptName", error)));
          return;
        }
        if (outputName === undefined) {
          reject(
            new Error("encryptNameByCallingWorker: outputName is undefined")
          );
        } else {
          resolve(outputName);
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in encryptNameByCallingWorker");
        reject(new Error(`encryptName message error: ${event.type}`));
      };

      // console.debug("main: before postMessage in encryptNameByCallingWorker");
      this.workers[whichWorker].postMessage(
        {
          action: "encryptName",
          inputName: inputName,
        },
        [channel.port1]
      );
    });
  }

  async decryptNameByCallingWorker(inputName: string): Promise<string> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in decryptNameByCallingWorker");
        const { outputName, status, error } = event.data as RecvMsg;

        if (status === "error") {
          reject(new Error(getWorkerErrorMessage("decryptName", error)));
        } else {
          if (outputName === undefined) {
            reject(
              new Error("decryptNameByCallingWorker: outputName is undefined")
            );
          } else {
            resolve(outputName);
          }
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in decryptNameByCallingWorker");
        reject(new Error(`decryptName message error: ${event.type}`));
      };

      // console.debug("main: before postMessage in decryptNameByCallingWorker");
      this.workers[whichWorker].postMessage(
        {
          action: "decryptName",
          inputName: inputName,
        },
        [channel.port1]
      );
    });
  }

  async encryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in encryptContentByCallingWorker");
        const { outputContent, status, error } = event.data as RecvMsg;
        if (status === "error") {
          reject(new Error(getWorkerErrorMessage("encryptContent", error)));
          return;
        }
        if (outputContent === undefined) {
          reject(
            new Error(
              "encryptContentByCallingWorker: outputContent is undefined"
            )
          );
        } else {
          resolve(outputContent);
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug("main: receiving error in encryptContentByCallingWorker");
        reject(new Error(`encryptContent message error: ${event.type}`));
      };

      // console.debug(
      //   "main: before postMessage in encryptContentByCallingWorker"
      // );
      this.workers[whichWorker].postMessage(
        {
          action: "encryptContent",
          inputContent: input,
        },
        [
          channel.port1,
          // input // the array buffer might be re-used later, so we CANNOT transfer here
        ]
      );
    });
  }

  async decryptContentByCallingWorker(
    input: ArrayBuffer
  ): Promise<ArrayBuffer> {
    await this.prepareByCallingWorker();
    ++this.workerIdx;
    const whichWorker = this.workerIdx % this.workers.length;
    return await new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      channel.port2.onmessage = (event) => {
        // console.debug("main: receiving msg in decryptContentByCallingWorker");
        const { outputContent, status, error } = event.data as RecvMsg;

        if (status === "error") {
          reject(new Error(getWorkerErrorMessage("decryptContent", error)));
        } else {
          if (outputContent === undefined) {
            reject(
              new Error(
                "decryptContentByCallingWorker: outputContent is undefined"
              )
            );
          } else {
            resolve(outputContent);
          }
        }
      };

      channel.port2.onmessageerror = (event) => {
        // console.debug(
        //   "main: receiving onmessageerror in decryptContentByCallingWorker"
        // );
        reject(new Error(`decryptContent message error: ${event.type}`));
      };

      // console.debug(
      //   "main: before postMessage in decryptContentByCallingWorker"
      // );
      this.workers[whichWorker].postMessage(
        {
          action: "decryptContent",
          inputContent: input,
        },
        [
          channel.port1,
          input, // not transfer for safety
        ]
      );
    });
  }
}

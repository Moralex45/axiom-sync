import { strict as assert } from "assert";

import type { AxiomSyncPluginSettings } from "../src/baseTypes";
import { messyConfigToNormal, normalConfigToMessy } from "../src/configPersist";

const DEFAULT_SETTINGS: AxiomSyncPluginSettings = {
  s3: {
    s3AccessKeyID: "acc",
  } as any,
  telegram: {
    botToken: "bot-token",
  } as any,
  webdav: {
    address: "addr",
  } as any,
  webdis: {
    address: "addr",
  } as any,
  box: {
    refreshToken: "xxx",
  } as any,
  pcloud: {
    accessToken: "xxx",
  } as any,
  koofr: {
    refreshToken: "xxx",
  } as any,
  azureblobstorage: {
    containerSasUrl: "http://127.0.0.1",
  } as any,
  password: "password",
  serviceType: "s3",
  currLogLevel: "info",
  ignorePaths: ["somefoldertoignore"],
  enableStatusBarInfo: true,
};

describe("Config Persist tests", () => {
  it("should encrypt go back and forth conrrectly", async () => {
    const k = DEFAULT_SETTINGS;
    const k2 = normalConfigToMessy(k);
    const k3 = messyConfigToNormal(k2);
    assert.deepEqual(k3, k);
  });
});

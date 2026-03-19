import type { AxiomSyncPluginSettings } from "./baseTypes";
import type { FakeFs } from "./fsAll";
import { FakeFsS3 } from "./fsS3";
import { FakeFsTelegram } from "./fsTelegram";

/**
 * To avoid circular dependency, we need a new file here.
 */
export function getClient(
  settings: AxiomSyncPluginSettings,
  vaultName: string,
  saveUpdatedConfigFunc: () => Promise<void>
): FakeFs {
  if (settings.serviceType === "telegram") {
    return new FakeFsTelegram(
      settings.telegram,
      vaultName,
      saveUpdatedConfigFunc
    );
  }
  return new FakeFsS3(settings.s3);
}

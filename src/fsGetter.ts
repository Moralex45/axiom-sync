import type { AxiomSyncPluginSettings } from "./baseTypes";
import type { FakeFs } from "./fsAll";
import { FakeFsS3 } from "./fsS3";

/**
 * To avoid circular dependency, we need a new file here.
 */
export function getClient(
  settings: AxiomSyncPluginSettings,
  _vaultName: string,
  _saveUpdatedConfigFunc: () => Promise<any>
): FakeFs {
  return new FakeFsS3(settings.s3);
}

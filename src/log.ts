type AxiomSyncConsoleLevel = "silent" | "debug";

declare global {
  // biome-ignore lint/style/noVar: global state is the simplest way to share log level across modules
  var __axiomSyncConsoleLevel: AxiomSyncConsoleLevel | undefined;
}

const getConsoleLevel = (): AxiomSyncConsoleLevel => {
  return globalThis.__axiomSyncConsoleLevel ?? "silent";
};

export const configureLogging = (level?: string) => {
  globalThis.__axiomSyncConsoleLevel = level === "debug" ? "debug" : "silent";
};

export const logInfo = (...args: unknown[]) => {
  if (getConsoleLevel() === "debug") {
    console.debug(...args);
  }
};

export const logDebug = (...args: unknown[]) => {
  if (getConsoleLevel() === "debug") {
    console.debug(...args);
  }
};

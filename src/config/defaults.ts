import { RUNTIME_ARCH, RUNTIME_VERSION } from "../constants.js";

export const DEFAULT_INCLUDE = [
  "dist/**/*",
  "assets/**/*",
  "config/**/*",
  "package.json",
  "package-lock.json",
];

export const DEFAULT_EXCLUDE = ["**/*.map", "**/*.test.*", "**/*.spec.*"];

export const DEFAULT_DEPENDENCY_COMMAND = "npm ci --omit=dev";

export const defaults = {
  applicationType: "console" as const,
  build: {
    dependencyCommand: DEFAULT_DEPENDENCY_COMMAND,
    include: DEFAULT_INCLUDE,
    exclude: DEFAULT_EXCLUDE,
  },
  runtime: {
    version: RUNTIME_VERSION,
    architecture: RUNTIME_ARCH,
    nodeArguments: [] as string[],
    applicationArguments: [] as string[],
    environment: { NODE_ENV: "production" } as Record<string, string>,
  },
  launcher: {
    workingDirectory: "app",
    forwardArguments: true,
    waitForExit: true,
    showConsole: true,
  },
  installer: {
    outputDirectory: "release",
    outputName: "${name}-Setup-${version}",
    installMode: "perUser" as const,
    startMenuShortcut: true,
    desktopShortcut: false,
    launchAfterInstall: true,
    allowChangeInstallDirectory: true,
    compression: "lzma2",
    solidCompression: true,
  },
  advanced: {
    keepStaging: false,
    keepIss: false,
    additionalInnoDirectives: {} as Record<string, string>,
  },
};

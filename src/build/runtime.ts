import fs from "node:fs";
import { RUNTIME_VERSION } from "../constants.js";
import { EasyInnoError } from "../utils/errors.js";
import { vendorPaths } from "../utils/paths.js";
import type { WorkPaths } from "./staging.js";

/** Returns the list of missing runtime files (empty when the bundled runtime is intact). */
export function missingRuntimeFiles(): string[] {
  return [vendorPaths.nodeExe(), vendorPaths.nodeLicense(), vendorPaths.npmCli()].filter(
    (f) => !fs.existsSync(f),
  );
}

export function verifyRuntime(): void {
  const missing = missingRuntimeFiles();
  if (missing.length > 0) {
    throw new EasyInnoError(
      "EASY_INNO_RUNTIME_MISSING",
      `Bundled Node.js ${RUNTIME_VERSION} runtime is incomplete. Missing:\n\n${missing.join("\n")}`,
      {
        hint: "Reinstall easy-inno, or run `npm run vendor:node` when working from a source checkout.",
      },
    );
  }
}

export async function copyRuntime(paths: WorkPaths): Promise<void> {
  verifyRuntime();
  await fs.promises.cp(vendorPaths.nodeDir(), paths.stagingRuntime, { recursive: true });
}

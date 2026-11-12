import path from "node:path";
import { WORK_DIR_NAME } from "../constants.js";
import { resolveConfig } from "../config/resolver.js";
import { assertSafeToDelete, exists, removeDir } from "../utils/filesystem.js";
import { log } from "../utils/logger.js";

export async function cleanCommand(options: { all?: boolean; cwd?: string } = {}): Promise<void> {
  const root = path.resolve(options.cwd ?? process.cwd());
  const workDir = path.join(root, WORK_DIR_NAME);

  if (options.all) {
    // Resolve (and validate) the output directory before deleting anything.
    const config = resolveConfig(root);
    assertSafeToDelete(config.installer.outputDirectory, root);
    if (await exists(config.installer.outputDirectory)) {
      await removeDir(config.installer.outputDirectory);
      log.ok(`Removed ${config.installer.outputDirectory}`);
    }
  }

  if (await exists(workDir)) {
    await removeDir(workDir);
    log.ok(`Removed ${workDir}`);
  } else {
    log.info("Nothing to clean.");
  }
}

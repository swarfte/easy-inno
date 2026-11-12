import fs from "node:fs";
import path from "node:path";
import { sha256File } from "../utils/filesystem.js";
import type { ResolvedConfig } from "../config/resolver.js";
import type { WorkPaths } from "./staging.js";

export interface ManifestEntry {
  path: string;
  size: number;
  sha256: string;
}

async function walk(dir: string, base: string, out: string[]): Promise<void> {
  for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, base, out);
    else if (entry.isFile()) out.push(full);
  }
}

export async function writeManifest(
  config: ResolvedConfig,
  paths: WorkPaths,
): Promise<{ fileCount: number; totalBytes: number }> {
  const all: string[] = [];
  await walk(paths.staging, paths.staging, all);
  all.sort();

  const files: ManifestEntry[] = [];
  let totalBytes = 0;
  for (const file of all) {
    const size = (await fs.promises.stat(file)).size;
    totalBytes += size;
    files.push({
      path: path.relative(paths.staging, file).replace(/\\/g, "/"),
      size,
      sha256: await sha256File(file),
    });
  }

  const manifest = {
    schemaVersion: 1,
    application: { name: config.displayName, version: config.version },
    runtime: { version: config.runtime.version, architecture: config.runtime.architecture },
    fileCount: files.length,
    totalBytes,
    files,
  };
  await fs.promises.mkdir(paths.manifestsDir, { recursive: true });
  await fs.promises.writeFile(paths.manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  return { fileCount: files.length, totalBytes };
}

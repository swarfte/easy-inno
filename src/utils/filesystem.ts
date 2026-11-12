import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { EasyInnoError } from "./errors.js";

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function assertInside(root: string, target: string, label = "Path"): void {
  if (!isInside(root, target)) {
    throw new EasyInnoError(
      "EASY_INNO_PATH_OUTSIDE_PROJECT",
      `${label} is outside the project root:\n\n${target}`,
      { hint: `All sources must be located inside ${root}.` },
    );
  }
}

/** Reject patterns that could escape the project root. */
export function assertSafePattern(pattern: string, source: string): void {
  const normalized = pattern.replace(/\\/g, "/");
  const bad =
    path.win32.isAbsolute(pattern) ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.split("/").includes("..");
  if (bad) {
    throw new EasyInnoError(
      "EASY_INNO_PATH_OUTSIDE_PROJECT",
      `Pattern "${pattern}" must be a relative path inside the project root.`,
      { source, hint: 'Remove "../", drive letters and UNC paths from the pattern.' },
    );
  }
}

export function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** Guard for recursive deletion targets. */
export function assertSafeToDelete(target: string, projectRoot: string): void {
  const resolved = path.resolve(target);
  const driveRoot = path.parse(resolved).root;
  const protectedPaths = [projectRoot, os.homedir(), driveRoot];
  // Refuse to delete a protected directory or any of its ancestors.
  if (protectedPaths.some((p) => isInside(resolved, p))) {
    throw new EasyInnoError(
      "EASY_INNO_PATH_OUTSIDE_PROJECT",
      `Refusing to delete protected directory:\n\n${resolved}`,
      { hint: "Choose an output directory that is a dedicated sub-directory." },
    );
  }
}

export async function removeDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.promises.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export async function isWritableDir(dir: string): Promise<boolean> {
  try {
    await ensureDir(dir);
    const probe = path.join(dir, `.easy-inno-write-test-${process.pid}`);
    await fs.promises.writeFile(probe, "");
    await fs.promises.rm(probe);
    return true;
  } catch {
    return false;
  }
}

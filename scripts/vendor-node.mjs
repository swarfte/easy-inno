// Downloads node-v26.13.0-win-x64.zip, verifies its SHA-256 and unpacks the runtime into
// vendor/node/win-x64/26.13.0. Run by maintainers in the release pipeline.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "26.13.0";
const SHA256 = "dcc60d59a0746999f99064a01c020445d54d84228c691cdbf25b49ac3b59150a";
const ZIP = `node-v${VERSION}-win-x64.zip`;
const URL = `https://nodejs.org/dist/v${VERSION}/${ZIP}`;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "vendor", "node", "win-x64", VERSION);

// Untrusted download + extraction live in their own fresh directory.
const work = fs.mkdtempSync(path.join(os.tmpdir(), "easy-inno-node-"));
const zipPath = path.join(work, ZIP);
const extractDir = path.join(work, "extract");
fs.mkdirSync(extractDir);

console.log(`Downloading ${URL}`);
const response = await fetch(URL);
if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));

const actual = createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
if (actual !== SHA256) {
  throw new Error(`SHA-256 mismatch for ${ZIP}\n  expected ${SHA256}\n  actual   ${actual}`);
}
console.log("SHA-256 verified");

// bsdtar ships with Windows 10+ and extracts zip archives.
const tar = spawnSync("tar", ["-xf", zipPath, "-C", extractDir], { stdio: "inherit" });
if (tar.status !== 0) throw new Error("Extraction failed");

const inner = path.join(extractDir, `node-v${VERSION}-win-x64`);
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const name of ["node.exe", "npm", "npm.cmd", "npx", "npx.cmd", "LICENSE", "node_modules"]) {
  const from = path.join(inner, name);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(target, name), { recursive: true });
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`Runtime installed to ${target}`);

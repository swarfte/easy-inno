// Vendors the Inno Setup compiler into vendor/inno-setup. By default downloads the pinned,
// SHA-256-verified installer and installs it silently into a temp dir; with --from, copies
// from an existing installation instead.
//
// Usage: npm run vendor:inno [-- --from "C:\Program Files\Inno Setup 7"]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";

const VERSION = "7.1.1";
const SHA256 = "8a5a6711c3766a6e5fb74f280ba0e3551e719ce94538d901fdbd1f8f9920b3f0";
const URL = `https://github.com/jrsoftware/issrc/releases/download/is-7_1_1/innosetup-${VERSION}-x64.exe`;

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
let from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;

// Without --from, download the pinned installer and install it silently (per-user, no admin)
// into a temporary directory, then copy the compiler files out of it.
let tempWork;
if (!from) {
  tempWork = fs.mkdtempSync(path.join(os.tmpdir(), "easy-inno-inno-"));
  const exe = path.join(tempWork, "innosetup.exe");
  console.log(`Downloading ${URL}`);
  const response = await fetch(URL);
  if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);
  fs.writeFileSync(exe, Buffer.from(await response.arrayBuffer()));
  const actual = createHash("sha256").update(fs.readFileSync(exe)).digest("hex");
  if (actual !== SHA256) throw new Error(`SHA-256 mismatch for Inno Setup
  expected ${SHA256}
  actual   ${actual}`);
  console.log("SHA-256 verified");
  from = path.join(tempWork, "install");
  const r = spawnSync(exe, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CURRENTUSER", "/NOICONS", "/SP-", `/DIR=${from}`], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("Inno Setup silent install failed");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "vendor", "inno-setup");

if (!fs.existsSync(path.join(from, "ISCC.exe"))) {
  console.error(`ISCC.exe not found in ${from}`);
  process.exit(1);
}

// Skip the IDE, docs, samples and the uninstaller of the source installation.
const SKIP = /^(unins.*|Examples|Compil32\.exe|.*\.chm|.*\.url|Uninstall.*|whatsnew.*)$/i;

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
for (const entry of fs.readdirSync(from)) {
  if (SKIP.test(entry)) continue;
  fs.cpSync(path.join(from, entry), path.join(target, entry), { recursive: true });
}

// The spec requires the license to ship as LICENSE.txt.
const license = ["license.txt", "LICENSE.txt"].map((n) => path.join(target, n)).find((p) => fs.existsSync(p));
if (license && path.basename(license) !== "LICENSE.txt") fs.renameSync(license, path.join(target, "LICENSE.txt"));
if (!fs.existsSync(path.join(target, "LICENSE.txt"))) {
  console.warn("WARNING: no license file found; copy Inno Setup's license to vendor/inno-setup/LICENSE.txt");
}
console.log(`Inno Setup files copied to ${target}`);

if (tempWork) fs.rmSync(tempWork, { recursive: true, force: true });

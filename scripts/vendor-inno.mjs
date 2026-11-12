// Copies the Inno Setup compiler files from an existing Inno Setup installation into
// vendor/inno-setup. Maintainers pin one exact Inno Setup version per easy-inno release.
//
// Usage: npm run vendor:inno -- --from "C:\Program Files (x86)\Inno Setup 6"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const fromIndex = args.indexOf("--from");
const from = fromIndex >= 0 ? args[fromIndex + 1] : undefined;
if (!from) {
  console.error('Usage: node scripts/vendor-inno.mjs --from "<Inno Setup install dir>"');
  process.exit(1);
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

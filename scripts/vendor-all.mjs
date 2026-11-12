// Populates every vendored binary (Node runtime, Inno Setup compiler, launcher executables)
// and verifies they are all present. Runs automatically on `npm pack` / `npm publish`
// (prepack) so a published package is always self-contained.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = fs.readFileSync(path.join(root, "scripts", "vendor-node.mjs"), "utf8").match(/VERSION = "([^"]+)"/)[1];
const required = () => ({
  node: [`vendor/node/win-x64/${version}/node.exe`, `vendor/node/win-x64/${version}/LICENSE`, `vendor/node/win-x64/${version}/node_modules/npm/bin/npm-cli.js`],
  inno: ["vendor/inno-setup/ISCC.exe", "vendor/inno-setup/LICENSE.txt"],
  launcher: ["vendor/launcher/launcher-console.exe", "vendor/launcher/launcher-windowed.exe"],
});
const missing = (files) => files.filter((f) => !fs.existsSync(path.join(root, f)));
const run = (script) => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts", script)], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

// Always build dist first so a pack never ships stale output.
const tsc = spawnSync(process.execPath, [path.join(root, "node_modules", "typescript", "lib", "tsc.js"), "-p", "tsconfig.json"], { cwd: root, stdio: "inherit" });
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const r = required();
if (missing(r.node).length) run("vendor-node.mjs");
if (missing(r.inno).length) run("vendor-inno.mjs");
if (missing(r.launcher).length) run("build-launcher.mjs");

const stillMissing = missing(Object.values(r).flat());
if (stillMissing.length) {
  console.error(`Refusing to pack: missing vendored files:\n  ${stillMissing.join("\n  ")}`);
  process.exit(1);
}
console.log("All vendored binaries present.");

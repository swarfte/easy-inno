// Compiles launcher/launcher.c into vendor/launcher/launcher-{console,windowed}.exe.
// Maintainer-only: end users receive the prebuilt executables inside the npm package.
// Requires MinGW-w64 gcc (x86_64) or MSVC cl.exe on PATH.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "launcher", "launcher.c");
const outDir = path.join(root, "vendor", "launcher");
fs.mkdirSync(outDir, { recursive: true });

function has(cmd, args = ["--version"]) {
  return spawnSync(cmd, args, { stdio: "ignore", shell: false }).status !== null;
}

function build(type) {
  const out = path.join(outDir, `launcher-${type}.exe`);
  const windowed = type === "windowed";
  let result;
  if (has("x86_64-w64-mingw32-gcc") || has("gcc")) {
    const gcc = has("x86_64-w64-mingw32-gcc") ? "x86_64-w64-mingw32-gcc" : "gcc";
    const args = ["-Os", "-s", "-municode", "-DUNICODE", "-D_UNICODE", source, "-o", out, "-static", "-lshell32", "-luser32"];
    if (windowed) args.splice(3, 0, "-mwindows", "-DWINDOWED");
    result = spawnSync(gcc, args, { stdio: "inherit" });
  } else if (has("cl", ["/?"])) {
    const args = ["/nologo", "/O1", "/MT", "/DUNICODE", "/D_UNICODE", ...(windowed ? ["/DWINDOWED"] : []), source, `/Fe:${out}`, "/link", windowed ? "/SUBSYSTEM:WINDOWS" : "/SUBSYSTEM:CONSOLE", windowed ? "/ENTRY:wWinMainCRTStartup" : "/ENTRY:wmainCRTStartup", "shell32.lib", "user32.lib"];
    result = spawnSync("cl", args, { stdio: "inherit", cwd: outDir });
  } else {
    console.error("No C compiler found. Install MinGW-w64 (gcc) or run from a Visual Studio Developer prompt.");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`built ${out}`);
}

build("console");
build("windowed");

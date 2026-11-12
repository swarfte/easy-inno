import fs from "node:fs";
import path from "node:path";
import { RUNTIME_VERSION } from "../constants.js";
import { resolveConfig, type ResolvedConfig } from "../config/resolver.js";
import { missingRuntimeFiles } from "../build/runtime.js";
import { validateIcon } from "../inno/generator.js";
import { isWritableDir } from "../utils/filesystem.js";
import { log } from "../utils/logger.js";
import { vendorPaths } from "../utils/paths.js";
import { run } from "../utils/process.js";
import { EasyInnoError } from "../utils/errors.js";

const NATIVE_PACKAGES = [
  "better-sqlite3",
  "sharp",
  "serialport",
  "bcrypt",
  "canvas",
  "sqlite3",
  "node-pty",
  "argon2",
  "usb",
];

type Status = "ok" | "warn" | "fail";
interface Check {
  status: Status;
  message: string;
}

export interface DoctorResult {
  failures: number;
  warnings: number;
}

function section(title: string, checks: Check[]): void {
  log.info(log.bold(title));
  for (const c of checks) {
    if (c.status === "ok") log.ok(c.message);
    else if (c.status === "warn") log.warn(c.message);
    else log.fail(c.message);
  }
  log.info();
}

function guard(fn: () => void, okMessage: string): Check {
  try {
    fn();
    return { status: "ok", message: okMessage };
  } catch (error) {
    const msg = error instanceof EasyInnoError ? `${error.code}: ${error.message.split("\n")[0]}` : String(error);
    return { status: "fail", message: msg };
  }
}

export async function doctorCommand(options: { cwd?: string } = {}): Promise<DoctorResult> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const warnings: string[] = [];
  let failures = 0;
  const tally = (checks: Check[]) => {
    for (const c of checks) if (c.status === "fail") failures++;
  };

  log.info("easy-inno doctor\n");

  const env: Check[] = [
    process.platform === "win32" && process.arch === "x64"
      ? { status: "ok", message: "Windows x64" }
      : { status: "fail", message: `Unsupported host: ${process.platform} ${process.arch} (Windows x64 required)` },
    { status: "ok", message: `Host Node.js detected (${process.versions.node})` },
  ];
  try {
    const npm = await run("npm --version", [], { cwd, shell: true });
    env.push(npm.exitCode === 0 ? { status: "ok", message: "npm available" } : { status: "warn", message: "npm not found on PATH" });
  } catch {
    env.push({ status: "warn", message: "npm not found on PATH" });
  }
  section("Environment", env);
  tally(env);

  let config: ResolvedConfig | null = null;
  const project: Check[] = [];
  try {
    config = resolveConfig(cwd);
    project.push({ status: "ok", message: "package.json is valid" });
  } catch (error) {
    const msg = error instanceof EasyInnoError ? `${error.code}: ${error.message.split("\n")[0]}` : String(error);
    project.push({ status: "fail", message: msg });
  }
  if (config) {
    project.push(
      fs.existsSync(path.join(cwd, "package-lock.json"))
        ? { status: "ok", message: "package-lock.json exists" }
        : { status: "fail", message: "package-lock.json is missing (EASY_INNO_LOCKFILE_REQUIRED); run npm install" },
    );
    project.push({
      status: "ok",
      message: config.build.command ? `Build script: ${config.build.command}` : "No build script (project assumed pre-built)",
    });
    project.push(
      fs.existsSync(path.join(cwd, config.entry))
        ? { status: "ok", message: `Entry: ${config.entry}` }
        : { status: "warn", message: `Entry: ${config.entry} does not exist yet (it must exist after the build)` },
    );
    project.push(
      config.packageJson.scripts?.preview
        ? { status: "ok", message: "Preview script exists" }
        : { status: "warn", message: 'No "preview" script; add one so preview matches the installed app' },
    );
  }
  section("Project", project);
  tally(project);

  const missing = missingRuntimeFiles();
  const runtime: Check[] = [
    missing.length === 0
      ? { status: "ok", message: `Node.js ${RUNTIME_VERSION} LTS x64` }
      : { status: "fail", message: `EASY_INNO_RUNTIME_MISSING: ${missing.join(", ")}` },
    fs.existsSync(vendorPaths.nodeExe())
      ? { status: "ok", message: "node.exe exists" }
      : { status: "fail", message: "node.exe is missing" },
    fs.existsSync(vendorPaths.nodeLicense())
      ? { status: "ok", message: "Runtime license exists" }
      : { status: "fail", message: "Runtime license is missing" },
  ];
  for (const type of ["console", "windowed"] as const) {
    runtime.push(
      fs.existsSync(vendorPaths.launcher(type))
        ? { status: "ok", message: `launcher-${type}.exe exists` }
        : { status: "fail", message: `EASY_INNO_LAUNCHER_MISSING: launcher-${type}.exe` },
    );
  }
  section("Bundled runtime", runtime);
  tally(runtime);

  const inno: Check[] = [
    fs.existsSync(vendorPaths.iscc())
      ? { status: "ok", message: "ISCC.exe exists" }
      : { status: "fail", message: "EASY_INNO_INNO_COMPILER_MISSING: ISCC.exe" },
    fs.existsSync(vendorPaths.innoLicense())
      ? { status: "ok", message: "Inno Setup license exists" }
      : { status: "fail", message: "Inno Setup license is missing" },
  ];
  section("Inno Setup", inno);
  tally(inno);

  if (config) {
    const installer: Check[] = [];
    if (config.installer.appIdIsGenerated) {
      installer.push({ status: "warn", message: "AppId is derived, not stored; run easy-inno init to persist it" });
    } else {
      installer.push({ status: "ok", message: "AppId is stable" });
    }
    installer.push(
      (await isWritableDir(config.installer.outputDirectory))
        ? { status: "ok", message: "Output directory is writable" }
        : { status: "fail", message: "EASY_INNO_OUTPUT_NOT_WRITABLE" },
    );
    installer.push(
      config.installer.icon
        ? guard(() => void validateIcon(config!), "Icon is valid")
        : { status: "ok", message: "No custom icon configured" },
    );
    section("Installer", installer);
    tally(installer);

    const deps = Object.keys((config.packageJson.dependencies as Record<string, string> | undefined) ?? {});
    for (const native of deps.filter((d) => NATIVE_PACKAGES.includes(d))) {
      warnings.push(`Project contains native dependency: ${native}`);
    }
  }

  const hostMajor = Number(process.versions.node.split(".")[0]);
  if (hostMajor !== Number(RUNTIME_VERSION.split(".")[0])) {
    warnings.push(`Preview uses Node.js ${process.versions.node}, installer uses Node.js ${RUNTIME_VERSION}`);
  }

  if (warnings.length > 0) {
    log.info(log.bold("Warnings"));
    warnings.forEach((w) => log.warn(w));
    if (warnings.some((w) => w.startsWith("Preview uses"))) {
      log.info(
        `\nPreview runtime mismatch\n\nLocal preview:\nNode.js ${process.versions.node}\n\nPackaged runtime:\nNode.js ${RUNTIME_VERSION}\n\n` +
          `For the closest preview parity, run the project locally with\nNode.js ${RUNTIME_VERSION}.`,
      );
    }
  }
  return { failures, warnings: warnings.length };
}

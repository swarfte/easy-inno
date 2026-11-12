# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

easy-inno is a Windows x64-only CLI (`easy-inno init|build|doctor|config|clean|version`) that packages a Node.js project into a single `Setup.exe`. It bundles a fixed Node.js runtime (`RUNTIME_VERSION` in `src/constants.ts`, with its SHA-256) and the Inno Setup compiler, so neither is needed on the user's or target machine. All user configuration lives under the `easyInno` key in the target project's `package.json`. See `README.md` for the user-facing config and `spec.md` (long Chinese-language product spec) for design rationale.

## Commands

```bash
npm install
npm run build        # tsc -> dist/ (ESM, "type": "module")
npm test             # build + node --test "test/*.test.mjs"
node --test --test-name-pattern="entry inference" test/unit.test.mjs   # single test (run npm run build first)
npm run vendor:node       # download + SHA-256 verify Node into vendor/
npm run vendor:inno -- --from "C:\Program Files\Inno Setup 7"
npm run vendor:launcher   # compile launcher/launcher.c (MinGW gcc or MSVC)
```

There is no linter. Tests import from `dist/`, so they run against compiled output — always rebuild before running them directly. `vendor/` is generated, gitignored, but shipped in the npm package.

## Architecture

`bin/easy-inno.js` → `src/cli.ts` (commander) → `src/commands/*`. `buildCommand` in `src/commands/build.ts` is the pipeline orchestrator; read it first. Stages, in order:

1. `config/` — `resolveConfig` merges `package.json#easyInno` with `defaults.ts`, validates via zod (`schema.ts`), infers the entry (`easyInno.entry` → `main` → single `bin`), and interpolates `${name}`/`${version}` in output names.
2. `build/project-builder.ts` — runs the user's build command, verifies entry and `package-lock.json`.
3. `build/collector.ts` + `staging.ts` — fast-glob the include/exclude patterns into a staging dir under `.easy-inno/` (`.env*` and `.npmrc` never packaged unless explicitly included; lifecycle scripts stripped from the staged `package.json`).
4. `build/dependencies.ts` / `npm.ts` — `npm ci --omit=dev` run with the **bundled** Node/npm so native modules match the packaged ABI.
5. `build/runtime.ts` — copies the vendored runtime; `staging.installLauncher` + `manifest.ts` place the launcher exe and write `easy-inno.runtime.json`.
6. `inno/generator.ts` renders `templates/setup.iss.hbs` (Handlebars; `inno/escape.ts` handles Inno constant/param escaping) → `inno/compiler.ts` invokes the vendored `ISCC`.

`launcher/launcher.c` is a standalone C program (wide-char Win32 API, own mini JSON parser) compiled in console and windowed (`-DWINDOWED`) variants by `scripts/build-launcher.mjs`. At runtime it reads `easy-inno.runtime.json` next to itself and spawns `runtime\node.exe <entry>`; it also handles `--easy-inno-health-check` and sets the `EASY_INNO_*` env vars. Changes to the manifest format must be made in both `manifest.ts` and `launcher.c`.

Errors use `EasyInnoError` (code, source, hint) from `utils/errors.ts`; destructive filesystem operations go through `assertSafeToDelete` / `assertSafePattern` in `utils/filesystem.ts`.

## Notes

- `installer.appId` must stay stable across releases (it's how upgrades find the existing install) — don't change defaults in ways that alter generated app IDs.
- Building and running requires Windows (`assertSupportedHost`) and populated `vendor/`.

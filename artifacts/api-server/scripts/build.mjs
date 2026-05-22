#!/usr/bin/env node
/**
 * Production build script for the API server.
 * Uses esbuild to bundle TypeScript → ESM, with pino worker-thread support.
 *
 * esbuild-plugin-pino injects extra worker-thread entry points alongside the
 * main bundle, so we must use `outdir` (not `outfile`).  The main entry is
 * named "index" → dist/index.mjs, which matches `"start": "node dist/index.mjs"`.
 *
 * Workspace packages (@workspace/*) are bundled inline rather than left as
 * external imports.  Without this, Node.js would follow the exports map in
 * each lib's package.json, hit a .ts file, and throw
 * ERR_UNKNOWN_FILE_EXTENSION at runtime.  True npm packages remain external
 * (handled by the `packages: "external"` option) so native addons like
 * firebase-admin, bcrypt, and sharp are never bundled.
 */
import { build } from "esbuild";
import { esbuildPluginPino } from "esbuild-plugin-pino";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "fs";
import { createRequire } from "module";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
globalThis.require = require;

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, "../../..");

/**
 * Resolve @workspace/* imports to their TypeScript source so esbuild
 * bundles them inline instead of leaving them as bare package imports
 * that Node.js cannot execute (.ts exports map entries).
 *
 * Resolution strategy (tried in order):
 *   1. lib/<pkgName>  — fast path covering all packages under lib/
 *   2. realpathSync(node_modules/@workspace/<pkgName>) — generic fallback
 *      that handles any workspace package regardless of its directory,
 *      using pnpm's own symlink to locate the real package root.
 *      This covers packages under artifacts/, scripts/, or any future
 *      directory that is listed in pnpm-workspace.yaml.
 */
const bundleWorkspacePlugin = {
  name: "bundle-workspace-packages",
  setup(build) {
    build.onResolve({ filter: /^@workspace\// }, (args) => {
      const withoutPrefix = args.path.replace("@workspace/", "");
      const slashIdx = withoutPrefix.indexOf("/");
      const pkgName = slashIdx === -1 ? withoutPrefix : withoutPrefix.slice(0, slashIdx);
      const subpath = slashIdx === -1 ? "." : `./${withoutPrefix.slice(slashIdx + 1)}`;

      // Fast path: lib/<pkgName>
      let pkgDir = join(workspaceRoot, "lib", pkgName);
      let pkgJsonPath = join(pkgDir, "package.json");

      // Generic fallback: resolve via the pnpm workspace symlink.
      // This handles packages that live outside lib/ (e.g. artifacts/*, scripts/).
      if (!existsSync(pkgJsonPath)) {
        const symlink = join(workspaceRoot, "node_modules", "@workspace", pkgName);
        if (!existsSync(symlink)) return null;
        try {
          pkgDir = realpathSync(symlink);
        } catch {
          return null;
        }
        pkgJsonPath = join(pkgDir, "package.json");
        if (!existsSync(pkgJsonPath)) return null;
      }

      const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
      const exp = pkg.exports?.[subpath];

      if (typeof exp === "string") {
        return { path: resolve(pkgDir, exp) };
      }
      if (exp && typeof exp === "object") {
        const entry = exp["import"] ?? exp["default"] ?? exp["types"];
        if (entry) return { path: resolve(pkgDir, entry) };
      }

      return null;
    });
  },
};

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outdir: "dist",
  entryNames: "[name]",
  outExtension: { ".js": ".mjs" },
  target: "node20",
  sourcemap: true,
  plugins: [bundleWorkspacePlugin, esbuildPluginPino({ transports: ["pino-pretty"] })],
  packages: "external",
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV ?? "production"),
  },
});

console.log("✅  API server built → dist/index.mjs");

/* ── Post-build assertion ─────────────────────────────────────────────────
   Verify that bundleWorkspacePlugin inlined every @workspace/* dependency
   and that no .ts source file escaped as a runtime import.
   If either check fails the build exits non-zero so CI / deployment knows
   immediately rather than discovering the crash at node startup.           */
const bundle = readFileSync("dist/index.mjs", "utf-8");
const leakedImports = [];

for (const re of [
  // static ESM:  import X from "@workspace/..."
  /\bfrom\s*["']@workspace\//g,
  // CJS:         require("@workspace/...")
  /\brequire\s*\(\s*["']@workspace\//g,
  // dynamic ESM: import("@workspace/...")
  /\bimport\s*\(\s*["']@workspace\//g,
  // .ts extension — any of the above pointing at a raw TS file
  /\bfrom\s*["'][^"']+\.ts["']/g,
  /\brequire\s*\(\s*["'][^"']+\.ts["']\)/g,
]) {
  for (const m of bundle.matchAll(re)) {
    leakedImports.push(m[0].trimStart().slice(0, 120));
  }
}

if (leakedImports.length > 0) {
  console.error("❌  Build assertion FAILED — these imports escaped bundling:");
  for (const l of leakedImports) console.error("    " + l);
  console.error(
    "\n    Cause: bundleWorkspacePlugin did not resolve them.\n" +
      "    Fix:   check that the package exists under lib/ and its package.json\n" +
      "           exports field has an entry for the requested subpath."
  );
  process.exit(1);
}
console.log("✅  Bundle assertion passed — no escaped workspace imports or .ts references.");

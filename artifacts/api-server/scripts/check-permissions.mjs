#!/usr/bin/env node
/**
 * check-permissions.mjs
 *
 * CI/build-time guard: scans every route file under
 * artifacts/api-server/src/routes/ for requirePermission /
 * requireAnyPermission / requireAllPermissions calls and verifies that every
 * permission id string is present in the @workspace/auth-utils catalog.
 *
 * Exit 0 → all ids known.
 * Exit 1 → one or more unknown ids found (prints a summary).
 *
 * Usage:
 *   node artifacts/api-server/scripts/check-permissions.mjs
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { createRequire } from "module";
import { join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = join(__dirname, "..", "..", "..");

// ── Load the catalog from the compiled JS or TS source ─────────────────────
// Try compiled output first, then fall back to raw TS source parse.
let PERMISSION_IDS;
try {
  const require = createRequire(import.meta.url);
  // The workspace auth-utils package exports from its dist build.
  const catalog = require(join(repoRoot, "lib/auth-utils/src/permissions.ts"));
  PERMISSION_IDS = new Set(catalog.PERMISSION_IDS ?? []);
} catch {
  // Fall back: parse PERMISSION_IDS directly from the TS source as text.
  const src = readFileSync(join(repoRoot, "lib/auth-utils/src/permissions.ts"), "utf8");
  PERMISSION_IDS = new Set([...src.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]));
}

if (PERMISSION_IDS.size === 0) {
  console.error("[check-permissions] ERROR: could not load PERMISSION_IDS catalog.");
  process.exit(1);
}

// ── Walk route files ────────────────────────────────────────────────────────
const routesDir = join(repoRoot, "artifacts/api-server/src/routes");

function walkSync(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...walkSync(full));
    } else if (name.endsWith(".ts") || name.endsWith(".js")) {
      entries.push(full);
    }
  }
  return entries;
}

const routeFiles = walkSync(routesDir);

// ── Extract permission ids from source ─────────────────────────────────────
// Matches both single-arg and array-arg forms:
//   requirePermission("some.id")
//   requireAnyPermission(["a.b", "c.d"])
//   requireAllPermissions(["a.b"])
const STRING_RE = /"([a-z][a-z0-9._]*)"/g;
const CALL_RE = /require(?:Permission|AnyPermission|AllPermissions)\s*\(([^)]+)\)/g;

const unknown = []; // { file, id }

for (const file of routeFiles) {
  const src = readFileSync(file, "utf8");
  let match;
  while ((match = CALL_RE.exec(src)) !== null) {
    const args = match[1];
    let strMatch;
    STRING_RE.lastIndex = 0;
    while ((strMatch = STRING_RE.exec(args)) !== null) {
      const id = strMatch[1];
      if (!PERMISSION_IDS.has(id)) {
        unknown.push({ file: relative(repoRoot, file), id });
      }
    }
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
if (unknown.length === 0) {
  console.log(
    `[check-permissions] OK — all permission ids are in the catalog ` +
      `(${PERMISSION_IDS.size} ids, ${routeFiles.length} route files checked).`
  );
  process.exit(0);
} else {
  console.error(`[check-permissions] FAIL — ${unknown.length} unknown permission id(s) found:\n`);
  for (const { file, id } of unknown) {
    console.error(`  ✗  "${id}"  in  ${file}`);
  }
  console.error("\nAdd the missing id(s) to lib/auth-utils/src/permissions.ts and re-run.");
  process.exit(1);
}

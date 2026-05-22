/**
 * audit-platform-config.mjs
 *
 * Smoke-check: calls the live /api/platform-config endpoint and verifies
 * that every key admin-settable field is present and non-null in the response.
 *
 * Usage (from project root):
 *   node artifacts/api-server/scripts/audit-platform-config.mjs [base-url]
 *
 * Defaults to http://localhost:5000 when no base-url is supplied.
 * In Replit dev: node ... https://$REPLIT_DEV_DOMAIN
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const BASE_URL = process.argv[2]?.replace(/\/$/, "") ?? "http://localhost:5000";
const ENDPOINT = `${BASE_URL}/api/platform-config`;

const REQUIRED_PATHS = [
  ["platform.appName", "string"],
  ["platform.appStatus", "string"],
  ["platform.currencySymbol", "string"],
  ["platform.currencyCode", "string"],
  ["features.mart", "boolean"],
  ["features.food", "boolean"],
  ["features.rides", "boolean"],
  ["finance.gstEnabled", "boolean"],
  ["orderRules.minOrderAmount", "number"],
];

const EXPECTED_STATUS_VALUES = ["active", "maintenance", "limited"];

function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function main() {
  console.log(`\n🔍  Auditing platform-config at ${ENDPOINT}\n`);

  let raw;
  try {
    const res = await fetch(ENDPOINT, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const body = await res.json();
    raw = body?.data ?? body;
  } catch (err) {
    console.error(`❌  FATAL: Could not reach ${ENDPOINT}\n   ${err.message}`);
    process.exit(2);
  }

  let pass = 0;
  let fail = 0;

  for (const [path, expectedType] of REQUIRED_PATHS) {
    const val = get(raw, path);
    if (val == null) {
      console.error(`  ✗  MISSING  ${path}`);
      fail++;
    } else if (typeof val !== expectedType) {
      console.error(`  ✗  WRONG TYPE  ${path}  (got ${typeof val}, expected ${expectedType})`);
      fail++;
    } else {
      console.log(`  ✓  ${path}  =  ${JSON.stringify(val)}`);
      pass++;
    }
  }

  const status = get(raw, "platform.appStatus");
  if (status && !EXPECTED_STATUS_VALUES.includes(status)) {
    console.error(
      `  ✗  platform.appStatus has unexpected value "${status}" (expected one of: ${EXPECTED_STATUS_VALUES.join(", ")})`
    );
    fail++;
  }

  const branding = get(raw, "branding");
  if (branding && typeof branding === "object") {
    const lat = get(raw, "branding.mapCenterLat");
    const lng = get(raw, "branding.mapCenterLng");
    if (lat != null && lng != null) {
      console.log(`  ✓  branding.mapCenterLat/Lng  =  [${lat}, ${lng}]`);
      pass++;
    } else {
      console.log(`  ℹ  branding.mapCenterLat/Lng not set — rider map will use hardcoded default`);
    }
  } else {
    console.log(`  ℹ  branding block absent — rider map will use hardcoded default`);
  }

  const regionalTz = get(raw, "regional.timezone");
  if (regionalTz) {
    console.log(`  ✓  regional.timezone  =  ${regionalTz}`);
    pass++;
  } else {
    console.log(`  ℹ  regional.timezone not set — apps will default to "Asia/Karachi"`);
  }

  const phoneFormat = get(raw, "regional.phoneFormat");
  if (phoneFormat) {
    try {
      new RegExp(phoneFormat);
      console.log(`  ✓  regional.phoneFormat  =  ${phoneFormat}  (valid regex)`);
      pass++;
    } catch {
      console.error(
        `  ✗  regional.phoneFormat  =  ${phoneFormat}  (INVALID regex — validator will fall back to hardcoded pattern)`
      );
      fail++;
    }
  } else {
    console.log(
      `  ℹ  regional.phoneFormat not set — apps will use hardcoded /^0?3\\d{9}$/ pattern`
    );
  }

  console.log(`\n${"─".repeat(56)}`);
  if (fail === 0) {
    console.log(`✅  All ${pass} checks passed.\n`);
    process.exit(0);
  } else {
    console.log(`🚨  ${fail} check(s) FAILED, ${pass} passed.\n`);
    process.exit(1);
  }
}

main();

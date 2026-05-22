// Smoke-test: node src/utils/verify.mjs
// Covers tokenStorage, jwtUtils, authClient, hooks, and all 6 component exports.

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pkg = require("../../dist/index.cjs");

const {
  version,
  // storage
  createTokenStorage,
  // client
  createAuthClient,
  // jwt
  decodeJwt,
  isTokenExpired,
  getTokenExpiryRemaining,
  // hooks
  useAuth,
  useTokenRefresh,
  useLoginFlow,
  useAuthContext,
  AuthProvider,
  AuthContext,
  // components
  OtpInput,
  PhoneInput,
  PasswordInput,
  SocialButtons,
  BiometricPrompt,
  LoginScreen,
} = pkg;

let pass = 0,
  fail = 0;
function assert(label, cond) {
  if (cond) {
    console.log(`  ✓  ${label}`);
    pass++;
  } else {
    console.error(`  ✗  ${label}`);
    fail++;
  }
}

// ── version ──────────────────────────────────────────────────────────────
console.log("\n[version]");
assert("version === 0.0.1", version === "0.0.1");

// ── tokenStorage ─────────────────────────────────────────────────────────
console.log("\n[tokenStorage]");
const mem = createTokenStorage("memory");
assert("null before set", mem.getAccessToken() === null);
mem.setAccessToken("tok");
assert("stored correctly", mem.getAccessToken() === "tok");
mem.removeAccessToken();
assert("removed correctly", mem.getAccessToken() === null);

// ── jwtUtils (non-ASCII Urdu payload) ────────────────────────────────────
console.log("\n[jwtUtils]");
const now = Math.floor(Date.now() / 1000);
const makeJwt = (p) => {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256" })}.${enc(p)}.sig`;
};
const valid = makeJwt({ sub: "1", exp: now + 3600, city: "آزاد کشمیر" });
const expired = makeJwt({ sub: "2", exp: now - 120 });
const d = decodeJwt(valid);
assert("decodeJwt parses payload", d !== null && d.sub === "1");
assert("non-ASCII claim decoded", d?.city === "آزاد کشمیر");
assert("isTokenExpired false (valid)", !isTokenExpired(valid, 60));
assert("isTokenExpired true (expired)", isTokenExpired(expired, 60));
assert("getTokenExpiryRemaining > 0", getTokenExpiryRemaining(valid) > 0);
assert("getTokenExpiryRemaining expired=0", getTokenExpiryRemaining(expired) === 0);

// ── authClient ────────────────────────────────────────────────────────────
console.log("\n[authClient]");
const store = createTokenStorage("memory");
store.setAccessToken("fake");
const client = createAuthClient({ baseURL: "http://localhost:5000", tokenStorage: store });
["get", "post", "put", "patch", "delete"].forEach((m) =>
  assert(`client.${m} is function`, typeof client[m] === "function")
);

// ── hooks ─────────────────────────────────────────────────────────────────
console.log("\n[hooks]");
assert("useAuth         is function", typeof useAuth === "function");
assert("useTokenRefresh is function", typeof useTokenRefresh === "function");
assert("useLoginFlow    is function", typeof useLoginFlow === "function");
assert("useAuthContext  is function", typeof useAuthContext === "function");
assert("AuthProvider    is function", typeof AuthProvider === "function");
assert("AuthContext     is object", typeof AuthContext === "object" && AuthContext !== null);

// ── components ────────────────────────────────────────────────────────────
console.log("\n[components]");
assert("OtpInput        is function", typeof OtpInput === "function");
assert("PhoneInput      is function", typeof PhoneInput === "function");
assert("PasswordInput   is function", typeof PasswordInput === "function");
assert("SocialButtons   is function", typeof SocialButtons === "function");
assert("BiometricPrompt is function", typeof BiometricPrompt === "function");
assert("LoginScreen     is function", typeof LoginScreen === "function");

// ── summary ───────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(46)}`);
console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);

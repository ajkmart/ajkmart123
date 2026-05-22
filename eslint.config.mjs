import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { rules: localRules } = require("./eslint-rules/no-silent-catch.cjs");
const {
  rules: destructureRules,
} = require("./eslint-rules/no-underscore-shorthand-destructure.cjs");

export default [
  // ─── Global ignores (replaces .eslintignore) ──────────────────────
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/.vite/**",
      "**/artifacts/ajkmart/**", // READ-ONLY — do not lint
      // Test files: not included in web tsconfigs, linted separately via vitest
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.spec.ts",
      "**/*.spec.tsx",
      "**/tests/**",
      // React Native / Expo native files: use a different module resolution
      "**/*.native.ts",
      "**/*.native.tsx",
      // Files literally named "native.ts/tsx" (no dot prefix) in lib sub-packages
      "lib/auth-utils/src/captcha/native.tsx",
      "lib/auth-utils/src/oauth/native.ts",
      // Build/tool config files: typically not included in app tsconfigs
      "**/vitest.config.ts",
      "**/drizzle.config.ts",
      "**/orval.config.ts",
      "scripts/**",
    ],
  },
  // ─── TypeScript files (all workspaces) ────────────────────────────
  {
    files: ["**/*.ts", "**/*.tsx"],
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "ajk-local": { rules: { ...localRules, ...destructureRules } },
    },
    rules: {
      // ── Type safety ───────────────────────────────────────────────
      // Off (explicit decision): `any` is unavoidable in ORM query builders,
      // Express req.body dynamic shapes, and dynamic Drizzle patterns.
      // Enforcing this would require hundreds of low-value casts with no safety gain.
      "@typescript-eslint/no-explicit-any": "off",
      // Off: these fire on every ORM/Express any-typed value and produce
      // thousands of low-signal warnings across the codebase.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // Off: TypeScript infers return types well; requiring them on every
      // function is too verbose for a large React + Express codebase.
      "@typescript-eslint/explicit-function-return-type": "off",

      // ── Variables ─────────────────────────────────────────────────
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // ── Async / Promises ──────────────────────────────────────────
      // Error: all floating promises must be explicitly marked void, awaited,
      // or handled with .catch(). Use `void fn()` for intentional fire-and-forget.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      // Off: false-positives on interface-implementing methods that must
      // match an async signature even when the body is synchronous.
      "@typescript-eslint/require-await": "off",

      // ── Silent error swallowing ────────────────────────────────────
      "ajk-local/no-silent-catch": "error",
      // ── Destructuring correctness ──────────────────────────────────
      // Catches `{ _foo }` (reads literal prop "_foo") when the intent
      // was `{ foo: _foo }` (rename "foo" to local var "_foo").
      // Auto-fixable: eslint --fix converts `_foo` → `foo: _foo`.
      // allow: _sc is a legitimate internal key in the idempotency cache
      //        JSON format ({ _sc: statusCode, ...body }).
      "ajk-local/no-underscore-shorthand-destructure": ["error", { allow: ["_sc"] }],

      // ── General ───────────────────────────────────────────────────
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // null:ignore allows `x == null` / `x != null` for nullish checks (matches
      // both null and undefined). All other comparisons still require ===  / !==.
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  // ─── API Server: import cycle detection ───────────────────────────
  // Catches circular imports (e.g. sos.ts ↔ admin.ts) at lint time
  // before they surface as runtime failures or CI errors.
  {
    files: ["artifacts/api-server/src/**/*.ts"],
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: {
          project: "artifacts/api-server/tsconfig.json",
        },
      },
    },
    rules: {
      "import/no-cycle": "error",
    },
  },
  // ─── React files (admin, vendor-app, rider-app, lib UI packages) ──
  // Covers both .ts and .tsx so that hooks used in .ts hook files are
  // also checked by react-hooks/rules-of-hooks and exhaustive-deps.
  {
    files: [
      "artifacts/admin/**/*.ts",
      "artifacts/admin/**/*.tsx",
      "artifacts/vendor-app/**/*.ts",
      "artifacts/vendor-app/**/*.tsx",
      "artifacts/rider-app/**/*.ts",
      "artifacts/rider-app/**/*.tsx",
      "lib/auth-react/**/*.ts",
      "lib/auth-react/**/*.tsx",
      "lib/auth-utils/**/*.ts",
      "lib/auth-utils/**/*.tsx",
      "lib/ui/**/*.ts",
      "lib/ui/**/*.tsx",
    ],
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      "react/jsx-key": "error",
      // cmdk-input-wrapper is a valid attribute used by the cmdk library (shadcn/ui command)
      "react/no-unknown-property": ["error", { ignore: ["cmdk-input-wrapper"] }],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
    settings: { react: { version: "detect" } },
  },
];

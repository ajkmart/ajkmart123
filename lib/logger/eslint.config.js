import { createRequire } from "module";
import tseslint from "typescript-eslint";

const require = createRequire(import.meta.url);
const { rules: localRules } = require("../../eslint-rules/no-silent-catch.cjs");

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["src/**/*.{js,ts}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "ajk-local": { rules: localRules },
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // The logger package is the intentional owner of all console.* calls in
      // the monorepo. src/index.ts wraps console.* to add namespacing, level
      // filtering, and error-reporter forwarding. All other packages must use
      // @workspace/logger instead of calling console.* directly.
      //
      // Rule is set to "error" here too — any future helper files added to
      // this package must route through the same internal console calls
      // already in index.ts, not introduce new top-level console.* usage.
      // index.ts itself carries /* eslint-disable no-console */ at the top.
      "no-console": "error",

      // Disallow silent .catch(() => {}) / .catch(() => ({})) / empty catch blocks.
      "ajk-local/no-silent-catch": "error",
    },
  }
);

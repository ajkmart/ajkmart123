import reactHooks from "eslint-plugin-react-hooks";
import { createRequire } from "module";
import tseslint from "typescript-eslint";

const require = createRequire(import.meta.url);
const { rules: localRules } = require("../../eslint-rules/no-silent-catch.cjs");

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "public/**"],
  },
  {
    files: ["src/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      "react-hooks": reactHooks,
      "ajk-local": { rules: localRules },
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      // All console.* calls are banned — use @workspace/logger instead.
      // error-reporter.ts carries /* eslint-disable no-console */ because it
      // monkeypatches console.error and must call the real console internally.
      "no-console": "error",

      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",

      // Disallow silent .catch(() => {}) / .catch(() => ({})) / empty catch blocks.
      // Always log errors so failures are observable. See eslint-rules/no-silent-catch.cjs.
      "ajk-local/no-silent-catch": "error",
    },
  },
  {
    // Logger wrapper file — re-exports from @workspace/logger, no console calls,
    // but excluded so future pass-through helpers aren't blocked by the rule.
    files: ["**/lib/logger.ts"],
    rules: { "no-console": "off" },
  }
);

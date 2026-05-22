import { createRequire } from "module";
import tseslint from "typescript-eslint";

const require = createRequire(import.meta.url);
const { rules: localRules } = require("../../eslint-rules/no-silent-catch.cjs");

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "src/routes/auth.ts"],
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
      // Disallow silent .catch(() => {}) / .catch(() => ({})) / empty catch blocks.
      // Always log errors so failures are observable. See eslint-rules/no-silent-catch.cjs.
      "ajk-local/no-silent-catch": "error",
    },
  }
);

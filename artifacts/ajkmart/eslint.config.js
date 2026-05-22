// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const { rules: localRules } = require("../../eslint-rules/no-silent-catch.cjs");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/*",
      "build/*",
      ".expo/*",
      "node_modules/*",
      "public/*",
      "shims/*",
      "scripts/*",
      "server/*",
      "expo-env.d.ts",
    ],
  },
  {
    plugins: {
      "ajk-local": { rules: localRules },
    },
    rules: {
      // All console.* calls are banned — use @workspace/logger instead.
      // error-reporter.ts carries /* eslint-disable no-console */ because it
      // monkeypatches console.error and must call the real console internally.
      // The Expo production build also strips consoles via babel-plugin-transform-remove-console.
      "no-console": "error",

      // React Native does not render to the DOM — HTML entity escaping adds no value.
      "react/no-unescaped-entities": "off",

      // Platform.OS-gated conditional native imports are intentional in this codebase.
      "@typescript-eslint/no-require-imports": "off",

      // Pre-existing backlog — tracked in follow-up task "Clean up lint warnings
      // in the customer app". Re-enable once violations are resolved.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",

      // Disallow silent .catch(() => {}) / .catch(() => ({})) / empty catch blocks.
      // Always log errors so failures are observable. See eslint-rules/no-silent-catch.cjs.
      "ajk-local/no-silent-catch": "error",
    },
  },
  {
    // Logger wrapper file — re-exports from @workspace/logger, no console calls,
    // but excluded so future pass-through helpers aren't blocked by the rule.
    files: ["**/utils/logger.ts"],
    rules: { "no-console": "off" },
  },
]);

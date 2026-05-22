// Dynamic Expo config — extends app.json with environment-aware values.
// APP_ORIGIN overrides the expo-router origin; falls back to EXPO_PUBLIC_DOMAIN, then a safe default.
function resolveOrigin() {
  if (process.env.APP_ORIGIN) return process.env.APP_ORIGIN;
  if (process.env.EXPO_PUBLIC_DOMAIN) return `https://${process.env.EXPO_PUBLIC_DOMAIN}/`;
  return "https://example.com/";
}

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    [
      "expo-router",
      {
        origin: resolveOrigin(),
      },
    ],
    "expo-font",
    "expo-web-browser",
    "expo-video",
  ],
});

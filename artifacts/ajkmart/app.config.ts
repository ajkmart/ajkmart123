// eslint-disable-next-line @typescript-eslint/no-require-imports
type ExpoConfig = Record<string, unknown>;

const config: ExpoConfig = {
  name: "AJKMart Super App",
  slug: "ajkmart",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "ajkmart",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/images/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#0047B3",
  },
  ios: {
    supportsTablet: false,
    infoPlist: {
      NSLocationAlwaysAndWhenInUseUsageDescription:
        "AJKMart needs your location to track deliveries in the background when you are online as a rider.",
      NSLocationAlwaysUsageDescription:
        "AJKMart needs your location to track deliveries in the background when you are online as a rider.",
      NSLocationWhenInUseUsageDescription:
        "AJKMart needs your location to show you on the map and connect you with customers.",
      UIBackgroundModes: ["location", "fetch"],
    },
  },
  android: {
    package: "com.ajkmart.superapp",
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: "./assets/images/icon.png",
      backgroundColor: "#1A56DB",
    },
    permissions: [
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "ACCESS_BACKGROUND_LOCATION",
      "CAMERA",
      "READ_EXTERNAL_STORAGE",
      "WRITE_EXTERNAL_STORAGE",
      "FOREGROUND_SERVICE",
      "FOREGROUND_SERVICE_LOCATION",
    ],
  },
  web: {
    bundler: "metro",
    output: "static",
    favicon: "./assets/images/icon.png",
    themeColor: "#1A56DB",
    backgroundColor: "#ffffff",
    meta: {
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
    },
    pwa: {
      display: "standalone",
      startUrl: "/",
      shortName: "AJKMart",
      lang: "en",
      icon: {
        src: "./assets/images/icon.png",
        sizes: "192x192 512x512",
        type: "image/png",
      },
    },
  },
  plugins: [
    [
      "expo-router",
      {
        /**
         * APP_ORIGIN must be set to the production domain before any EAS build.
         * Set EXPO_PUBLIC_DOMAIN for Replit-hosted deployments.
         * Falls back to https://replit.com/ for development only.
         */
        origin:
          process.env.APP_ORIGIN ??
          (process.env.EXPO_PUBLIC_DOMAIN
            ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
            : "https://replit.com/"),
      },
    ],
    "expo-font",
    "expo-web-browser",
    "expo-video",
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: {
      projectId: "beda998f-beae-4a9b-9e99-1ccc888fd543",
    },
  },
  owner: "topfx75",
  runtimeVersion: {
    policy: "appVersion",
  },
  updates: {
    url: "https://u.expo.dev/beda998f-beae-4a9b-9e99-1ccc888fd543",
  },
};

export default config;

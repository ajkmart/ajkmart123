import type { CapacitorConfig } from "@capacitor/cli";

/*
 * FCM setup (Android):
 *   Place google-services.json (downloaded from the Firebase Console) in
 *   android/app/google-services.json before syncing/building.
 *
 * FCM setup (iOS / APNs):
 *   Place GoogleService-Info.plist in ios/App/App/GoogleService-Info.plist.
 *   Then upload your APNs auth key to the Firebase Console →
 *   Project Settings → Cloud Messaging → iOS app configuration.
 *   The Firebase Admin SDK routes FCM messages to APNs automatically.
 */
const config: CapacitorConfig = {
  appId: "com.ajkmart.vendor",
  appName: "AJKMart Vendor",
  webDir: "dist/public",
  server: {
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

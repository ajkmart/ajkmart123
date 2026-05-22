/**
 * Registers the AJKMart PWA service worker on web.
 * No-op on native platforms.
 */
import { Platform } from "react-native";
import { createLogger } from "@/utils/logger";
const log = createLogger("[SW]");

export function registerServiceWorker() {
  if (Platform.OS !== "web") return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        // Service worker registered successfully
      })
      .catch((err) => {
        log.warn("Registration failed:", err);
      });
  });
}

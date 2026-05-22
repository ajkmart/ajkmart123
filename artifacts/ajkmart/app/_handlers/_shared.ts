import { Platform } from "react-native";
import { setBaseUrl } from "@workspace/api-client-react";
import { createLogger } from "@/utils/logger";

export const log = createLogger("[AJKMart]");

const _envDomain = process.env.EXPO_PUBLIC_DOMAIN?.trim();
const _webHost =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  typeof window.location !== "undefined" &&
  window.location.host
    ? window.location.host
    : "";
export const _domain = _envDomain || _webHost;
if (_domain) setBaseUrl(`https://${_domain}/api`);

export const GUEST_BROWSABLE = new Set([
  "landing",
  "product",
  "vendor",
  "categories",
  "restaurants",
  "food",
  "mart",
  "pharmacy",
  "offers",
  "search",
  "parcel",
  "van",
  "school",
  "ride",
  "weather",
  "blog",
  "rate-app",
]);

export const AUTH_REDIRECT_CAP = 4;
export const AUTH_REDIRECT_RESET_MS = 3000;
export const WHATS_NEW_KEY = "@ajkmart_last_whats_new_version";

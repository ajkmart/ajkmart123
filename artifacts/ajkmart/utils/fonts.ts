import { Platform } from "react-native";
import * as Font from "expo-font";
import { createLogger } from "@/utils/logger";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";
import {
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_500Medium,
  NotoNastaliqUrdu_600SemiBold,
  NotoNastaliqUrdu_700Bold,
} from "@expo-google-fonts/noto-nastaliq-urdu";
const log = createLogger("[fonts]");

if (Platform.OS === "web" && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e?.reason?.message ?? e?.reason ?? "");
    if (msg.includes("fontfaceobserver") || msg.includes("Font") || msg === "") {
      e.preventDefault();
    }
  });
}

const CORE_FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
};

const URDU_FONTS = {
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_500Medium,
  NotoNastaliqUrdu_600SemiBold,
  NotoNastaliqUrdu_700Bold,
};

let _urduLoaded = false;
let _urduLoading: Promise<void> | null = null;

/** Returns true if Urdu fonts have already been loaded into the font registry. */
export function urduFontsReady(): boolean {
  return _urduLoaded;
}

export async function loadCoreFonts(): Promise<void> {
  try {
    await Font.loadAsync(CORE_FONTS);
  } catch {
    log.warn("Core font load failed — using system fallback");
  }
}

/**
 * Load the four Noto Nastaliq Urdu weights.
 * Safe to call multiple times — subsequent calls are no-ops.
 * Never throws; errors are silently swallowed.
 */
export async function loadUrduFonts(): Promise<void> {
  if (_urduLoaded) return;

  if (_urduLoading) {
    // eslint-disable-next-line ajk-local/no-silent-catch -- in-flight Urdu font load failure is non-critical; app continues with fallback fonts
    await _urduLoading.catch(() => {});
    return;
  }

  _urduLoading = Font.loadAsync(URDU_FONTS).then(() => {
    _urduLoaded = true;
  }).catch(() => {
    _urduLoading = null;
  });

  await _urduLoading;
}

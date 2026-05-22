import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

const MAX_DIMENSION = 1280;
const WEBP_QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55];
const JPEG_QUALITY_STEPS = [0.82, 0.72, 0.60, 0.48];

async function uriToDataUrl(uri: string, mimeType = "image/jpeg"): Promise<string> {
  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as const });
  return `data:${mimeType};base64,${base64}`;
}

async function getFileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return (info as Record<string, unknown> & { size?: number }).size ?? Infinity;
  } catch {
    return Infinity;
  }
}

/**
 * Compresses an image URI to under `maxBytes` using progressive quality reduction.
 * Tries WebP first (best compression), falls back to JPEG if WebP is unsupported.
 * Returns a base64 data URL suitable for API transmission.
 * Falls back gracefully to original if compression fails entirely.
 *
 * @param uri       Local image URI from expo-image-picker or camera.
 * @param maxBytes  Target maximum file size in bytes (default: 200 KB).
 */
export async function compressImage(uri: string, maxBytes = 200 * 1024): Promise<string> {
  if (!uri) return uriToDataUrl(uri);

  try {
    /* ── Attempt 1: WebP (superior compression, supported on Android/iOS) ── */
    let bestWebpUri: string | null = null;
    let bestWebpSize = Infinity;

    for (const quality of WEBP_QUALITY_STEPS) {
      try {
        const result = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: MAX_DIMENSION } }],
          { compress: quality, format: ImageManipulator.SaveFormat.WEBP },
        );
        const size = await getFileSize(result.uri);
        if (size <= maxBytes) {
          return uriToDataUrl(result.uri, "image/webp");
        }
        if (size < bestWebpSize) {
          bestWebpSize = size;
          bestWebpUri = result.uri;
        }
      } catch {
        /* WebP not supported on this platform/SDK version — break to JPEG fallback */
        break;
      }
    }

    /* If WebP got us close enough (within 10% over target), use it */
    if (bestWebpUri && bestWebpSize <= maxBytes * 1.1) {
      return uriToDataUrl(bestWebpUri, "image/webp");
    }

    /* ── Attempt 2: JPEG fallback ─────────────────────────────────────────── */
    let bestJpegUri: string | null = null;
    let bestJpegSize = Infinity;

    for (const quality of JPEG_QUALITY_STEPS) {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: MAX_DIMENSION } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
      const size = await getFileSize(result.uri);
      if (size <= maxBytes) {
        return uriToDataUrl(result.uri, "image/jpeg");
      }
      if (size < bestJpegSize) {
        bestJpegSize = size;
        bestJpegUri = result.uri;
      }
    }

    /* Return the smallest result we managed to produce */
    const bestUri = bestJpegUri ?? bestWebpUri ?? uri;
    const mimeType = bestJpegUri ? "image/jpeg" : bestWebpUri ? "image/webp" : "image/jpeg";
    return uriToDataUrl(bestUri, mimeType);
  } catch {
    return uriToDataUrl(uri);
  }
}

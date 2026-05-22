import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import { Platform } from "react-native";

export interface CompressOptions {
  maxWidth?: number;
  quality?: number;
}

const DEFAULT_MAX_WIDTH = 1200;
const DEFAULT_QUALITY = 0.7;

/**
 * Compresses an image to the specified max width and quality.
 * Mirrors the pattern used in `app/pharmacy/_Screen.tsx`.
 *
 * @param uri  Local image URI returned by expo-image-picker.
 * @param opts Optional overrides for `maxWidth` (px) and `quality` (0–1).
 * @returns    The URI of the compressed image (may be the original if compression is unsupported).
 */
export async function compressImage(
  uri: string,
  opts: CompressOptions = {},
): Promise<string> {
  if (!uri) return uri;

  const maxWidth = opts.maxWidth ?? DEFAULT_MAX_WIDTH;
  const quality = opts.quality ?? DEFAULT_QUALITY;

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
}

/**
 * Reads a compressed image URI and converts it to a base64 data URL for upload.
 * Handles both native (file://) and web (blob://) URIs.
 */
export async function imageUriToBase64(uri: string): Promise<string> {
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

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64" as const,
  });
  return `data:image/jpeg;base64,${base64}`;
}

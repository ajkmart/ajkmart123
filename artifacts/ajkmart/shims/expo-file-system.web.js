/**
 * expo-file-system web shim
 * File system access in browsers uses fetch + Blob URL APIs.
 */

export const documentDirectory = null;
export const cacheDirectory = null;
export const bundleDirectory = null;

export async function getInfoAsync(_uri, _options) {
  return { exists: false, isDirectory: false, size: 0, modificationTime: 0, uri: _uri };
}

export async function readAsStringAsync(_uri, _options) {
  throw new Error("File reading not supported on web");
}

export async function writeAsStringAsync(_uri, _contents, _options) {
  throw new Error("File writing not supported on web");
}

export async function deleteAsync(_uri, _options) {}

export async function moveAsync(_options) {}

export async function copyAsync(_options) {}

export async function makeDirectoryAsync(_uri, _options) {}

export async function readDirectoryAsync(_uri) {
  return [];
}

export async function downloadAsync(uri, _localUri, _options) {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = uri.split("/").pop() || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    return { uri: blobUrl, status: response.status, headers: {}, mimeType: blob.type };
  } catch (e) {
    throw new Error(`Download failed: ${e.message}`);
  }
}

export function createDownloadResumable(_uri, _localUri, _options, _callback) {
  return {
    downloadAsync: () => downloadAsync(_uri, _localUri, _options),
    pauseAsync: async () => {},
    resumeAsync: async () => {},
    cancelAsync: async () => {},
    savable: () => ({ url: _uri, fileUri: _localUri, options: _options, resumeData: null }),
  };
}

export async function uploadAsync(_url, _uri, _options) {
  throw new Error("Upload not supported on web via this API");
}

export const EncodingType = {
  Base64: "base64",
  UTF8: "utf8",
};

export const FileSystemSessionType = {
  BACKGROUND: 0,
  FOREGROUND: 1,
};

export const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
};

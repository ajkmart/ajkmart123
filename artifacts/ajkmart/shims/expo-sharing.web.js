/**
 * expo-sharing web shim
 * Uses the Web Share API if available, falls back to downloading the file.
 */

export async function isAvailableAsync() {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export async function shareAsync(url, options = {}) {
  const title = options.dialogTitle || options.mimeType || "Share";

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, url });
      return;
    } catch {}
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = url.split("/").pop() || "file";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

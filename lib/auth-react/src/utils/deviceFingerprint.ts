export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") {
    // SSR / React Native environment — return a stable per-process fallback
    return "ssr_" + Math.random().toString(36).slice(2);
  }

  try {
    const stored = sessionStorage.getItem("_dfp");
    if (stored) return stored;
  } catch (_e) {
    // sessionStorage may be disabled (e.g. private mode with storage blocked)
  }

  const fp = [
    navigator.userAgent,
    navigator.language,
    screen.width + "x" + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency ?? "",
  ]
    .filter(Boolean)
    .join("|");

  let hash = 0;
  for (let i = 0; i < fp.length; i++) {
    hash = ((hash << 5) - hash + fp.charCodeAt(i)) | 0;
  }
  const id = "web_" + Math.abs(hash).toString(36);

  try {
    sessionStorage.setItem("_dfp", id);
  } catch (_e) {
    // best-effort
  }

  return id;
}

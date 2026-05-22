import { getVendorApiBase } from "./envValidation";

/* Mirror the BASE URL logic from api.ts so the health probe targets the same
   origin as all other API calls, including Capacitor/native contexts. */
const _apiBase = getVendorApiBase();

export async function checkApiHealth(): Promise<{ reachable: boolean; url: string }> {
  const url = `${_apiBase}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { reachable: res.ok, url };
  } catch {
    return { reachable: false, url };
  } finally {
    clearTimeout(timer);
  }
}

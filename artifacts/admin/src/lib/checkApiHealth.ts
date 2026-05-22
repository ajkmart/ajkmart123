export async function checkApiHealth(): Promise<{ reachable: boolean; url: string }> {
  const url = "/api/health";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    // 429 means the server IS up but throttling — still reachable
    return { reachable: res.ok || res.status === 429, url };
  } catch {
    return { reachable: false, url };
  } finally {
    clearTimeout(timer);
  }
}

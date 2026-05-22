import dns from "dns";
import { logger } from "./logger.js";

export function isPrivateIpOrHost(host: string): boolean {
  const h = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (h === "localhost" || h === "::1" || h === "0.0.0.0" || h === "::") return true;

  // Full loopback range 127.0.0.0/8
  if (h.startsWith("127.")) return true;

  // RFC-1918 private IPv4
  if (h.startsWith("10.") || h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;

  // Link-local IPv4 (169.254.0.0/16 — covers all cloud metadata endpoints)
  if (/^169\.254\./.test(h)) return true;

  // Internal-only hostname suffixes
  if (h.endsWith(".internal") || h.endsWith(".local")) return true;

  // IPv6 link-local (fe80::/10)
  if (/^fe[89ab][0-9a-f]:/i.test(h)) return true;

  // IPv6 unique-local (fc00::/7 — fc:: and fd::)
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const ipv4mapped = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (ipv4mapped) return isPrivateIpOrHost(ipv4mapped[1]!);

  return false;
}

export async function isValidWebhookUrl(raw: string): Promise<boolean> {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return false;

    const rawHost = parsed.hostname.toLowerCase();

    if (isPrivateIpOrHost(rawHost)) return false;

    let addresses: dns.LookupAddress[];
    try {
      addresses = await dns.promises.lookup(rawHost, { all: true });
    } catch {
      logger.warn(
        { host: rawHost },
        "[webhook] DNS resolution failed during URL validation — rejecting"
      );
      return false;
    }

    for (const { address } of addresses) {
      if (isPrivateIpOrHost(address)) {
        logger.warn(
          { host: rawHost, address },
          "[webhook] Resolved address is private — rejecting webhook URL"
        );
        return false;
      }
    }

    return true;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "[webhook] URL validation threw unexpectedly"
    );
    return false;
  }
}

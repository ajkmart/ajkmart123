export interface JwtPayload {
  sub?: string;
  exp?: number;
  iat?: number;
  jti?: string;
  role?: string;
  [key: string]: unknown;
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = padded.length % 4;
  const base64 = remainder ? padded + "=".repeat(4 - remainder) : padded;
  const binary = atob(base64);
  return decodeURIComponent(
    binary
      .split("")
      .map((c: string) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]!);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string, leewaySeconds = 60): boolean {
  const payload = decodeJwt(token);
  if (!payload || typeof payload.exp !== "number") return true;
  const nowSeconds = Math.floor(Date.now() / 1000);
  return payload.exp - leewaySeconds <= nowSeconds;
}

import { createLogger } from "@workspace/logger";
const log = createLogger("[db]");

export const usingFallback = false;

if (!process.env.DATABASE_URL) {
  log.warn(
    "⚠️  Warning: DATABASE_URL secret missing! " + "Add DATABASE_URL in the Replit Secrets panel."
  );
}

const databaseUrl = process.env.DATABASE_URL!;

export { databaseUrl };

export type PgSslOption = boolean | { rejectUnauthorized: boolean };

export interface PgPoolConnection {
  connectionString: string;
  ssl?: PgSslOption;
}

const SSL_QUERY_KEYS = new Set([
  "sslmode",
  "ssl",
  "uselibpqcompat",
  "sslrootcert",
  "sslcert",
  "sslkey",
]);

export function buildPgPoolConfig(rawUrl?: string): PgPoolConnection {
  const url = rawUrl ?? databaseUrl;
  if (!url) {
    throw new Error("Database URL is required to build pool config");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { connectionString: url };
  }

  const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  const hasSslHint =
    sslMode !== "" ||
    parsed.searchParams.has("ssl") ||
    parsed.searchParams.has("uselibpqcompat") ||
    parsed.searchParams.has("sslrootcert");

  for (const key of SSL_QUERY_KEYS) {
    parsed.searchParams.delete(key);
  }

  const cleanedString = parsed.toString();

  if (sslMode === "disable" || sslMode === "allow") {
    return { connectionString: cleanedString };
  }

  const envAllowSelfSigned =
    process.env.PGSSL_ALLOW_SELF_SIGNED === "1" || process.env.PGSSL_REJECT_UNAUTHORIZED === "0";

  if (!hasSslHint) {
    return {
      connectionString: cleanedString,
      ssl: envAllowSelfSigned ? { rejectUnauthorized: false } : undefined,
    };
  }

  const allowSelfSigned = envAllowSelfSigned || sslMode === "no-verify";

  return {
    connectionString: cleanedString,
    ssl: { rejectUnauthorized: !allowSelfSigned },
  };
}

export const pgPoolConfig = buildPgPoolConfig(databaseUrl);

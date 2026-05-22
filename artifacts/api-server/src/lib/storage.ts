import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { logger } from "./logger.js";

const STORAGE_BUCKET_URL = process.env["STORAGE_BUCKET_URL"];
const STORAGE_ACCESS_KEY = process.env["STORAGE_ACCESS_KEY"];
const STORAGE_SECRET_KEY = process.env["STORAGE_SECRET_KEY"];
const STORAGE_BUCKET_NAME = process.env["STORAGE_BUCKET_NAME"];
const STORAGE_ENDPOINT = process.env["STORAGE_ENDPOINT"];
const STORAGE_REGION = process.env["STORAGE_REGION"] ?? "us-east-1";
const IS_PROD = process.env["NODE_ENV"] === "production";

export const LOCAL_UPLOADS_DIR = path.resolve(process.cwd(), "uploads");
export const PUBLIC_UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads");

let s3Client: S3Client | null = null;
let resolvedBucketName: string | null = null;
let resolvedPublicBase: string | null = null;

/* ── URL parsing ────────────────────────────────────────────────────────────
   Handles two common S3-compatible URL styles:
   • Path-style:         https://s3.amazonaws.com/my-bucket
   • Virtual-host style: https://my-bucket.s3.amazonaws.com
                         https://my-bucket.nyc3.digitaloceanspaces.com
   In both cases, bucket name is derived and the endpoint is the bare host
   (without the bucket prefix) so forcePathStyle works correctly for the SDK. */
function parseBucketUrl(rawUrl: string): { bucket: string | null; endpoint: string } {
  const url = new URL(rawUrl);

  const pathSegment = url.pathname.replace(/^\//, "").split("/")[0];
  if (pathSegment) {
    /* Path-style: bucket is the first path segment */
    return { bucket: pathSegment, endpoint: `${url.protocol}//${url.host}` };
  }

  /* Virtual-hosted style: bucket is the first subdomain */
  const hostParts = url.hostname.split(".");
  if (hostParts.length >= 3) {
    const bucket = hostParts[0]!;
    const endpointHost = hostParts.slice(1).join(".");
    return { bucket, endpoint: `${url.protocol}//${endpointHost}` };
  }

  return { bucket: null, endpoint: `${url.protocol}//${url.host}` };
}

if (STORAGE_BUCKET_URL) {
  let initError: Error | null = null;

  try {
    const { bucket: derivedBucket, endpoint: derivedEndpoint } = parseBucketUrl(STORAGE_BUCKET_URL);
    resolvedBucketName = STORAGE_BUCKET_NAME ?? derivedBucket;
    resolvedPublicBase = STORAGE_BUCKET_URL.replace(/\/$/, "");

    const endpoint = STORAGE_ENDPOINT ?? derivedEndpoint;

    const missingVars: string[] = [];
    if (!resolvedBucketName)
      missingVars.push(
        "STORAGE_BUCKET_NAME (cannot auto-detect from URL — use path-style or virtual-host URL)"
      );
    if (!STORAGE_ACCESS_KEY) missingVars.push("STORAGE_ACCESS_KEY");
    if (!STORAGE_SECRET_KEY) missingVars.push("STORAGE_SECRET_KEY");

    if (missingVars.length > 0) {
      initError = new Error(
        `[storage] STORAGE_BUCKET_URL is set but the following S3 configuration is missing: ${missingVars.join(", ")}`
      );
    } else {
      s3Client = new S3Client({
        region: STORAGE_REGION,
        endpoint,
        credentials: {
          accessKeyId: STORAGE_ACCESS_KEY!,
          secretAccessKey: STORAGE_SECRET_KEY!,
        },
        forcePathStyle: true,
      });
      logger.info(
        `[storage] S3-compatible storage enabled. Bucket: ${resolvedBucketName}, Endpoint: ${endpoint}`
      );
    }
  } catch (err) {
    initError = err instanceof Error ? err : new Error(String(err));
  }

  if (initError) {
    /* Warn and fall back to local disk in both dev and production.
       A misconfigured S3 URL should not prevent the server from starting —
       operators can fix the credentials without requiring a full redeploy. */
    logger.warn(
      { err: initError },
      "[storage] S3 config incomplete — falling back to local disk storage. " +
        "Files will not survive container restarts and are not shared across instances. " +
        "Fix STORAGE_BUCKET_URL / STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY to enable object storage."
    );
    resolvedBucketName = null;
    s3Client = null;
  }
} else {
  logger.info("[storage] STORAGE_BUCKET_URL not set — using local disk storage (./uploads/).");
}

async function ensureLocalDir(): Promise<void> {
  await mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
}

/**
 * Fallback storage: write a file to `public/uploads/` so it is served by the
 * `/uploads` static route on the API server and can be referenced by an
 * absolute `APP_BASE_URL/uploads/<key>` URL — the same format S3 returns.
 * Used in dev and in production when S3 credentials are absent.
 */
async function saveFallback(buffer: Buffer, key: string): Promise<string> {
  await mkdir(PUBLIC_UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(PUBLIC_UPLOADS_DIR, key), buffer);
  const baseUrl = (process.env["APP_BASE_URL"] ?? "http://localhost:5000").replace(/\/$/, "");
  return `${baseUrl}/uploads/${key}`;
}

export function isS3Enabled(): boolean {
  return s3Client != null && resolvedBucketName != null;
}

/**
 * Download an object from storage by key and return its raw bytes.
 * Used to serve pre-registration documents through the authenticated proxy
 * instead of exposing direct S3/public URLs.
 */
export async function storageDownload(
  key: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (s3Client && resolvedBucketName) {
    try {
      const response = await s3Client.send(
        new GetObjectCommand({ Bucket: resolvedBucketName, Key: key })
      );
      if (!response.Body) return null;
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      logger.warn(
        { key, err: err instanceof Error ? err.message : String(err) },
        "[storage] storageDownload S3 fetch failed"
      );
      return null;
    }
  }

  if (IS_PROD) {
    throw new Error("[storage] storageDownload called in production without a working S3 client.");
  }

  try {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    const buffer = await readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

export async function storageUpload(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (s3Client && resolvedBucketName && resolvedPublicBase) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: resolvedBucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `${resolvedPublicBase}/${key}`;
  }

  /* In production without S3 credentials, fall back to local disk and log a
     critical alert. Files written this way will not survive container restarts
     and are not shared across instances. Operators should set S3 credentials. */
  if (IS_PROD) {
    logger.error(
      "[storage] storageUpload: S3 not configured in production — " +
        "falling back to local disk. Files will not persist across deploys. " +
        "Set STORAGE_BUCKET_URL, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY."
    );
  }

  return saveFallback(buffer, key);
}

/* ── Private object storage ───────────────────────────────────────────────
   A SEPARATE S3 client is used for sensitive pre-registration documents so
   that those objects are NEVER written to the same bucket origin that is
   publicly readable. No per-object ACL tricks are used here: the private
   bucket itself must be configured with no public access.

   Required env vars (when deploying):
     STORAGE_PRIVATE_BUCKET_URL   — e.g. https://my-private-bucket.s3.amazonaws.com
     STORAGE_PRIVATE_ACCESS_KEY   — falls back to STORAGE_ACCESS_KEY
     STORAGE_PRIVATE_SECRET_KEY   — falls back to STORAGE_SECRET_KEY
     STORAGE_PRIVATE_BUCKET_NAME  — auto-detected from URL if absent

   In development (NODE_ENV !== "production"), files are written to the local
   uploads directory instead, which is never publicly served as a static tree.

   If the private bucket is not configured in production this function throws
   immediately (no silent fallback to the public bucket).
*/

const STORAGE_PRIVATE_BUCKET_URL = process.env["STORAGE_PRIVATE_BUCKET_URL"];
const STORAGE_PRIVATE_ACCESS_KEY = process.env["STORAGE_PRIVATE_ACCESS_KEY"] ?? STORAGE_ACCESS_KEY;
const STORAGE_PRIVATE_SECRET_KEY = process.env["STORAGE_PRIVATE_SECRET_KEY"] ?? STORAGE_SECRET_KEY;
const STORAGE_PRIVATE_BUCKET_NAME = process.env["STORAGE_PRIVATE_BUCKET_NAME"];

let privateS3Client: S3Client | null = null;
let privateResolvedBucketName: string | null = null;

if (STORAGE_PRIVATE_BUCKET_URL) {
  try {
    const { bucket: derivedBucket, endpoint: derivedEndpoint } = parseBucketUrl(
      STORAGE_PRIVATE_BUCKET_URL
    );
    privateResolvedBucketName = STORAGE_PRIVATE_BUCKET_NAME ?? derivedBucket;
    const endpoint = derivedEndpoint;
    if (privateResolvedBucketName && STORAGE_PRIVATE_ACCESS_KEY && STORAGE_PRIVATE_SECRET_KEY) {
      privateS3Client = new S3Client({
        region: STORAGE_REGION,
        endpoint,
        credentials: {
          accessKeyId: STORAGE_PRIVATE_ACCESS_KEY,
          secretAccessKey: STORAGE_PRIVATE_SECRET_KEY,
        },
        forcePathStyle: true,
      });
      logger.info(`[storage] Private S3 bucket configured. Bucket: ${privateResolvedBucketName}`);
    } else {
      logger.warn(
        "[storage] STORAGE_PRIVATE_BUCKET_URL set but credentials/bucket name incomplete — private uploads will use local disk."
      );
    }
  } catch (err) {
    logger.warn({ err }, "[storage] Failed to init private S3 client.");
  }
} else if (!IS_PROD) {
  logger.info(
    "[storage] STORAGE_PRIVATE_BUCKET_URL not set — private uploads go to local disk (development only)."
  );
}

/**
 * Upload an object to PRIVATE storage — for sensitive pre-registration
 * documents. Uses a dedicated private S3 bucket (not the public uploads
 * bucket). Files are never directly accessible via a public URL; they are
 * served only through the authenticated proxy (GET /api/uploads/reg/:key).
 *
 * In production, requires STORAGE_PRIVATE_BUCKET_URL to be configured.
 * Throws explicitly if private storage is unavailable — no silent fallback
 * to the public bucket.
 */
export async function storageUploadPrivate(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<void> {
  if (privateS3Client && privateResolvedBucketName) {
    await privateS3Client.send(
      new PutObjectCommand({
        Bucket: privateResolvedBucketName,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        /* No ACL field — the bucket itself must deny public access at the
           bucket policy/block-public-access level. We rely on bucket-level
           access control, not object-level ACLs, for broad provider compat. */
      })
    );
    return;
  }

  if (IS_PROD) {
    throw new Error(
      "[storage] storageUploadPrivate: STORAGE_PRIVATE_BUCKET_URL is required in production. " +
        "Configure a private (non-public) S3 bucket and set STORAGE_PRIVATE_BUCKET_URL, " +
        "STORAGE_PRIVATE_ACCESS_KEY, and STORAGE_PRIVATE_SECRET_KEY."
    );
  }

  /* Development fallback — local disk, served only through authenticated proxy */
  await ensureLocalDir();
  await writeFile(path.join(LOCAL_UPLOADS_DIR, key), buffer);
}

/**
 * Download an object from private storage.
 * Mirrors storageDownload() but uses the private S3 client.
 */
export async function storageDownloadPrivate(
  key: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (privateS3Client && privateResolvedBucketName) {
    try {
      const response = await privateS3Client.send(
        new GetObjectCommand({ Bucket: privateResolvedBucketName, Key: key })
      );
      if (!response.Body) return null;
      const stream = response.Body as Readable;
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      }
      return {
        buffer: Buffer.concat(chunks),
        contentType: response.ContentType ?? "application/octet-stream",
      };
    } catch (err) {
      logger.warn(
        { key, err: err instanceof Error ? err.message : String(err) },
        "[storage] storageDownloadPrivate S3 fetch failed"
      );
      return null;
    }
  }

  if (IS_PROD) {
    throw new Error(
      "[storage] storageDownloadPrivate called in production without a private S3 client."
    );
  }

  /* Dev: read from local disk */
  try {
    const filePath = path.join(LOCAL_UPLOADS_DIR, key);
    const buffer = await readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === ".jpg" || ext === ".jpeg"
        ? "image/jpeg"
        : ext === ".png"
          ? "image/png"
          : ext === ".webp"
            ? "image/webp"
            : "application/octet-stream";
    return { buffer, contentType };
  } catch {
    return null;
  }
}

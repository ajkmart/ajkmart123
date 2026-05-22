import { db } from "@workspace/db";
import { pharmacyPrescriptionRefsTable } from "@workspace/db/schema";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import type { NextFunction, Request, Response } from "express";
import { Router, type IRouter } from "express";
import { unlink, writeFile } from "fs/promises";
import multer from "multer";
import os from "os";
import path from "path";
import sharp from "sharp";
import { promisify } from "util";
import { logger } from "../lib/logger.js";
import {
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../lib/response.js";
import { storageDownloadPrivate, storageUpload, storageUploadPrivate } from "../lib/storage.js";
import { registerUploadLimiter } from "../middleware/rate-limit.js";
import {
  customerAuth,
  getCachedSettings,
  requireRole,
  riderAuth,
  verifyUserJwt,
} from "../middleware/security.js";
import { verifyAccessToken } from "../utils/admin-jwt.js";

/* ── Server-side registration upload nonce store ─────────────────────────
   Each call to POST /uploads/register-token issues a UUID nonce stored in
   this in-memory Map. The nonce is ONE-TIME USE: consumed on the first
   successful POST /uploads/register and deleted from the map.
   A second Map records which nonce owns each uploaded document so that
   GET /uploads/reg/:key can enforce owner-or-admin access.
*/
const REG_TOKEN_TTL_MS = 30 * 60 * 1000; /* 30 minutes */
const MAX_PENDING_NONCES = 500;

interface PendingNonce {
  exp: number;
  consumed: boolean;
}
const pendingNonces = new Map<string, PendingNonce>();
const docNonces = new Map<string, string>(); /* docKey → nonce */

function pruneNonces(): void {
  const now = Date.now();
  for (const [nonce, info] of pendingNonces) {
    if (info.exp < now) pendingNonces.delete(nonce);
  }
  for (const [key, nonce] of docNonces) {
    if (!pendingNonces.has(nonce)) docNonces.delete(key);
  }
}

function issueNonce(): string {
  if (pendingNonces.size >= MAX_PENDING_NONCES) pruneNonces();
  const nonce = randomUUID();
  pendingNonces.set(nonce, { exp: Date.now() + REG_TOKEN_TTL_MS, consumed: false });
  return nonce;
}

/** Validate and atomically consume a nonce (one-time use). */
function consumeNonce(nonce: string): boolean {
  if (!nonce) return false;
  const info = pendingNonces.get(nonce);
  if (!info) return false;
  if (info.exp < Date.now()) {
    pendingNonces.delete(nonce);
    return false;
  }
  if (info.consumed) return false;
  info.consumed = true;
  return true;
}

/** Associate docKey with the nonce that uploaded it (used for access check). */
function bindDocToNonce(docKey: string, nonce: string): void {
  /* Keep the nonce entry alive (even though consumed) for the doc lifetime.
     Reset consumed flag so the GET endpoint can re-validate without re-issuing. */
  const info = pendingNonces.get(nonce);
  if (info) {
    docNonces.set(docKey, nonce);
    /* extend expiry 24h so admins can review before cleanup */
    info.exp = Date.now() + 24 * 60 * 60 * 1000;
  }
}

/** Returns true if the supplied nonce is authorised to read the given docKey. */
function nonceCanReadDoc(docKey: string, nonce: string): boolean {
  const stored = docNonces.get(docKey);
  if (!stored || stored !== nonce) return false;
  const info = pendingNonces.get(nonce);
  return info !== undefined && info.exp > Date.now();
}

/* ── Combined user + admin auth for the registration-doc proxy ────────────
   Accepts either a valid end-user JWT or a valid admin access token.
   Sets req.userId (user path) or req.adminId (admin path) before next(). */
function _anyAuthOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["authorization"] as string | undefined;
  const tokenHeader = req.headers["x-auth-token"] as string | undefined;
  const raw = tokenHeader || (header?.startsWith("Bearer ") ? header.slice(7) : null);

  if (!raw) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  /* Try user JWT first */
  try {
    const userPayload = verifyUserJwt(raw);
    if (userPayload) {
      (req as Request & { userId?: string }).userId = userPayload.userId;
      next();
      return;
    }
  } catch (err) {
    logger.warn({ err }, "[uploads] user token verification failed — trying admin token");
  }

  /* Try admin JWT */
  try {
    const adminPayload = verifyAccessToken(raw);
    if (adminPayload?.sub) {
      (req as Request & { adminId?: string }).adminId = adminPayload.sub;
      next();
      return;
    }
  } catch (err) {
    logger.warn({ err }, "[uploads] admin token verification failed — rejecting request");
  }

  res.status(401).json({ error: "Authentication required" });
}

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

/* ── Production disk-storage warning ────────────────────────────────────────
   Files are stored on local disk inside ./uploads/ as a dev fallback.
   In production, set STORAGE_BUCKET_URL + STORAGE_ACCESS_KEY +
   STORAGE_SECRET_KEY to enable S3-compatible object storage.
   Without S3, uploads survive restarts on persistent volumes but are not
   shared across multiple instances. */
if (process.env.NODE_ENV === "production" && !process.env["STORAGE_BUCKET_URL"]) {
  logger.warn(
    "[uploads] STORAGE_BUCKET_URL is not set — using local disk storage (./uploads/). " +
      "Files will not survive container restarts and are not shared across instances. " +
      "Set STORAGE_BUCKET_URL, STORAGE_ACCESS_KEY, and STORAGE_SECRET_KEY for S3-compatible storage."
  );
}

const DEFAULT_MAX_IMAGE_MB = 5;
const DEFAULT_MAX_VIDEO_MB = 50;
const DEFAULT_MAX_VIDEO_DURATION_SECS = 60;
const DEFAULT_IMAGE_FORMATS = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const DEFAULT_VIDEO_FORMATS = ["video/mp4", "video/quicktime", "video/webm"];

function formatToMime(fmt: string): string {
  const f = fmt.trim().toLowerCase();
  if (f === "jpg" || f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  if (f === "mp4") return "video/mp4";
  if (f === "quicktime" || f === "mov") return "video/quicktime";
  if (f === "webm") return "video/webm";
  return f.includes("/") ? f : `image/${f}`;
}

async function getUploadLimits() {
  const s = await getCachedSettings();
  const maxImageMb =
    parseInt(s["upload_max_image_mb"] ?? String(DEFAULT_MAX_IMAGE_MB)) || DEFAULT_MAX_IMAGE_MB;
  const maxVideoMb =
    parseInt(s["upload_max_video_mb"] ?? String(DEFAULT_MAX_VIDEO_MB)) || DEFAULT_MAX_VIDEO_MB;
  const maxVideoDuration =
    parseInt(s["upload_max_video_duration_sec"] ?? String(DEFAULT_MAX_VIDEO_DURATION_SECS)) ||
    DEFAULT_MAX_VIDEO_DURATION_SECS;
  const imageFormats = s["upload_allowed_image_formats"]
    ? s["upload_allowed_image_formats"].split(",").map(formatToMime).filter(Boolean)
    : DEFAULT_IMAGE_FORMATS;
  const videoFormats = s["upload_allowed_video_formats"]
    ? s["upload_allowed_video_formats"].split(",").map(formatToMime).filter(Boolean)
    : DEFAULT_VIDEO_FORMATS;
  return {
    maxImageSize: maxImageMb * 1024 * 1024,
    maxVideoSize: maxVideoMb * 1024 * 1024,
    maxVideoDuration,
    imageFormats: imageFormats.length ? imageFormats : DEFAULT_IMAGE_FORMATS,
    videoFormats: videoFormats.length ? videoFormats : DEFAULT_VIDEO_FORMATS,
  };
}

/* ── Magic-byte (file signature) validation ─────────────────────────────────
   Prevents MIME-type spoofing by checking the actual file header bytes rather
   than trusting the Content-Type header. */
const MAGIC_BYTES: Record<string, ReadonlyArray<readonly number[]>> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/jpg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]] /* RIFF header — WebP specific check below */,
  "video/mp4": [[0x66, 0x74, 0x79, 0x70]] /* ftyp box at offset 4 */,
  "video/quicktime": [[0x66, 0x74, 0x79, 0x70]],
  "video/webm": [[0x1a, 0x45, 0xdf, 0xa3]],
};

function validateFileMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return true; /* Unknown type — pass through (MIME filter handles it) */

  const normalizedMime = mimeType === "image/jpg" ? "image/jpeg" : mimeType;

  for (const sig of signatures) {
    const offset = normalizedMime === "video/mp4" || normalizedMime === "video/quicktime" ? 4 : 0;
    if (buffer.length < offset + sig.length) continue;
    if (sig.every((byte, i) => buffer[offset + i] === byte)) {
      if (normalizedMime === "image/webp") {
        /* WebP must also have 'WEBP' at bytes 8-11 */
        if (buffer.length < 12) return false;
        return (
          buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
        );
      }
      return true;
    }
  }
  return false;
}

const prescriptionRefMap = new Map<string, string>();

const MULTER_PERMISSIVE_IMAGE_LIMIT = 50 * 1024 * 1024;
const MULTER_PERMISSIVE_VIDEO_LIMIT = 500 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_PERMISSIVE_IMAGE_LIMIT },
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MULTER_PERMISSIVE_VIDEO_LIMIT },
});

/* ── Helper: optionally compress an image buffer based on platform settings ── */
async function maybeCompressImage(buffer: Buffer, mimeType: string): Promise<Buffer> {
  try {
    const s = await getCachedSettings();
    const compressEnabled = (s["security_compress_images"] ?? "on") === "on";
    if (!compressEnabled) return buffer;
    const quality = Math.max(
      1,
      Math.min(100, parseInt(s["security_img_quality"] ?? "80", 10) || 80)
    );
    let pipeline = sharp(buffer);
    if (mimeType === "image/png") {
      pipeline = pipeline.png({ quality, compressionLevel: 6 });
    } else if (mimeType === "image/webp") {
      pipeline = pipeline.webp({ quality });
    } else {
      pipeline = pipeline.jpeg({ quality, mozjpeg: true });
    }
    return await pipeline.toBuffer();
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return buffer;
  }
}

/* ── Helper: upload an image buffer and return the public URL ── */
async function saveBuffer(buffer: Buffer, prefix: string, mimeType: string): Promise<string> {
  const ext = mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const key = `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
  const processed = await maybeCompressImage(buffer, mimeType);
  return storageUpload(processed, key, mimeType);
}

/* ── Helper: upload a video buffer and return the public URL ── */
async function saveVideoBuffer(buffer: Buffer, prefix: string, mimeType: string): Promise<string> {
  const ext =
    mimeType === "video/quicktime" ? ".mov" : mimeType === "video/webm" ? ".webm" : ".mp4";
  const key = `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
  return storageUpload(buffer, key, mimeType);
}

/* ── Helper: upload an audio buffer and return the public URL ── */
async function saveAudioBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const baseType = mimeType.split(";")[0]!.trim();
  const ext =
    baseType === "audio/mpeg"
      ? ".mp3"
      : baseType === "audio/ogg"
        ? ".ogg"
        : baseType === "audio/wav"
          ? ".wav"
          : baseType === "audio/aac"
            ? ".aac"
            : baseType === "audio/mp4"
              ? ".m4a"
              : ".webm";
  const key = `audio_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
  return storageUpload(buffer, key, baseType);
}

/* ── POST /uploads — JSON base64 upload (customers / super-app) ── */
router.post("/", customerAuth, async (req, res) => {
  try {
    const { file, filename, mimeType } = req.body;

    if (!file) {
      sendValidationError(res, "No file data provided");
      return;
    }

    const limits = await getUploadLimits();
    const mime = mimeType || "image/jpeg";
    if (!limits.imageFormats.includes(mime)) {
      sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    const base64Data = file.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > limits.maxImageSize) {
      sendValidationError(
        res,
        `File too large. Maximum ${Math.round(limits.maxImageSize / 1024 / 1024)}MB allowed`
      );
      return;
    }

    if (!validateFileMagicBytes(buffer, mime)) {
      sendValidationError(res, "File content does not match the declared MIME type");
      return;
    }

    const url = await saveBuffer(buffer, "upload", mime);

    sendCreated(res, {
      url,
      filename: filename || path.basename(url),
      size: buffer.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    sendError(res, msg);
  }
});

/* ── POST /uploads/proof — multipart/form-data delivery-proof upload (riders) ──
   Uses riderAuth so rider JWTs are accepted.
   File field name: "file"; optional field "purpose" for auditing.
   Enforces same 5MB / allowed-type limits as the JSON route.
*/
router.post(
  "/proof",
  riderAuth,
  (req, res, next) => {
    upload.single("file")(req as never, res as never, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          sendValidationError(res, "File too large");
          return;
        }
        sendValidationError(res, err.message);
        return;
      }
      if (err) {
        sendValidationError(res, err instanceof Error ? err.message : "Upload failed");
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        sendValidationError(res, "No file uploaded");
        return;
      }

      const { mimetype, buffer, originalname } = req.file;

      const limits = await getUploadLimits();
      if (!limits.imageFormats.includes(mimetype)) {
        sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
        return;
      }
      if (buffer.length > limits.maxImageSize) {
        sendValidationError(
          res,
          `File too large. Maximum ${Math.round(limits.maxImageSize / (1024 * 1024))}MB allowed`
        );
        return;
      }

      if (!validateFileMagicBytes(buffer, mimetype)) {
        sendValidationError(res, "File content does not match the declared MIME type");
        return;
      }

      const url = await saveBuffer(buffer, "proof", mimetype);

      sendCreated(res, {
        url,
        filename: originalname || path.basename(url),
        size: buffer.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      sendError(res, msg);
    }
  }
);

/* ── POST /uploads/register-token — issue a server-side one-time-use nonce ───
   Public endpoint (no auth required) that creates a UUID nonce, stores it
   server-side, and returns it to the caller. The nonce is required in
   POST /uploads/register (x-upload-token header) and is ONE-TIME USE —
   consumed on the first successful upload. This binds each document upload
   to a specific, server-tracked onboarding session rather than a freely
   mintable stateless token.
   Rate-limited by registerUploadLimiter (10 req/60 min/IP).
*/
router.post("/register-token", registerUploadLimiter, (_req, res) => {
  try {
    const nonce = issueNonce();
    res.status(200).json({ success: true, token: nonce, expiresIn: REG_TOKEN_TTL_MS / 1000 });
  } catch (e: unknown) {
    sendError(res, e instanceof Error ? e.message : "Failed to generate token");
  }
});

/* ── POST /uploads/register — multipart/form-data upload for registration documents ──
   Requires a valid x-upload-token header (obtained from POST /uploads/register-token).
   Stores the document as a private S3 object (ACL: private).
   Returns an opaque /api/uploads/reg/:key path — NOT a direct storage URL.
   The file is served only via the authenticated GET /uploads/reg/:key proxy.
*/
router.post(
  "/register",
  registerUploadLimiter,
  (req, res, next) => {
    upload.single("file")(req as never, res as never, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          sendValidationError(res, "File too large");
          return;
        }
        sendValidationError(res, err.message);
        return;
      }
      if (err) {
        sendValidationError(res, err instanceof Error ? err.message : "Upload failed");
        return;
      }
      next();
    });
  },
  async (req, res) => {
    /* Validate and atomically consume the one-time server-side nonce.
       Each nonce is issued by POST /uploads/register-token, tracked in memory,
       and can only be used once. Replay or forged tokens are rejected. */
    const uploadToken = req.headers["x-upload-token"] as string | undefined;
    if (!uploadToken || !consumeNonce(uploadToken)) {
      res.status(403).json({
        success: false,
        error:
          "A valid registration upload token is required. Call POST /api/uploads/register-token first.",
        code: "MISSING_UPLOAD_TOKEN",
      });
      return;
    }

    try {
      if (!req.file) {
        sendValidationError(res, "No file uploaded");
        return;
      }

      const { mimetype, buffer, originalname } = req.file;

      const limits = await getUploadLimits();
      if (!limits.imageFormats.includes(mimetype)) {
        sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
        return;
      }
      if (buffer.length > limits.maxImageSize) {
        sendValidationError(
          res,
          `File too large. Maximum ${Math.round(limits.maxImageSize / (1024 * 1024))}MB allowed`
        );
        return;
      }

      if (!validateFileMagicBytes(buffer, mimetype)) {
        sendValidationError(res, "File content does not match the declared MIME type");
        return;
      }

      /* Store in private storage (separate private S3 bucket, or local disk in dev).
         Never stored in the public uploads bucket. */
      const ext = mimetype === "image/png" ? ".png" : mimetype === "image/webp" ? ".webp" : ".jpg";
      const key = `reg_${Date.now()}_${randomUUID().slice(0, 8)}${ext}`;
      const processed = await maybeCompressImage(buffer, mimetype);
      await storageUploadPrivate(processed, key, mimetype);

      /* Bind the doc key to the nonce so the GET proxy can enforce ownership. */
      bindDocToNonce(key, uploadToken);

      /* Return an opaque server-relative path AND the download nonce.
         The client must pass the nonce as x-doc-nonce when retrieving the doc.
         Admins can retrieve any doc with an admin JWT (no nonce required). */
      const baseUrl =
        process.env["NODE_ENV"] !== "production"
          ? (process.env["APP_BASE_URL"] ?? `http://localhost:${process.env["PORT"] ?? "5000"}`)
          : "";
      const opaqueUrl = `${baseUrl}/api/uploads/reg/${key}`;

      sendCreated(res, {
        url: opaqueUrl,
        downloadToken: uploadToken,
        filename: originalname || key,
        size: buffer.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      sendError(res, msg);
    }
  }
);

/* ── GET /uploads/reg/:key — owner-or-admin proxy for pre-registration docs ──
   Access is restricted to either:
     (a) The original uploader: presents x-doc-nonce header matching the nonce
         that was returned in the POST /uploads/register response. This nonce
         is server-tracked and scoped to the specific docKey.
     (b) An admin: presents a valid admin access token via Authorization header.
   Any other request (valid user JWT with no matching nonce, public request,
   wrong nonce) receives a 403. Key format is validated to prevent traversal.
*/
const REG_KEY_SAFE = /^reg_[\w.-]+$/;

router.get("/reg/:key", async (req, res) => {
  const { key } = req.params as Record<string, string>;

  if (!key || !REG_KEY_SAFE.test(key)) {
    sendNotFound(res);
    return;
  }

  /* Check admin JWT first */
  const header = req.headers["authorization"] as string | undefined;
  const tokenHeader = req.headers["x-auth-token"] as string | undefined;
  const rawToken = tokenHeader || (header?.startsWith("Bearer ") ? header.slice(7) : null);
  const docNonce = req.headers["x-doc-nonce"] as string | undefined;

  let isAdmin = false;
  if (rawToken) {
    try {
      const adminPayload = verifyAccessToken(rawToken);
      if (adminPayload?.sub) isAdmin = true;
    } catch (err) {
      logger.warn({ err }, "[uploads] doc-serve: admin token check failed");
    }
  }

  /* Check owner nonce (required for non-admin callers) */
  const isOwner = docNonce ? nonceCanReadDoc(key, docNonce) : false;

  if (!isAdmin && !isOwner) {
    res.status(403).json({
      success: false,
      error: "Access denied. Present x-doc-nonce (from original upload) or an admin token.",
      code: "DOC_ACCESS_DENIED",
    });
    return;
  }

  try {
    const result = await storageDownloadPrivate(key);
    if (!result) {
      sendNotFound(res);
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(result.buffer);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    sendError(res, msg);
  }
});

/* ── POST /uploads/prescription — base64 prescription upload (customers) ── */
router.post("/prescription", customerAuth, async (req, res) => {
  try {
    const { file, mimeType, refId } = req.body;

    if (!file) {
      sendValidationError(res, "No file data provided");
      return;
    }

    if (!refId || typeof refId !== "string") {
      sendValidationError(res, "refId is required");
      return;
    }

    const limits = await getUploadLimits();
    const mime = mimeType || "image/jpeg";
    if (!limits.imageFormats.includes(mime)) {
      sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
      return;
    }

    const base64Data = file.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    if (buffer.length > limits.maxImageSize) {
      sendValidationError(
        res,
        `File too large. Maximum ${Math.round(limits.maxImageSize / 1024 / 1024)}MB allowed`
      );
      return;
    }

    if (!validateFileMagicBytes(buffer, mime)) {
      sendValidationError(res, "File content does not match the declared MIME type");
      return;
    }

    const url = await saveBuffer(buffer, "rx", mime);
    prescriptionRefMap.set(refId, url);
    setTimeout(() => prescriptionRefMap.delete(refId), 60 * 60 * 1000);

    const userId = req.customerId;
    if (userId) {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      db.insert(pharmacyPrescriptionRefsTable)
        .values({ refId, userId, photoUrl: url, expiresAt })
        .catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), refId, userId },
            "[uploads] prescription ref insert failed (non-critical)"
          );
        });
    }

    sendCreated(res, { url, refId });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    sendError(res, msg);
  }
});

router.get("/prescription/resolve/:refId", (req, res) => {
  const url = prescriptionRefMap.get(req.params.refId!);
  if (url) {
    sendSuccess(res, { url });
  } else {
    sendNotFound(res, "Reference not found or expired");
  }
});

/* ── POST /uploads/video — multipart video upload (vendors only) ── */
router.post(
  "/video",
  requireRole("vendor", { vendorApprovalCheck: true }),
  (req, res, next) => {
    videoUpload.single("file")(req as never, res as never, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          sendValidationError(res, "Video too large. Maximum 50MB allowed");
          return;
        }
        sendValidationError(res, err.message);
        return;
      }
      if (err) {
        sendValidationError(res, err instanceof Error ? err.message : "Upload failed");
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        sendValidationError(res, "No video file uploaded");
        return;
      }

      const { mimetype, buffer, originalname } = req.file;

      const limits = await getUploadLimits();
      if (!limits.videoFormats.includes(mimetype)) {
        sendValidationError(res, "Only MP4, MOV, and WebM videos are allowed");
        return;
      }
      if (buffer.length > limits.maxVideoSize) {
        sendValidationError(
          res,
          `Video too large. Maximum ${Math.round(limits.maxVideoSize / (1024 * 1024))}MB allowed`
        );
        return;
      }

      const tmpPath = path.join(os.tmpdir(), `upload_${randomUUID()}.tmp`);
      try {
        await writeFile(tmpPath, buffer);
        const { stdout } = await execFileAsync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "format=duration",
          "-of",
          "default=noprint_wrappers=1:nokey=1",
          tmpPath,
        ]);
        const duration = parseFloat(stdout.trim());
        if (isNaN(duration)) {
          sendValidationError(
            res,
            "Could not determine video duration. Please upload a valid video file."
          );
          return;
        }
        if (duration > limits.maxVideoDuration) {
          sendValidationError(
            res,
            `Video must be ${limits.maxVideoDuration} seconds or less. Your video is ${Math.ceil(duration)}s.`
          );
          return;
        }
      } catch (err) {
        logger.warn(
          {
            error: err instanceof Error ? err.message : String(err),
            code: "VIDEO_DURATION_CHECK_FAILED",
            timestamp: new Date().toISOString(),
          },
          "[uploads] ffprobe video duration check failed"
        );
        sendValidationError(
          res,
          "Could not verify video duration. Please try a different file or format."
        );
        return;
      } finally {
        unlink(tmpPath).catch((err: unknown) => {
          logger.warn(
            { err: err instanceof Error ? err.message : String(err), tmpPath },
            "[uploads] temp video file cleanup failed"
          );
        });
      }

      const url = await saveVideoBuffer(buffer, "video", mimetype);

      sendCreated(res, {
        url,
        filename: originalname || path.basename(url),
        size: buffer.length,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      sendError(res, msg);
    }
  }
);

/* ── POST /uploads/audio — multipart audio upload (authenticated users) ── */
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const ALLOWED_AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/aac",
];

router.post(
  "/audio",
  requireRole("vendor", { vendorApprovalCheck: true }),
  (req, res, next) => {
    audioUpload.single("file")(req as never, res as never, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          sendValidationError(res, "Audio too large. Maximum 20MB allowed");
          return;
        }
        sendValidationError(res, err.message);
        return;
      }
      if (err) {
        sendValidationError(res, err instanceof Error ? err.message : "Upload failed");
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        sendValidationError(res, "No audio file uploaded");
        return;
      }
      const { mimetype, buffer, originalname } = req.file;
      const baseType = mimetype.split(";")[0]!.trim();
      if (!ALLOWED_AUDIO_TYPES.includes(baseType)) {
        sendValidationError(res, "Only webm, ogg, mp3, mp4, wav, and aac audio files are allowed");
        return;
      }
      const url = await saveAudioBuffer(buffer, mimetype);
      sendCreated(res, { url, filename: originalname || path.basename(url), size: buffer.length });
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : "Audio upload failed");
    }
  }
);

/* ── POST /uploads/doc — multipart document upload (vendors only) ──
   Accepts JPEG, PNG, WebP images up to 5MB.
   Field name: "file". Returns { url }.
*/
router.post(
  "/doc",
  requireRole("vendor", { vendorApprovalCheck: false }),
  (req, res, next) => {
    upload.single("file")(req as never, res as never, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          sendValidationError(res, "File too large. Maximum 5MB allowed");
          return;
        }
        sendValidationError(res, err.message);
        return;
      }
      if (err) {
        sendValidationError(res, err instanceof Error ? err.message : "Upload failed");
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        sendValidationError(res, "No file uploaded");
        return;
      }
      const { mimetype, buffer, originalname } = req.file;
      const limits = await getUploadLimits();
      if (!limits.imageFormats.includes(mimetype)) {
        sendValidationError(res, "Only JPEG, PNG, and WebP images are allowed");
        return;
      }
      if (buffer.length > limits.maxImageSize) {
        sendValidationError(
          res,
          `File too large. Maximum ${Math.round(limits.maxImageSize / (1024 * 1024))}MB allowed`
        );
        return;
      }
      if (!validateFileMagicBytes(buffer, mimetype)) {
        sendValidationError(res, "File content does not match the declared MIME type");
        return;
      }
      const url = await saveBuffer(buffer, "vendor-doc", mimetype);
      sendCreated(res, { url, filename: originalname || path.basename(url), size: buffer.length });
    } catch (e: unknown) {
      sendError(res, e instanceof Error ? e.message : "Document upload failed");
    }
  }
);

export { prescriptionRefMap };

export default router;

import { db } from "@workspace/db";
import {
  kycVerificationsTable,
  notificationsTable,
  riderProfilesTable,
  usersTable,
} from "@workspace/db/schema";
import { randomUUID } from "crypto";
import { and, desc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { mkdir, writeFile } from "fs/promises";
import multer from "multer";
import path from "path";
import { logger } from "../lib/logger.js";
import { sendForbidden } from "../lib/response.js";
import { emitKycSubmitted } from "../lib/socketio.js";
import {
  KycAdminReviewSchema,
  KycSubmitBase64Schema,
  KycSubmitTextSchema,
} from "../lib/validation/schemas.js";
import { sendPushToUser } from "../lib/webpush.js";
import { getClientIp, logAdminAudit } from "../middleware/admin-audit.js";
import { customerAuth, requireRole } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";
import {
  sendKycApprovalEmail,
  sendKycRejectionEmail,
  sendKycResubmitEmail,
} from "../services/email.js";
import { sendApprovalSMS, sendRejectionSMS } from "../services/sms.js";
import { getCachedSettings } from "./admin-shared.js";
import { adminAuth } from "./admin.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads/kyc");
const DEFAULT_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
const _DEFAULT_MAX_KYC_IMAGE_SIZE = 5 * 1024 * 1024;

function kycFormatToMime(fmt: string): string {
  const f = fmt.trim().toLowerCase();
  if (f === "jpg" || f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "webp") return "image/webp";
  return f.includes("/") ? f : `image/${f}`;
}

async function getKycUploadLimits() {
  const s = await getCachedSettings();
  const maxMb = parseInt(s["upload_max_image_mb"] ?? "5") || 5;
  const formats = s["upload_allowed_image_formats"]
    ? s["upload_allowed_image_formats"].split(",").map(kycFormatToMime).filter(Boolean)
    : DEFAULT_ALLOWED_TYPES;
  return {
    maxSize: maxMb * 1024 * 1024,
    allowedTypes: formats.length ? formats : DEFAULT_ALLOWED_TYPES,
  };
}

/* Magic byte signatures for MIME validation */
const MIME_MAGIC: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47]],
  "image/webp": [[0x52, 0x49, 0x46, 0x46]], // RIFF....WEBP
};

function detectMime(buf: Buffer): string | null {
  for (const [mime, signatures] of Object.entries(MIME_MAGIC)) {
    for (const sig of signatures) {
      if (sig.every((byte, i) => buf[i] === byte)) return mime;
    }
  }
  return null;
}

const KYC_PERMISSIVE_LIMIT = 50 * 1024 * 1024;

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: KYC_PERMISSIVE_LIMIT },
  fileFilter: (_req, file, cb) => {
    /* Accept exactly the same set as kycLimits.allowedTypes (jpeg/png/webp) so
       the later MIME check never fires a 400 after a large buffer has already
       been loaded into memory with a disallowed type. */
    const acceptedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (acceptedTypes.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG, PNG, and WebP images are allowed for KYC"));
  },
});

async function saveKycPhoto(
  userId: string,
  type: string,
  buffer: Buffer,
  mime: string
): Promise<string> {
  const ext = mime === "image/png" ? ".png" : mime === "image/webp" ? ".webp" : ".jpg";
  const filename = `kyc_${userId.slice(-8)}_${type}_${randomUUID().slice(0, 8)}${ext}`;
  await mkdir(UPLOADS_DIR, { recursive: true });
  await writeFile(path.join(UPLOADS_DIR, filename), buffer);
  return `/api/uploads/kyc/${filename}`;
}

/** Task 11: Check if this user is allowed to submit KYC.
 *  Riders and vendors always allowed. Customers only allowed if
 *  platform config has wallet_kyc_required=on. */
async function canSubmitKyc(userId: string): Promise<{ allowed: boolean; reason?: string }> {
  const [user] = await db
    .select({ roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return { allowed: false, reason: "User not found" };

  const role = user.roles?.split(",")[0]?.trim() ?? "customer";
  if (role === "rider" || role === "vendor") return { allowed: true };

  /* Customer: check platform config */
  const settings = await getCachedSettings();
  if (settings["wallet_kyc_required"] === "on" || settings["upload_kyc_docs"] === "on") {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: "KYC verification is not required for your account type.",
  };
}

const router: IRouter = Router();

/* ─── Customer: GET /api/kyc/status ─── */
router.get("/status", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const [record] = await db
      .select()
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.userId, userId))
      .orderBy(desc(kycVerificationsTable.createdAt))
      .limit(1);

    const [user] = await db
      .select({ kycStatus: usersTable.kycStatus })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!record) {
      res.json({ status: user?.kycStatus ?? "none", record: null });
      return;
    }

    res.json({
      status: record.status,
      record: {
        id: record.id,
        status: record.status,
        fullName: record.fullName,
        cnic: record.cnic,
        dateOfBirth: record.dateOfBirth,
        gender: record.gender,
        address: record.address,
        city: record.city,
        hasFrontId: !!record.frontIdPhoto,
        hasBackId: !!record.backIdPhoto,
        hasSelfie: !!record.selfiePhoto,
        rejectionReason: record.rejectionReason,
        submittedAt: record.submittedAt.toISOString(),
        reviewedAt: record.reviewedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ─── Customer: POST /api/kyc/submit ─── */
router.post(
  "/submit",
  customerAuth,
  kycUpload.fields([
    { name: "frontIdPhoto", maxCount: 1 },
    { name: "backIdPhoto", maxCount: 1 },
    { name: "selfiePhoto", maxCount: 1 },
    { name: "idFront", maxCount: 1 },
    { name: "idBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "idPhoto", maxCount: 1 },
  ]) as unknown as import("express").RequestHandler,
  validateBody(KycSubmitTextSchema),
  async (req, res) => {
    try {
      const userId = req.customerId!;

      const { allowed, reason } = await canSubmitKyc(userId);
      if (!allowed) {
        sendForbidden(res, reason ?? "KYC not required for your account type.");
        return;
      }

      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const frontFile =
        files?.["frontIdPhoto"]?.[0] ?? files?.["idFront"]?.[0] ?? files?.["idPhoto"]?.[0];
      const backFile = files?.["backIdPhoto"]?.[0] ?? files?.["idBack"]?.[0];
      const selfieFile = files?.["selfiePhoto"]?.[0] ?? files?.["selfie"]?.[0];
      if (!frontFile) {
        res.status(400).json({ success: false, error: "Front side of CNIC is required" });
        return;
      }
      if (!backFile) {
        res.status(400).json({ success: false, error: "Back side of CNIC is required" });
        return;
      }
      if (!selfieFile) {
        res.status(400).json({ success: false, error: "Selfie photo is required" });
        return;
      }

      const kycLimits = await getKycUploadLimits();
      for (const f of [frontFile, backFile, selfieFile]) {
        if (f.size > kycLimits.maxSize) {
          res.status(400).json({
            success: false,
            error: `File ${f.originalname} exceeds ${Math.round(kycLimits.maxSize / 1024 / 1024)}MB limit`,
          });
          return;
        }
        if (!kycLimits.allowedTypes.includes(f.mimetype)) {
          res.status(400).json({
            success: false,
            error: `File type ${f.mimetype} is not allowed`,
          });
          return;
        }
      }

      const { fullName, cnic: cnicClean, dateOfBirth, gender, address, city } = req.body;

      try {
        await db.transaction(async (tx) => {
          /* Block re-submission if already approved */
          const [existing] = await tx
            .select({
              id: kycVerificationsTable.id,
              status: kycVerificationsTable.status,
            })
            .from(kycVerificationsTable)
            .where(eq(kycVerificationsTable.userId, userId))
            .orderBy(desc(kycVerificationsTable.createdAt))
            .limit(1);

          if (existing?.status === "approved") {
            throw Object.assign(new Error("KYC already verified"), {
              statusCode: 400,
            });
          }

          /* Block re-submission while a review is already pending */
          if (existing?.status === "pending") {
            throw Object.assign(
              new Error(
                "A KYC submission is already under review. Please wait for a decision before submitting again."
              ),
              { statusCode: 409 }
            );
          }

          /* Block duplicate CNIC across different users */
          const [cnicDuplicate] = await tx
            .select({ userId: kycVerificationsTable.userId })
            .from(kycVerificationsTable)
            .where(
              and(
                eq(kycVerificationsTable.cnic, cnicClean),
                ne(kycVerificationsTable.userId, userId)
              )
            )
            .limit(1);

          if (cnicDuplicate) {
            throw Object.assign(new Error("This CNIC is already registered to another account."), {
              statusCode: 409,
            });
          }

          const [frontUrl, backUrl, selfieUrl] = await Promise.all([
            saveKycPhoto(userId, "front", frontFile.buffer, frontFile.mimetype),
            saveKycPhoto(userId, "back", backFile.buffer, backFile.mimetype),
            saveKycPhoto(userId, "selfie", selfieFile.buffer, selfieFile.mimetype),
          ]);

          const id = randomUUID();
          const now = new Date();

          if (existing?.status === "rejected" || existing?.status === "resubmit") {
            await tx
              .update(kycVerificationsTable)
              .set({
                status: "pending",
                fullName,
                cnic: cnicClean,
                dateOfBirth,
                gender,
                address: address ?? null,
                city: city ?? null,
                frontIdPhoto: frontUrl,
                backIdPhoto: backUrl,
                selfiePhoto: selfieUrl,
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
                submittedAt: now,
                updatedAt: now,
              })
              .where(eq(kycVerificationsTable.userId, userId));
          } else {
            await tx.insert(kycVerificationsTable).values({
              id,
              userId,
              status: "pending",
              fullName,
              cnic: cnicClean,
              dateOfBirth,
              gender,
              address: address ?? null,
              city: city ?? null,
              frontIdPhoto: frontUrl,
              backIdPhoto: backUrl,
              selfiePhoto: selfieUrl,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }

          await tx
            .update(usersTable)
            .set({ kycStatus: "pending", updatedAt: now })
            .where(eq(usersTable.id, userId));
        });

        res.json({
          success: true,
          message: "KYC submitted successfully. Our team will review within 24 hours.",
        });
        emitKycSubmitted({ userId, submittedAt: new Date().toISOString() });
      } catch (err: unknown) {
        const errAsRecord = err as Record<string, unknown>;
        if (errAsRecord?.statusCode === 400) {
          res.status(400).json({ error: errAsRecord.message });
          return;
        }
        if (errAsRecord?.statusCode === 409) {
          res.status(409).json({ error: errAsRecord.message });
          return;
        }
        logger.error({ err }, "KYC submit error");
        res.status(500).json({ error: "Failed to submit KYC. Please try again." });
      }
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ─── Customer: POST /api/kyc/submit-base64 — JSON base64 photo upload ─── */
router.post(
  "/submit-base64",
  customerAuth,
  validateBody(KycSubmitBase64Schema),
  async (req, res) => {
    try {
      const userId = req.customerId!;

      const { allowed, reason } = await canSubmitKyc(userId);
      if (!allowed) {
        sendForbidden(res, reason ?? "KYC not required for your account type.");
        return;
      }

      const {
        fullName,
        cnic: cnicClean,
        dateOfBirth,
        gender,
        address,
        city,
        frontIdPhoto,
        backIdPhoto,
        selfiePhoto,
      } = req.body;

      const kycLimits = await getKycUploadLimits();

      function base64ToBuffer(
        dataUrl: string,
        fieldName: string
      ): { buffer: Buffer; mime: string } {
        const match = dataUrl.match(/^data:(image\/[\w]+);base64,(.+)$/);
        if (!match)
          throw Object.assign(new Error(`Invalid image data for ${fieldName}`), {
            statusCode: 400,
          });

        const claimedMime = match[1]!;
        if (!kycLimits.allowedTypes.includes(claimedMime)) {
          throw Object.assign(
            new Error(`${fieldName}: Only JPEG, PNG, or WebP images are allowed`),
            { statusCode: 400 }
          );
        }

        const buffer = Buffer.from(match[2]!, "base64");

        if (buffer.length > kycLimits.maxSize) {
          throw Object.assign(
            new Error(
              `${fieldName}: Image too large. Maximum ${Math.round(kycLimits.maxSize / (1024 * 1024))}MB allowed`
            ),
            { statusCode: 400 }
          );
        }

        /* Magic byte MIME verification — reject if bytes match no known format OR mismatch */
        const actualMime = detectMime(buffer);
        const mimeOk =
          actualMime === claimedMime ||
          (actualMime === "image/webp" && claimedMime === "image/jpeg");
        if (!actualMime) {
          throw Object.assign(
            new Error(`${fieldName}: File appears corrupted or is not a valid image`),
            { statusCode: 400 }
          );
        }
        if (!mimeOk) {
          throw Object.assign(
            new Error(`${fieldName}: Image content does not match its declared type`),
            { statusCode: 400 }
          );
        }

        return { buffer, mime: claimedMime };
      }

      try {
        const front = base64ToBuffer(frontIdPhoto, "Front CNIC photo");
        const back = base64ToBuffer(backIdPhoto, "Back CNIC photo");
        const selfie = base64ToBuffer(selfiePhoto, "Selfie photo");

        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({
              id: kycVerificationsTable.id,
              status: kycVerificationsTable.status,
            })
            .from(kycVerificationsTable)
            .where(eq(kycVerificationsTable.userId, userId))
            .orderBy(desc(kycVerificationsTable.createdAt))
            .limit(1);

          if (existing?.status === "approved") {
            throw Object.assign(new Error("KYC already verified"), {
              statusCode: 400,
            });
          }

          /* Block re-submission while a review is already pending */
          if (existing?.status === "pending") {
            throw Object.assign(
              new Error(
                "A KYC submission is already under review. Please wait for a decision before submitting again."
              ),
              { statusCode: 409 }
            );
          }

          /* Block duplicate CNIC across different users */
          const [cnicDuplicate] = await tx
            .select({ userId: kycVerificationsTable.userId })
            .from(kycVerificationsTable)
            .where(
              and(
                eq(kycVerificationsTable.cnic, cnicClean),
                ne(kycVerificationsTable.userId, userId)
              )
            )
            .limit(1);

          if (cnicDuplicate) {
            throw Object.assign(new Error("This CNIC is already registered to another account."), {
              statusCode: 409,
            });
          }

          const [frontUrl, backUrl, selfieUrl] = await Promise.all([
            saveKycPhoto(userId, "front", front.buffer, front.mime),
            saveKycPhoto(userId, "back", back.buffer, back.mime),
            saveKycPhoto(userId, "selfie", selfie.buffer, selfie.mime),
          ]);

          const id = randomUUID();
          const now = new Date();

          if (existing?.status === "rejected" || existing?.status === "resubmit") {
            await tx
              .update(kycVerificationsTable)
              .set({
                status: "pending",
                fullName,
                cnic: cnicClean,
                dateOfBirth,
                gender,
                address: address ?? null,
                city: city ?? null,
                frontIdPhoto: frontUrl,
                backIdPhoto: backUrl,
                selfiePhoto: selfieUrl,
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
                submittedAt: now,
                updatedAt: now,
              })
              .where(eq(kycVerificationsTable.userId, userId));
          } else {
            await tx.insert(kycVerificationsTable).values({
              id,
              userId,
              status: "pending",
              fullName,
              cnic: cnicClean,
              dateOfBirth,
              gender,
              address: address ?? null,
              city: city ?? null,
              frontIdPhoto: frontUrl,
              backIdPhoto: backUrl,
              selfiePhoto: selfieUrl,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }

          await tx
            .update(usersTable)
            .set({ kycStatus: "pending", updatedAt: now })
            .where(eq(usersTable.id, userId));
        });

        res.json({
          success: true,
          message: "KYC submitted successfully. Our team will review within 24 hours.",
        });
        emitKycSubmitted({ userId, submittedAt: new Date().toISOString() });
      } catch (err: unknown) {
        const errAsRec2 = err as Record<string, unknown>;
        if (errAsRec2?.statusCode === 400) {
          res.status(400).json({ error: errAsRec2.message });
          return;
        }
        if (errAsRec2?.statusCode === 409) {
          res.status(409).json({ error: errAsRec2.message });
          return;
        }
        logger.error({ err }, "KYC submit-base64 error");
        res.status(500).json({ error: "Failed to submit KYC. Please try again." });
      }
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ─── Vendor: GET /api/kyc/vendor/status ─── */
router.get("/vendor/status", requireRole("vendor"), async (req, res) => {
  try {
    const userId = req.vendorId!;
    const [record] = await db
      .select()
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.userId, userId))
      .orderBy(desc(kycVerificationsTable.createdAt))
      .limit(1);

    const [user] = await db
      .select({ kycStatus: usersTable.kycStatus })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!record) {
      res.json({ status: user?.kycStatus ?? "none", record: null });
      return;
    }

    res.json({
      status: record.status,
      record: {
        id: record.id,
        status: record.status,
        fullName: record.fullName,
        cnic: record.cnic,
        dateOfBirth: record.dateOfBirth,
        gender: record.gender,
        address: record.address,
        city: record.city,
        hasFrontId: !!record.frontIdPhoto,
        hasBackId: !!record.backIdPhoto,
        hasSelfie: !!record.selfiePhoto,
        rejectionReason: record.rejectionReason,
        submittedAt: record.submittedAt.toISOString(),
        reviewedAt: record.reviewedAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Vendor KYC status error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ─── Vendor: POST /api/kyc/vendor/submit-base64 ─── */
router.post(
  "/vendor/submit-base64",
  requireRole("vendor"),
  validateBody(KycSubmitBase64Schema),
  async (req, res) => {
    try {
      const userId = req.vendorId!;

      const { allowed, reason } = await canSubmitKyc(userId);
      if (!allowed) {
        sendForbidden(res, reason ?? "KYC not required for your account type.");
        return;
      }

      const {
        fullName,
        cnic: cnicClean,
        dateOfBirth,
        gender,
        address,
        city,
        frontIdPhoto,
        backIdPhoto,
        selfiePhoto,
      } = req.body;

      const kycLimits = await getKycUploadLimits();

      function base64ToBuffer(
        dataUrl: string,
        fieldName: string
      ): { buffer: Buffer; mime: string } {
        const match = dataUrl.match(/^data:(image\/[\w]+);base64,(.+)$/);
        if (!match)
          throw Object.assign(new Error(`Invalid image data for ${fieldName}`), {
            statusCode: 400,
          });
        const claimedMime = match[1]!;
        if (!kycLimits.allowedTypes.includes(claimedMime)) {
          throw Object.assign(
            new Error(`${fieldName}: Only JPEG, PNG, or WebP images are allowed`),
            { statusCode: 400 }
          );
        }
        const buffer = Buffer.from(match[2]!, "base64");
        if (buffer.length > kycLimits.maxSize) {
          throw Object.assign(
            new Error(
              `${fieldName}: Image too large. Maximum ${Math.round(kycLimits.maxSize / (1024 * 1024))}MB allowed`
            ),
            { statusCode: 400 }
          );
        }
        const actualMime = detectMime(buffer);
        const mimeOk =
          actualMime === claimedMime ||
          (actualMime === "image/webp" && claimedMime === "image/jpeg");
        if (!actualMime)
          throw Object.assign(
            new Error(`${fieldName}: File appears corrupted or is not a valid image`),
            { statusCode: 400 }
          );
        if (!mimeOk)
          throw Object.assign(
            new Error(`${fieldName}: Image content does not match its declared type`),
            { statusCode: 400 }
          );
        return { buffer, mime: claimedMime };
      }

      try {
        const front = base64ToBuffer(frontIdPhoto, "Front CNIC photo");
        const back = base64ToBuffer(backIdPhoto, "Back CNIC photo");
        const selfie = base64ToBuffer(selfiePhoto, "Selfie photo");

        await db.transaction(async (tx) => {
          const [existing] = await tx
            .select({ id: kycVerificationsTable.id, status: kycVerificationsTable.status })
            .from(kycVerificationsTable)
            .where(eq(kycVerificationsTable.userId, userId))
            .orderBy(desc(kycVerificationsTable.createdAt))
            .limit(1);

          if (existing?.status === "approved") {
            throw Object.assign(new Error("KYC already verified"), { statusCode: 400 });
          }
          if (existing?.status === "pending") {
            throw Object.assign(
              new Error(
                "A KYC submission is already under review. Please wait for a decision before submitting again."
              ),
              { statusCode: 409 }
            );
          }

          const [cnicDuplicate] = await tx
            .select({ userId: kycVerificationsTable.userId })
            .from(kycVerificationsTable)
            .where(
              and(
                eq(kycVerificationsTable.cnic, cnicClean),
                ne(kycVerificationsTable.userId, userId)
              )
            )
            .limit(1);

          if (cnicDuplicate) {
            throw Object.assign(new Error("This CNIC is already registered to another account."), {
              statusCode: 409,
            });
          }

          const [frontUrl, backUrl, selfieUrl] = await Promise.all([
            saveKycPhoto(userId, "front", front.buffer, front.mime),
            saveKycPhoto(userId, "back", back.buffer, back.mime),
            saveKycPhoto(userId, "selfie", selfie.buffer, selfie.mime),
          ]);

          const id = randomUUID();
          const now = new Date();

          if (existing?.status === "rejected" || existing?.status === "resubmit") {
            await tx
              .update(kycVerificationsTable)
              .set({
                status: "pending",
                fullName,
                cnic: cnicClean,
                dateOfBirth,
                gender,
                address: address ?? null,
                city: city ?? null,
                frontIdPhoto: frontUrl,
                backIdPhoto: backUrl,
                selfiePhoto: selfieUrl,
                rejectionReason: null,
                reviewedBy: null,
                reviewedAt: null,
                submittedAt: now,
                updatedAt: now,
              })
              .where(eq(kycVerificationsTable.userId, userId));
          } else {
            await tx.insert(kycVerificationsTable).values({
              id,
              userId,
              status: "pending",
              fullName,
              cnic: cnicClean,
              dateOfBirth,
              gender,
              address: address ?? null,
              city: city ?? null,
              frontIdPhoto: frontUrl,
              backIdPhoto: backUrl,
              selfiePhoto: selfieUrl,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            });
          }

          await tx
            .update(usersTable)
            .set({ kycStatus: "pending", updatedAt: now })
            .where(eq(usersTable.id, userId));
        });

        res.json({
          success: true,
          message: "KYC submitted successfully. Our team will review within 24 hours.",
        });
        emitKycSubmitted({ userId, submittedAt: new Date().toISOString() });
      } catch (err: unknown) {
        const e = err as { statusCode?: number; message?: string };
        if (e?.statusCode === 400) {
          res.status(400).json({ error: e.message });
          return;
        }
        if (e?.statusCode === 409) {
          res.status(409).json({ error: e.message });
          return;
        }
        logger.error({ err }, "Vendor KYC submit-base64 error");
        res.status(500).json({ error: "Failed to submit KYC. Please try again." });
      }
    } catch (err) {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Vendor KYC submit-base64 unhandled error"
      );
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

/* ─── Admin: GET /api/kyc/admin/list ─── */
router.get("/admin/list", adminAuth, async (req, res) => {
  try {
    const { status, q, userId, page = "1", limit = "20" } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions: SQL[] = []; // drizzle dynamic query
    if (status && status !== "all") {
      conditions.push(eq(kycVerificationsTable.status, status));
    }
    if (userId?.trim()) {
      conditions.push(eq(kycVerificationsTable.userId, userId.trim()));
    }
    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(usersTable.name, term),
          ilike(usersTable.phone, term),
          ilike(kycVerificationsTable.fullName, term),
          ilike(kycVerificationsTable.cnic, term)
        )!
      );
    }

    const whereClause =
      conditions.length === 0
        ? undefined
        : conditions.length === 1
          ? conditions[0]
          : and(...conditions);

    const records = await db
      .select({
        id: kycVerificationsTable.id,
        userId: kycVerificationsTable.userId,
        status: kycVerificationsTable.status,
        fullName: kycVerificationsTable.fullName,
        cnic: kycVerificationsTable.cnic,
        dateOfBirth: kycVerificationsTable.dateOfBirth,
        gender: kycVerificationsTable.gender,
        city: kycVerificationsTable.city,
        address: kycVerificationsTable.address,
        frontIdPhoto: kycVerificationsTable.frontIdPhoto,
        backIdPhoto: kycVerificationsTable.backIdPhoto,
        selfiePhoto: kycVerificationsTable.selfiePhoto,
        submittedAt: kycVerificationsTable.submittedAt,
        reviewedAt: kycVerificationsTable.reviewedAt,
        rejectionReason: kycVerificationsTable.rejectionReason,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        userEmail: usersTable.email,
      })
      .from(kycVerificationsTable)
      .leftJoin(usersTable, eq(kycVerificationsTable.userId, usersTable.id))
      .where(whereClause)
      .orderBy(desc(kycVerificationsTable.submittedAt))
      .limit(limitNum)
      .offset(offset);

    res.json({ records });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ─── Admin: GET /api/kyc/admin/:id ─── */
router.get("/admin/:id", adminAuth, async (req, res) => {
  try {
    const [record] = await db
      .select()
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.id, req.params["id"] as string))
      .limit(1);

    if (!record) {
      res.status(404).json({ error: "KYC record not found" });
      return;
    }

    const [user] = await db
      .select({
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
        avatar: usersTable.avatar,
        roles: usersTable.roles,
      })
      .from(usersTable)
      .where(eq(usersTable.id, record.userId))
      .limit(1);

    /* For rider users, also fetch vehicle papers / driving license from rider_profiles */
    let riderProfile: {
      vehicleType: string | null;
      vehiclePlate: string | null;
      vehicleRegNo: string | null;
      drivingLicense: string | null;
      vehiclePhoto: string | null;
      documents: string | null;
    } | null = null;
    const isRider = (user?.roles ?? "")
      .split(",")
      .map((r) => r.trim())
      .includes("rider");
    if (isRider) {
      const [rp] = await db
        .select({
          vehicleType: riderProfilesTable.vehicleType,
          vehiclePlate: riderProfilesTable.vehiclePlate,
          vehicleRegNo: riderProfilesTable.vehicleRegNo,
          drivingLicense: riderProfilesTable.drivingLicense,
          vehiclePhoto: riderProfilesTable.vehiclePhoto,
          documents: riderProfilesTable.documents,
        })
        .from(riderProfilesTable)
        .where(eq(riderProfilesTable.userId, record.userId))
        .limit(1);
      riderProfile = rp ?? null;
    }

    res.json({
      ...record,
      submittedAt: record.submittedAt.toISOString(),
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      user: user ?? null,
      riderProfile,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ─── Admin: PATCH /api/kyc/admin/:id — Review KYC ─── */
router.patch("/admin/:id", adminAuth, validateBody(KycAdminReviewSchema), async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    const [record] = await db
      .select({
        id: kycVerificationsTable.id,
        userId: kycVerificationsTable.userId,
        fullName: kycVerificationsTable.fullName,
      })
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.id, req.params["id"] as string))
      .limit(1);

    if (!record) {
      res.status(404).json({ error: "KYC record not found" });
      return;
    }

    const now = new Date();
    const adminId = req.adminId;

    let userPhone: string | null = null;
    let userEmail: string | null = null;
    let userName: string | null = record.fullName ?? null;

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(kycVerificationsTable)
          .set({
            status,
            rejectionReason:
              status === "rejected" || status === "resubmit" ? rejectionReason : null,
            reviewedAt: now,
            reviewedBy: adminId,
            updatedAt: now,
          })
          .where(eq(kycVerificationsTable.id, record.id));

        const finalKycStatus =
          status === "approved" ? "verified" : status === "resubmit" ? "resubmit" : "rejected";
        await tx
          .update(usersTable)
          .set({ kycStatus: finalKycStatus, updatedAt: now })
          .where(eq(usersTable.id, record.userId));

        const [user] = await tx
          .select({ name: usersTable.name, phone: usersTable.phone, email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, record.userId))
          .limit(1);

        userPhone = user?.phone ?? null;
        userEmail = user?.email ?? null;
        userName = record.fullName ?? user?.name ?? null;

        /* Task 12: Sync approved name to users.name if it was different */
        if (status === "approved" && record.fullName) {
          await tx
            .update(usersTable)
            .set({ name: record.fullName })
            .where(eq(usersTable.id, record.userId));
        }

        /* Notification */
        const notifTitle = status === "approved" ? "KYC Approved ✅" : "KYC Update Required ⚠️";
        const notifBody =
          status === "approved"
            ? `Shukriya ${record.fullName || user?.name || "Customer"}, aapka KYC verify ho gaya hai.`
            : `Aapka KYC review kiya gaya: ${rejectionReason || "Details mismatch"}. Dobara submit karein.`;

        await tx.insert(notificationsTable).values({
          id: randomUUID(),
          userId: record.userId,
          title: notifTitle,
          body: notifBody,
          type: "system",
          icon: status === "approved" ? "checkmark-circle" : "alert-circle",
        });

        /* Push notification */
        sendPushToUser(record.userId, {
          title: notifTitle,
          body: notifBody,
          tag: "kyc-update",
          data: { type: "kyc_status", status },
        }).catch((err: unknown) => {
          logger.warn(
            {
              err: err instanceof Error ? err.message : String(err),
              userId: record.userId,
              status,
            },
            "[kyc] review-status push notification failed"
          );
        });

        void logAdminAudit(`kyc_review_${status}`, {
          adminId,
          ip: getClientIp(req),
          result: "success",
          metadata: {
            userId: record.userId,
            status,
            reason: rejectionReason || "N/A",
          },
        });
      });

      /* Fire-and-forget SMS + Email after transaction commits */
      const settings = await getCachedSettings();
      if (status === "approved") {
        if (userPhone)
          sendApprovalSMS(userPhone, userName, "account", settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] approval SMS failed"
            )
          );
        if (userEmail)
          sendKycApprovalEmail(userEmail, userName, settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] approval email failed"
            )
          );
      } else if (status === "rejected") {
        const reason = rejectionReason || "Details mismatch";
        if (userPhone)
          sendRejectionSMS(userPhone, userName, "account", reason, settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] rejection SMS failed"
            )
          );
        if (userEmail)
          sendKycRejectionEmail(userEmail, userName, reason, settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] rejection email failed"
            )
          );
      } else if (status === "resubmit") {
        const reason = rejectionReason || "Please resubmit your documents";
        if (userPhone)
          sendRejectionSMS(userPhone, userName, "account", reason, settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] resubmit SMS failed"
            )
          );
        if (userEmail)
          sendKycResubmitEmail(userEmail, userName, reason, settings).catch((err: unknown) =>
            logger.warn(
              { err: err instanceof Error ? err.message : String(err) },
              "[kyc] resubmit email failed"
            )
          );
      }

      res.json({ success: true });
    } catch (err) {
      logger.error({ err }, "KYC review error");
      res.status(500).json({ error: "Failed to update KYC status" });
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ success: false, error: "Internal server error" });
  }
});

/* ─── Admin: POST /api/kyc/admin/:id/approve — approve KYC (alias for PATCH with status=approved) ─── */
router.post("/admin/:id/approve", adminAuth, async (req, res) => {
  try {
    const { reason } = req.body ?? {};
    const [record] = await db
      .select({
        id: kycVerificationsTable.id,
        userId: kycVerificationsTable.userId,
        fullName: kycVerificationsTable.fullName,
      })
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.id, req.params["id"] as string))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "KYC record not found" });
      return;
    }

    const now = new Date();
    const adminId = req.adminId;
    let userPhone: string | null = null;
    let userEmail: string | null = null;

    await db.transaction(async (tx) => {
      await tx
        .update(kycVerificationsTable)
        .set({
          status: "approved",
          rejectionReason: null,
          reviewedAt: now,
          reviewedBy: adminId,
          updatedAt: now,
        })
        .where(eq(kycVerificationsTable.id, record.id));
      await tx
        .update(usersTable)
        .set({ kycStatus: "verified", updatedAt: now })
        .where(eq(usersTable.id, record.userId));
      if (record.fullName) {
        await tx
          .update(usersTable)
          .set({ name: record.fullName })
          .where(eq(usersTable.id, record.userId));
      }
      const [user] = await tx
        .select({ phone: usersTable.phone, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, record.userId))
        .limit(1);
      userPhone = user?.phone ?? null;
      userEmail = user?.email ?? null;

      const notifTitle = "KYC Approved ✅";
      const notifBody = `Shukriya ${record.fullName || "Customer"}, aapka KYC verify ho gaya hai.`;
      await tx.insert(notificationsTable).values({
        id: randomUUID(),
        userId: record.userId,
        title: notifTitle,
        body: notifBody,
        type: "system",
        icon: "checkmark-circle",
      });
      sendPushToUser(record.userId, {
        title: notifTitle,
        body: notifBody,
        tag: "kyc-update",
        data: { type: "kyc_status", status: "approved" },
      }).catch((err: unknown) => {
        logger.warn(
          { userId: record.userId, err: err instanceof Error ? err.message : String(err) },
          "[kyc] push notification failed for approval — non-fatal"
        );
      });
      void logAdminAudit("kyc_review_approved", {
        adminId,
        ip: getClientIp(req),
        result: "success",
        metadata: { userId: record.userId, reason: reason || "approved" },
      });
    });

    /* Fire-and-forget SMS + Email after transaction commits */
    const settings = await getCachedSettings();
    if (userPhone)
      sendApprovalSMS(userPhone, record.fullName, "account", settings).catch((err: unknown) =>
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[kyc] approval SMS failed"
        )
      );
    if (userEmail)
      sendKycApprovalEmail(userEmail, record.fullName, settings).catch((err: unknown) =>
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[kyc] approval email failed"
        )
      );

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[kyc] approve alias failed");
    res.status(500).json({ error: "Failed to approve KYC" });
  }
});

/* ─── Admin: POST /api/kyc/admin/:id/reject — reject KYC (alias for PATCH with status=rejected) ─── */
router.post("/admin/:id/reject", adminAuth, async (req, res) => {
  try {
    const { reason } = req.body ?? {};
    if (!reason?.trim()) {
      res.status(400).json({ error: "Rejection reason is required" });
      return;
    }
    const [record] = await db
      .select({
        id: kycVerificationsTable.id,
        userId: kycVerificationsTable.userId,
        fullName: kycVerificationsTable.fullName,
      })
      .from(kycVerificationsTable)
      .where(eq(kycVerificationsTable.id, req.params["id"] as string))
      .limit(1);
    if (!record) {
      res.status(404).json({ error: "KYC record not found" });
      return;
    }

    const now = new Date();
    const adminId = req.adminId;
    let userPhone: string | null = null;
    let userEmail: string | null = null;

    await db.transaction(async (tx) => {
      await tx
        .update(kycVerificationsTable)
        .set({
          status: "rejected",
          rejectionReason: reason,
          reviewedAt: now,
          reviewedBy: adminId,
          updatedAt: now,
        })
        .where(eq(kycVerificationsTable.id, record.id));
      await tx
        .update(usersTable)
        .set({ kycStatus: "rejected", updatedAt: now })
        .where(eq(usersTable.id, record.userId));
      const [user] = await tx
        .select({ phone: usersTable.phone, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, record.userId))
        .limit(1);
      userPhone = user?.phone ?? null;
      userEmail = user?.email ?? null;

      const notifTitle = "KYC Update Required ⚠️";
      const notifBody = `Aapka KYC review kiya gaya: ${reason}. Dobara submit karein.`;
      await tx.insert(notificationsTable).values({
        id: randomUUID(),
        userId: record.userId,
        title: notifTitle,
        body: notifBody,
        type: "system",
        icon: "alert-circle",
      });
      sendPushToUser(record.userId, {
        title: notifTitle,
        body: notifBody,
        tag: "kyc-update",
        data: { type: "kyc_status", status: "rejected" },
      }).catch((err: unknown) => {
        logger.warn(
          { userId: record.userId, err: err instanceof Error ? err.message : String(err) },
          "[kyc] push notification failed for rejection — non-fatal"
        );
      });
      void logAdminAudit("kyc_review_rejected", {
        adminId,
        ip: getClientIp(req),
        result: "success",
        metadata: { userId: record.userId, reason },
      });
    });

    /* Fire-and-forget SMS + Email after transaction commits */
    const settings = await getCachedSettings();
    if (userPhone)
      sendRejectionSMS(userPhone, record.fullName, "account", reason, settings).catch(
        (err: unknown) =>
          logger.warn(
            { err: err instanceof Error ? err.message : String(err) },
            "[kyc] rejection SMS failed"
          )
      );
    if (userEmail)
      sendKycRejectionEmail(userEmail, record.fullName, reason, settings).catch((err: unknown) =>
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          "[kyc] rejection email failed"
        )
      );

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "[kyc] reject alias failed");
    res.status(500).json({ error: "Failed to reject KYC" });
  }
});

export default router;

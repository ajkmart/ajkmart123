/**
 * UserService - Admin User Management
 *
 * Centralized business logic for:
 * - Authentication & Authorization
 * - User CRUD operations
 * - OTP management
 * - Profile updates
 * - User status & conditions
 * - Session management
 */

import { db } from "@workspace/db";
import {
  adminAccountsTable,
  authAuditLogTable,
  platformSettingsTable,
  riderProfilesTable,
  userSessionsTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db/schema";
import { canonicalizePhone } from "@workspace/phone-utils";
import { createHash } from "crypto";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import {
  getPlatformSettings,
  invalidateSettingsCache,
  signAdminJwt,
} from "../routes/admin-shared.js";
import { recordAdminPasswordSnapshot } from "./admin-password-watch.service.js";
import { sendApprovalEmail, sendRejectionEmail } from "./email.js";
import {
  generateSecureOtp,
  hashPassword,
  validatePasswordStrength,
  verifyAdminSecret,
} from "./password.js";
import { resolveAdminPermissions } from "./permissions.service.js";
import { sendApprovalSMS, sendRejectionSMS } from "./sms.js";

export interface CreateUserInput {
  phone?: string;
  email?: string;
  name?: string;
  username?: string;
  role?: string;
  city?: string;
  area?: string;
  tempPassword?: string;
}

export interface UpdateUserInput {
  name?: string;
  email?: string;
  city?: string;
  area?: string;
  status?: string;
}

export interface AdminAccountInput {
  name: string;
  username?: string;
  email?: string | null;
  role: string;
  secret: string;
}

export class UserService {
  /**
   * Create a new user (for admin use)
   */
  static async createUser(input: CreateUserInput) {
    const trimPhone = input.phone?.trim() || null;
    const trimEmail = input.email?.trim().toLowerCase() || null;
    const trimName = input.name?.trim() || null;
    const trimUsername =
      input.username
        ?.trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "") || null;

    // Validate inputs
    if (!trimPhone && !trimName) {
      throw new Error("Either phone or name is required");
    }

    let canonPhone: string | null = null;
    if (trimPhone) {
      canonPhone = canonicalizePhone(trimPhone);
      if (!canonPhone || !/^3\d{9}$/.test(canonPhone)) {
        throw new Error("Phone must be a valid Pakistani mobile number");
      }

      // Check uniqueness
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.phone, canonPhone as string))
        .limit(1);
      if (existing) {
        throw new Error("A user with this phone number already exists");
      }
    }

    if (trimEmail && !trimEmail.includes("@")) {
      throw new Error("Invalid email format");
    }

    if (trimEmail) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, trimEmail))
        .limit(1);
      if (existing) {
        throw new Error("A user with this email already exists");
      }
    }

    if (trimUsername && trimUsername.length < 3) {
      throw new Error("Username must be at least 3 characters");
    }

    if (trimUsername) {
      const [existing] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.username, trimUsername))
        .limit(1);
      if (existing) {
        throw new Error("This username is already taken");
      }
    }

    const validRoles = ["customer", "rider", "vendor"];
    const userRole = validRoles.includes(input.role || "") ? input.role : "customer";

    // Hash temporary password if provided
    let passwordHash: string | null = null;
    if (input.tempPassword) {
      const strengthCheck = validatePasswordStrength(input.tempPassword);
      if (!strengthCheck.ok) {
        throw new Error(`Weak password: ${strengthCheck.message}`);
      }
      passwordHash = hashPassword(input.tempPassword);
    }

    const userId = generateId();
    const now = new Date();

    await db.insert(usersTable).values({
      id: userId,
      phone: canonPhone,
      email: trimEmail,
      name: trimName,
      username: trimUsername,
      roles: userRole,
      city: input.city || null,
      area: input.area || null,
      passwordHash: passwordHash || null,
      createdAt: now,
      updatedAt: now,
      kycStatus: "pending",
      isActive: true,
    });

    // Auto-create blank profile row so leftJoin immediately returns a profile
    // object instead of null, avoiding a data gap in the admin UI.
    if (userRole === "vendor") {
      await db.insert(vendorProfilesTable).values({ userId }).onConflictDoNothing();
    } else if (userRole === "rider") {
      await db.insert(riderProfilesTable).values({ userId }).onConflictDoNothing();
    }

    logger.info({ userId, phone: canonPhone }, "[UserService] User created");

    return { userId };
  }

  /**
   * Update user profile
   */
  static async updateUser(userId: string, input: UpdateUserInput) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) {
      updates.name = input.name.trim() || null;
    }
    if (input.email !== undefined) {
      const trimEmail = input.email.trim().toLowerCase();
      if (trimEmail && !trimEmail.includes("@")) {
        throw new Error("Invalid email format");
      }
      updates.email = trimEmail || null;
    }
    if (input.city !== undefined) {
      updates.city = input.city.trim() || null;
    }
    if (input.area !== undefined) {
      updates.area = input.area.trim() || null;
    }

    await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

    logger.info({ userId, updates }, "[UserService] User updated");

    return { success: true };
  }

  /**
   * Set user status (active/suspended/banned)
   */
  static async setUserStatus(userId: string, status: "active" | "suspended" | "banned") {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const flags =
      status === "active"
        ? { isActive: true, isBanned: false }
        : status === "suspended"
          ? { isActive: false, isBanned: false }
          : { isActive: false, isBanned: true };
    await db
      .update(usersTable)
      .set({ ...flags, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    logger.info({ userId, status }, "[UserService] User status changed");

    return { success: true };
  }

  /**
   * Approve pending user (KYC)
   */
  static async approveUser(userId: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date();
    await db
      .update(usersTable)
      .set({
        kycStatus: "verified",
        approvalStatus: "approved",
        isActive: true,
        isBanned: false,
        updatedAt: now,
      })
      .where(eq(usersTable.id, userId));

    await Promise.allSettled([
      db
        .update(vendorProfilesTable)
        .set({ updatedAt: now })
        .where(eq(vendorProfilesTable.userId, userId)),
      db
        .update(riderProfilesTable)
        .set({ updatedAt: now })
        .where(eq(riderProfilesTable.userId, userId)),
    ]);

    logger.info({ userId }, "[UserService] User approved");

    // Send approval notifications (non-blocking)
    void (async () => {
      try {
        const settings = await getPlatformSettings();
        const role = user.roles ?? "user";
        const notifications: Promise<unknown>[] = [];
        if (user.email) {
          notifications.push(sendApprovalEmail(user.email, user.name, role, settings));
        }
        if (user.phone) {
          notifications.push(sendApprovalSMS(user.phone, user.name, role, settings));
        }
        await Promise.allSettled(notifications);
        logger.info({ userId, role }, "[UserService] Approval notifications dispatched");
      } catch (err: unknown) {
        logger.warn({ userId, err }, "[UserService] Failed to send approval notifications");
      }
    })();

    return { success: true };
  }

  /**
   * Reject pending user
   */
  static async rejectUser(userId: string, reason: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    await db
      .update(usersTable)
      .set({
        kycStatus: "rejected",
        approvalStatus: "rejected",
        isActive: false,
        approvalNote: reason,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    logger.info({ userId, reason }, "[UserService] User rejected");

    // Send rejection notifications (non-blocking)
    void (async () => {
      try {
        const settings = await getPlatformSettings();
        const role = user.roles ?? "user";
        const notifications: Promise<unknown>[] = [];
        if (user.email) {
          notifications.push(sendRejectionEmail(user.email, user.name, role, reason, settings));
        }
        if (user.phone) {
          notifications.push(sendRejectionSMS(user.phone, user.name, role, reason, settings));
        }
        await Promise.allSettled(notifications);
        logger.info({ userId, role }, "[UserService] Rejection notifications dispatched");
      } catch (err: unknown) {
        logger.warn({ userId, err }, "[UserService] Failed to send rejection notifications");
      }
    })();

    return { success: true };
  }

  /**
   * Delete user (admin action)
   */
  static async deleteUser(userId: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    // Soft-delete: set deletedAt + deactivate so isNull(deletedAt) filters exclude this user
    await db
      .update(usersTable)
      .set({
        deletedAt: new Date(),
        isActive: false,
        isBanned: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    // Revoke all sessions
    await db.delete(userSessionsTable).where(eq(userSessionsTable.userId, userId));

    logger.info({ userId }, "[UserService] User deleted");

    return { success: true };
  }

  /**
   * Create admin sub-account
   */
  static async createAdminAccount(input: AdminAccountInput) {
    if (input.name.trim().length < 3) {
      throw new Error("Admin name must be at least 3 characters");
    }

    if (input.secret.length < 8) {
      throw new Error("Admin secret must be at least 8 characters");
    }

    const passwordHash = hashPassword(input.secret);

    const adminId = generateId();

    const usernameValue = (input.username ?? input.name).trim().toLowerCase();
    const emailValue = input.email ? input.email.trim().toLowerCase() || null : null;
    await db.insert(adminAccountsTable).values({
      id: adminId,
      name: input.name.trim(),
      username: usernameValue,
      email: emailValue,
      role: input.role || "viewer",
      totpEnabled: false,
      totpSecret: null,
      secret: passwordHash,
      lastLoginAt: null,
    });

    // Baseline the out-of-band password watchdog at creation time so the
    // very first secret value is not flagged as a direct DB write on the
    // next startup scan.
    await recordAdminPasswordSnapshot({
      adminId,
      secret: passwordHash,
      passwordChangedAt: null,
    });

    logger.info(
      { adminId, name: input.name, role: input.role },
      "[UserService] Admin account created"
    );

    return { adminId };
  }

  /**
   * Get OTP bypass status for user
   */
  static async getOtpBypassStatus(userId: string) {
    const [user] = await db
      .select({
        otpBypassUntil: usersTable.otpBypassUntil,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const now = new Date();
    const isBypassed = user.otpBypassUntil && user.otpBypassUntil > now;

    return {
      isBypassed,
      bypassUntil: user.otpBypassUntil,
    };
  }

  /**
   * Set OTP bypass for user
   */
  static async setOtpBypass(userId: string, bypassMinutes: number) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    const bypassUntil = new Date(Date.now() + bypassMinutes * 60 * 1000);

    await db
      .update(usersTable)
      .set({ otpBypassUntil: bypassUntil, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    logger.info({ userId, bypassMinutes }, "[UserService] OTP bypass set");

    return { success: true, bypassUntil };
  }

  /**
   * Clear OTP bypass for user
   */
  static async clearOtpBypass(userId: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    await db
      .update(usersTable)
      .set({ otpBypassUntil: null, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));

    logger.info({ userId }, "[UserService] OTP bypass cleared");

    return { success: true };
  }

  // ════════════════════════════════════════════════════════════════════════════════
  // OTP MANAGEMENT OPERATIONS
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * Hash OTP for storage
   */
  private static hashOtp(otp: string): string {
    return createHash("sha256").update(otp).digest("hex");
  }

  /**
   * Upsert platform setting
   */
  private static async upsertSetting(key: string, value: string) {
    await db
      .insert(platformSettingsTable)
      .values({ key, value, label: key, category: "otp" })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
    invalidateSettingsCache();
  }

  /**
   * Get OTP status
   */
  static async getOtpStatus() {
    const now = new Date();

    const activeDisable = await db.query.platformSettingsTable.findFirst({
      where: and(
        eq(platformSettingsTable.key, "otp_global_disabled_until"),
        gt(platformSettingsTable.value, now.toISOString())
      ),
      columns: { value: true },
    });

    const disabledUntil = activeDisable ? new Date(activeDisable.value) : null;
    const isGloballyDisabled = !!disabledUntil;

    const [{ bypassCount }] = await db
      .select({ bypassCount: sql<number>`COUNT(*)::int` })
      .from(usersTable)
      .where(sql`otp_bypass_until > now()`);

    return {
      isGloballyDisabled,
      disabledUntil: isGloballyDisabled ? disabledUntil!.toISOString() : null,
      activeBypassCount: Number(bypassCount ?? 0),
    };
  }

  /**
   * Disable OTP globally
   */
  static async disableOtpGlobally(minutes: number) {
    if (!minutes || minutes <= 0 || minutes > 1440) {
      throw new Error("minutes must be between 1 and 1440");
    }

    const disabledUntil = new Date(Date.now() + minutes * 60 * 1000);
    await this.upsertSetting("otp_global_disabled_until", disabledUntil.toISOString());

    return { disabledUntil: disabledUntil.toISOString(), minutes };
  }

  /**
   * Restore OTP globally
   */
  static async restoreOtpGlobally() {
    await this.upsertSetting("otp_global_disabled_until", new Date(0).toISOString());
    return { success: true };
  }

  /**
   * Get OTP audit log
   */
  static async getOtpAuditLog(filters?: {
    userId?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    const pageNum = Math.max(1, filters?.page ?? 1);
    const limit = 50;
    const offset = (pageNum - 1) * limit;

    const otpEvents = [
      "otp_sent",
      "otp_verified",
      "otp_failed",
      "otp_verified_new_user",
      "login_otp_bypass",
      "login_global_otp_bypass",
      "otp_reuse_attempt",
      "otp_expired",
      "otp_send_bypassed",
      "otp_send_global_bypassed",
      "admin_otp_bypass_set",
      "admin_otp_bypass_cancel",
      "admin_otp_generate",
      "admin_otp_global_disable",
      "admin_otp_global_restore",
      "admin_clear_otp_attempts",
    ];

    const conditions: any[] = [
      sql`${authAuditLogTable.event} IN (${sql.join(
        otpEvents.map((e) => sql`${e}`),
        sql`, `
      )})`,
    ];

    if (filters?.userId) conditions.push(sql`${authAuditLogTable.userId} = ${filters.userId}`);
    if (filters?.from)
      conditions.push(sql`${authAuditLogTable.createdAt} >= ${new Date(filters.from)}`);
    if (filters?.to)
      conditions.push(sql`${authAuditLogTable.createdAt} <= ${new Date(filters.to)}`);

    const whereClause = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(authAuditLogTable)
        .where(whereClause)
        .orderBy(desc(authAuditLogTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(authAuditLogTable)
        .where(whereClause),
    ]);

    // Batch-fetch user info
    const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
    const userMap = new Map<string, { phone: string | null; name: string | null }>();
    if (userIds.length > 0) {
      const users = await db
        .select({
          id: usersTable.id,
          phone: usersTable.phone,
          name: usersTable.name,
        })
        .from(usersTable)
        .where(inArray(usersTable.id, userIds));
      for (const u of users) userMap.set(u.id, { phone: u.phone, name: u.name });
    }

    const FAIL_EVENTS = new Set([
      "otp_failed",
      "otp_reuse_attempt",
      "otp_expired",
      "otp_rate_limit_exceeded",
    ]);

    const enriched = rows.map((row) => {
      const userInfo = row.userId ? (userMap.get(row.userId) ?? {}) : {};
      let metadata: Record<string, unknown> = {};
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : {};
      } catch (err) {
        /* intentional: non-fatal guard */ void err;
      }
      const metaResult = metadata?.result as string | null | undefined;
      const derivedResult = metaResult ?? (FAIL_EVENTS.has(row.event) ? "fail" : "success");

      return {
        id: row.id,
        event: row.event,
        userId: row.userId,
        phone:
          (userInfo as { phone?: string | null; name?: string | null }).phone ??
          (metadata?.phone as string | null) ??
          null,
        name: (userInfo as { phone?: string | null; name?: string | null }).name ?? null,
        ip: row.ip,
        channel: (metadata?.channel as string | null) ?? null,
        result: derivedResult,
        adminId: (metadata?.adminId as string | null) ?? null,
        createdAt: row.createdAt,
      };
    });

    return {
      entries: enriched,
      total: Number(total ?? 0),
      page: pageNum,
      pages: Math.ceil(Number(total ?? 0) / limit),
    };
  }

  /**
   * Get OTP channels priority
   */
  static async getOtpChannels() {
    const settings = await getPlatformSettings();
    const raw = settings["otp_channel_priority"] ?? "whatsapp,sms,email";
    const channels = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allChannels = ["whatsapp", "sms", "email"];
    const ordered = [...channels, ...allChannels.filter((c) => !channels.includes(c))];
    return { channels: ordered };
  }

  /**
   * Update OTP channels priority
   */
  static async updateOtpChannels(channels: string[]) {
    if (!Array.isArray(channels) || channels.length === 0) {
      throw new Error("channels must be a non-empty array");
    }
    const valid = ["whatsapp", "sms", "email"];
    const seen = new Set<string>();
    const deduped = (channels as string[]).filter(
      (c) => valid.includes(c) && !seen.has(c) && seen.add(c)
    );
    const canonical = [...deduped, ...valid.filter((c) => !seen.has(c))];
    if (deduped.length === 0) {
      throw new Error("No valid channels provided");
    }

    await this.upsertSetting("otp_channel_priority", canonical.join(","));
    return { channels: canonical };
  }

  /**
   * Generate OTP for user
   */
  static async generateOtpForUser(userId: string) {
    const [user] = await db
      .select({
        id: usersTable.id,
        phone: usersTable.phone,
        name: usersTable.name,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) throw new Error("User not found");

    const otp = generateSecureOtp();
    const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

    // Store OTP in otp_tokens table (columns removed from users table)
    const { generateOtpCode: _g, hashOtpCode } = await import("../modules/otp/otp.generate.js");
    const { saveOtpToken } = await import("../modules/otp/otp.store.js");
    const identifier = user.phone ?? userId;
    const identifierType: "phone" | "email" = user.phone ? "phone" : "email";
    await saveOtpToken({
      identifier,
      identifierType,
      otpType: "login",
      otpHash: hashOtpCode(otp),
      channel: "sms",
      userId,
      ttlMs: 5 * 60 * 1000,
    });

    await db.update(usersTable).set({ updatedAt: new Date() }).where(eq(usersTable.id, userId));

    return { otp, expiresAt: otpExpiry.toISOString(), phone: user.phone };
  }

  /**
   * Authenticate a sub-admin by username + password.
   * Returns MFA challenge if TOTP is enabled, or success with admin info.
   */
  static async authenticateAdmin(
    username: string,
    password: string,
    _ip: string
  ): Promise<{
    requiresMfa?: boolean;
    tempToken?: string;
    success?: boolean;
    admin?: { id: string; role: string; name: string; permissions: string[] };
    error?: string;
  }> {
    if (!username || !password) {
      return { success: false, error: "Username and password are required" };
    }

    const [admin] = await db
      .select()
      .from(adminAccountsTable)
      .where(and(eq(adminAccountsTable.username, username), eq(adminAccountsTable.isActive, true)))
      .limit(1);

    if (!admin) {
      return { success: false, error: "Invalid credentials" };
    }

    const passwordOk = verifyAdminSecret(password, admin.secret);
    if (!passwordOk) {
      return { success: false, error: "Invalid credentials" };
    }

    if (admin.totpEnabled && admin.totpSecret) {
      const tempToken = signAdminJwt(admin.id, "mfa_challenge", admin.name, 5 / 60);
      return { requiresMfa: true, tempToken };
    }

    await db
      .update(adminAccountsTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminAccountsTable.id, admin.id));

    const permissions = await resolveAdminPermissions(admin.id, admin.role);

    return {
      success: true,
      admin: {
        id: admin.id,
        role: admin.role,
        name: admin.name,
        permissions,
      },
    };
  }
}

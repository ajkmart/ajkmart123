import { db } from "@workspace/db";
import {
  accountConditionsTable,
  conditionRulesTable,
  conditionSettingsTable,
  usersTable,
  vanBookingsTable,
  vanDriversTable,
  vanSchedulesTable,
} from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendValidationError } from "../../lib/response.js";
import { sendPushToRole } from "../../lib/webpush.js";
import { alertAccountRestriction } from "../../services/email.js";
import { getCachedSettings } from "../admin-shared.js";

const router = Router();

const SEVERITY_RANK: Record<string, number> = {
  warning: 1,
  restriction_normal: 2,
  restriction_strict: 3,
  suspension: 4,
  ban: 5,
};

const SEVERITY_TO_CATEGORY: Record<string, string> = {
  warning: "warning",
  restriction_normal: "restriction",
  restriction_strict: "restriction",
  suspension: "suspension",
  ban: "ban",
};

const TYPE_TO_SEVERITY: Record<string, string> = {
  warning_l1: "warning",
  warning_l2: "warning",
  warning_l3: "warning",
  restriction_service_block: "restriction_normal",
  restriction_wallet_freeze: "restriction_normal",
  restriction_promo_block: "restriction_normal",
  restriction_order_cap: "restriction_normal",
  restriction_review_block: "restriction_normal",
  restriction_cash_only: "restriction_normal",
  restriction_new_order_block: "restriction_strict",
  restriction_rate_limit: "restriction_strict",
  restriction_pending_review_gate: "restriction_strict",
  restriction_device_restriction: "restriction_strict",
  suspension_temporary: "suspension",
  suspension_extended: "suspension",
  suspension_pending_review: "suspension",
  ban_soft: "ban",
  ban_hard: "ban",
  ban_fraud: "ban",
};

const ESCALATION_MAP: Record<string, string> = {
  warning_l1: "warning_l2",
  warning_l2: "warning_l3",
  warning_l3: "restriction_service_block",
  restriction_service_block: "restriction_new_order_block",
  restriction_wallet_freeze: "restriction_new_order_block",
  restriction_promo_block: "restriction_new_order_block",
  restriction_order_cap: "restriction_new_order_block",
  restriction_review_block: "restriction_new_order_block",
  restriction_cash_only: "restriction_new_order_block",
  restriction_new_order_block: "suspension_temporary",
  restriction_rate_limit: "suspension_temporary",
  restriction_pending_review_gate: "suspension_pending_review",
  restriction_device_restriction: "suspension_temporary",
  suspension_temporary: "suspension_extended",
  suspension_extended: "ban_soft",
  suspension_pending_review: "ban_soft",
  ban_soft: "ban_hard",
  ban_hard: "ban_fraud",
};

/* Minimum severity rank that triggers an admin notification.
 * Ranks: warning=1, restriction_normal=2, restriction_strict=3, suspension=4, ban=5
 * We fire for restriction_strict and above (rank ≥ 3). */
const NOTIFY_MIN_RANK = 3;

interface ConditionNotifyParams {
  userId: string;
  conditionType: string;
  severity: string;
  reason: string;
  appliedBy: string;
  triggeredByRule?: string | null;
}

/**
 * Fire-and-forget: sends a push notification to all admin subscribers and
 * an email alert when a high-severity condition is applied to a user account.
 * Errors are logged but never surface to callers (never throw).
 */
async function notifyAdminConditionApplied(params: ConditionNotifyParams): Promise<void> {
  const rank = SEVERITY_RANK[params.severity] ?? 0;
  if (rank < NOTIFY_MIN_RANK) return;

  const severityLabel: Record<string, string> = {
    restriction_strict: "Strict Restriction",
    suspension: "Suspension",
    ban: "Ban",
  };
  const label = severityLabel[params.severity] ?? params.severity;

  /* Best-effort user lookup for richer operator context */
  let userName: string | null = null;
  let userPhone: string | null = null;
  try {
    const [u] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, params.userId))
      .limit(1);
    userName = u?.name ?? null;
    userPhone = u?.phone ?? null;
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] ignore — display name falls back to userId`
    );
  }

  const displayName = userName || userPhone || params.userId;
  const pushTitle = `Account ${label} Applied`;
  const pushBody = `${displayName} — ${params.conditionType}: ${params.reason.slice(0, 100)}`;

  const pushPromise = sendPushToRole("admin", {
    title: pushTitle,
    body: pushBody,
    tag: `condition_${params.userId}`,
    data: {
      type: "account_condition",
      userId: params.userId,
      conditionType: params.conditionType,
      severity: params.severity,
      ...(params.triggeredByRule ? { rule: params.triggeredByRule } : {}),
    },
  }).catch((err) => {
    logger.error("[admin/conditions] push notification failed:", err);
  });

  const emailPromise = getCachedSettings()
    .then((settings) =>
      alertAccountRestriction(
        {
          userId: params.userId,
          userName,
          userPhone,
          conditionType: params.conditionType,
          severity: params.severity,
          reason: params.reason,
          appliedBy: params.appliedBy,
          triggeredByRule: params.triggeredByRule ?? null,
        },
        settings
      )
    )
    .then((result) => {
      if (!result.sent) {
        logger.info(
          `[admin/conditions] email alert skipped: ${result.reason ?? result.error ?? "unknown"}`
        );
      }
    })
    .catch((err) => {
      logger.error("[admin/conditions] email alert failed:", err);
    });

  await Promise.all([pushPromise, emailPromise]);
}

async function getUserRole(userId: string): Promise<string> {
  const [u] = await db
    .select({ roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!u?.roles) return "customer";
  return u.roles.split(",")[0]?.trim() || "customer";
}

/** Returns ALL roles a user has, including the synthetic "van_driver" role
 *  if they're an approved + active van driver. Used by the rule engine to
 *  match rules whose targetRole is "van_driver". */
async function getUserRoleSet(userId: string): Promise<Set<string>> {
  const roles = new Set<string>();
  const [u] = await db
    .select({ roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (u?.roles) {
    for (const r of u.roles.split(",")) {
      const t = r.trim();
      if (t) roles.add(t);
    }
  }
  if (roles.size === 0) roles.add("customer");
  // Synthetic van_driver role
  const [vd] = await db
    .select({ approvalStatus: vanDriversTable.approvalStatus, isActive: vanDriversTable.isActive })
    .from(vanDriversTable)
    .where(eq(vanDriversTable.userId, userId))
    .limit(1);
  if (vd && vd.isActive && vd.approvalStatus === "approved") {
    roles.add("van_driver");
  }
  return roles;
}

/* ─── Input validation schemas ─── */
const createConditionSchema = z.object({
  userId: z.string().min(1, "userId is required"),
  conditionType: z.string().min(1, "conditionType is required"),
  reason: z.string().min(1, "reason is required").max(1000),
  severity: z.string().optional(),
  category: z.string().optional(),
  userRole: z.string().optional(),
  notes: z.string().max(2000).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  appliedBy: z.string().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
});

const patchConditionSchema = z
  .object({
    action: z.enum(["lift", "escalate"]).optional(),
    liftReason: z.string().max(1000).optional(),
    liftedBy: z.string().optional(),
    appliedBy: z.string().optional(),
    reason: z.string().max(1000).optional(),
    notes: z.string().max(2000).optional().nullable(),
    expiresAt: z.string().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .strip();

const createConditionRuleSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  targetRole: z.string().min(1, "targetRole is required"),
  metric: z.string().min(1, "metric is required"),
  operator: z.enum([">", "<", ">=", "<=", "==", "!="]),
  threshold: z.union([z.string().min(1), z.number()]),
  conditionType: z.string().min(1, "conditionType is required"),
  severity: z.string().optional(),
  cooldownHours: z.number().int().min(0).optional(),
  modeApplicability: z.string().optional(),
  isActive: z.boolean().optional(),
});

const patchConditionRuleSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().max(500).nullable().optional(),
    targetRole: z.string().min(1).optional(),
    metric: z.string().min(1).optional(),
    operator: z.enum([">", "<", ">=", "<=", "==", "!="]).optional(),
    threshold: z.union([z.string().min(1), z.number()]).optional(),
    conditionType: z.string().min(1).optional(),
    severity: z.string().optional(),
    cooldownHours: z.number().int().min(0).optional(),
    modeApplicability: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const bulkConditionSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, "ids must be a non-empty array"),
    action: z.enum(["lift", "delete"], {
      errorMap: () => ({ message: "action must be 'lift' or 'delete'" }),
    }),
    reason: z.string().optional(),
  })
  .strict();

export async function reconcileUserFlags(
  userId: string
): Promise<{ success: boolean; conditions?: number; error?: string }> {
  try {
    const conditions = await db
      .select()
      .from(accountConditionsTable)
      .where(
        and(eq(accountConditionsTable.userId, userId), eq(accountConditionsTable.isActive, true))
      );
    return { success: true, conditions: conditions.length };
  } catch (err) {
    logger.error("reconcileUserFlags error:", err);
    return { success: false, error: String(err) };
  }
}

/* ─────────────── CONDITIONS LIST ─────────────── */
router.get("/conditions", async (req, res) => {
  try {
    const { userId, role, severity, status, search, dateFrom, dateTo } = req.query as Record<
      string,
      string
    >;

    const where: SQL[] = []; // drizzle dynamic query
    if (userId) where.push(eq(accountConditionsTable.userId, userId));
    if (role && role !== "all") where.push(eq(accountConditionsTable.userRole, role));
    if (severity && severity !== "all")
      where.push(
        eq(
          accountConditionsTable.severity,
          severity as typeof accountConditionsTable.severity._.data
        )
      );
    if (status === "active") where.push(eq(accountConditionsTable.isActive, true));
    if (status === "lifted") where.push(eq(accountConditionsTable.isActive, false));
    if (dateFrom) where.push(gte(accountConditionsTable.appliedAt, new Date(dateFrom)));
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      where.push(lte(accountConditionsTable.appliedAt, end));
    }

    const rows = await db
      .select({
        id: accountConditionsTable.id,
        userId: accountConditionsTable.userId,
        userRole: accountConditionsTable.userRole,
        conditionType: accountConditionsTable.conditionType,
        severity: accountConditionsTable.severity,
        category: accountConditionsTable.category,
        reason: accountConditionsTable.reason,
        notes: accountConditionsTable.notes,
        appliedBy: accountConditionsTable.appliedBy,
        appliedAt: accountConditionsTable.appliedAt,
        expiresAt: accountConditionsTable.expiresAt,
        liftedAt: accountConditionsTable.liftedAt,
        liftedBy: accountConditionsTable.liftedBy,
        liftReason: accountConditionsTable.liftReason,
        isActive: accountConditionsTable.isActive,
        metadata: accountConditionsTable.metadata,
        userName: usersTable.name,
        userPhone: usersTable.phone,
      })
      .from(accountConditionsTable)
      .leftJoin(usersTable, eq(accountConditionsTable.userId, usersTable.id))
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(accountConditionsTable.appliedAt));

    let conditions = rows;
    if (search) {
      const q = search.toLowerCase();
      conditions = rows.filter(
        (c) =>
          (c.userName ?? "").toLowerCase().includes(q) ||
          (c.userPhone ?? "").toLowerCase().includes(q) ||
          (c.reason ?? "").toLowerCase().includes(q)
      );
    }

    const activeConditions = conditions.filter((c) => c.isActive);
    const severityCounts: Record<string, number> = {};
    const roleCounts: Record<string, number> = {};
    for (const c of activeConditions) {
      severityCounts[c.severity] = (severityCounts[c.severity] || 0) + 1;
      roleCounts[c.userRole] = (roleCounts[c.userRole] || 0) + 1;
    }

    res.json({
      success: true,
      data: {
        conditions,
        activeCount: activeConditions.length,
        severityCounts,
        roleCounts,
      },
    });
  } catch (error) {
    logger.error("[admin/conditions] list error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

router.get("/conditions/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const conditions = await db
      .select()
      .from(accountConditionsTable)
      .where(eq(accountConditionsTable.userId, userId))
      .orderBy(desc(accountConditionsTable.appliedAt));
    res.json({ success: true, data: { conditions } });
  } catch (error) {
    logger.error("[admin/conditions] user conditions error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

router.post("/conditions", async (req, res) => {
  try {
    const p = createConditionSchema.safeParse(req.body ?? {});
    if (!p.success) {
      const msg = p.error.errors.map((e) => e.message).join("; ");
      return res.status(400).json({ success: false, error: msg });
    }
    try {
      const { userId, conditionType, reason, notes, expiresAt, appliedBy, metadata } = p.data;
      const severity = p.data.severity || TYPE_TO_SEVERITY[conditionType] || "warning";
      const category = p.data.category || SEVERITY_TO_CATEGORY[severity] || "warning";
      const userRole = p.data.userRole || (await getUserRole(userId));

      const [created] = await db
        .insert(accountConditionsTable)
        .values({
          id: generateId(),
          userId,
          userRole,
          conditionType: conditionType as "warning_l1",
          severity: severity as "warning",
          category,
          reason,
          notes: notes ?? null,
          appliedBy: appliedBy ?? "admin",
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isActive: true,
          metadata: metadata ?? null,
        })
        .returning();

      res.json({ success: true, data: created });

      /* Fire admin notifications after response — non-blocking */
      notifyAdminConditionApplied({
        userId,
        conditionType,
        severity,
        reason,
        appliedBy: appliedBy ?? "admin",
      }).catch((err: unknown) =>
        logger.warn(
          {
            message: "[admin/conditions] notify error",
            error: err instanceof Error ? err.message : String(err),
            code: "CONDITIONS_NOTIFY_FAILED",
            correlationId: null,
            timestamp: new Date().toISOString(),
          },
          "[admin/conditions] notify error"
        )
      );

      return;
    } catch (error) {
      logger.error("[admin/conditions] create error:", error);
      res.status(500).json({ success: false, error: "An internal error occurred" });
      return;
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
    return;
  }
});

router.patch("/conditions/:id", async (req, res) => {
  try {
    const p = patchConditionSchema.safeParse(req.body ?? {});
    if (!p.success) {
      const msg = p.error.errors.map((e) => e.message).join("; ");
      return res.status(400).json({ success: false, error: msg });
    }
    try {
      const { id } = req.params as Record<string, string>;
      const { action, liftReason, liftedBy, appliedBy, reason, notes, expiresAt, isActive } =
        p.data;

      const [existing] = await db
        .select()
        .from(accountConditionsTable)
        .where(eq(accountConditionsTable.id, id))
        .limit(1);
      if (!existing) return res.status(404).json({ success: false, error: "Condition not found" });

      if (action === "lift") {
        const [updated] = await db
          .update(accountConditionsTable)
          .set({
            isActive: false,
            liftedAt: new Date(),
            liftedBy: liftedBy ?? "admin",
            liftReason: liftReason ?? "Lifted by admin",
            updatedAt: new Date(),
          })
          .where(eq(accountConditionsTable.id, id))
          .returning();
        return res.json({ success: true, data: updated });
      }

      if (action === "escalate") {
        const nextType = ESCALATION_MAP[existing.conditionType] || existing.conditionType;
        const nextSeverity = TYPE_TO_SEVERITY[nextType] || existing.severity;
        const nextCategory = SEVERITY_TO_CATEGORY[nextSeverity] || existing.category;
        await db
          .update(accountConditionsTable)
          .set({
            isActive: false,
            liftedAt: new Date(),
            liftedBy: liftedBy ?? "admin",
            liftReason: `Escalated to ${nextType}`,
            updatedAt: new Date(),
          })
          .where(eq(accountConditionsTable.id, id));
        const [created] = await db
          .insert(accountConditionsTable)
          .values({
            id: generateId(),
            userId: existing.userId,
            userRole: existing.userRole,
            conditionType: nextType as typeof existing.conditionType,
            severity: nextSeverity as typeof existing.severity,
            category: nextCategory,
            reason: reason ?? `Escalated from ${existing.conditionType}`,
            notes: existing.notes,
            appliedBy: appliedBy ?? "admin",
            isActive: true,
            metadata: { escalatedFrom: existing.id },
          })
          .returning();
        return res.json({ success: true, data: created });
      }

      /* General field update — only the allowlisted fields from the validated schema */
      const generalUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (notes !== undefined) generalUpdates.notes = notes;
      if (expiresAt !== undefined)
        generalUpdates.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (isActive !== undefined) generalUpdates.isActive = isActive;
      if (reason !== undefined) generalUpdates.reason = reason;
      if (appliedBy !== undefined) generalUpdates.appliedBy = appliedBy;

      const [updated] = await db
        .update(accountConditionsTable)
        .set(generalUpdates)
        .where(eq(accountConditionsTable.id, id))
        .returning();
      return res.json({ success: true, data: updated });
    } catch (error) {
      logger.error("[admin/conditions] update error:", error);
      return res.status(500).json({ success: false, error: "An internal error occurred" });
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
    return;
  }
});

router.delete("/conditions/:id", async (req, res) => {
  try {
    await db.delete(accountConditionsTable).where(eq(accountConditionsTable.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error("[admin/conditions] delete error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

router.post("/conditions/bulk", async (req, res) => {
  try {
    const p = bulkConditionSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }
    try {
      const { ids, action, reason } = p.data;
      if (action === "lift") {
        const result = await db
          .update(accountConditionsTable)
          .set({
            isActive: false,
            liftedAt: new Date(),
            liftedBy: "admin",
            liftReason: reason || "Bulk lift by admin",
            updatedAt: new Date(),
          })
          .where(
            and(inArray(accountConditionsTable.id, ids), eq(accountConditionsTable.isActive, true))
          )
          .returning({ id: accountConditionsTable.id });
        return res.json({ success: true, affected: result.length });
      }
      if (action === "delete") {
        const result = await db
          .delete(accountConditionsTable)
          .where(inArray(accountConditionsTable.id, ids))
          .returning({ id: accountConditionsTable.id });
        return res.json({ success: true, affected: result.length });
      }
      return res.status(400).json({ success: false, error: "Unsupported action" });
    } catch (error) {
      logger.error("[admin/conditions] bulk action error:", error);
      return res.status(500).json({ success: false, error: "An internal error occurred" });
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
    return;
  }
});

/* ─────────────── CONDITION RULES (CRUD) ─────────────── */
router.get("/condition-rules", async (_req, res) => {
  try {
    const rules = await db
      .select()
      .from(conditionRulesTable)
      .orderBy(desc(conditionRulesTable.createdAt));
    res.json({ success: true, data: { rules } });
  } catch (error) {
    logger.error("[admin/condition-rules] list error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

router.post("/condition-rules", async (req, res) => {
  try {
    const p = createConditionRuleSchema.safeParse(req.body ?? {});
    if (!p.success) {
      const msg = p.error.errors.map((e) => e.message).join("; ");
      return res.status(400).json({ success: false, error: msg });
    }
    try {
      const {
        name,
        description,
        targetRole,
        metric,
        operator,
        threshold,
        conditionType,
        severity,
        cooldownHours,
        modeApplicability,
        isActive,
      } = p.data;
      const sev = severity || TYPE_TO_SEVERITY[conditionType] || "warning";
      const [created] = await db
        .insert(conditionRulesTable)
        .values({
          id: generateId(),
          name,
          description: description ?? null,
          targetRole,
          metric,
          operator,
          threshold: String(threshold),
          conditionType: conditionType as "warning_l1",
          severity: sev as "warning",
          cooldownHours: cooldownHours != null ? Number(cooldownHours) : 24,
          modeApplicability: modeApplicability ?? "default,ai_recommended,custom",
          isActive: isActive ?? true,
        })
        .returning();
      return res.json({ success: true, data: created });
    } catch (error) {
      logger.error("[admin/condition-rules] create error:", error);
      return res.status(500).json({ success: false, error: "An internal error occurred" });
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
    return;
  }
});

router.patch("/condition-rules/:id", async (req, res) => {
  try {
    const p = patchConditionRuleSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }
    try {
      const validated = p.data;
      const updates: Record<string, unknown> = { ...validated, updatedAt: new Date() };
      if (updates.threshold !== undefined) updates.threshold = String(updates.threshold);
      if (updates.cooldownHours !== undefined)
        updates.cooldownHours = Number(updates.cooldownHours);
      const [updated] = await db
        .update(conditionRulesTable)
        .set(updates)
        .where(eq(conditionRulesTable.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ success: false, error: "Rule not found" });
      return res.json({ success: true, data: updated });
    } catch (error) {
      logger.error("[admin/condition-rules] patch error:", error);
      return res.status(500).json({ success: false, error: "An internal error occurred" });
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
    return;
  }
});

router.delete("/condition-rules/:id", async (req, res) => {
  try {
    await db.delete(conditionRulesTable).where(eq(conditionRulesTable.id, req.params.id));
    res.json({ success: true });
  } catch (error) {
    logger.error("[admin/condition-rules] delete error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

/* ─────────────── DEFAULT RULE SEEDS ─────────────── */
const DEFAULT_RULES: Array<Partial<typeof conditionRulesTable.$inferInsert>> = [
  // Customer
  {
    name: "Customer high cancellation",
    targetRole: "customer",
    metric: "cancellation_rate",
    operator: ">",
    threshold: "30",
    conditionType: "warning_l2",
    severity: "warning",
    cooldownHours: 48,
    description: "Cancels too many orders",
  },
  {
    name: "Customer fraud incident",
    targetRole: "customer",
    metric: "fraud_incidents",
    operator: ">=",
    threshold: "1",
    conditionType: "ban_fraud",
    severity: "ban",
    cooldownHours: 0,
    description: "Confirmed payment fraud",
  },
  {
    name: "Customer abuse reports",
    targetRole: "customer",
    metric: "abuse_reports",
    operator: ">=",
    threshold: "3",
    conditionType: "suspension_temporary",
    severity: "suspension",
    cooldownHours: 72,
  },
  {
    name: "Customer failed payments",
    targetRole: "customer",
    metric: "failed_payments_7d",
    operator: ">=",
    threshold: "5",
    conditionType: "restriction_cash_only",
    severity: "restriction_normal",
    cooldownHours: 168,
  },
  // Rider
  {
    name: "Rider miss/ignore high",
    targetRole: "rider",
    metric: "miss_ignore_rate",
    operator: ">",
    threshold: "40",
    conditionType: "warning_l2",
    severity: "warning",
    cooldownHours: 48,
  },
  {
    name: "Rider rating low",
    targetRole: "rider",
    metric: "avg_rating_30d",
    operator: "<",
    threshold: "3.5",
    conditionType: "warning_l1",
    severity: "warning",
    cooldownHours: 72,
  },
  {
    name: "Rider GPS spoofing",
    targetRole: "rider",
    metric: "gps_spoofing",
    operator: ">=",
    threshold: "1",
    conditionType: "ban_fraud",
    severity: "ban",
    cooldownHours: 0,
  },
  {
    name: "Rider cancellation debt",
    targetRole: "rider",
    metric: "cancellation_debt",
    operator: ">",
    threshold: "500",
    conditionType: "restriction_new_order_block",
    severity: "restriction_strict",
    cooldownHours: 24,
  },
  // Van driver (synthetic role — matched via getUserRoleSet)
  {
    name: "Van driver excessive cancellations",
    targetRole: "van_driver",
    metric: "van_cancellation_count_30d",
    operator: ">=",
    threshold: "5",
    conditionType: "warning_l2",
    severity: "warning",
    cooldownHours: 48,
    description: "Cancelled too many van trips in last 30 days",
  },
  {
    name: "Van driver no-shows",
    targetRole: "van_driver",
    metric: "van_noshow_count",
    operator: ">=",
    threshold: "3",
    conditionType: "restriction_service_block",
    severity: "restriction_normal",
    cooldownHours: 72,
    description: "Multiple passenger no-shows on van trips",
  },
  {
    name: "Van driver missed start",
    targetRole: "van_driver",
    metric: "van_driver_missed_start",
    operator: ">=",
    threshold: "2",
    conditionType: "warning_l1",
    severity: "warning",
    cooldownHours: 24,
    description: "Missed scheduled trip starts",
  },
  // Vendor
  {
    name: "Vendor complaint reports",
    targetRole: "vendor",
    metric: "complaint_reports",
    operator: ">=",
    threshold: "5",
    conditionType: "warning_l2",
    severity: "warning",
    cooldownHours: 72,
  },
  {
    name: "Vendor fake item complaints",
    targetRole: "vendor",
    metric: "fake_item_complaints",
    operator: ">=",
    threshold: "3",
    conditionType: "restriction_new_order_block",
    severity: "restriction_strict",
    cooldownHours: 168,
  },
  {
    name: "Vendor hygiene complaints",
    targetRole: "vendor",
    metric: "hygiene_complaints",
    operator: ">=",
    threshold: "3",
    conditionType: "suspension_temporary",
    severity: "suspension",
    cooldownHours: 168,
  },
  {
    name: "Vendor late pattern violations",
    targetRole: "vendor",
    metric: "late_pattern_violations",
    operator: ">=",
    threshold: "5",
    conditionType: "warning_l1",
    severity: "warning",
    cooldownHours: 48,
  },
];

router.post("/condition-rules/seed-defaults", async (_req, res) => {
  try {
    const existing = await db.select({ id: conditionRulesTable.id }).from(conditionRulesTable);
    if (existing.length > 0) {
      return res.json({
        success: true,
        message: `Skipped — ${existing.length} rules already exist`,
        inserted: 0,
      });
    }
    const rows = DEFAULT_RULES.map((r) => ({
      id: generateId(),
      name: r.name!,
      description: r.description ?? null,
      targetRole: r.targetRole!,
      metric: r.metric!,
      operator: r.operator!,
      threshold: String(r.threshold),
      conditionType: r.conditionType!,
      severity: r.severity!,
      cooldownHours: r.cooldownHours ?? 24,
      modeApplicability: "default,ai_recommended,custom",
      isActive: true,
    }));
    await db
      .insert(conditionRulesTable)
      .values(rows as Array<typeof conditionRulesTable.$inferInsert>);
    return res.json({
      success: true,
      message: `Seeded ${rows.length} default rules`,
      inserted: rows.length,
    });
  } catch (error) {
    logger.error("[admin/condition-rules] seed error:", error);
    return res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

/* ─────────────── METRIC COMPUTATION (van + basic) ─────────────── */
async function computeUserMetric(userId: string, metric: string): Promise<number | null> {
  const now = new Date();
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const _ago7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  switch (metric) {
    case "van_cancellation_count_30d": {
      const driverSchedules = await db
        .select({ id: vanSchedulesTable.id })
        .from(vanSchedulesTable)
        .where(eq(vanSchedulesTable.driverId, userId));
      const ids = driverSchedules.map((s) => s.id);
      if (ids.length === 0) return 0;
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(vanBookingsTable)
        .where(
          and(
            inArray(vanBookingsTable.scheduleId, ids),
            eq(vanBookingsTable.status, "cancelled"),
            gte(vanBookingsTable.cancelledAt, ago30)
          )
        );
      return Number(row?.c ?? 0);
    }
    case "van_noshow_count": {
      // Only count past-dated trips (travelDate < today) where the booking
      // remained "confirmed" but the passenger never boarded — i.e. an actual
      // no-show. Future/upcoming confirmed bookings must not be counted.
      const today = now.toISOString().split("T")[0]!;
      const driverSchedules = await db
        .select({ id: vanSchedulesTable.id })
        .from(vanSchedulesTable)
        .where(eq(vanSchedulesTable.driverId, userId));
      const ids = driverSchedules.map((s) => s.id);
      if (ids.length === 0) return 0;
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(vanBookingsTable)
        .where(
          and(
            inArray(vanBookingsTable.scheduleId, ids),
            eq(vanBookingsTable.status, "confirmed"),
            gte(vanBookingsTable.createdAt, ago30),
            sql`${vanBookingsTable.travelDate} < ${today}`,
            sql`${vanBookingsTable.boardedAt} IS NULL`
          )
        );
      return Number(row?.c ?? 0);
    }
    case "van_driver_missed_start": {
      const [row] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(vanSchedulesTable)
        .where(
          and(
            eq(vanSchedulesTable.driverId, userId),
            eq(vanSchedulesTable.tripStatus, "idle"),
            gte(vanSchedulesTable.updatedAt, ago30)
          )
        );
      return Number(row?.c ?? 0);
    }
    case "cancellation_rate":
    case "miss_ignore_rate":
    case "avg_rating_30d":
    case "fraud_incidents":
    case "abuse_reports":
    case "failed_payments_7d":
    case "complaint_reports":
    case "fake_item_complaints":
    case "hygiene_complaints":
    case "late_pattern_violations":
    case "gps_spoofing":
    case "cancellation_debt":
    case "order_completion_rate":
      return null;
    default:
      return null;
  }
}

function compareMetric(value: number, operator: string, threshold: string): boolean {
  const t = parseFloat(threshold);
  if (Number.isNaN(t)) return false;
  switch (operator) {
    case ">":
      return value > t;
    case "<":
      return value < t;
    case ">=":
      return value >= t;
    case "<=":
      return value <= t;
    case "==":
      return value === t;
    case "!=":
      return value !== t;
    default:
      return false;
  }
}

/**
 * Evaluate all active rules whose targetRole matches any role of the user
 * (including the synthetic "van_driver" role for approved van drivers).
 * Honors per-rule cooldown and inserts new conditions when thresholds are met.
 * Exported so other routes (e.g. van mode entry) can trigger evaluation.
 */
export async function evaluateRulesForUser(userId: string) {
  const roleSet = await getUserRoleSet(userId);
  const primaryRole = await getUserRole(userId);
  const roleArr = Array.from(roleSet);

  const rules = await db
    .select()
    .from(conditionRulesTable)
    .where(
      and(eq(conditionRulesTable.isActive, true), inArray(conditionRulesTable.targetRole, roleArr))
    );

  const triggered: Array<{
    ruleId: string;
    ruleName: string;
    metric: string;
    value: number;
    conditionId?: string;
  }> = [];
  const skipped: Array<{ ruleId: string; ruleName: string; reason: string }> = [];

  for (const rule of rules) {
    const value = await computeUserMetric(userId, rule.metric);
    if (value == null) {
      skipped.push({ ruleId: rule.id, ruleName: rule.name, reason: "metric_not_implemented" });
      continue;
    }
    if (!compareMetric(value, rule.operator, rule.threshold)) continue;

    if (rule.cooldownHours > 0) {
      const cutoff = new Date(Date.now() - rule.cooldownHours * 60 * 60 * 1000);
      const [recent] = await db
        .select({ id: accountConditionsTable.id })
        .from(accountConditionsTable)
        .where(
          and(
            eq(accountConditionsTable.userId, userId),
            eq(accountConditionsTable.conditionType, rule.conditionType),
            gte(accountConditionsTable.appliedAt, cutoff)
          )
        )
        .limit(1);
      if (recent) {
        skipped.push({ ruleId: rule.id, ruleName: rule.name, reason: "cooldown" });
        continue;
      }
    }
    const [created] = await db
      .insert(accountConditionsTable)
      .values({
        id: generateId(),
        userId,
        userRole: rule.targetRole === "van_driver" ? "van_driver" : primaryRole,
        conditionType: rule.conditionType,
        severity: rule.severity,
        category: SEVERITY_TO_CATEGORY[rule.severity] || "warning",
        reason: `Auto: ${rule.name} (${rule.metric} ${rule.operator} ${rule.threshold}, observed ${value})`,
        appliedBy: "rule_engine",
        isActive: true,
        metadata: {
          ruleId: rule.id,
          metric: rule.metric,
          observed: value,
          threshold: rule.threshold,
        },
      })
      .returning();
    triggered.push({
      ruleId: rule.id,
      ruleName: rule.name,
      metric: rule.metric,
      value,
      conditionId: created?.id,
    });

    /* Fire admin notifications for high-severity auto-triggered conditions */
    notifyAdminConditionApplied({
      userId,
      conditionType: rule.conditionType,
      severity: rule.severity,
      reason: `Auto: ${rule.name} (${rule.metric} ${rule.operator} ${rule.threshold}, observed ${value})`,
      appliedBy: "rule_engine",
      triggeredByRule: rule.name,
    }).catch((err: unknown) =>
      logger.warn(
        {
          message: "[admin/conditions] notify error (rule engine)",
          error: err instanceof Error ? err.message : String(err),
          code: "CONDITIONS_RULE_ENGINE_NOTIFY_FAILED",
          correlationId: null,
          timestamp: new Date().toISOString(),
        },
        "[admin/conditions] notify error (rule engine)"
      )
    );
  }

  return {
    userId,
    primaryRole,
    roles: roleArr,
    evaluated: rules.length,
    triggered: triggered.length,
    skipped: skipped.length,
    details: { triggered, skipped },
  };
}

router.post("/condition-rules/evaluate/:userId", async (req, res) => {
  try {
    const result = await evaluateRulesForUser(req.params.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error("[admin/condition-rules] evaluate error:", error);
    res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

/* ─────────────── CONDITION SETTINGS ─────────────── */
router.get("/condition-settings", async (_req, res) => {
  try {
    const [settings] = await db.select().from(conditionSettingsTable).limit(1);
    if (!settings) {
      const [created] = await db
        .insert(conditionSettingsTable)
        .values({ id: generateId(), mode: "default" })
        .returning();
      return res.json({ success: true, data: created });
    }
    return res.json({ success: true, data: settings });
  } catch (error) {
    logger.error("[admin/condition-settings] get error:", error);
    return res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

router.patch("/condition-settings", async (req, res) => {
  try {
    const { mode, customThresholds, aiParameters, updatedBy } = req.body ?? {};
    const [existing] = await db.select().from(conditionSettingsTable).limit(1);
    if (!existing) {
      const [created] = await db
        .insert(conditionSettingsTable)
        .values({
          id: generateId(),
          mode: mode ?? "default",
          customThresholds: customThresholds ?? null,
          aiParameters: aiParameters ?? null,
          updatedBy: updatedBy ?? "admin",
        })
        .returning();
      return res.json({ success: true, data: created });
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (mode !== undefined) updates.mode = mode;
    if (customThresholds !== undefined) updates.customThresholds = customThresholds;
    if (aiParameters !== undefined) updates.aiParameters = aiParameters;
    if (updatedBy !== undefined) updates.updatedBy = updatedBy;
    const [updated] = await db
      .update(conditionSettingsTable)
      .set(updates)
      .where(eq(conditionSettingsTable.id, existing.id))
      .returning();
    return res.json({ success: true, data: updated });
  } catch (error) {
    logger.error("[admin/condition-settings] patch error:", error);
    return res.status(500).json({ success: false, error: "An internal error occurred" });
  }
});

export default router;

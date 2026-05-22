import { db } from "@workspace/db";
import { conditionRulesTable, conditionSettingsTable } from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";

const router = Router();

const CONDITION_TYPES = [
  "warning_l1",
  "warning_l2",
  "warning_l3",
  "restriction_service_block",
  "restriction_wallet_freeze",
  "restriction_promo_block",
  "restriction_order_cap",
  "restriction_review_block",
  "restriction_cash_only",
  "restriction_new_order_block",
  "restriction_rate_limit",
  "restriction_pending_review_gate",
  "restriction_device_restriction",
  "suspension_temporary",
  "suspension_extended",
  "suspension_pending_review",
  "ban_soft",
  "ban_hard",
  "ban_fraud",
] as const;

const SEVERITY_VALUES = [
  "warning",
  "restriction_normal",
  "restriction_strict",
  "suspension",
  "ban",
] as const;

type ConditionType = (typeof CONDITION_TYPES)[number];
type SeverityValue = (typeof SEVERITY_VALUES)[number];

const ruleCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  description: z.string().max(500).optional().nullable(),
  targetRole: z.string().min(1, "targetRole is required"),
  metric: z.string().min(1, "metric is required"),
  operator: z.enum([">", "<", ">=", "<=", "==", "!="]),
  threshold: z.union([z.string().min(1), z.number()]).transform((v) => String(v)),
  conditionType: z.enum(CONDITION_TYPES),
  severity: z.enum(SEVERITY_VALUES).optional().default("warning"),
  cooldownHours: z.number().int().min(0).optional().default(24),
  modeApplicability: z.string().optional().default("default,ai_recommended,custom"),
  isActive: z.boolean().optional().default(true),
});

const ruleUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  targetRole: z.string().min(1).optional(),
  metric: z.string().min(1).optional(),
  operator: z.enum([">", "<", ">=", "<=", "==", "!="]).optional(),
  threshold: z
    .union([z.string().min(1), z.number()])
    .transform((v) => String(v))
    .optional(),
  conditionType: z.enum(CONDITION_TYPES).optional(),
  severity: z.enum(SEVERITY_VALUES).optional(),
  cooldownHours: z.number().int().min(0).optional(),
  modeApplicability: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (_req, res) => {
  try {
    const rules = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.isActive, true))
      .orderBy(desc(conditionRulesTable.createdAt));
    sendSuccess(res, { rules });
  } catch (err) {
    logger.error({ err }, "[business-rules] list error");
    sendError(res, "Failed to fetch business rules", 500);
  }
});

router.get("/settings", async (_req, res) => {
  try {
    const settings = await db.select().from(conditionSettingsTable).limit(1);
    sendSuccess(res, { settings: settings[0] ?? {} });
  } catch (err) {
    logger.error({ err }, "[business-rules] settings error");
    sendSuccess(res, { settings: {} });
  }
});

router.post("/", async (req, res) => {
  try {
    const p = ruleCreateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const d = p.data;
      const row: typeof conditionRulesTable.$inferInsert = {
        id: generateId(),
        name: d.name,
        description: d.description ?? null,
        targetRole: d.targetRole,
        metric: d.metric,
        operator: d.operator,
        threshold: d.threshold,
        conditionType: d.conditionType as ConditionType,
        severity: d.severity as SeverityValue,
        cooldownHours: d.cooldownHours,
        modeApplicability: d.modeApplicability,
        isActive: d.isActive,
      };

      const [created] = await db.insert(conditionRulesTable).values(row).returning();
      sendSuccess(res, { rule: created });
    } catch (err) {
      logger.error({ err }, "[business-rules] create error");
      sendError(res, "Failed to create business rule", 500);
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

router.put("/:id", async (req, res) => {
  try {
    const p = ruleUpdateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { id } = req.params as Record<string, string>;
      const [existing] = await db
        .select()
        .from(conditionRulesTable)
        .where(eq(conditionRulesTable.id, id))
        .limit(1);

      if (!existing) {
        sendNotFound(res, "Business rule not found");
        return;
      }

      const d = p.data;
      const patch: Partial<typeof conditionRulesTable.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (d.name !== undefined) patch.name = d.name;
      if (d.description !== undefined) patch.description = d.description;
      if (d.targetRole !== undefined) patch.targetRole = d.targetRole;
      if (d.metric !== undefined) patch.metric = d.metric;
      if (d.operator !== undefined) patch.operator = d.operator;
      if (d.threshold !== undefined) patch.threshold = d.threshold;
      if (d.conditionType !== undefined) patch.conditionType = d.conditionType as ConditionType;
      if (d.severity !== undefined) patch.severity = d.severity as SeverityValue;
      if (d.cooldownHours !== undefined) patch.cooldownHours = d.cooldownHours;
      if (d.modeApplicability !== undefined) patch.modeApplicability = d.modeApplicability;
      if (d.isActive !== undefined) patch.isActive = d.isActive;

      const [updated] = await db
        .update(conditionRulesTable)
        .set(patch)
        .where(eq(conditionRulesTable.id, id))
        .returning();

      sendSuccess(res, { rule: updated });
    } catch (err) {
      logger.error({ err }, "[business-rules] update error");
      sendError(res, "Failed to update business rule", 500);
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

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(conditionRulesTable)
      .where(eq(conditionRulesTable.id, id))
      .limit(1);

    if (!existing) {
      sendNotFound(res, "Business rule not found");
      return;
    }

    await db
      .update(conditionRulesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(conditionRulesTable.id, id));

    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[business-rules] delete error");
    sendError(res, "Failed to delete business rule", 500);
  }
});

const validateSchema = z.object({
  metric: z.string().min(1, "metric is required"),
  value: z.number({ invalid_type_error: "value must be a number" }),
  role: z.string().optional(),
  conditionType: z.string().optional(),
  threshold: z.union([z.string(), z.number()]).optional(),
  operator: z.enum([">", "<", ">=", "<=", "==", "!="]).optional(),
});

router.post("/validate", async (req, res) => {
  try {
    const p = validateSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    const { metric, value, role, conditionType, threshold, operator } = p.data;

    try {
      let matched: Array<{ id: string; name: string; conditionType: string; severity: string }> =
        [];

      if (threshold !== undefined && operator) {
        const thresholdNum = parseFloat(String(threshold));
        const val = parseFloat(String(value));

        if (!isNaN(thresholdNum) && !isNaN(val)) {
          let triggered = false;
          switch (operator) {
            case ">":
              triggered = val > thresholdNum;
              break;
            case "<":
              triggered = val < thresholdNum;
              break;
            case ">=":
              triggered = val >= thresholdNum;
              break;
            case "<=":
              triggered = val <= thresholdNum;
              break;
            case "==":
              triggered = val === thresholdNum;
              break;
            case "!=":
              triggered = val !== thresholdNum;
              break;
          }

          if (triggered) {
            matched = [
              {
                id: "dry-run",
                name: "Dry-run rule",
                conditionType: conditionType ?? "warning_l1",
                severity: "warning",
              },
            ];
          }
        }
      } else {
        const rules = await db
          .select()
          .from(conditionRulesTable)
          .where(eq(conditionRulesTable.isActive, true));

        matched = rules
          .filter((r) => {
            if (r.metric !== metric) return false;
            if (role && r.targetRole !== "all" && r.targetRole !== role) return false;

            const t = parseFloat(String(r.threshold));
            const v = parseFloat(String(value));
            if (isNaN(t) || isNaN(v)) return false;

            switch (r.operator) {
              case ">":
                return v > t;
              case "<":
                return v < t;
              case ">=":
                return v >= t;
              case "<=":
                return v <= t;
              case "==":
                return v === t;
              case "!=":
                return v !== t;
              default:
                return false;
            }
          })
          .map((r) => ({
            id: r.id,
            name: r.name,
            conditionType: r.conditionType,
            severity: r.severity,
          }));
      }

      sendSuccess(res, { triggered: matched.length > 0, matchedRules: matched, dryRun: true });
    } catch (err) {
      logger.error({ err }, "[business-rules] validate error");
      sendError(res, "Failed to validate rule", 500);
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

router.post("/evaluate", async (req, res) => {
  try {
    const { metric, value, role } = req.body ?? {};
    if (!metric || value === undefined) {
      sendError(res, "metric and value are required", 400);
      return;
    }

    try {
      const rules = await db
        .select()
        .from(conditionRulesTable)
        .where(eq(conditionRulesTable.isActive, true));

      const matched = rules.filter((r) => {
        if (r.metric !== metric) return false;
        if (role && r.targetRole !== "all" && r.targetRole !== role) return false;

        const t = parseFloat(String(r.threshold));
        const v = parseFloat(String(value));
        if (isNaN(t) || isNaN(v)) return false;

        switch (r.operator) {
          case ">":
            return v > t;
          case "<":
            return v < t;
          case ">=":
            return v >= t;
          case "<=":
            return v <= t;
          case "==":
            return v === t;
          case "!=":
            return v !== t;
          default:
            return false;
        }
      });

      sendSuccess(res, {
        triggered: matched.length > 0,
        matchedRules: matched.map((r) => ({
          id: r.id,
          name: r.name,
          conditionType: r.conditionType,
          severity: r.severity,
        })),
      });
    } catch (err) {
      logger.error({ err }, "[business-rules] evaluate error");
      sendError(res, "Failed to evaluate rules", 500);
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

export default router;

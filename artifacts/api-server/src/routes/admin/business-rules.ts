import { db } from "@workspace/db";
import { businessRulesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { logger } from "../../lib/logger.js";
import { sendCreated, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, generateId, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return value;
    }
  }
  return value;
}

function validateBusinessRule(payload: Record<string, unknown>, requireTrigger = true): string[] {
  const errors: string[] = [];
  const trigger = payload.trigger;
  const conditions = payload.conditions;
  const actions = payload.actions;
  const name = payload.name;
  const priority = payload.priority;
  const isActive = payload.isActive;

  if (requireTrigger && (!trigger || typeof trigger !== "string" || !trigger.trim())) {
    errors.push("trigger is required and must be a non-empty string");
  }
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    errors.push("name must be a non-empty string");
  }
  if (conditions !== undefined && !isJsonObject(conditions)) {
    errors.push("conditions must be a JSON object");
  }
  if (actions !== undefined && !isJsonObject(actions)) {
    errors.push("actions must be a JSON object");
  }
  if (priority !== undefined && priority != null) {
    const numericPriority = Number(priority);
    if (!Number.isInteger(numericPriority) || numericPriority < 0) {
      errors.push("priority must be a non-negative integer");
    }
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    errors.push("isActive must be a boolean");
  }

  return errors;
}

router.get("/", async (req, res) => {
  try {
    const rules = await db.select().from(businessRulesTable).orderBy(businessRulesTable.priority);
    sendSuccess(res, { rules });
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

const createBusinessRuleSchema = z.object({
  name: z.string().min(1, "name is required"),
  description: z.string().optional().default(""),
  trigger: z.string().min(1, "trigger is required"),
  conditions: z.record(z.unknown()).optional().default({}),
  actions: z.record(z.unknown()).optional().default({}),
  priority: z.number({ coerce: true }).int().nonnegative().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

router.post("/", async (req, res) => {
  try {
    const parsed = createBusinessRuleSchema.safeParse({
      ...req.body,
      conditions: parseJsonField(req.body.conditions),
      actions: parseJsonField(req.body.actions),
    });
    if (!parsed.success) {
      sendValidationError(
        res,
        "Invalid business rule payload",
        parsed.error.errors.map((e) => e.message).join("; ")
      );
      return;
    }
    const body = parsed.data;

    const id = generateId();
    const [created] = await db
      .insert(businessRulesTable)
      .values({
        id,
        name: body.name,
        description: body.description,
        trigger: body.trigger,
        conditions: body.conditions as Record<string, unknown>,
        actions: body.actions as Record<string, unknown>,
        priority: body.priority,
        isActive: body.isActive,
      })
      .returning();

    void addAuditEntry({
      action: "business_rule_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created business rule: ${created.name}`,
      result: "success",
    });

    sendCreated(res, { rule: created });
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
    const id = req.params.id;
    const body = {
      name: req.body.name,
      description: req.body.description,
      trigger: req.body.trigger,
      conditions:
        req.body.conditions !== undefined ? parseJsonField(req.body.conditions) : undefined,
      actions: req.body.actions !== undefined ? parseJsonField(req.body.actions) : undefined,
      priority: req.body.priority,
      isActive: req.body.isActive,
    };

    const errors = validateBusinessRule(body, false);
    if (errors.length > 0) {
      sendValidationError(res, "Invalid business rule payload", JSON.stringify(errors));
      return;
    }

    const [existing] = await db
      .select()
      .from(businessRulesTable)
      .where(eq(businessRulesTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Business rule not found");
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = String(body.name ?? "");
    if (body.description !== undefined) updates.description = String(body.description ?? "");
    if (body.trigger !== undefined) updates.trigger = String(body.trigger ?? "");
    if (body.conditions !== undefined)
      updates.conditions = body.conditions as Record<string, unknown>;
    if (body.actions !== undefined) updates.actions = body.actions as Record<string, unknown>;
    if (body.priority !== undefined) updates.priority = Number(body.priority);
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    const [updated] = await db
      .update(businessRulesTable)
      .set(updates)
      .where(eq(businessRulesTable.id, id))
      .returning();

    void addAuditEntry({
      action: "business_rule_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated business rule: ${existing.name}`,
      result: "success",
    });

    sendSuccess(res, { rule: updated });
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
    const id = req.params.id;
    const [existing] = await db
      .select()
      .from(businessRulesTable)
      .where(eq(businessRulesTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Business rule not found");
      return;
    }

    await db.delete(businessRulesTable).where(eq(businessRulesTable.id, id));

    void addAuditEntry({
      action: "business_rule_delete",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deleted business rule: ${existing.name}`,
      result: "success",
    });

    sendSuccess(res, { success: true });
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

router.post("/validate", async (req, res) => {
  try {
    const payload = {
      trigger: req.body.trigger,
      conditions: parseJsonField(req.body.conditions),
      actions: parseJsonField(req.body.actions),
      name: req.body.name,
      priority: req.body.priority,
      isActive: req.body.isActive,
    };
    const errors = validateBusinessRule(payload);
    sendSuccess(res, { valid: errors.length === 0, errors });
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

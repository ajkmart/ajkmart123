import { db } from "@workspace/db";
import { abAssignmentsTable, abExperimentsTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { addAuditEntry, generateId, getClientIp, type AdminRequest } from "../admin-shared.js";

const router = Router();

router.get("/experiments", async (_req, res) => {
  try {
    const experiments = await db
      .select()
      .from(abExperimentsTable)
      .orderBy(desc(abExperimentsTable.createdAt));
    sendSuccess(res, { experiments });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/experiments", async (req, res) => {
  try {
    const { name, description, variants, trafficPct } = req.body;
    if (!name) {
      sendValidationError(res, "Name is required");
      return;
    }
    if (!variants || !Array.isArray(variants) || variants.length < 2) {
      sendValidationError(res, "At least 2 variants are required");
      return;
    }

    for (const v of variants) {
      if (!v.name || typeof v.name !== "string" || !v.name.trim()) {
        sendValidationError(res, "All variants must have a non-empty name");
        return;
      }
      if (typeof v.weight !== "number" || v.weight < 0 || isNaN(v.weight)) {
        sendValidationError(res, "All variant weights must be non-negative numbers");
        return;
      }
    }

    interface Variant {
      name: string;
      weight: number;
    }
    const names = variants.map((v: Variant) => v.name.trim());
    if (new Set(names).size !== names.length) {
      sendValidationError(res, "Variant names must be unique");
      return;
    }

    const id = generateId();
    const [created] = await db
      .insert(abExperimentsTable)
      .values({
        id,
        name,
        description: description || "",
        variants,
        trafficPct: trafficPct ?? 100,
        status: "active",
      })
      .returning();

    void addAuditEntry({
      action: "experiment_create",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Created experiment: ${name}`,
      result: "success",
    });
    sendSuccess(res, { experiment: created });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

function validateExperimentPayload(payload: Record<string, unknown>, partial = false): string[] {
  const errors: string[] = [];
  if (!partial || payload.name !== undefined) {
    if (!payload.name || typeof payload.name !== "string" || !payload.name.trim()) {
      errors.push("Name is required");
    }
  }
  if (!partial || payload.variants !== undefined) {
    if (!Array.isArray(payload.variants) || payload.variants.length < 2) {
      errors.push("At least 2 variants are required");
    } else {
      const names = new Set<string>();
      for (const v of payload.variants) {
        if (!v || typeof v !== "object") {
          errors.push("Each variant must be an object");
          break;
        }
        if (!v.name || typeof v.name !== "string" || !v.name.trim()) {
          errors.push("All variants must have a non-empty name");
          break;
        }
        if (typeof v.weight !== "number" || isNaN(v.weight) || v.weight < 0) {
          errors.push("All variant weights must be non-negative numbers");
          break;
        }
        if (names.has(v.name.trim())) {
          errors.push("Variant names must be unique");
          break;
        }
        names.add(v.name.trim());
      }
    }
  }
  if (payload.trafficPct !== undefined) {
    const pct = Number(payload.trafficPct);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      errors.push("trafficPct must be a number between 0 and 100");
    }
  }
  if (!partial || payload.description !== undefined) {
    if (payload.description !== undefined && typeof payload.description !== "string") {
      errors.push("Description must be a string");
    }
  }
  return errors;
}

router.get("/experiments/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, id))
      .limit(1);
    if (!experiment) {
      sendNotFound(res, "Experiment not found");
      return;
    }
    sendSuccess(res, { experiment });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.put("/experiments/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const { name, description, variants, trafficPct } = req.body;
    const payload = { name, description, variants, trafficPct };
    const errors = validateExperimentPayload(payload, true);
    if (errors.length > 0) {
      sendValidationError(res, errors.join("; "));
      return;
    }

    const [existing] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Experiment not found");
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description);
    if (variants !== undefined) updates.variants = variants;
    if (trafficPct !== undefined) updates.trafficPct = Number(trafficPct);

    const [updated] = await db
      .update(abExperimentsTable)
      .set(updates)
      .where(eq(abExperimentsTable.id, id))
      .returning();
    void addAuditEntry({
      action: "experiment_update",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated experiment: ${existing.name}`,
      result: "success",
    });
    sendSuccess(res, { experiment: updated });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/experiments/:id/status", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const { status } = req.body;
    if (!["active", "paused", "completed", "draft"].includes(status)) {
      sendValidationError(res, "Invalid status");
      return;
    }

    const [existing] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Experiment not found");
      return;
    }

    await db
      .update(abExperimentsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(abExperimentsTable.id, id));
    void addAuditEntry({
      action: "experiment_status",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Updated experiment ${existing.name} to ${status}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/experiments/:id/results", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, id))
      .limit(1);
    if (!experiment) {
      sendNotFound(res, "Experiment not found");
      return;
    }

    const results = await db
      .select({
        variant: abAssignmentsTable.variant,
        total: sql<number>`count(*)::int`,
        converted: sql<number>`sum(case when ${abAssignmentsTable.converted} then 1 else 0 end)::int`,
      })
      .from(abAssignmentsTable)
      .where(eq(abAssignmentsTable.experimentId, id))
      .groupBy(abAssignmentsTable.variant);

    sendSuccess(res, { experiment, results });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/experiments/:id/convert", async (req, res) => {
  try {
    const experimentId = req.params["id"] as string;
    const { userId } = req.body;
    if (!userId) {
      sendValidationError(res, "userId is required");
      return;
    }

    const [experiment] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, experimentId))
      .limit(1);
    if (!experiment) {
      sendNotFound(res, "Experiment not found");
      return;
    }

    const [assignment] = await db
      .select()
      .from(abAssignmentsTable)
      .where(
        and(
          eq(abAssignmentsTable.experimentId, experimentId),
          eq(abAssignmentsTable.userId, userId)
        )
      )
      .limit(1);

    if (!assignment) {
      sendNotFound(res, "No assignment found for this user in this experiment");
      return;
    }
    if (assignment.converted) {
      sendSuccess(res, { alreadyConverted: true });
      return;
    }

    await db
      .update(abAssignmentsTable)
      .set({ converted: true })
      .where(eq(abAssignmentsTable.id, assignment.id));

    sendSuccess(res, { converted: true, variant: assignment.variant });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/experiments/:id", async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const [existing] = await db
      .select()
      .from(abExperimentsTable)
      .where(eq(abExperimentsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Experiment not found");
      return;
    }

    await db.delete(abAssignmentsTable).where(eq(abAssignmentsTable.experimentId, id));
    await db.delete(abExperimentsTable).where(eq(abExperimentsTable.id, id));
    void addAuditEntry({
      action: "experiment_delete",
      ip: getClientIp(req),
      adminId: (req as AdminRequest).adminId,
      details: `Deleted experiment: ${existing.name}`,
      result: "success",
    });
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;

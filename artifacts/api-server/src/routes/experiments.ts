import { db } from "@workspace/db";
import { abAssignmentsTable, abExperimentsTable } from "@workspace/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Request } from "express";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";

const router = Router();

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  status: z.string().optional(),
});

const assignExperimentSchema = z
  .object({
    userId: z.string().min(1, "userId is required"),
    experimentId: z.string().min(1, "experimentId is required"),
  })
  .strict();

router.get("/", async (req, res) => {
  try {
    const p = paginationSchema.safeParse(req.query);
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }

    try {
      const { page, limit, status } = p.data;
      const offset = (page - 1) * limit;

      let countQuery = db
        .select({ count: sql<number>`count(*)::int` })
        .from(abExperimentsTable)
        .$dynamic();

      let dataQuery = db
        .select()
        .from(abExperimentsTable)
        .orderBy(desc(abExperimentsTable.createdAt))
        .limit(limit)
        .offset(offset)
        .$dynamic();

      if (status) {
        countQuery = countQuery.where(eq(abExperimentsTable.status, status));
        dataQuery = dataQuery.where(eq(abExperimentsTable.status, status));
      }

      const [countRow, experiments] = await Promise.all([countQuery, dataQuery]);
      const total = countRow[0]?.count ?? 0;

      sendSuccess(res, { experiments, total, page, limit });
    } catch (err) {
      logger.error({ err }, "[experiments] list error");
      sendSuccess(res, { experiments: [], total: 0, page: 1, limit: 50 });
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

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
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
  } catch (err) {
    logger.error({ err }, "[experiments] get error");
    sendNotFound(res, "Experiment not found");
  }
});

router.post("/assign", customerAuth, async (req, res) => {
  try {
    const p = assignExperimentSchema.safeParse(req.body ?? {});
    if (!p.success) {
      sendValidationError(res, p.error.errors.map((e) => e.message).join("; "));
      return;
    }
    const { userId, experimentId } = p.data;

    // Enforce self-assignment: only allow a user to assign themselves
    const authenticatedUserId = (req as Request & { userId?: string }).userId;
    if (!authenticatedUserId || authenticatedUserId !== userId) {
      sendError(res, "Forbidden: you may only assign yourself to an experiment", 403);
      return;
    }

    try {
      const [experiment] = await db
        .select()
        .from(abExperimentsTable)
        .where(
          and(eq(abExperimentsTable.id, experimentId), eq(abExperimentsTable.status, "active"))
        )
        .limit(1);

      if (!experiment) {
        sendNotFound(res, "Experiment not found or not active");
        return;
      }

      const [existing] = await db
        .select()
        .from(abAssignmentsTable)
        .where(
          and(
            eq(abAssignmentsTable.experimentId, experimentId),
            eq(abAssignmentsTable.userId, userId)
          )
        )
        .limit(1);

      if (existing) {
        sendSuccess(res, { assignment: existing, isNew: false });
        return;
      }

      const variants = experiment.variants as Array<{ name: string; weight: number }>;
      const totalWeight = variants.reduce((s, v) => s + (v.weight ?? 1), 0);
      let rand = Math.random() * totalWeight;
      let assignedVariant = variants[0]?.name ?? "control";
      for (const v of variants) {
        rand -= v.weight ?? 1;
        if (rand <= 0) {
          assignedVariant = v.name;
          break;
        }
      }

      const [created] = await db
        .insert(abAssignmentsTable)
        .values({
          id: generateId(),
          experimentId,
          userId,
          variant: assignedVariant,
          converted: false,
        })
        .returning();

      sendSuccess(res, { assignment: created, isNew: true });
    } catch (err) {
      logger.error({ err }, "[experiments] assign error");
      sendError(res, "Failed to assign experiment", 500);
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

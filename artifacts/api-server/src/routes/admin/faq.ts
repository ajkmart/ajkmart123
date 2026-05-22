import { db } from "@workspace/db";
import { faqsTable } from "@workspace/db/schema";
import { asc, eq } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendCreated, sendError, sendNotFound, sendSuccess } from "../../lib/response.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const faqs = await db
      .select()
      .from(faqsTable)
      .orderBy(asc(faqsTable.sortOrder), asc(faqsTable.createdAt));
    return sendSuccess(res, {
      faqs: faqs.map((f) => ({
        ...f,
        createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : f.updatedAt,
      })),
      total: faqs.length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return sendError(res, "Failed to fetch FAQs", 500);
  }
});

router.post("/", async (req, res) => {
  try {
    const { category, question, answer, sortOrder, isActive } = req.body as {
      category?: string;
      question?: string;
      answer?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    if (!question?.trim() || !answer?.trim()) {
      return sendError(res, "Question and answer are required", 400);
    }
    try {
      const [faq] = await db
        .insert(faqsTable)
        .values({
          id: generateId(),
          category: category?.trim() || "General",
          question: question.trim(),
          answer: answer.trim(),
          sortOrder: sortOrder ?? 0,
          isActive: isActive !== false,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return sendCreated(res, { faq });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return sendError(res, "Failed to create FAQ", 500);
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

router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const { category, question, answer, sortOrder, isActive } = req.body as {
      category?: string;
      question?: string;
      answer?: string;
      sortOrder?: number;
      isActive?: boolean;
    };
    const updates: Partial<typeof faqsTable.$inferInsert> = { updatedAt: new Date() };
    if (category !== undefined) updates.category = category.trim() || "General";
    if (question !== undefined) updates.question = question.trim();
    if (answer !== undefined) updates.answer = answer.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;
    try {
      const [faq] = await db.update(faqsTable).set(updates).where(eq(faqsTable.id, id)).returning();
      if (!faq) return sendNotFound(res, "FAQ not found");
      return sendSuccess(res, { faq });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return sendError(res, "Failed to update FAQ", 500);
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
    try {
      const [deleted] = await db.delete(faqsTable).where(eq(faqsTable.id, id)).returning();
      if (!deleted) return sendNotFound(res, "FAQ not found");
      return sendSuccess(res, { ok: true });
    } catch (err) {
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        },
        "[route] unhandled error"
      );
      return sendError(res, "Failed to delete FAQ", 500);
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

import { db } from "@workspace/db";
import {
  popupCampaignsTable,
  popupImpressionsTable,
  popupTemplatesTable,
} from "@workspace/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { sendError, sendNotFound, sendSuccess, sendValidationError } from "../../lib/response.js";
import { generateAIContent } from "../../services/communicationAI.js";
import { type AdminRequest } from "../admin-shared.js";

const router = Router();

const aiGenerateSchema = z.object({
  targetAudience: z.string().min(3).optional().default("all users"),
  goal: z.string().min(1),
  tone: z.enum(["urgent", "friendly", "luxury"]).optional().default("friendly"),
  platform: z.enum(["web", "mobile"]).optional().default("mobile"),
});

function computeStatus(campaign: typeof popupCampaignsTable.$inferSelect): string {
  const now = new Date();
  if (campaign.status === "draft") return "draft";
  if (campaign.status === "paused") return "paused";
  if (campaign.status === "expired") return "expired";
  if (campaign.startDate && campaign.startDate > now) return "scheduled";
  if (campaign.endDate && campaign.endDate < now) return "expired";
  if (campaign.status === "live") return "live";
  return campaign.status;
}

router.get("/popups", async (_req, res) => {
  try {
    const campaigns = await db
      .select()
      .from(popupCampaignsTable)
      .orderBy(desc(popupCampaignsTable.createdAt));

    const impressionCounts = await db
      .select({
        popupId: popupImpressionsTable.popupId,
        views: sql<number>`sum(case when ${popupImpressionsTable.action} = 'view' then 1 else 0 end)::int`,
        clicks: sql<number>`sum(case when ${popupImpressionsTable.action} = 'click' then 1 else 0 end)::int`,
      })
      .from(popupImpressionsTable)
      .groupBy(popupImpressionsTable.popupId);

    const analyticsMap = new Map(impressionCounts.map((r) => [r.popupId, r]));

    const enriched = campaigns.map((c) => {
      const analytics = analyticsMap.get(c.id);
      const views = analytics?.views ?? 0;
      const clicks = analytics?.clicks ?? 0;
      return {
        ...c,
        computedStatus: computeStatus(c),
        analytics: { views, clicks, ctr: views > 0 ? Math.round((clicks / views) * 100) : 0 },
      };
    });

    sendSuccess(res, { campaigns: enriched });
  } catch (err) {
    logger.error({ err }, "[admin/popups] list error");
    sendError(res, "Failed to fetch campaigns", 500);
  }
});

router.get("/popups/templates", async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(popupTemplatesTable)
      .where(eq(popupTemplatesTable.isActive, true))
      .orderBy(desc(popupTemplatesTable.createdAt));
    sendSuccess(res, { templates });
  } catch (err) {
    logger.error({ err }, "[admin/popups/templates] list error");
    sendError(res, "Failed to fetch templates", 500);
  }
});

router.post("/popups/ai-generate", async (req, res) => {
  try {
    const parsed = aiGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.errors.map((e) => e.message).join("; "));
      return;
    }

    const { targetAudience, goal, tone, platform } = parsed.data;

    const prompt = `You are a marketing expert for AJKMart, a Pakistani super-app for e-commerce, food delivery, and rides. Generate a compelling ${platform} popup campaign.

Goal: ${goal}
Target Audience: ${targetAudience}
Tone: ${tone}

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "title": "Short compelling headline (max 50 chars)",
  "body": "Supporting description (max 120 chars)",
  "ctaText": "Action button text (max 20 chars)",
  "suggestedType": "modal|bottom_sheet|top_banner|floating_card",
  "suggestedColors": {
    "colorFrom": "#hexcode",
    "colorTo": "#hexcode"
  },
  "animation": "fade|slide|bounce|zoom"
}`;

    try {
      const aiResult = await generateAIContent(prompt);
      let popupData: Record<string, unknown>;

      try {
        const cleaned = aiResult.content
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim();
        popupData = JSON.parse(cleaned) as Record<string, unknown>;
      } catch (err) {
        logger.error(
          {
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
          "[route] unhandled error"
        );
        popupData = generateFallbackPopup(goal, tone);
      }

      const suggestedColors = (
        typeof popupData.suggestedColors === "object" && popupData.suggestedColors
          ? popupData.suggestedColors
          : { colorFrom: "#7C3AED", colorTo: "#4F46E5" }
      ) as { colorFrom?: string; colorTo?: string };

      const validHex = (v: unknown) => /^#[0-9A-Fa-f]{6}$/.test(String(v ?? ""));

      sendSuccess(res, {
        title: String(popupData.title ?? ""),
        body: String(popupData.body ?? ""),
        ctaText: String(popupData.ctaText ?? ""),
        suggestedType: ["modal", "bottom_sheet", "top_banner", "floating_card"].includes(
          String(popupData.suggestedType)
        )
          ? popupData.suggestedType
          : "modal",
        suggestedColors: {
          colorFrom: validHex(suggestedColors.colorFrom)
            ? String(suggestedColors.colorFrom)
            : "#7C3AED",
          colorTo: validHex(suggestedColors.colorTo) ? String(suggestedColors.colorTo) : "#4F46E5",
        },
        animation: ["fade", "slide", "bounce", "zoom"].includes(String(popupData.animation))
          ? popupData.animation
          : "fade",
        source: aiResult.source,
      });
    } catch (err) {
      logger.error({ err }, "[admin/popups/ai-generate] error");
      const fallback = generateFallbackPopup(goal, tone);
      sendSuccess(res, { ...fallback, source: "template_fallback" });
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

function generateFallbackPopup(goal: string, tone: string): Record<string, unknown> {
  const lowerGoal = goal.toLowerCase();

  const toneColors: Record<string, { colorFrom: string; colorTo: string }> = {
    urgent: { colorFrom: "#DC2626", colorTo: "#991B1B" },
    luxury: { colorFrom: "#1C1917", colorTo: "#44403C" },
    friendly: { colorFrom: "#7C3AED", colorTo: "#4F46E5" },
  };

  const colors = toneColors[tone] ?? toneColors["friendly"]!;

  if (lowerGoal.includes("signup") || lowerGoal.includes("register")) {
    return {
      title: "Join AJKMart Today",
      body: "Sign up and get Rs. 200 off your first order.",
      ctaText: "Sign Up Free",
      suggestedType: "bottom_sheet",
      suggestedColors: tone === "friendly" ? { colorFrom: "#7C3AED", colorTo: "#4F46E5" } : colors,
      animation: "slide",
    };
  }

  if (
    lowerGoal.includes("promo") ||
    lowerGoal.includes("discount") ||
    lowerGoal.includes("offer")
  ) {
    return {
      title: "Exclusive Offer Inside!",
      body: "Special discount just for you. Limited time only.",
      ctaText: "Claim Offer",
      suggestedType: "floating_card",
      suggestedColors: tone === "urgent" ? { colorFrom: "#DC2626", colorTo: "#991B1B" } : colors,
      animation: "bounce",
    };
  }

  return {
    title: "Don't Miss Out!",
    body: "Limited time offer. Shop now and save big on your favorites.",
    ctaText: "Shop Now",
    suggestedType: "modal",
    suggestedColors: colors,
    animation: tone === "urgent" ? "zoom" : "fade",
  };
}

router.post("/popups", async (req: AdminRequest, res) => {
  try {
    const { title, ...rest } = req.body ?? {};
    if (!title?.trim()) {
      sendValidationError(res, "Title is required");
      return;
    }

    const [created] = await db
      .insert(popupCampaignsTable)
      .values({
        id: generateId(),
        title: String(title).trim(),
        ...rest,
        createdBy: req.adminPayload?.adminId ?? "admin",
      })
      .returning();

    sendSuccess(res, { campaign: { ...created, computedStatus: computeStatus(created) } });
  } catch (err) {
    logger.error({ err }, "[admin/popups] create error");
    sendError(res, "Failed to create campaign", 500);
  }
});

router.patch("/popups/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(popupCampaignsTable)
      .where(eq(popupCampaignsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Campaign not found");
      return;
    }

    const [updated] = await db
      .update(popupCampaignsTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(popupCampaignsTable.id, id))
      .returning();

    sendSuccess(res, { campaign: { ...updated, computedStatus: computeStatus(updated) } });
  } catch (err) {
    logger.error({ err }, "[admin/popups] update error");
    sendError(res, "Failed to update campaign", 500);
  }
});

router.delete("/popups/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(popupCampaignsTable)
      .where(eq(popupCampaignsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Campaign not found");
      return;
    }

    await db.delete(popupCampaignsTable).where(eq(popupCampaignsTable.id, id));
    sendSuccess(res, { success: true });
  } catch (err) {
    logger.error({ err }, "[admin/popups] delete error");
    sendError(res, "Failed to delete campaign", 500);
  }
});

/* ── POST /popups/clone/:id — duplicate a campaign ── */
router.post("/popups/clone/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(popupCampaignsTable)
      .where(eq(popupCampaignsTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Campaign not found");
      return;
    }

    const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = existing;
    const [cloned] = await db
      .insert(popupCampaignsTable)
      .values({
        ...rest,
        id: generateId(),
        title: `${existing.title} (Copy)`,
        status: "draft",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    sendSuccess(res, { campaign: { ...cloned, computedStatus: computeStatus(cloned) } });
  } catch (err) {
    logger.error({ err }, "[admin/popups] clone error");
    sendError(res, "Failed to clone campaign", 500);
  }
});

/* ── GET /popups/:id/analytics — per-campaign analytics ── */
router.get("/popups/:id/analytics", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const rows = await db
      .select({
        action: popupImpressionsTable.action,
        count: sql<number>`count(*)::int`,
      })
      .from(popupImpressionsTable)
      .where(eq(popupImpressionsTable.popupId, id))
      .groupBy(popupImpressionsTable.action);

    const views = rows.find((r) => r.action === "view")?.count ?? 0;
    const clicks = rows.find((r) => r.action === "click")?.count ?? 0;
    const closes = rows.find((r) => r.action === "close")?.count ?? 0;

    sendSuccess(res, {
      views,
      clicks,
      closes,
      ctr: views > 0 ? Math.round((clicks / views) * 100) : 0,
    });
  } catch (err) {
    logger.error({ err }, "[admin/popups] analytics error");
    sendError(res, "Failed to fetch analytics", 500);
  }
});

/* ── Template CRUD (PATCH / DELETE) ── */
router.post("/popups/templates", async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      popupType,
      defaultTitle,
      defaultBody,
      defaultCtaText,
      colorFrom,
      colorTo,
      textColor,
      animation,
      stylePreset,
      previewImageUrl,
    } = req.body ?? {};
    if (!name) {
      sendValidationError(res, "name is required");
      return;
    }
    const [tpl] = await db
      .insert(popupTemplatesTable)
      .values({
        id: generateId(),
        name: String(name),
        description: description ?? null,
        category: category ?? "general",
        popupType: popupType ?? "modal",
        defaultTitle: defaultTitle ?? null,
        defaultBody: defaultBody ?? null,
        defaultCtaText: defaultCtaText ?? null,
        colorFrom: colorFrom ?? "#7C3AED",
        colorTo: colorTo ?? "#4F46E5",
        textColor: textColor ?? "#FFFFFF",
        animation: animation ?? "fade",
        stylePreset: stylePreset ?? "default",
        previewImageUrl: previewImageUrl ?? null,
        isActive: true,
      })
      .returning();
    sendSuccess(res, { template: tpl });
  } catch (err) {
    logger.error({ err }, "[admin/popups/templates] create error");
    sendError(res, "Failed to create template", 500);
  }
});

router.patch("/popups/templates/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [existing] = await db
      .select()
      .from(popupTemplatesTable)
      .where(eq(popupTemplatesTable.id, id))
      .limit(1);
    if (!existing) {
      sendNotFound(res, "Template not found");
      return;
    }
    const [updated] = await db
      .update(popupTemplatesTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(eq(popupTemplatesTable.id, id))
      .returning();
    sendSuccess(res, { template: updated });
  } catch (err) {
    logger.error({ err }, "[admin/popups/templates] update error");
    sendError(res, "Failed to update template", 500);
  }
});

router.delete("/popups/templates/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    await db.delete(popupTemplatesTable).where(eq(popupTemplatesTable.id, id));
    sendSuccess(res, { deleted: true });
  } catch (err) {
    logger.error({ err }, "[admin/popups/templates] delete error");
    sendError(res, "Failed to delete template", 500);
  }
});

export default router;

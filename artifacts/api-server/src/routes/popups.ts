import { db } from "@workspace/db";
import {
  ordersTable,
  popupCampaignsTable,
  popupImpressionsTable,
  usersTable,
} from "@workspace/db/schema";
import { ai } from "@workspace/integrations-gemini-ai";
import { and, count, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendCreated, sendError, sendSuccess, sendValidationError } from "../lib/response.js";
import { verifyUserJwt } from "../middleware/security.js";

const router: IRouter = Router();

function getUserFromRequest(req: Request): { userId: string; roles: string } | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const payload = verifyUserJwt(token);
  if (!payload) return null;
  return { userId: payload.userId, roles: payload.role ?? "customer" };
}

async function evaluateTargeting(
  campaign: typeof popupCampaignsTable.$inferSelect,
  user: { userId: string; role: string } | null
): Promise<boolean> {
  interface TargetingRules {
    roles?: string[];
    userIds?: string[];
    cities?: string[];
    newUsers?: boolean;
    minOrderCount?: number;
    maxOrderCount?: number;
    minOrderValue?: number;
    maxOrderValue?: number;
  }

  const raw = campaign.targeting ?? {};
  const targeting: TargetingRules = raw as TargetingRules;

  if (!targeting || Object.keys(targeting).length === 0) return true;

  if (targeting.roles?.length) {
    const userRole = user?.role ?? "customer";
    if (!targeting.roles.includes(userRole) && !targeting.roles.includes("all")) return false;
  }

  if (targeting.userIds?.length) {
    if (!user?.userId) return false;
    if (!targeting.userIds.includes(user.userId)) return false;
  }

  if (targeting.cities?.length) {
    if (!user?.userId) return false;
    const [userRow] = await db
      .select({ city: usersTable.city })
      .from(usersTable)
      .where(eq(usersTable.id, user.userId))
      .limit(1);
    const userCity = userRow?.city;
    if (!userCity) return false;
    const normalizedCity = userCity.toLowerCase().trim();
    if (!targeting.cities.some((c) => c.toLowerCase().trim() === normalizedCity)) return false;
  }

  if (user?.userId) {
    if (targeting.newUsers === true) {
      const [firstOrder] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId))
        .limit(1);
      if (firstOrder) return false;
    }

    if (
      typeof targeting.minOrderCount === "number" ||
      typeof targeting.maxOrderCount === "number"
    ) {
      const [orderCountRow] = await db
        .select({ count: count() })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId));
      const orderCount = orderCountRow?.count ?? 0;
      if (
        typeof targeting.minOrderCount === "number" &&
        Number(orderCount) < targeting.minOrderCount
      )
        return false;
      if (
        typeof targeting.maxOrderCount === "number" &&
        Number(orderCount) > targeting.maxOrderCount
      )
        return false;
    }

    if (
      typeof targeting.minOrderValue === "number" ||
      typeof targeting.maxOrderValue === "number"
    ) {
      const [avgRow] = await db
        .select({ avg: sql<string>`coalesce(avg(${ordersTable.total}), '0')` })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.userId));
      const avgValue = parseFloat(avgRow?.avg ?? "0");
      if (typeof targeting.minOrderValue === "number" && avgValue < targeting.minOrderValue)
        return false;
      if (typeof targeting.maxOrderValue === "number" && avgValue > targeting.maxOrderValue)
        return false;
    }
  }

  return true;
}

router.get("/active", async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const userRole = user ? user.roles || "customer" : "customer";
    const sessionId = req.query["sessionId"] as string | undefined;
    const now = new Date();

    const activeCampaigns = await db
      .select()
      .from(popupCampaignsTable)
      .where(
        and(
          eq(popupCampaignsTable.status, "live"),
          or(isNull(popupCampaignsTable.startDate), lte(popupCampaignsTable.startDate, now)),
          or(isNull(popupCampaignsTable.endDate), gte(popupCampaignsTable.endDate, now))
        )
      )
      .orderBy(desc(popupCampaignsTable.priority));

    const eligible: typeof activeCampaigns = [];

    for (const campaign of activeCampaigns) {
      const userObj = user
        ? { userId: user.userId, role: user.roles }
        : { userId: "guest", role: userRole };

      const passes = await evaluateTargeting(campaign, userObj);
      if (!passes) continue;

      if (campaign.maxTotalImpressions) {
        const [totalViews] = await db
          .select({ count: count() })
          .from(popupImpressionsTable)
          .where(
            and(
              eq(popupImpressionsTable.popupId, campaign.id),
              eq(popupImpressionsTable.action, "view")
            )
          );
        if (Number(totalViews?.count ?? 0) >= campaign.maxTotalImpressions) continue;
      }

      if (user?.userId) {
        const maxPerUser = campaign.maxImpressionsPerUser ?? 1;
        const frequency = campaign.displayFrequency ?? "once";

        const conditions = [
          eq(popupImpressionsTable.popupId, campaign.id),
          eq(popupImpressionsTable.userId, user.userId),
          eq(popupImpressionsTable.action, "view"),
        ];

        if (frequency === "daily") {
          const dayStart = new Date();
          dayStart.setHours(0, 0, 0, 0);
          conditions.push(gte(popupImpressionsTable.seenAt, dayStart));
        } else if (frequency === "every_session" && sessionId) {
          conditions.push(eq(popupImpressionsTable.sessionId, sessionId));
        }

        const [viewCount] = await db
          .select({ count: count() })
          .from(popupImpressionsTable)
          .where(and(...conditions));
        if (Number(viewCount?.count ?? 0) >= maxPerUser) continue;
      }

      eligible.push(campaign);
    }

    sendSuccess(res, {
      popups: eligible.map((c) => ({
        id: c.id,
        title: c.title,
        body: c.body,
        mediaUrl: c.mediaUrl,
        ctaText: c.ctaText,
        ctaLink: c.ctaLink,
        popupType: c.popupType,
        displayFrequency: c.displayFrequency,
        priority: c.priority,
        colorFrom: c.colorFrom,
        colorTo: c.colorTo,
        textColor: c.textColor,
        animation: c.animation,
        stylePreset: c.stylePreset,
      })),
      total: eligible.length,
    });
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/impression", async (req, res) => {
  try {
    const user = getUserFromRequest(req);
    const { popupId, action, sessionId } = req.body as {
      popupId: string;
      action: string;
      sessionId?: string;
    };
    if (!popupId) {
      sendValidationError(res, "popupId is required");
      return;
    }
    const validActions = ["view", "click", "dismiss"];
    if (!validActions.includes(action)) {
      sendValidationError(res, "action must be view, click, or dismiss");
      return;
    }

    const [campaign] = await db
      .select({ id: popupCampaignsTable.id })
      .from(popupCampaignsTable)
      .where(eq(popupCampaignsTable.id, popupId))
      .limit(1);
    if (!campaign) {
      sendValidationError(res, "Invalid popupId");
      return;
    }

    const userId = user?.userId ?? "guest";

    await db
      .insert(popupImpressionsTable)
      .values({
        id: generateId(),
        popupId,
        userId,
        action,
        sessionId: sessionId || null,
      })
      .catch((err: unknown) => {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err), popupId, userId, action },
          "[popups] impression insert failed (non-critical)"
        );
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
    res.status(500).json({ error: "Server error" });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
   POST /api/popups/ai-generate — AI-Powered Popup Generation with Gemini
   ────────────────────────────────────────────────────────────────────────── */
const aiGenerateSchema = z.object({
  targetAudience: z.string().min(3, "Target audience must be at least 3 characters"),
  goal: z.enum(["conversion", "signup", "promo"], {
    errorMap: () => ({ message: "Goal must be conversion, signup, or promo" }),
  }),
  tone: z.enum(["urgent", "friendly", "luxury"]).optional(),
  platform: z.enum(["web", "mobile"]).optional(),
});

type _AIGenerateRequest = z.infer<typeof aiGenerateSchema>;
type AIPopupContent = {
  title: string;
  body: string;
  ctaText: string;
  ctaLink: string;
  stylePreset: string;
  animation: string;
  colorFrom: string;
  colorTo: string;
};

router.post("/ai-generate", async (req, res) => {
  try {
    // Validate input
    const parsed = aiGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error.issues.map((i) => i.message).join(", "));
      return;
    }

    const { targetAudience, goal, tone = "friendly", platform = "web" } = parsed.data;

    // Build AI prompt
    const prompt = `You are a professional marketing copywriter. Generate a compelling ${platform} popup for:
- Target Audience: ${targetAudience}
- Goal: ${goal} (${goal === "conversion" ? "encourage purchase" : goal === "signup" ? "encourage user registration" : "promote special offer"})
- Tone: ${tone}

Respond ONLY with valid JSON (no markdown, no code blocks) with these exact fields:
{
  "title": "short catchy headline (max 50 chars)",
  "body": "persuasive body text (max 150 chars)",
  "ctaText": "action button text (max 20 chars)",
  "ctaLink": "/suggested-link",
  "stylePreset": "default|minimal|bold|luxury",
  "animation": "fade|slide|pop|none",
  "colorFrom": "#HEXCOLOR1",
  "colorTo": "#HEXCOLOR2"
}

Ensure the colors match the tone (e.g., urgent=red tones, luxury=gold/silver, friendly=soft blues/greens).`;

    // Call Gemini API
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    // Extract and validate response
    const rawResponse = response.text;
    if (!rawResponse) {
      sendError(res, "No response from AI model", 500);
      return;
    }

    // Parse AI response
    let popupContent: AIPopupContent;
    try {
      popupContent = JSON.parse(rawResponse);
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        "[popups] AI JSON parse failed — trying regex extraction"
      );
      // Fallback: extract JSON from potential markdown blocks
      const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        sendError(res, "Failed to parse AI response", 500);
        return;
      }
      popupContent = JSON.parse(jsonMatch[0]);
    }

    // Validate parsed content
    if (!popupContent.title || !popupContent.body || !popupContent.ctaText) {
      sendError(res, "AI generated incomplete popup content", 500);
      return;
    }

    // Save to database
    const campaignId = generateId();
    const [campaign] = await db
      .insert(popupCampaignsTable)
      .values({
        id: campaignId,
        title: popupContent.title,
        body: popupContent.body,
        ctaText: popupContent.ctaText,
        ctaLink: popupContent.ctaLink || "/",
        popupType: "modal",
        displayFrequency: "once",
        maxImpressionsPerUser: 1,
        priority: goal === "conversion" ? 5 : goal === "signup" ? 3 : 1,
        status: "draft",
        stylePreset: popupContent.stylePreset || "default",
        colorFrom: popupContent.colorFrom || "#7C3AED",
        colorTo: popupContent.colorTo || "#4F46E5",
        animation: popupContent.animation || "fade",
        textColor: "#FFFFFF",
        targeting:
          targetAudience === "new_users" ? { newUsers: true } : { roles: [targetAudience] },
      })
      .returning();

    sendCreated(
      res,
      {
        id: campaign.id,
        title: campaign.title,
        body: campaign.body,
        ctaText: campaign.ctaText,
        ctaLink: campaign.ctaLink,
        stylePreset: campaign.stylePreset,
        animation: campaign.animation,
        colorFrom: campaign.colorFrom,
        colorTo: campaign.colorTo,
        status: campaign.status,
      },
      "Popup generated successfully. Review and customize before going live."
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendError(res, `AI generation failed: ${message}`, 500);
  }
});

export default router;

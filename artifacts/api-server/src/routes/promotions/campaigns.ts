import { Router } from "express";
import {
  adminAuth,
  asc,
  campaignParticipationsTable,
  campaignsTable,
  count,
  db,
  desc,
  eq,
  generateId,
  inArray,
  mapCampaign,
  mapOffer,
  marketingAuth,
  nowIso,
  offerRedemptionsTable,
  offersTable,
  requireRole,
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
  sum,
} from "./helpers.js";

const router = Router();

router.get("/campaigns", adminAuth, async (_req, res) => {
  try {
    const campaigns = await db
      .select()
      .from(campaignsTable)
      .orderBy(desc(campaignsTable.createdAt));

    const offerCounts = await db
      .select({ campaignId: offersTable.campaignId, count: count() })
      .from(offersTable)
      .groupBy(offersTable.campaignId);
    const countMap = Object.fromEntries(offerCounts.map((r) => [r.campaignId, r.count]));

    const now = nowIso();
    sendSuccess(res, {
      campaigns: campaigns.map((c) => ({
        ...mapCampaign(c),
        offerCount: countMap[c.id] ?? 0,
        computedStatus:
          !c.status || c.status === "draft"
            ? "draft"
            : c.status === "paused"
              ? "paused"
              : c.startDate > now
                ? "scheduled"
                : c.endDate < now
                  ? "expired"
                  : c.status,
      })),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/campaigns/:id", adminAuth, async (req, res) => {
  try {
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, req.params["id"] as string))
      .limit(1);
    if (!campaign) {
      sendNotFound(res, "Campaign not found");
      return;
    }

    const offers = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.campaignId, campaign.id));

    const participations = await db
      .select()
      .from((await import("./helpers.js")).campaignParticipationsTable)
      .where(
        eq((await import("./helpers.js")).campaignParticipationsTable.campaignId, campaign.id)
      );

    sendSuccess(res, {
      campaign: mapCampaign(campaign),
      offers: offers.map(mapOffer),
      participations,
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/campaigns", marketingAuth, async (req, res) => {
  try {
    const {
      name,
      description,
      theme,
      colorFrom,
      colorTo,
      bannerImage,
      priority,
      budgetCap,
      startDate,
      endDate,
      status,
    } = req.body;
    if (!name || !startDate || !endDate) {
      sendValidationError(res, "name, startDate, endDate required");
      return;
    }

    const [campaign] = await db
      .insert(campaignsTable)
      .values({
        id: generateId(),
        name,
        description: description || null,
        theme: theme || "general",
        colorFrom: colorFrom || "#7C3AED",
        colorTo: colorTo || "#4F46E5",
        bannerImage: bannerImage || null,
        priority: priority ?? 0,
        budgetCap: budgetCap ? String(budgetCap) : null,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: status || "draft",
      })
      .returning();
    sendCreated(res, mapCampaign(campaign));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/campaigns/:id", marketingAuth, async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const fields = [
      "name",
      "description",
      "theme",
      "colorFrom",
      "colorTo",
      "bannerImage",
      "priority",
      "status",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.budgetCap !== undefined)
      updates.budgetCap = body.budgetCap ? String(body.budgetCap) : null;
    if (body.startDate !== undefined) updates.startDate = new Date(String(body.startDate));
    if (body.endDate !== undefined) updates.endDate = new Date(String(body.endDate));

    const [campaign] = await db
      .update(campaignsTable)
      .set(updates)
      .where(eq(campaignsTable.id, id))
      .returning();
    if (!campaign) {
      sendNotFound(res, "Campaign not found");
      return;
    }
    sendSuccess(res, mapCampaign(campaign));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/campaigns/:id", marketingAuth, async (req, res) => {
  try {
    await db.delete(campaignsTable).where(eq(campaignsTable.id, req.params["id"] as string));
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /vendor/campaigns/:id/performance ── vendor campaign performance ── */
router.get("/vendor/campaigns/:id/performance", requireRole("vendor"), async (req, res) => {
  try {
    const vendorId = req.vendorId as string | undefined;
    const campaignId = req.params["id"] as string;

    const vendorParticipations = await db
      .select({ vendorId: campaignParticipationsTable.vendorId })
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.campaignId, campaignId));
    if (!vendorParticipations.some((p) => p.vendorId === vendorId)) {
      sendForbidden(res, "You do not have access to this campaign's performance data");
      return;
    }

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId))
      .limit(1);
    if (!campaign) {
      sendNotFound(res, "Campaign not found");
      return;
    }

    const offers = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.campaignId, campaignId));
    const offerIds = offers.map((o) => o.id);

    const redemptions =
      offerIds.length > 0
        ? await db
            .select({
              offerId: offerRedemptionsTable.offerId,
              totalUses: count(),
              totalValue: sum(offerRedemptionsTable.discount),
            })
            .from(offerRedemptionsTable)
            .where(inArray(offerRedemptionsTable.offerId, offerIds))
            .groupBy(offerRedemptionsTable.offerId)
        : [];

    const redemptionMap = Object.fromEntries(
      redemptions.map((r) => [r.offerId, { totalUses: r.totalUses, totalValue: r.totalValue }])
    );

    sendSuccess(res, {
      campaign: mapCampaign(campaign),
      offers: offers.map((o) => ({
        ...mapOffer(o),
        performance: redemptionMap[o.id] ?? { totalUses: 0, totalValue: "0" },
      })),
      totals: {
        totalOffers: offers.length,
        totalRedemptions: redemptions.reduce((s, r) => s + Number(r.totalUses), 0),
        totalDiscount: redemptions.reduce((s, r) => s + Number(r.totalValue ?? 0), 0),
      },
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* ── GET /vendor/campaigns ── list active campaigns vendor can join ── */
router.get("/vendor/campaigns", requireRole("vendor"), async (req, res) => {
  try {
    const vendorId = req.vendorId as string;
    const now = nowIso();
    const campaigns = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.status, "active"))
      .orderBy(asc(campaignsTable.endDate));

    const myParticipations = await db
      .select()
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.vendorId, vendorId));
    const myMap = Object.fromEntries(myParticipations.map((p) => [p.campaignId, p]));

    sendSuccess(res, {
      campaigns: campaigns
        .filter((c) => c.startDate <= now && c.endDate >= now)
        .map((c) => ({
          ...mapCampaign(c),
          participation: myMap[c.id] ?? null,
          isParticipating: !!myMap[c.id],
        })),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* ── POST /vendor/campaigns/:id/participate ── join a campaign ── */
router.post("/vendor/campaigns/:id/participate", requireRole("vendor"), async (req, res) => {
  try {
    const vendorId = req.vendorId as string;
    const campaignId = req.params["id"] as string;

    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId))
      .limit(1);
    if (!campaign) {
      sendNotFound(res, "Campaign not found");
      return;
    }
    if (campaign.status !== "active") {
      sendValidationError(res, "Campaign is not currently active");
      return;
    }

    const [_existing] = await db
      .select()
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.campaignId, campaignId))
      .limit(1);
    // check if THIS vendor already participates
    const myExisting = await db
      .select()
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.campaignId, campaignId))
      .then((rows) => rows.find((r) => r.vendorId === vendorId));
    if (myExisting) {
      sendError(res, "You are already participating in this campaign", 409);
      return;
    }

    const [participation] = await db
      .insert(campaignParticipationsTable)
      .values({
        id: generateId(),
        campaignId,
        vendorId,
        status: "active",
      })
      .returning();
    sendCreated(res, { participation });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

/* ── DELETE /vendor/participations/:id ── leave / cancel participation ── */
router.delete("/vendor/participations/:id", requireRole("vendor"), async (req, res) => {
  try {
    const vendorId = req.vendorId as string;
    const participationId = req.params["id"] as string;
    const rows = await db
      .select()
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.id, participationId));
    const participation = rows.find((r) => r.vendorId === vendorId);
    if (!participation) {
      sendNotFound(res, "Participation not found");
      return;
    }
    await db
      .delete(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.id, participationId));
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;

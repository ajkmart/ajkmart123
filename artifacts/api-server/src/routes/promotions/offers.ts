import { Router, type Request } from "express";
import type { SQL } from "./helpers.js";
import {
  adminAuth,
  and,
  asc,
  campaignParticipationsTable,
  count,
  db,
  desc,
  eq,
  generateId,
  inArray,
  managerAuth,
  mapOffer,
  marketingAuth,
  nowIso,
  offerRedemptionsTable,
  offersTable,
  offerTemplatesTable,
  ordersTable,
  requireRole,
  sendCreated,
  sendError,
  sendNotFound,
  sendSuccess,
  sendValidationError,
  sql,
  sum,
} from "./helpers.js";

const router = Router();

router.get("/offers", adminAuth, async (req, res) => {
  try {
    const campaignId = req.query["campaignId"] as string | undefined;
    const type = req.query["type"] as string | undefined;
    const status = req.query["status"] as string | undefined;

    const conditions: SQL[] = [];
    if (campaignId) conditions.push(eq(offersTable.campaignId, campaignId));
    if (type) conditions.push(eq(offersTable.type, type));

    const offers = await db
      .select()
      .from(offersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(offersTable.sortOrder), desc(offersTable.createdAt));

    let mapped = offers.map(mapOffer);
    if (status) mapped = mapped.filter((o) => o.computedStatus === status || o.status === status);

    sendSuccess(res, { offers: mapped, total: mapped.length });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/offers/pending", managerAuth, async (_req: Request, res) => {
  try {
    const pending = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.status, "pending_approval"))
      .orderBy(asc(offersTable.createdAt));
    sendSuccess(res, { offers: pending.map((o) => mapOffer(o)) });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/offers/:id", adminAuth, async (req, res) => {
  try {
    const [offer] = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.id, req.params["id"] as string))
      .limit(1);
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }

    const redemptions = await db
      .select()
      .from(offerRedemptionsTable)
      .where(
        and(
          eq(offerRedemptionsTable.offerId, offer.id),
          sql`${offerRedemptionsTable.orderId} IS NOT NULL`
        )
      )
      .orderBy(desc(offerRedemptionsTable.createdAt))
      .limit(100);

    const [analytics] = await db
      .select({ totalDiscount: sum(offerRedemptionsTable.discount), totalRedemptions: count() })
      .from(offerRedemptionsTable)
      .where(
        and(
          eq(offerRedemptionsTable.offerId, offer.id),
          sql`${offerRedemptionsTable.orderId} IS NOT NULL`
        )
      );

    sendSuccess(res, {
      offer: mapOffer(offer),
      analytics: {
        totalRedemptions: analytics?.totalRedemptions ?? 0,
        totalDiscount: analytics?.totalDiscount ? parseFloat(String(analytics.totalDiscount)) : 0,
      },
      recentRedemptions: redemptions,
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers", marketingAuth, async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    if (!body.name || !body.type || !body.startDate || !body.endDate) {
      sendValidationError(res, "name, type, startDate, endDate required");
      return;
    }

    const [offer] = await db
      .insert(offersTable)
      .values({
        id: generateId(),
        campaignId: body.campaignId ? String(body.campaignId) : null,
        name: String(body.name),
        description: body.description ? String(body.description) : null,
        type: String(body.type),
        code: body.code ? String(body.code).toUpperCase().trim() : null,
        discountPct: body.discountPct ? String(body.discountPct) : null,
        discountFlat: body.discountFlat ? String(body.discountFlat) : null,
        minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : "0",
        maxDiscount: body.maxDiscount ? String(body.maxDiscount) : null,
        buyQty: body.buyQty ? Number(body.buyQty) : null,
        getQty: body.getQty ? Number(body.getQty) : null,
        cashbackPct: body.cashbackPct ? String(body.cashbackPct) : null,
        cashbackMax: body.cashbackMax ? String(body.cashbackMax) : null,
        freeDelivery: body.freeDelivery === true,
        targetingRules: (body.targetingRules as object) || {},
        stackable: body.stackable === true,
        usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
        usagePerUser: body.usagePerUser ? Number(body.usagePerUser) : 1,
        appliesTo: body.appliesTo ? String(body.appliesTo) : "all",
        vendorId: body.vendorId ? String(body.vendorId) : null,
        status: (() => {
          const requested = body.status ? String(body.status) : "draft";
          const role = req.adminRole ?? "";
          const isManager = role === "super" || role === "manager";
          const safeStatuses = ["draft", "pending_approval"];
          if (!isManager && !safeStatuses.includes(requested)) return "draft";
          return requested;
        })(),
        startDate: new Date(String(body.startDate)),
        endDate: new Date(String(body.endDate)),
        sortOrder: body.sortOrder != null ? Number(body.sortOrder) : 0,
      })
      .returning();
    sendCreated(res, mapOffer(offer));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/offers/:id", marketingAuth, async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const strFields = [
      "name",
      "description",
      "type",
      "appliesTo",
      "vendorId",
      "createdBy",
      "approvedBy",
    ];
    for (const f of strFields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.status !== undefined) {
      const requested = String(body.status);
      const role = req.adminRole ?? "";
      const isManager = role === "super" || role === "manager";
      const safeStatuses = ["draft", "pending_approval"];
      updates.status = !isManager && !safeStatuses.includes(requested) ? "draft" : requested;
    }
    if (body.campaignId !== undefined) updates.campaignId = body.campaignId || null;
    if (body.code !== undefined)
      updates.code = body.code ? String(body.code).toUpperCase().trim() : null;
    if (body.discountPct !== undefined)
      updates.discountPct = body.discountPct ? String(body.discountPct) : null;
    if (body.discountFlat !== undefined)
      updates.discountFlat = body.discountFlat ? String(body.discountFlat) : null;
    if (body.minOrderAmount !== undefined)
      updates.minOrderAmount = String(body.minOrderAmount || "0");
    if (body.maxDiscount !== undefined)
      updates.maxDiscount = body.maxDiscount ? String(body.maxDiscount) : null;
    if (body.cashbackPct !== undefined)
      updates.cashbackPct = body.cashbackPct ? String(body.cashbackPct) : null;
    if (body.cashbackMax !== undefined)
      updates.cashbackMax = body.cashbackMax ? String(body.cashbackMax) : null;
    if (body.buyQty !== undefined) updates.buyQty = body.buyQty ? Number(body.buyQty) : null;
    if (body.getQty !== undefined) updates.getQty = body.getQty ? Number(body.getQty) : null;
    if (body.freeDelivery !== undefined) updates.freeDelivery = Boolean(body.freeDelivery);
    if (body.stackable !== undefined) updates.stackable = Boolean(body.stackable);
    if (body.targetingRules !== undefined) updates.targetingRules = body.targetingRules;
    if (body.usageLimit !== undefined)
      updates.usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
    if (body.usagePerUser !== undefined) updates.usagePerUser = Number(body.usagePerUser) || 1;
    if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
    if (body.startDate !== undefined) updates.startDate = new Date(String(body.startDate));
    if (body.endDate !== undefined) updates.endDate = new Date(String(body.endDate));

    const [offer] = await db
      .update(offersTable)
      .set(updates)
      .where(eq(offersTable.id, id))
      .returning();
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }
    sendSuccess(res, mapOffer(offer));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers/bulk", marketingAuth, async (req, res) => {
  try {
    const { ids, action } = req.body as { ids: string[]; action: string };
    if (!Array.isArray(ids) || !action) {
      sendValidationError(res, "ids and action required");
      return;
    }
    const statusMap: Record<string, string> = {
      pause: "paused",
      activate: "live",
      archive: "expired",
    };
    const newStatus = statusMap[action];
    if (!newStatus) {
      sendValidationError(res, "invalid action");
      return;
    }
    await db
      .update(offersTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(inArray(offersTable.id, ids));
    sendSuccess(res, { success: true, updated: ids.length });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers/:id/clone", marketingAuth, async (req, res) => {
  try {
    const [original] = await db
      .select()
      .from(offersTable)
      .where(eq(offersTable.id, req.params["id"] as string))
      .limit(1);
    if (!original) {
      sendNotFound(res, "Offer not found");
      return;
    }

    const [cloned] = await db
      .insert(offersTable)
      .values({
        ...original,
        id: generateId(),
        name: `${original.name} (Copy)`,
        code: original.code ? `${original.code}_COPY` : null,
        status: "draft",
        usedCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    sendCreated(res, mapOffer(cloned));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/offers/:id", marketingAuth, async (req, res) => {
  try {
    await db.delete(offersTable).where(eq(offersTable.id, req.params["id"] as string));
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/templates", adminAuth, async (_req, res) => {
  try {
    const templates = await db
      .select()
      .from(offerTemplatesTable)
      .orderBy(asc(offerTemplatesTable.sortOrder), desc(offerTemplatesTable.createdAt));
    sendSuccess(res, { templates, total: templates.length });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/templates/:id", adminAuth, async (req, res) => {
  try {
    const [tpl] = await db
      .select()
      .from(offerTemplatesTable)
      .where(eq(offerTemplatesTable.id, req.params["id"] as string))
      .limit(1);
    if (!tpl) {
      sendNotFound(res, "Template not found");
      return;
    }
    sendSuccess(res, tpl);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/templates", marketingAuth, async (req: Request, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const { name, type } = body;
    if (!name || !type) {
      sendValidationError(res, "name and type required");
      return;
    }

    const [tpl] = await db
      .insert(offerTemplatesTable)
      .values({
        id: generateId(),
        name: String(name),
        description: body.description ? String(body.description) : null,
        type: String(type),
        code: body.code ? String(body.code).toUpperCase().trim() : null,
        discountPct: body.discountPct ? String(body.discountPct) : null,
        discountFlat: body.discountFlat ? String(body.discountFlat) : null,
        minOrderAmount: body.minOrderAmount ? String(body.minOrderAmount) : "0",
        maxDiscount: body.maxDiscount ? String(body.maxDiscount) : null,
        buyQty: body.buyQty ? Number(body.buyQty) : null,
        getQty: body.getQty ? Number(body.getQty) : null,
        cashbackPct: body.cashbackPct ? String(body.cashbackPct) : null,
        cashbackMax: body.cashbackMax ? String(body.cashbackMax) : null,
        freeDelivery: body.freeDelivery === true,
        targetingRules: (body.targetingRules as object) || {},
        stackable: body.stackable === true,
        usageLimit: body.usageLimit ? Number(body.usageLimit) : null,
        usagePerUser: body.usagePerUser ? Number(body.usagePerUser) : 1,
        appliesTo: body.appliesTo ? String(body.appliesTo) : "all",
        sortOrder: body.sortOrder ? Number(body.sortOrder) : 0,
        createdBy: req.adminId ?? null,
      })
      .returning();
    sendCreated(res, tpl);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/templates/:id", marketingAuth, async (req, res) => {
  try {
    const id = req.params["id"] as string;
    const body = req.body as Record<string, unknown>;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    const strFields = ["name", "description", "type", "appliesTo", "code"];
    for (const f of strFields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.discountPct !== undefined)
      updates.discountPct = body.discountPct ? String(body.discountPct) : null;
    if (body.discountFlat !== undefined)
      updates.discountFlat = body.discountFlat ? String(body.discountFlat) : null;
    if (body.minOrderAmount !== undefined)
      updates.minOrderAmount = String(body.minOrderAmount || "0");
    if (body.maxDiscount !== undefined)
      updates.maxDiscount = body.maxDiscount ? String(body.maxDiscount) : null;
    if (body.cashbackPct !== undefined)
      updates.cashbackPct = body.cashbackPct ? String(body.cashbackPct) : null;
    if (body.cashbackMax !== undefined)
      updates.cashbackMax = body.cashbackMax ? String(body.cashbackMax) : null;
    if (body.buyQty !== undefined) updates.buyQty = body.buyQty ? Number(body.buyQty) : null;
    if (body.getQty !== undefined) updates.getQty = body.getQty ? Number(body.getQty) : null;
    if (body.freeDelivery !== undefined) updates.freeDelivery = Boolean(body.freeDelivery);
    if (body.stackable !== undefined) updates.stackable = Boolean(body.stackable);
    if (body.targetingRules !== undefined) updates.targetingRules = body.targetingRules;
    if (body.usageLimit !== undefined)
      updates.usageLimit = body.usageLimit ? Number(body.usageLimit) : null;
    if (body.usagePerUser !== undefined) updates.usagePerUser = Number(body.usagePerUser) || 1;
    if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);

    const [tpl] = await db
      .update(offerTemplatesTable)
      .set(updates)
      .where(eq(offerTemplatesTable.id, id))
      .returning();
    if (!tpl) {
      sendNotFound(res, "Template not found");
      return;
    }
    sendSuccess(res, tpl);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/templates/:id", marketingAuth, async (req, res) => {
  try {
    await db
      .delete(offerTemplatesTable)
      .where(eq(offerTemplatesTable.id, req.params["id"] as string));
    sendSuccess(res, { success: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/templates/:id/instantiate", marketingAuth, async (req: Request, res) => {
  try {
    const [tpl] = await db
      .select()
      .from(offerTemplatesTable)
      .where(eq(offerTemplatesTable.id, req.params["id"] as string))
      .limit(1);
    if (!tpl) {
      sendNotFound(res, "Template not found");
      return;
    }

    const body = req.body as Record<string, unknown>;
    if (!body.startDate || !body.endDate) {
      sendValidationError(res, "startDate and endDate required");
      return;
    }

    const [offer] = await db
      .insert(offersTable)
      .values({
        id: generateId(),
        campaignId: body.campaignId ? String(body.campaignId) : null,
        name: body.name ? String(body.name) : tpl.name,
        description: tpl.description,
        type: tpl.type,
        code: body.code ? String(body.code).toUpperCase().trim() : tpl.code,
        discountPct: tpl.discountPct,
        discountFlat: tpl.discountFlat,
        minOrderAmount: tpl.minOrderAmount,
        maxDiscount: tpl.maxDiscount,
        buyQty: tpl.buyQty,
        getQty: tpl.getQty,
        cashbackPct: tpl.cashbackPct,
        cashbackMax: tpl.cashbackMax,
        freeDelivery: tpl.freeDelivery,
        targetingRules: tpl.targetingRules,
        stackable: tpl.stackable,
        usageLimit: tpl.usageLimit,
        usagePerUser: tpl.usagePerUser,
        appliesTo: tpl.appliesTo,
        vendorId: body.vendorId ? String(body.vendorId) : null,
        status: "draft",
        startDate: new Date(String(body.startDate)),
        endDate: new Date(String(body.endDate)),
        sortOrder: tpl.sortOrder,
        createdBy: req.adminId ?? null,
      })
      .returning();
    sendCreated(res, mapOffer(offer));
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/analytics", adminAuth, async (req, res) => {
  try {
    const campaignId = req.query["campaignId"] as string | undefined;

    const conditions: SQL[] = [sql`${offerRedemptionsTable.orderId} IS NOT NULL`];
    if (campaignId) {
      const offersInCampaign = await db
        .select({ id: offersTable.id })
        .from(offersTable)
        .where(eq(offersTable.campaignId, campaignId));
      const offerIds = offersInCampaign.map((o) => o.id);
      if (offerIds.length > 0) conditions.push(inArray(offerRedemptionsTable.offerId, offerIds));
    }

    const [totals] = await db
      .select({ totalRedemptions: count(), totalDiscount: sum(offerRedemptionsTable.discount) })
      .from(offerRedemptionsTable)
      .where(and(...conditions));

    const topOffers = await db
      .select({
        offerId: offerRedemptionsTable.offerId,
        redemptions: count(),
        discountGiven: sum(offerRedemptionsTable.discount),
      })
      .from(offerRedemptionsTable)
      .where(and(...conditions))
      .groupBy(offerRedemptionsTable.offerId)
      .orderBy(desc(count()))
      .limit(5);

    const offerDetails =
      topOffers.length > 0
        ? await db
            .select({ id: offersTable.id, name: offersTable.name, type: offersTable.type })
            .from(offersTable)
            .where(
              inArray(
                offersTable.id,
                topOffers.map((o) => o.offerId)
              )
            )
        : [];
    const offerMap = Object.fromEntries(offerDetails.map((o) => [o.id, o]));

    const activeCampaigns = await db
      .select({ count: count() })
      .from((await import("./helpers.js")).campaignsTable)
      .where(eq((await import("./helpers.js")).campaignsTable.status, "live"));
    const activeOffers = await db
      .select({ count: count() })
      .from(offersTable)
      .where(eq(offersTable.status, "live"));

    sendSuccess(res, {
      totals: {
        redemptions: totals?.totalRedemptions ?? 0,
        discountGiven: totals?.totalDiscount ? parseFloat(String(totals.totalDiscount)) : 0,
      },
      topOffers: topOffers.map((o) => ({
        ...o,
        discountGiven: o.discountGiven ? parseFloat(String(o.discountGiven)) : 0,
        offer: offerMap[o.offerId] ?? null,
      })),
      activeCampaigns: activeCampaigns[0]?.count ?? 0,
      activeOffers: activeOffers[0]?.count ?? 0,
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/ai-recommendations", adminAuth, async (_req, res) => {
  try {
    const now = nowIso();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentOrders = await db
      .select({
        type: ordersTable.type,
        total: ordersTable.total,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where((await import("drizzle-orm")).gte(ordersTable.createdAt, thirtyDaysAgo))
      .limit(500);

    const ordersByType: Record<string, number[]> = {};
    const ordersByHour: number[] = Array(24).fill(0);
    for (const o of recentOrders) {
      const t = o.type ?? "mart";
      if (!ordersByType[t]) ordersByType[t] = [];
      ordersByType[t].push(parseFloat(String(o.total || "0")));
      const hour = new Date(o.createdAt).getHours();
      ordersByHour[hour]++;
    }

    const peakHours = ordersByHour
      .map((c, h) => ({ hour: h, count: c }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(({ hour }) => hour);

    const activeOffers = await db
      .select({ type: offersTable.type })
      .from(offersTable)
      .where(eq(offersTable.status, "live"));
    const coveredTypes = new Set(activeOffers.map((o) => o.type));

    const recommendations: {
      id: string;
      type: string;
      title: string;
      description: string;
      impact: string;
      suggestedDiscount: number;
      suggestedTimes?: number[];
      targetService?: string;
    }[] = [];

    if (!coveredTypes.has("happy_hour") && peakHours.length > 0) {
      recommendations.push({
        id: "happy_hour_suggestion",
        type: "happy_hour",
        title: "Happy Hour Opportunity",
        description: `Peak order times are around ${peakHours.map((h) => `${h}:00`).join(", ")}. A 15-20% happy hour discount during these times could boost order volume significantly.`,
        impact: "high",
        suggestedDiscount: 15,
        suggestedTimes: peakHours,
      });
    }

    const topService = Object.entries(ordersByType).sort((a, b) => b[1].length - a[1].length)[0];
    if (topService && !coveredTypes.has("category")) {
      const [svcName, orders] = topService;
      const avgOrder = orders.reduce((s, v) => s + v, 0) / orders.length;
      recommendations.push({
        id: "top_service_boost",
        type: "percentage",
        title: `Boost ${svcName.charAt(0).toUpperCase() + svcName.slice(1)} Orders`,
        description: `${svcName} is your top service with ${orders.length} orders (avg Rs.${Math.round(avgOrder)}). A 10% discount for orders above Rs.${Math.round(avgOrder * 0.8)} could increase frequency.`,
        impact: "medium",
        suggestedDiscount: 10,
        targetService: svcName,
      });
    }

    const newUserOffers = activeOffers.filter((o) => o.type === "first_order");
    if (newUserOffers.length === 0) {
      recommendations.push({
        id: "first_order_offer",
        type: "first_order",
        title: "New User Acquisition",
        description:
          "No first-order discount is currently active. A Rs.100 off or 20% discount for first-time users could significantly improve conversion rates.",
        impact: "high",
        suggestedDiscount: 20,
      });
    }

    if (!coveredTypes.has("free_delivery")) {
      recommendations.push({
        id: "free_delivery_threshold",
        type: "free_delivery",
        title: "Free Delivery Offer",
        description:
          "Free delivery above a threshold (e.g., Rs.500) is proven to increase cart values. Consider running this during weekends.",
        impact: "medium",
        suggestedDiscount: 0,
      });
    }

    sendSuccess(res, { recommendations });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.patch("/vendor/participations/:id", adminAuth, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) {
      sendValidationError(res, "status required");
      return;
    }
    const [participation] = await db
      .update(campaignParticipationsTable)
      .set({ status, notes: notes || null })
      .where(eq(campaignParticipationsTable.id, req.params["id"] as string))
      .returning();
    if (!participation) {
      sendNotFound(res, "Participation not found");
      return;
    }
    sendSuccess(res, participation);
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/vendor/participations", adminAuth, async (req, res) => {
  try {
    const campaignId = req.query["campaignId"] as string | undefined;
    const conditions: SQL[] = [];
    if (campaignId) conditions.push(eq(campaignParticipationsTable.campaignId, campaignId));
    const participations = await db
      .select()
      .from(campaignParticipationsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(campaignParticipationsTable.createdAt));
    sendSuccess(res, { participations });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.delete("/vendor/participations/:id", requireRole("vendor"), async (req: Request, res) => {
  try {
    const vendorId = req.vendorId as string;
    if (!vendorId) {
      sendValidationError(res, "auth required");
      return;
    }
    const [participation] = await db
      .select()
      .from(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.id, req.params["id"] as string))
      .limit(1);
    if (!participation) {
      sendNotFound(res, "Participation not found");
      return;
    }
    if (participation.vendorId !== vendorId) {
      sendError(res, "Not authorized", 403);
      return;
    }
    if (participation.status !== "pending") {
      sendError(res, "Only pending participations can be withdrawn", 400);
      return;
    }
    await db
      .delete(campaignParticipationsTable)
      .where(eq(campaignParticipationsTable.id, req.params["id"] as string));
    sendSuccess(res, { message: "Participation withdrawn" });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/bookmarks/:offerId", async (req: Request, res) => {
  try {
    const userId = req.customerId;
    if (!userId) {
      sendValidationError(res, "auth required");
      return;
    }
    const { offerId } = req.params as { offerId: string };

    const [offer] = await db
      .select({ id: offersTable.id })
      .from(offersTable)
      .where(eq(offersTable.id, offerId))
      .limit(1);
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }

    const existingBookmark = await db
      .select({ id: offerRedemptionsTable.id })
      .from(offerRedemptionsTable)
      .where(
        and(
          eq(offerRedemptionsTable.offerId, offerId),
          eq(offerRedemptionsTable.userId, userId),
          sql`${offerRedemptionsTable.orderId} IS NULL`,
          sql`${offerRedemptionsTable.discount} = '0'`
        )
      )
      .limit(1);

    if (existingBookmark.length > 0) {
      sendSuccess(res, { bookmarked: true, alreadyExists: true });
      return;
    }

    await db.insert(offerRedemptionsTable).values({
      id: generateId(),
      offerId,
      userId,
      orderId: null,
      discount: "0",
    });

    sendSuccess(res, { bookmarked: true });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/bookmarks", async (req: Request, res) => {
  try {
    const userId = req.customerId;
    if (!userId) {
      sendValidationError(res, "auth required");
      return;
    }

    const bookmarkRows = await db
      .select({ offerId: offerRedemptionsTable.offerId })
      .from(offerRedemptionsTable)
      .where(
        and(
          eq(offerRedemptionsTable.userId, userId),
          sql`${offerRedemptionsTable.orderId} IS NULL`,
          sql`${offerRedemptionsTable.discount} = '0'`
        )
      );

    if (bookmarkRows.length === 0) {
      sendSuccess(res, { offers: [] });
      return;
    }

    const offerIds = bookmarkRows.map((r) => r.offerId);
    const offers = await db.select().from(offersTable).where(inArray(offersTable.id, offerIds));
    sendSuccess(res, { offers: offers.map((o) => mapOffer(o)) });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers/:id/submit", marketingAuth, async (req: Request, res) => {
  try {
    const { id } = req.params as { id: string };
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }
    if (offer.status !== "draft") {
      sendError(res, "Only draft offers can be submitted for approval", 400);
      return;
    }
    await db
      .update(offersTable)
      .set({ status: "pending_approval", updatedAt: new Date() })
      .where(eq(offersTable.id, id));
    sendSuccess(res, { id, status: "pending_approval" });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers/:id/approve", managerAuth, async (req: Request, res) => {
  try {
    const { id } = req.params as { id: string };
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }
    if (offer.status !== "pending_approval") {
      sendError(res, "Only offers pending approval can be approved", 400);
      return;
    }
    await db
      .update(offersTable)
      .set({ status: "scheduled", approvedBy: req.adminId, updatedAt: new Date() })
      .where(eq(offersTable.id, id));
    sendSuccess(res, { id, status: "scheduled", approvedBy: req.adminId });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.post("/offers/:id/reject", managerAuth, async (req: Request, res) => {
  try {
    const { id } = req.params as { id: string };
    const [offer] = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
    if (!offer) {
      sendNotFound(res, "Offer not found");
      return;
    }
    if (offer.status !== "pending_approval") {
      sendError(res, "Only offers pending approval can be rejected", 400);
      return;
    }
    const { reason } = req.body as { reason?: string };
    await db
      .update(offersTable)
      .set({ status: "rejected", approvedBy: req.adminId, updatedAt: new Date() })
      .where(eq(offersTable.id, id));
    sendSuccess(res, { id, status: "rejected", reason: reason ?? null });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;

import { Router, type Request } from "express";
import { logger } from "../../lib/logger.js";
import {
  and,
  asc,
  campaignsTable,
  computeOfferStatus,
  count,
  customerAuth,
  db,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  mapCampaign,
  mapOffer,
  nowIso,
  offerRedemptionsTable,
  offersTable,
  ordersTable,
  promoCodesTable,
  sendSuccess,
  sendValidationError,
  sql,
  sum,
  usersTable,
} from "./helpers.js";

const router = Router();

router.get("/public", async (req, res) => {
  try {
    const now = nowIso();
    const type = req.query["type"] as string | undefined;

    const offers = await db
      .select()
      .from(offersTable)
      .where(
        and(
          eq(offersTable.status, "live"),
          lte(offersTable.startDate, now),
          gte(offersTable.endDate, now)
        )
      )
      .orderBy(asc(offersTable.sortOrder), desc(offersTable.createdAt));

    const campaigns = await db
      .select()
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.status, "live"),
          lte(campaignsTable.startDate, now),
          gte(campaignsTable.endDate, now)
        )
      )
      .orderBy(asc(campaignsTable.priority));

    let filteredOffers = offers;
    if (type && type !== "all") {
      filteredOffers = offers.filter(
        (o) => o.type === type || o.appliesTo === "all" || o.appliesTo === type
      );
    }

    const groupedOffers = {
      flashDeals: filteredOffers.filter((o) => o.type === "flash_deal" || o.type === "percentage"),
      freeDelivery: filteredOffers.filter((o) => o.freeDelivery || o.type === "free_delivery"),
      categoryOffers: filteredOffers.filter(
        (o) => o.type === "category" || o.type === "flat_discount"
      ),
      newUserSpecials: filteredOffers.filter((o) => {
        const rules = (o.targetingRules ?? {}) as Record<string, unknown>;
        return rules["newUsersOnly"] === true || o.type === "first_order";
      }),
      bogoDeals: filteredOffers.filter((o) => o.type === "bogo"),
      cashback: filteredOffers.filter((o) => o.type === "cashback"),
      happyHour: filteredOffers.filter((o) => o.type === "happy_hour"),
      bundles: filteredOffers.filter((o) => o.type === "combo"),
    };

    sendSuccess(res, {
      offers: filteredOffers.map(mapOffer),
      campaigns: campaigns.map(mapCampaign),
      grouped: {
        flashDeals: groupedOffers.flashDeals.map(mapOffer),
        freeDelivery: groupedOffers.freeDelivery.map(mapOffer),
        categoryOffers: groupedOffers.categoryOffers.map(mapOffer),
        newUserSpecials: groupedOffers.newUserSpecials.map(mapOffer),
        bogoDeals: groupedOffers.bogoDeals.map(mapOffer),
        cashback: groupedOffers.cashback.map(mapOffer),
        happyHour: groupedOffers.happyHour.map(mapOffer),
        bundles: groupedOffers.bundles.map(mapOffer),
      },
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

router.get("/for-you", customerAuth, async (req: Request, res) => {
  try {
    const userId: string | undefined = req.customerId ?? undefined;
    if (!userId) {
      sendValidationError(res, "auth required");
      return;
    }

    const now = nowIso();
    const liveOffers = await db
      .select()
      .from(offersTable)
      .where(
        and(
          eq(offersTable.status, "live"),
          lte(offersTable.startDate, now),
          gte(offersTable.endDate, now)
        )
      )
      .limit(20);

    const userOrders = await db
      .select({
        type: ordersTable.type,
        total: ordersTable.total,
        createdAt: ordersTable.createdAt,
      })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), isNull(ordersTable.deletedAt)))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20);

    const isNewUser = userOrders.length === 0;
    const totalSpent = userOrders.reduce((sum, o) => sum + parseFloat(String(o.total || "0")), 0);
    const serviceFreq: Record<string, number> = {};
    for (const o of userOrders) {
      const t = o.type ?? "mart";
      serviceFreq[t] = (serviceFreq[t] || 0) + 1;
    }
    const topService = Object.entries(serviceFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mart";

    const scored = liveOffers.map((o) => {
      const rules = (o.targetingRules ?? {}) as Record<string, unknown>;
      let score = 50;
      if (isNewUser && (rules["newUsersOnly"] || o.type === "first_order")) score += 40;
      if (!isNewUser && rules["returningUsersOnly"]) score += 20;
      if (o.appliesTo === topService || o.appliesTo === "all") score += 15;
      if (totalSpent > 5000 && rules["highValueUser"]) score += 10;
      return { ...o, relevanceScore: score };
    });
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    sendSuccess(res, {
      offers: scored.slice(0, 10).map((o) => mapOffer(o)),
      context: { isNewUser, topService, totalSpent },
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

router.post("/auto-apply", customerAuth, async (req: Request, res) => {
  try {
    const userId = req.customerId!;
    const { orderTotal, orderType } = req.body as { orderTotal?: unknown; orderType?: string };
    const total = parseFloat(String(orderTotal ?? "0"));
    const svcType = (orderType ?? "mart").toLowerCase().trim();
    const now = nowIso();

    const candidateOffers = await db
      .select()
      .from(offersTable)
      .where(
        and(
          eq(offersTable.status, "live"),
          lte(offersTable.startDate, now),
          gte(offersTable.endDate, now)
        )
      )
      .limit(50);

    const [userRow] = await db
      .select({ createdAt: usersTable.createdAt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const [orderCountRow] = await db
      .select({ c: count() })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), isNull(ordersTable.deletedAt)));
    const [spendRow] = await db
      .select({ s: sum(ordersTable.total) })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), isNull(ordersTable.deletedAt)));

    const isNewUser = userRow
      ? Date.now() - userRow.createdAt.getTime() < 30 * 24 * 60 * 60 * 1000
      : false;
    const totalOrders = Number(orderCountRow?.c ?? 0);
    const totalSpend = parseFloat(String(spendRow?.s ?? "0"));

    type ScoredOffer = { offer: typeof offersTable.$inferSelect; discount: number; score: number };
    const eligible: ScoredOffer[] = [];

    for (const offer of candidateOffers) {
      if (offer.code) continue;
      if (offer.usageLimit != null && offer.usedCount >= (offer.usageLimit ?? Infinity)) continue;

      const minAmt = parseFloat(String(offer.minOrderAmount ?? "0"));
      if (total < minAmt) continue;

      const appliesTo = (offer.appliesTo ?? "all").toLowerCase().trim();
      if (appliesTo !== "all" && appliesTo !== svcType) continue;

      const rules = (offer.targetingRules ?? {}) as Record<string, unknown>;
      if (rules.newUsersOnly && !isNewUser) continue;
      if (rules.returningUsersOnly && totalOrders === 0) continue;
      if (rules.highValueUser && totalSpend < 5000) continue;

      const usagePerUser = offer.usagePerUser ? Number(offer.usagePerUser) : null;
      if (usagePerUser != null && usagePerUser > 0) {
        const [redemptionRow] = await db
          .select({ c: count() })
          .from(offerRedemptionsTable)
          .where(
            and(
              eq(offerRedemptionsTable.offerId, offer.id),
              eq(offerRedemptionsTable.userId, userId),
              sql`${offerRedemptionsTable.orderId} IS NOT NULL`
            )
          );
        if (Number(redemptionRow?.c ?? 0) >= usagePerUser) continue;
      }

      let discount = 0;
      if (offer.freeDelivery) {
        discount = 0;
      }
      if (offer.discountPct) {
        discount = Math.round((total * parseFloat(String(offer.discountPct))) / 100);
        if (offer.maxDiscount) discount = Math.min(discount, parseFloat(String(offer.maxDiscount)));
      } else if (offer.discountFlat) {
        discount = parseFloat(String(offer.discountFlat));
      }
      discount = Math.min(discount, total);

      eligible.push({ offer, discount, score: discount });
    }

    eligible.sort((a, b) => b.score - a.score);
    const best = eligible[0];

    if (!best) {
      sendSuccess(res, { applied: false, offer: null, discount: 0, freeDelivery: false });
      return;
    }

    sendSuccess(res, {
      applied: true,
      offer: mapOffer(best.offer),
      discount: best.discount,
      freeDelivery: best.offer.freeDelivery ?? false,
      savingsMessage:
        best.discount > 0
          ? `Best offer applied: save Rs. ${best.discount}`
          : best.offer.freeDelivery
            ? "Free delivery applied automatically"
            : "Offer applied",
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

type ValidatedEntry = {
  type: "offer" | "promo_code";
  offerId?: string;
  promoId?: string;
  code?: string;
  name?: string;
  description?: string;
  offerType?: string;
  discount: number;
  freeDelivery?: boolean;
};

router.post("/validate", customerAuth, async (req: Request, res) => {
  try {
    const { code, offerIds, orderTotal, orderType } = req.body as {
      code?: string;
      offerIds?: unknown[];
      orderTotal?: unknown;
      orderType?: string;
    };
    const userId: string | undefined = req.customerId ?? undefined;
    const total = parseFloat(String(orderTotal ?? "0"));
    const now = nowIso();

    const validatedOffers: ValidatedEntry[] = [];
    let totalDiscount = 0;
    let freeDelivery = false;
    const errors: string[] = [];

    type OfferRow = typeof offersTable.$inferSelect;
    const offersToValidate: OfferRow[] = [];

    if (code) {
      const upperCode = code.toUpperCase().trim();
      const [offerByCode] = await db
        .select()
        .from(offersTable)
        .where(and(eq(offersTable.code, upperCode), eq(offersTable.status, "live")))
        .limit(1);
      if (offerByCode) {
        offersToValidate.push(offerByCode);
      } else {
        const [promo] = await db
          .select()
          .from(promoCodesTable)
          .where(eq(promoCodesTable.code, upperCode))
          .limit(1);
        if (promo) {
          if (!promo.isActive) {
            errors.push("This code is not active.");
          } else if (promo.expiresAt && now > promo.expiresAt) {
            errors.push("This code has expired.");
          } else if (promo.usageLimit != null && promo.usedCount >= promo.usageLimit) {
            errors.push("This code has reached its usage limit.");
          } else {
            let discount = 0;
            if (promo.discountPct) {
              discount = Math.round((total * parseFloat(String(promo.discountPct))) / 100);
              if (promo.maxDiscount)
                discount = Math.min(discount, parseFloat(String(promo.maxDiscount)));
            } else if (promo.discountFlat) {
              discount = parseFloat(String(promo.discountFlat));
            }
            discount = Math.min(discount, total);
            totalDiscount += discount;
            validatedOffers.push({
              type: "promo_code",
              promoId: promo.id,
              code: promo.code ?? undefined,
              discount,
              description: promo.description ?? undefined,
            });
          }
        } else {
          errors.push("Code not found.");
        }
      }
    }

    if (offerIds && Array.isArray(offerIds)) {
      const uniqueIds = [...new Set(offerIds.filter((id): id is string => typeof id === "string"))];
      if (uniqueIds.length > 0) {
        const rows = await db.select().from(offersTable).where(inArray(offersTable.id, uniqueIds));
        for (const row of rows) {
          offersToValidate.push(row);
        }
      }
    }

    const nonStackableCount = offersToValidate.filter((o) => !o.stackable).length;
    if (nonStackableCount > 0 && offersToValidate.length > 1) {
      errors.push(
        "One or more offers cannot be combined with other discounts. Please apply a single offer."
      );
      sendSuccess(res, { valid: false, totalDiscount: 0, freeDelivery: false, offers: [], errors });
      return;
    }

    for (const offer of offersToValidate) {
      const computed = computeOfferStatus(offer);
      if (computed !== "live") {
        errors.push(`Offer "${offer.name}" is not currently available.`);
        continue;
      }
      if (total < parseFloat(String(offer.minOrderAmount ?? "0"))) {
        errors.push(
          `Offer "${offer.name}" requires a minimum order of Rs. ${offer.minOrderAmount}.`
        );
        continue;
      }
      const rules = (offer.targetingRules ?? {}) as Record<string, unknown>;

      if (rules["newUsersOnly"] && userId) {
        const [orderCount] = await db
          .select({ c: count() })
          .from(ordersTable)
          .where(and(eq(ordersTable.userId, userId), isNull(ordersTable.deletedAt)));
        if (Number(orderCount?.c ?? 0) > 0) {
          errors.push(`Offer "${offer.name}" is for new users only.`);
          continue;
        }
      }

      if (rules["serviceTypes"] && Array.isArray(rules["serviceTypes"]) && orderType) {
        if (!(rules["serviceTypes"] as string[]).includes(orderType)) {
          errors.push(`Offer "${offer.name}" is not valid for ${orderType} orders.`);
          continue;
        }
      }

      if (rules["minOrders"] != null && userId) {
        const [orderCount] = await db
          .select({ c: count() })
          .from(ordersTable)
          .where(and(eq(ordersTable.userId, userId), isNull(ordersTable.deletedAt)));
        if (Number(orderCount?.c ?? 0) < Number(rules["minOrders"])) {
          errors.push(
            `Offer "${offer.name}" requires at least ${rules["minOrders"]} previous orders.`
          );
          continue;
        }
      }

      if (userId) {
        const [userUsage] = await db
          .select({ c: count() })
          .from(offerRedemptionsTable)
          .where(
            and(
              eq(offerRedemptionsTable.offerId, offer.id),
              eq(offerRedemptionsTable.userId, userId),
              sql`${offerRedemptionsTable.orderId} IS NOT NULL`
            )
          );
        const usagePerUser = offer.usagePerUser ?? 1;
        if (Number(userUsage?.c ?? 0) >= usagePerUser) {
          errors.push(`You have already used offer "${offer.name}".`);
          continue;
        }
      }

      if (!offer.stackable && validatedOffers.length > 0) {
        errors.push(`Offer "${offer.name}" cannot be combined with other discounts.`);
        continue;
      }

      let discount = 0;
      if (offer.freeDelivery || offer.type === "free_delivery") {
        freeDelivery = true;
      }
      if (offer.discountPct) {
        discount = Math.round((total * parseFloat(String(offer.discountPct))) / 100);
        if (offer.maxDiscount) discount = Math.min(discount, parseFloat(String(offer.maxDiscount)));
      } else if (offer.discountFlat) {
        discount = parseFloat(String(offer.discountFlat));
      }
      discount = Math.min(discount, total - totalDiscount);
      totalDiscount += discount;
      validatedOffers.push({
        type: "offer",
        offerId: offer.id,
        name: offer.name,
        offerType: offer.type,
        discount,
        freeDelivery: offer.freeDelivery ?? false,
      });
    }

    sendSuccess(res, {
      valid: errors.length === 0 || validatedOffers.length > 0,
      totalDiscount,
      freeDelivery,
      offers: validatedOffers,
      errors,
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

/* NOTE: vendor campaign routes (GET /vendor/campaigns, POST /vendor/campaigns/:id/participate)
   are owned by campaigns.ts and mounted under the promotions router with adminAuth.
   They must NOT be duplicated here — campaigns.ts is the single source of truth. */

export default router;

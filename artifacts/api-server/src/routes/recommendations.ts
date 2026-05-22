import { db } from "@workspace/db";
import { ordersTable, productsTable, userInteractionsTable } from "@workspace/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendInternalError, sendSuccess } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";

const router: IRouter = Router();

router.post("/track", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const { productId, type } = req.body;
    if (!productId || !type) {
      res.status(400).json({ error: "productId and type required" });
      return;
    }
    const validTypes = ["view", "add_to_cart", "purchase", "wishlist"];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      return;
    }
    const weightMap: Record<string, number> = { view: 1, add_to_cart: 3, wishlist: 2, purchase: 5 };
    await db.insert(userInteractionsTable).values({
      id: generateId(),
      userId,
      productId,
      interactionType: type,
      weight: weightMap[type] ?? 1,
    });
    res.json({ success: true });
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

router.get("/for-you", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const limit = Math.min(20, parseInt(String(req.query["limit"] || "10")));

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const userCategories = await db
      .select({
        category: productsTable.category,
        score: sql<number>`SUM(${userInteractionsTable.weight})`.as("score"),
      })
      .from(userInteractionsTable)
      .innerJoin(productsTable, eq(userInteractionsTable.productId, productsTable.id))
      .where(
        and(
          eq(userInteractionsTable.userId, userId),
          gte(userInteractionsTable.createdAt, thirtyDaysAgo)
        )
      )
      .groupBy(productsTable.category)
      .orderBy(sql`score DESC`)
      .limit(5);

    const interactedIds = await db
      .select({ productId: userInteractionsTable.productId })
      .from(userInteractionsTable)
      .where(eq(userInteractionsTable.userId, userId));
    const excludeIds = new Set(interactedIds.map((r) => r.productId));

    let recommendations: (Omit<
      typeof productsTable.$inferSelect,
      "price" | "originalPrice" | "rating"
    > & { price: number; originalPrice: number | undefined; rating: number; reason: string })[] =
      [];

    if (userCategories.length > 0) {
      const topCategories = userCategories.map((c) => c.category);
      const products = await db
        .select()
        .from(productsTable)
        .where(
          and(
            eq(productsTable.approvalStatus, "approved"),
            eq(productsTable.inStock, true),
            inArray(productsTable.category, topCategories)
          )
        )
        .orderBy(desc(productsTable.reviewCount))
        .limit(limit * 3);

      recommendations = products
        .filter((p) => !excludeIds.has(p.id))
        .slice(0, limit)
        .map((p) => ({
          ...p,
          price: parseFloat(p.price),
          originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
          rating: p.rating ? parseFloat(p.rating) : 4.0,
          reason: "based_on_history",
        }));
    }

    if (recommendations.length < limit) {
      const remaining = limit - recommendations.length;
      const existingIds = new Set([...excludeIds, ...recommendations.map((r) => r.id)]);
      const trending = await db
        .select()
        .from(productsTable)
        .where(and(eq(productsTable.approvalStatus, "approved"), eq(productsTable.inStock, true)))
        .orderBy(desc(productsTable.reviewCount))
        .limit(remaining * 2);

      const trendingFiltered = trending
        .filter((p) => !existingIds.has(p.id))
        .slice(0, remaining)
        .map((p) => ({
          ...p,
          price: parseFloat(p.price),
          originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
          rating: p.rating ? parseFloat(p.rating) : 4.0,
          reason: "trending",
        }));
      recommendations.push(...trendingFiltered);
    }

    res.json({ recommendations, total: recommendations.length });
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

router.get("/trending", async (req, res) => {
  try {
    const limit = Math.min(20, parseInt(String(req.query["limit"] || "10")));
    const type = req.query["type"] as string | undefined;

    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const trendingProducts = await db
        .select({
          productId: userInteractionsTable.productId,
          score: sql<number>`SUM(${userInteractionsTable.weight})`.as("score"),
        })
        .from(userInteractionsTable)
        .where(gte(userInteractionsTable.createdAt, sevenDaysAgo))
        .groupBy(userInteractionsTable.productId)
        .orderBy(sql`score DESC`)
        .limit(limit * 2);

      if (trendingProducts.length === 0) {
        const conditions = [
          eq(productsTable.approvalStatus, "approved"),
          eq(productsTable.inStock, true),
        ];
        if (type) conditions.push(eq(productsTable.type, type));
        const fallback = await db
          .select()
          .from(productsTable)
          .where(and(...conditions))
          .orderBy(desc(productsTable.reviewCount))
          .limit(limit);

        sendSuccess(res, {
          products: fallback.map((p) => ({
            ...p,
            price: parseFloat(p.price),
            originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
            rating: p.rating ? parseFloat(p.rating) : 4.0,
            trendScore: 0,
          })),
          total: fallback.length,
        });
        return;
      }

      const productIds = trendingProducts.map((t) => t.productId);
      const scoreMap = new Map(trendingProducts.map((t) => [t.productId, t.score]));

      const conditions = [
        eq(productsTable.approvalStatus, "approved"),
        eq(productsTable.inStock, true),
        inArray(productsTable.id, productIds),
      ];
      if (type) conditions.push(eq(productsTable.type, type));

      const products = await db
        .select()
        .from(productsTable)
        .where(and(...conditions));

      const result = products
        .map((p) => ({
          ...p,
          price: parseFloat(p.price),
          originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
          rating: p.rating ? parseFloat(p.rating) : 4.0,
          trendScore: scoreMap.get(p.id) ?? 0,
        }))
        .sort((a, b) => b.trendScore - a.trendScore)
        .slice(0, limit);

      sendSuccess(res, { products: result, total: result.length });
    } catch (e: unknown) {
      logger.error("[recommendations GET /trending] DB error:", e);
      sendInternalError(res);
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

router.get("/similar/:productId", async (req, res) => {
  try {
    const productId = req.params["productId"] as string;
    const limit = Math.min(20, parseInt(String(req.query["limit"] || "8")));

    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const similar = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.approvalStatus, "approved"),
          eq(productsTable.inStock, true),
          eq(productsTable.category, product.category),
          eq(productsTable.type, product.type),
          sql`${productsTable.id} != ${productId}`
        )
      )
      .orderBy(desc(productsTable.reviewCount))
      .limit(limit);

    const nameWords = product.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const scored = similar
      .map((p) => {
        const matchCount = nameWords.filter((w) => p.name.toLowerCase().includes(w)).length;
        const ratingScore = parseFloat(p.rating ?? "4.0") * 10 + (p.reviewCount ?? 0);
        return {
          ...p,
          price: parseFloat(p.price),
          originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
          rating: p.rating ? parseFloat(p.rating) : 4.0,
          similarityScore: matchCount * 100 + ratingScore,
        };
      })
      .sort((a, b) => b.similarityScore - a.similarityScore);

    res.json({
      products: scored,
      total: scored.length,
      baseProduct: { id: product.id, name: product.name, category: product.category },
    });
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

router.get("/frequently-bought", customerAuth, async (req, res) => {
  try {
    const userId = req.customerId!;
    const limit = Math.min(20, parseInt(String(req.query["limit"] || "10")));

    const recentOrders = await db
      .select({ items: ordersTable.items })
      .from(ordersTable)
      .where(and(eq(ordersTable.userId, userId), eq(ordersTable.status, "delivered")))
      .orderBy(desc(ordersTable.createdAt))
      .limit(20);

    const productFreq = new Map<
      string,
      { count: number; name: string; price: number; image?: string }
    >();
    for (const order of recentOrders) {
      const items = (order.items ?? []) as Array<{
        productId?: string;
        name?: string;
        price?: number;
        image?: string;
      }>;
      for (const item of items) {
        if (!item.productId) continue;
        const existing = productFreq.get(item.productId);
        if (existing) {
          existing.count++;
        } else {
          productFreq.set(item.productId, {
            count: 1,
            name: item.name ?? "",
            price: item.price ?? 0,
            image: item.image,
          });
        }
      }
    }

    const sorted = Array.from(productFreq.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    if (sorted.length === 0) {
      res.json({ products: [], total: 0 });
      return;
    }

    const productIds = sorted.map(([id]) => id);
    const products = await db
      .select()
      .from(productsTable)
      .where(
        and(
          inArray(productsTable.id, productIds),
          eq(productsTable.approvalStatus, "approved"),
          eq(productsTable.inStock, true)
        )
      );

    const freqMap = new Map(sorted);
    const result = products
      .map((p) => ({
        ...p,
        price: parseFloat(p.price),
        originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
        rating: p.rating ? parseFloat(p.rating) : 4.0,
        purchaseCount: freqMap.get(p.id)?.count ?? 0,
      }))
      .sort((a, b) => b.purchaseCount - a.purchaseCount);

    res.json({ products: result, total: result.length });
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

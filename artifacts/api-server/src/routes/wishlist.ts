import { db } from "@workspace/db";
import { productsTable, wishlistTable } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendCreated, sendNotFound, sendSuccess } from "../lib/response.js";
import { customerAuth } from "../middleware/security.js";
import { validateBody } from "../middleware/validate.js";

const router: IRouter = Router();

router.use(customerAuth);

const addToWishlistSchema = z.object({
  productId: z.string().min(1, "productId is required"),
});

router.post("/", validateBody(addToWishlistSchema), async (req, res) => {
  try {
    const userId = req.customerId!;
    const { productId } = req.body;

    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) {
      sendNotFound(res, "Product not found", "پروڈکٹ نہیں ملی۔");
      return;
    }

    const existing = await db
      .select({ id: wishlistTable.id })
      .from(wishlistTable)
      .where(and(eq(wishlistTable.userId, userId), eq(wishlistTable.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      sendSuccess(res, { alreadyExists: true, id: existing[0]!.id });
      return;
    }

    const [entry] = await db
      .insert(wishlistTable)
      .values({
        id: generateId(),
        userId,
        productId,
      })
      .returning();

    sendCreated(res, { id: entry!.id });
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

router.delete("/:productId", async (req, res) => {
  try {
    const userId = req.customerId!;
    const productId = req.params["productId"] as string;

    const deleted = await db
      .delete(wishlistTable)
      .where(and(eq(wishlistTable.userId, userId), eq(wishlistTable.productId, productId)))
      .returning();

    if (deleted.length === 0) {
      sendNotFound(res, "Item not in wishlist", "آئٹم خواہش کی فہرست میں نہیں ہے۔");
      return;
    }

    sendSuccess(res, null);
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

router.get("/", async (req, res) => {
  try {
    const userId = req.customerId!;

    const items = await db
      .select({
        id: wishlistTable.id,
        productId: wishlistTable.productId,
        createdAt: wishlistTable.createdAt,
      })
      .from(wishlistTable)
      .where(eq(wishlistTable.userId, userId))
      .orderBy(desc(wishlistTable.createdAt));

    if (items.length === 0) {
      sendSuccess(res, { items: [], total: 0 });
      return;
    }

    const productIds = items.map((i) => i.productId);
    const products = await db
      .select()
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));

    const productMap = new Map(products.map((p) => [p.id, p]));

    const enriched = items
      .map((item) => {
        const p = productMap.get(item.productId);
        if (!p) return null;
        return {
          id: item.id,
          productId: item.productId,
          createdAt: item.createdAt,
          product: {
            id: p.id,
            name: p.name,
            price: parseFloat(p.price),
            originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
            image: p.image,
            category: p.category,
            type: p.type,
            rating: p.rating ? parseFloat(p.rating) : undefined,
            reviewCount: p.reviewCount,
            inStock: p.inStock,
            unit: p.unit,
            vendorName: p.vendorName,
          },
        };
      })
      .filter(Boolean);

    sendSuccess(res, { items: enriched, total: enriched.length });
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

router.get("/check/:productId", async (req, res) => {
  try {
    const userId = req.customerId!;
    const productId = req.params["productId"] as string;

    const existing = await db
      .select({ id: wishlistTable.id })
      .from(wishlistTable)
      .where(and(eq(wishlistTable.userId, userId), eq(wishlistTable.productId, productId)))
      .limit(1);

    sendSuccess(res, { inWishlist: existing.length > 0 });
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

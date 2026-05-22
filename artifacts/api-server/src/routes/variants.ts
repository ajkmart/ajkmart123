import { db } from "@workspace/db";
import { productVariantsTable, productsTable } from "@workspace/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { adminAuth } from "./admin.js";

const router: IRouter = Router();

function safeParseAttributes(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      "[fn] error with fallback return"
    );
    return null;
  }
}

router.get("/product/:productId", async (req, res) => {
  try {
    const productId = req.params["productId"] as string;
    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(
        and(eq(productVariantsTable.productId, productId), eq(productVariantsTable.inStock, true))
      )
      .orderBy(asc(productVariantsTable.sortOrder));

    res.json({
      variants: variants.map((v) => ({
        ...v,
        price: parseFloat(v.price),
        originalPrice: v.originalPrice ? parseFloat(v.originalPrice) : undefined,
        attributes: safeParseAttributes(v.attributes),
      })),
      total: variants.length,
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

router.get("/product/:productId/all", adminAuth, async (req, res) => {
  try {
    const productId = req.params["productId"] as string;
    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, productId))
      .orderBy(asc(productVariantsTable.sortOrder));

    res.json({
      variants: variants.map((v) => ({
        ...v,
        price: parseFloat(v.price),
        originalPrice: v.originalPrice ? parseFloat(v.originalPrice) : undefined,
        attributes: safeParseAttributes(v.attributes),
      })),
      total: variants.length,
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

router.post("/", adminAuth, async (req, res) => {
  try {
    const {
      productId,
      label,
      type,
      price,
      originalPrice,
      sku,
      stock,
      inStock,
      sortOrder,
      attributes,
    } = req.body;
    if (!productId || !label || price === undefined) {
      res.status(400).json({ error: "productId, label, and price are required" });
      return;
    }

    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const [variant] = await db
      .insert(productVariantsTable)
      .values({
        id: generateId(),
        productId,
        label,
        type: type || "size",
        price: String(price),
        originalPrice: originalPrice ? String(originalPrice) : null,
        sku: sku || null,
        stock: stock ?? null,
        inStock: inStock !== false,
        sortOrder: sortOrder ?? 0,
        attributes: attributes ? JSON.stringify(attributes) : null,
      })
      .returning();

    res.status(201).json({
      ...variant!,
      price: parseFloat(variant!.price),
      originalPrice: variant!.originalPrice ? parseFloat(variant!.originalPrice) : undefined,
      attributes: safeParseAttributes(variant!.attributes),
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

const patchVariantSchema = z.object({
  label: z.string().min(1, "label must be a non-empty string").optional(),
  type: z.string().optional(),
  price: z.number({ coerce: true }).nonnegative("price must be a non-negative number").optional(),
  originalPrice: z
    .number({ coerce: true })
    .nonnegative("originalPrice must be a non-negative number")
    .nullable()
    .optional(),
  sku: z.string().nullable().optional(),
  stock: z.number({ coerce: true }).int("stock must be an integer").nullable().optional(),
  inStock: z.boolean().optional(),
  sortOrder: z.number({ coerce: true }).int("sortOrder must be an integer").optional(),
  attributes: z.record(z.unknown()).nullable().optional(),
});

router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const variantId = req.params["id"] as string;

    const parsed = patchVariantSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid request body" });
      return;
    }
    const fields = parsed.data;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (fields.label !== undefined) updates.label = fields.label;
    if (fields.type !== undefined) updates.type = fields.type;
    if (fields.price !== undefined) updates.price = String(fields.price);
    if (fields.originalPrice !== undefined)
      updates.originalPrice = fields.originalPrice != null ? String(fields.originalPrice) : null;
    if (fields.sku !== undefined) updates.sku = fields.sku;
    if (fields.stock !== undefined) updates.stock = fields.stock;
    if (fields.inStock !== undefined) updates.inStock = fields.inStock;
    if (fields.sortOrder !== undefined) updates.sortOrder = fields.sortOrder;
    if (fields.attributes !== undefined)
      updates.attributes = fields.attributes ? JSON.stringify(fields.attributes) : null;

    const [updated] = await db
      .update(productVariantsTable)
      .set(updates)
      .where(eq(productVariantsTable.id, variantId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }
    res.json({
      ...updated,
      price: parseFloat(updated.price),
      originalPrice: updated.originalPrice ? parseFloat(updated.originalPrice) : undefined,
      attributes: safeParseAttributes(updated.attributes),
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

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const variantId = req.params["id"] as string;
    const [deleted] = await db
      .delete(productVariantsTable)
      .where(eq(productVariantsTable.id, variantId))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Variant not found" });
      return;
    }
    res.json({ success: true, id: variantId });
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

export default router;

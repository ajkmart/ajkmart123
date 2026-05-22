import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { sendCreated, sendNotFound, sendSuccess } from "../lib/response.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { adminAuth, getCachedSettings } from "./admin.js";

const router: IRouter = Router();

const SEED_CATEGORIES = [
  { id: "fruits", name: "Fruits & Veg", icon: "leaf-outline", type: "mart", sortOrder: 0 },
  { id: "meat", name: "Meat & Fish", icon: "fish-outline", type: "mart", sortOrder: 1 },
  { id: "dairy", name: "Dairy & Eggs", icon: "egg-outline", type: "mart", sortOrder: 2 },
  { id: "bakery", name: "Bakery", icon: "cafe-outline", type: "mart", sortOrder: 3 },
  { id: "household", name: "Household", icon: "home-outline", type: "mart", sortOrder: 4 },
  { id: "beverages", name: "Beverages", icon: "wine-outline", type: "mart", sortOrder: 5 },
  { id: "snacks", name: "Snacks", icon: "pizza-outline", type: "mart", sortOrder: 6 },
  { id: "personal", name: "Personal Care", icon: "heart-outline", type: "mart", sortOrder: 7 },
  {
    id: "restaurants",
    name: "Restaurants",
    icon: "restaurant-outline",
    type: "food",
    sortOrder: 0,
  },
  { id: "fast-food", name: "Fast Food", icon: "fast-food-outline", type: "food", sortOrder: 1 },
  { id: "desi", name: "Desi Food", icon: "flame-outline", type: "food", sortOrder: 2 },
  { id: "chinese", name: "Chinese", icon: "nutrition-outline", type: "food", sortOrder: 3 },
  { id: "pizza", name: "Pizza", icon: "pizza-outline", type: "food", sortOrder: 4 },
  { id: "desserts", name: "Desserts", icon: "ice-cream-outline", type: "food", sortOrder: 5 },
];

async function ensureSeedCategories() {
  try {
    const existing = await db.select({ id: categoriesTable.id }).from(categoriesTable).limit(1);
    if (existing.length > 0) return;
    for (const cat of SEED_CATEGORIES) {
      await db
        .insert(categoriesTable)
        .values({
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          type: cat.type,
          sortOrder: cat.sortOrder,
          parentId: null,
          isActive: true,
        })
        .onConflictDoNothing();
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "[categories] ensureSeedCategories failed — startup seeding skipped"
    );
    throw err;
  }
}

ensureSeedCategories().catch((err: unknown) => {
  logger.warn(
    { err: err instanceof Error ? err.message : String(err) },
    "[categories] ensureSeedCategories at startup failed"
  );
});

const listQuerySchema = z
  .object({
    type: z.enum(["mart", "food"]).optional(),
  })
  .passthrough();

router.get("/", validateQuery(listQuerySchema), async (req, res) => {
  try {
    const type = req.query["type"] as string | undefined;

    if (type && (type === "mart" || type === "food")) {
      try {
        const s = await getCachedSettings();
        const featureKey = `feature_${type}`;
        if ((s[featureKey] ?? "on") !== "on") {
          sendSuccess(res, { categories: [] });
          return;
        }
      } catch (err) {
        logger.warn(
          { type, err: err instanceof Error ? err.message : String(err) },
          "[categories] Failed to check platform settings for feature flag"
        );
      }
    }

    const conditions = [eq(categoriesTable.isActive, true)];
    if (type) {
      conditions.push(eq(categoriesTable.type, type));
    }

    const allCats = await db
      .select()
      .from(categoriesTable)
      .where(and(...conditions))
      .orderBy(asc(categoriesTable.sortOrder));

    const typeFilter =
      type === "mart"
        ? eq(productsTable.type, "mart")
        : type === "food"
          ? eq(productsTable.type, "food")
          : undefined;

    const countRows = await db
      .select({
        category: productsTable.category,
        count: sql<number>`count(*)::int`,
      })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.inStock, true),
          eq(productsTable.approvalStatus, "approved"),
          ...(typeFilter ? [typeFilter] : [])
        )
      )
      .groupBy(productsTable.category);

    const countMap = new Map(countRows.map((r) => [r.category, r.count]));

    const topLevel = allCats.filter((c) => !c.parentId);
    const childrenMap = new Map<string, typeof allCats>();
    for (const c of allCats) {
      if (c.parentId) {
        const arr = childrenMap.get(c.parentId) || [];
        arr.push(c);
        childrenMap.set(c.parentId, arr);
      }
    }

    const categories = topLevel.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      type: c.type,
      parentId: c.parentId,
      sortOrder: c.sortOrder,
      productCount: countMap.get(c.id) ?? 0,
      children: (childrenMap.get(c.id) || []).map((child) => ({
        id: child.id,
        name: child.name,
        icon: child.icon,
        type: child.type,
        parentId: child.parentId,
        sortOrder: child.sortOrder,
        productCount: countMap.get(child.id) ?? 0,
      })),
    }));

    sendSuccess(res, { categories });
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

const createCategorySchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.string().min(1, "Type is required"),
  icon: z.string().optional(),
  parentId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

router.post("/", adminAuth, validateBody(createCategorySchema), async (req, res) => {
  try {
    const { name, icon, type, parentId, sortOrder, isActive } = req.body;

    const id = generateId();
    const [category] = await db
      .insert(categoriesTable)
      .values({
        id,
        name,
        icon: icon || "grid-outline",
        type,
        parentId: parentId || null,
        sortOrder: sortOrder ?? 0,
        isActive: isActive !== false,
      })
      .returning();

    sendCreated(res, category);
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

router.patch("/:id", adminAuth, async (req, res) => {
  try {
    const { name, icon, type, parentId, sortOrder, isActive } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (icon !== undefined) updates.icon = icon;
    if (type !== undefined) updates.type = type;
    if (parentId !== undefined) updates.parentId = parentId || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    const [updated] = await db
      .update(categoriesTable)
      .set(updates)
      .where(eq(categoriesTable.id, req.params["id"] as string))
      .returning();

    if (!updated) {
      sendNotFound(res, "Category not found", "زمرہ نہیں ملا۔");
      return;
    }

    sendSuccess(res, updated);
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

router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const id = req.params["id"] as string;

    await db
      .update(categoriesTable)
      .set({ parentId: null })
      .where(eq(categoriesTable.parentId, id));

    const [deleted] = await db
      .delete(categoriesTable)
      .where(eq(categoriesTable.id, id))
      .returning();

    if (!deleted) {
      sendNotFound(res, "Category not found", "زمرہ نہیں ملا۔");
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

const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number().int(),
    })
  ),
});

router.post("/reorder", adminAuth, validateBody(reorderSchema), async (req, res) => {
  try {
    const { items } = req.body;

    for (const item of items) {
      if (item.id && typeof item.sortOrder === "number") {
        await db
          .update(categoriesTable)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(categoriesTable.id, item.id));
      }
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

export default router;

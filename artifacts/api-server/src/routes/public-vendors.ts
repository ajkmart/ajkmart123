import { db } from "@workspace/db";
import { productsTable, reviewsTable, usersTable, vendorProfilesTable } from "@workspace/db/schema";
import { and, eq, ilike, isNotNull, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { sendError, sendNotFound, sendSuccess } from "../lib/response.js";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const { category, slim } = req.query as Record<string, string | undefined>;

    const conditions: ReturnType<typeof eq>[] = [
      ilike(usersTable.roles, "%vendor%") as ReturnType<typeof eq>,
    ];
    if (category) {
      conditions.push(eq(vendorProfilesTable.storeCategory, category) as ReturnType<typeof eq>);
    }

    const vendors = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        storeName: vendorProfilesTable.storeName,
        storeCategory: vendorProfilesTable.storeCategory,
        storeBanner: vendorProfilesTable.storeBanner,
        storeDeliveryTime: vendorProfilesTable.storeDeliveryTime,
        storeIsOpen: vendorProfilesTable.storeIsOpen,
        storeMinOrder: vendorProfilesTable.storeMinOrder,
        avatar: usersTable.avatar,
        city: usersTable.city,
      })
      .from(usersTable)
      .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
      .where(and(...conditions));

    const vendorIds = vendors.map((v) => v.id);
    const productCounts: Record<string, number> = {};
    const avgRatings: Record<string, number> = {};
    if (vendorIds.length > 0) {
      const counts = await db
        .select({ vendorId: productsTable.vendorId, count: sql<number>`count(*)` })
        .from(productsTable)
        .where(and(eq(productsTable.approvalStatus, "approved"), eq(productsTable.inStock, true)))
        .groupBy(productsTable.vendorId);
      for (const row of counts) {
        if (row.vendorId) productCounts[row.vendorId] = Number(row.count);
      }

      const ratings = await db
        .select({
          vendorId: reviewsTable.vendorId,
          avgRating: sql<number>`round(avg(${reviewsTable.rating})::numeric, 1)`,
        })
        .from(reviewsTable)
        .where(and(isNotNull(reviewsTable.vendorId), eq(reviewsTable.status, "visible")))
        .groupBy(reviewsTable.vendorId);
      for (const row of ratings) {
        if (row.vendorId) avgRatings[row.vendorId] = Number(row.avgRating);
      }
    }

    sendSuccess(res, {
      vendors: vendors.map((v) => {
        if (slim === "true") {
          return {
            id: v.id,
            name: v.storeName || v.name,
            storeCategory: v.storeCategory,
            storeIsOpen: v.storeIsOpen ?? true,
            avatar: v.avatar,
            avgRating: avgRatings[v.id] ?? null,
          };
        }
        return {
          id: v.id,
          name: v.storeName || v.name,
          storeName: v.storeName,
          storeCategory: v.storeCategory,
          storeBanner: v.storeBanner,
          storeDeliveryTime: v.storeDeliveryTime,
          storeIsOpen: v.storeIsOpen ?? true,
          storeMinOrder: v.storeMinOrder ? parseFloat(String(v.storeMinOrder)) : 0,
          avatar: v.avatar,
          city: v.city,
          productCount: productCounts[v.id] ?? 0,
          avgRating: avgRatings[v.id] ?? null,
        };
      }),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

router.get("/:id/store", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;

    const [vendor] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        storeName: vendorProfilesTable.storeName,
        storeCategory: vendorProfilesTable.storeCategory,
        storeBanner: vendorProfilesTable.storeBanner,
        storeDescription: vendorProfilesTable.storeDescription,
        storeDeliveryTime: vendorProfilesTable.storeDeliveryTime,
        storeIsOpen: vendorProfilesTable.storeIsOpen,
        storeMinOrder: vendorProfilesTable.storeMinOrder,
        storeAnnouncement: vendorProfilesTable.storeAnnouncement,
        storeHours: vendorProfilesTable.storeHours,
        avatar: usersTable.avatar,
        city: usersTable.city,
      })
      .from(usersTable)
      .leftJoin(vendorProfilesTable, eq(usersTable.id, vendorProfilesTable.userId))
      .where(and(eq(usersTable.id, id), ilike(usersTable.roles, "%vendor%")))
      .limit(1);

    if (!vendor) {
      sendNotFound(res, "Vendor not found");
      return;
    }

    const products = await db
      .select()
      .from(productsTable)
      .where(
        and(
          eq(productsTable.vendorId, id),
          eq(productsTable.approvalStatus, "approved"),
          eq(productsTable.inStock, true)
        )
      );

    sendSuccess(res, {
      vendor: {
        id: vendor.id,
        name: vendor.storeName || vendor.name,
        storeName: vendor.storeName,
        storeCategory: vendor.storeCategory,
        storeBanner: vendor.storeBanner,
        storeDescription: vendor.storeDescription,
        storeDeliveryTime: vendor.storeDeliveryTime,
        storeIsOpen: vendor.storeIsOpen ?? true,
        storeMinOrder: vendor.storeMinOrder ? parseFloat(String(vendor.storeMinOrder)) : 0,
        storeAnnouncement: vendor.storeAnnouncement,
        avatar: vendor.avatar,
        city: vendor.city,
      },
      products: products.map((p) => ({
        ...p,
        price: parseFloat(p.price),
        originalPrice: p.originalPrice ? parseFloat(p.originalPrice) : undefined,
        rating: p.rating ? parseFloat(p.rating) : null,
      })),
    });
  } catch (_err) {
    sendError(res, "Internal server error", 500);
  }
});

export default router;

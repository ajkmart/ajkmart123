import { db } from "@workspace/db";
import { bannersTable } from "@workspace/db/schema";
import { and, asc, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { logger } from "../lib/logger.js";
import { sendInternalError, sendSuccess } from "../lib/response.js";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  try {
    const placement = (req.query["placement"] as string) || "home";
    const service = req.query["service"] as string | undefined;
    const now = new Date();

    try {
      const banners = await db
        .select()
        .from(bannersTable)
        .where(
          and(
            eq(bannersTable.isActive, true),
            eq(bannersTable.placement, placement),
            or(isNull(bannersTable.startDate), lte(bannersTable.startDate, now)),
            or(isNull(bannersTable.endDate), gte(bannersTable.endDate, now))
          )
        )
        .orderBy(asc(bannersTable.sortOrder), desc(bannersTable.createdAt));

      const filtered = service
        ? banners.filter(
            (b) => !b.targetService || b.targetService === service || b.targetService === "all"
          )
        : banners;

      sendSuccess(res, {
        banners: filtered.map((b) => ({
          id: b.id,
          title: b.title,
          subtitle: b.subtitle,
          imageUrl: b.imageUrl,
          linkType: b.linkType,
          linkValue: b.linkValue,
          linkUrl:
            b.linkType === "url"
              ? b.linkValue
              : b.linkType === "product"
                ? `/product/${b.linkValue}`
                : b.linkType === "category"
                  ? `/category/${b.linkValue}`
                  : null,
          placement: b.placement,
          targetService: b.targetService,
          gradient1: b.colorFrom,
          gradient2: b.colorTo,
          icon: b.icon,
          sortOrder: b.sortOrder,
          isActive: b.isActive,
        })),
        total: filtered.length,
      });
    } catch (e: unknown) {
      logger.error("[banners GET /] DB error:", e);
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

export default router;

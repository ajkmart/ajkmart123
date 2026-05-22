import { db } from "@workspace/db";
import {
  adminAccountsTable,
  campaignParticipationsTable,
  campaignsTable,
  offerRedemptionsTable,
  offersTable,
  offerTemplatesTable,
  ordersTable,
  promoCodesTable,
  usersTable,
} from "@workspace/db/schema";
import { and, asc, count, desc, eq, gte, inArray, isNull, lte, SQL, sql, sum } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
} from "../../lib/response.js";
import { customerAuth, requireRole } from "../../middleware/security.js";
import { adminAuth, generateId } from "../admin-shared.js";

export {
  adminAccountsTable,
  adminAuth,
  and,
  asc,
  campaignParticipationsTable,
  campaignsTable,
  count,
  customerAuth,
  db,
  desc,
  eq,
  generateId,
  gte,
  inArray,
  isNull,
  lte,
  offerRedemptionsTable,
  offersTable,
  offerTemplatesTable,
  ordersTable,
  promoCodesTable,
  requireRole,
  Router,
  sendCreated,
  sendError,
  sendForbidden,
  sendNotFound,
  sendSuccess,
  sendValidationError,
  sql,
  sum,
  usersTable,
};
export type { NextFunction, Request, Response, SQL };

export async function marketingAuth(req: Request, res: Response, next: NextFunction) {
  adminAuth(req, res, async () => {
    const role: string = req.adminRole ?? "";
    if (role === "super" || role === "manager" || role === "marketing_manager") {
      next();
      return;
    }
    const adminId: string | undefined = req.adminId;
    if (adminId) {
      const [account] = await db
        .select({ permissions: adminAccountsTable.permissions })
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.id, adminId))
        .limit(1);
      if (account) {
        const perms = account.permissions.split(",").map((p: string) => p.trim());
        if (perms.includes("marketing")) {
          next();
          return;
        }
      }
    }
    sendForbidden(res, "Marketing permission required");
  });
}

export function managerAuth(req: Request, res: Response, next: NextFunction) {
  adminAuth(req, res, () => {
    const role: string = req.adminRole ?? "";
    if (role === "super" || role === "manager") {
      next();
      return;
    }
    sendForbidden(res, "Only managers and super-admins can perform this action");
  });
}

export function nowIso() {
  return new Date();
}

export type OfferRow = typeof offersTable.$inferSelect;
export type CampaignRow = typeof campaignsTable.$inferSelect;
export type TemplateRow = typeof offerTemplatesTable.$inferSelect;

export function computeOfferStatus(
  o: Pick<OfferRow, "status" | "startDate" | "endDate" | "usageLimit" | "usedCount">
): string {
  const now = nowIso();
  if (o.status === "draft") return "draft";
  if (o.status === "pending_approval") return "pending_approval";
  if (o.status === "paused") return "paused";
  if (o.status === "rejected") return "rejected";
  if (o.startDate > now) return "scheduled";
  if (o.endDate < now) return "expired";
  if (o.usageLimit != null && o.usedCount >= o.usageLimit) return "exhausted";
  if (o.status === "live") return "live";
  return o.status;
}

export function parseDecimal(v: string | null | undefined): number | null {
  return v != null ? parseFloat(String(v)) : null;
}

export function mapOffer(o: OfferRow) {
  return {
    ...o,
    discountPct: parseDecimal(o.discountPct),
    discountFlat: parseDecimal(o.discountFlat),
    minOrderAmount: parseDecimal(o.minOrderAmount) ?? 0,
    maxDiscount: parseDecimal(o.maxDiscount),
    cashbackPct: parseDecimal(o.cashbackPct),
    cashbackMax: parseDecimal(o.cashbackMax),
    startDate: o.startDate instanceof Date ? o.startDate.toISOString() : o.startDate,
    endDate: o.endDate instanceof Date ? o.endDate.toISOString() : o.endDate,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
    computedStatus: computeOfferStatus(o),
  };
}

export function mapCampaign(c: CampaignRow) {
  return {
    ...c,
    budgetCap: parseDecimal(c.budgetCap),
    budgetSpent: parseDecimal(c.budgetSpent) ?? 0,
    startDate: c.startDate instanceof Date ? c.startDate.toISOString() : c.startDate,
    endDate: c.endDate instanceof Date ? c.endDate.toISOString() : c.endDate,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

export function mapTemplate(t: TemplateRow) {
  return {
    ...t,
    discountPct: parseDecimal(t.discountPct),
    discountFlat: parseDecimal(t.discountFlat),
    minOrderAmount: parseDecimal(t.minOrderAmount) ?? 0,
    maxDiscount: parseDecimal(t.maxDiscount),
    cashbackPct: parseDecimal(t.cashbackPct),
    cashbackMax: parseDecimal(t.cashbackMax),
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

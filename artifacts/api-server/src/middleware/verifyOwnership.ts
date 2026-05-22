/**
 * verifyOwnership — resource-level ownership guard.
 *
 * Usage:
 *   router.get("/:id", requireRole("rider"), verifyOwnership("rider"), handler)
 *
 * Resource types and their ownership checks:
 *   "rider"   — req.riderId  must match the DB row's userId
 *   "vendor"  — req.userId   must match the DB row's userId (vendor profile)
 *   "wallet"  — req.customerId / riderId / userId must match walletTransaction.userId
 *
 * Cross-user access test matrix:
 *   | Caller         | Resource             | Expected |
 *   |----------------|----------------------|----------|
 *   | Rider1         | Rider2 wallet txn    | 403      |
 *   | Rider1         | Rider1 wallet txn    | 200      |
 *   | Vendor1        | Vendor2 profile      | 403      |
 *   | Vendor1        | Vendor1 profile      | 200      |
 *   | Customer1      | Customer2 wallet txn | 403      |
 *   | Customer1      | Customer1 wallet txn | 200      |
 *   | Admin (any)    | Any resource         | pass     |
 */

import { db } from "@workspace/db";
import {
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  riderProfilesTable,
  ridesTable,
  usersTable,
  vendorProfilesTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger.js";

export type OwnershipResourceType =
  | "rider"
  | "vendor"
  | "wallet_transaction"
  | "order"
  | "ride"
  | "user"
  | "pharmacy_order"
  | "pharmacy" /* alias for "pharmacy_order" */
  | "parcel_booking"
  | "parcel"; /* alias for "parcel_booking" */

function getCallerId(req: Request): string | undefined {
  return req.riderId ?? req.vendorId ?? req.customerId ?? req.userId;
}

/**
 * Returns middleware that checks the authenticated caller owns
 * the resource identified by `:id` in the route params.
 * Admin requests (req.adminId present) bypass the check.
 */
export function verifyOwnership(resourceType: OwnershipResourceType) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.adminId) {
      next();
      return;
    }

    const rawId = req.params["id"] as string;
    const resourceId = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!resourceId) {
      res.status(400).json({ success: false, error: "Resource ID is required" });
      return;
    }

    const callerId = getCallerId(req);
    if (!callerId) {
      res.status(401).json({ success: false, error: "Authentication required" });
      return;
    }

    try {
      let ownerId: string | null | undefined;

      switch (resourceType) {
        case "rider": {
          const [row] = await db
            .select({ userId: riderProfilesTable.userId })
            .from(riderProfilesTable)
            .where(eq(riderProfilesTable.userId, resourceId))
            .limit(1);
          ownerId = row?.userId ?? null;
          if (!ownerId) {
            const [userRow] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.id, resourceId))
              .limit(1);
            ownerId = userRow?.id ?? null;
          }
          break;
        }

        case "vendor": {
          const [row] = await db
            .select({ userId: vendorProfilesTable.userId })
            .from(vendorProfilesTable)
            .where(eq(vendorProfilesTable.userId, resourceId))
            .limit(1);
          ownerId = row?.userId ?? null;
          if (!ownerId) {
            const [userRow] = await db
              .select({ id: usersTable.id })
              .from(usersTable)
              .where(eq(usersTable.id, resourceId))
              .limit(1);
            ownerId = userRow?.id ?? null;
          }
          break;
        }

        case "wallet_transaction": {
          const [row] = await db
            .select({ userId: walletTransactionsTable.userId })
            .from(walletTransactionsTable)
            .where(eq(walletTransactionsTable.id, resourceId))
            .limit(1);
          ownerId = row?.userId ?? null;
          break;
        }

        case "order": {
          const [row] = await db
            .select({
              userId: ordersTable.userId,
              riderId: ordersTable.riderId,
              vendorId: ordersTable.vendorId,
            })
            .from(ordersTable)
            .where(eq(ordersTable.id, resourceId))
            .limit(1);
          if (!row) {
            ownerId = null;
            break;
          }
          if (row.userId === callerId || row.riderId === callerId || row.vendorId === callerId) {
            ownerId = callerId;
          } else {
            ownerId = row.userId;
          }
          break;
        }

        case "ride": {
          const [row] = await db
            .select({ userId: ridesTable.userId, riderId: ridesTable.riderId })
            .from(ridesTable)
            .where(eq(ridesTable.id, resourceId))
            .limit(1);
          if (!row) {
            ownerId = null;
            break;
          }
          if (row.userId === callerId || row.riderId === callerId) {
            ownerId = callerId;
          } else {
            ownerId = row.userId;
          }
          break;
        }

        case "user": {
          ownerId = resourceId;
          break;
        }

        case "pharmacy_order":
        case "pharmacy": {
          const [row] = await db
            .select({ userId: pharmacyOrdersTable.userId })
            .from(pharmacyOrdersTable)
            .where(eq(pharmacyOrdersTable.id, resourceId))
            .limit(1);
          ownerId = row?.userId ?? null;
          break;
        }

        case "parcel_booking":
        case "parcel": {
          const [row] = await db
            .select({ userId: parcelBookingsTable.userId })
            .from(parcelBookingsTable)
            .where(eq(parcelBookingsTable.id, resourceId))
            .limit(1);
          ownerId = row?.userId ?? null;
          break;
        }

        default: {
          logger.warn({ resourceType }, "[verifyOwnership] Unknown resource type");
          res.status(500).json({ success: false, error: "Internal: unknown resource type" });
          return;
        }
      }

      if (ownerId == null || ownerId === undefined) {
        res.status(404).json({ success: false, error: "Resource not found" });
        return;
      }

      if (ownerId !== callerId) {
        logger.warn(
          { callerId, ownerId, resourceType, resourceId },
          "[verifyOwnership] Cross-user access attempt blocked"
        );
        res
          .status(403)
          .json({ success: false, error: "Access denied — you do not own this resource" });
        return;
      }

      next();
    } catch (err) {
      logger.error(
        { err, resourceType, resourceId },
        "[verifyOwnership] DB error during ownership check"
      );
      res.status(500).json({ success: false, error: "Internal server error during authorization" });
    }
  };
}

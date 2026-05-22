/**
 * FleetService - Admin Fleet & Logistics Management
 *
 * Centralized business logic for:
 * - Rider management & approvals
 * - Ride dispatch & tracking
 * - SOS alerts handling
 * - GPS location tracking
 * - Service zone management
 * - Rider penalties & ratings
 */

import { db } from "@workspace/db";
import {
  liveLocationsTable,
  rideBidsTable,
  rideEventLogsTable,
  rideNotifiedRidersTable,
  riderProfilesTable,
  ridesTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db/schema";
import { getSocketRoom } from "@workspace/service-constants";
import { and, asc, count, desc, eq, gte, ilike, isNull, lt, lte, or, sql } from "drizzle-orm";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { emitRideUpdate } from "../lib/rideEvents.js";
import { emitRideDispatchUpdate, getIO } from "../lib/socketio.js";
import {
  RIDE_NOTIF_KEYS,
  getPlatformSettings,
  getUserLanguage,
  sendUserNotification,
  t,
} from "../routes/admin-shared.js";

export interface RiderApprovalInput {
  riderId: string;
  approved: boolean;
  reason?: string;
}

export interface RideUpdateInput {
  rideId: string;
  status?: string;
  driverId?: string;
  estimatedFare?: number;
}

export interface RiderPenaltyInput {
  riderId: string;
  type: string; // "cancellation", "rating", "complaint"
  points: number;
  reason: string;
}

export interface ServiceZoneInput {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  isActive: boolean;
}

export interface RideStatusInput {
  rideId: string;
  status: string;
  riderName?: string;
  riderPhone?: string;
  adminId?: string;
}

export interface RideCancelInput {
  rideId: string;
  reason?: string;
  adminId?: string;
}

export interface RideRefundInput {
  rideId: string;
  amount?: number;
  reason?: string;
  adminId?: string;
}

export interface RideReassignInput {
  rideId: string;
  riderId: string;
  riderName?: string;
  riderPhone?: string;
  adminId?: string;
}

export class FleetService {
  // ════════════════════════════════════════════════════════════════════════════════
  // RIDE MANAGEMENT OPERATIONS
  // ════════════════════════════════════════════════════════════════════════════════

  /**
   * Get all rides (basic list)
   */
  static async getRidesList(limit: number = 50, after?: string) {
    const { buildCursorPage, decodeCursor } = await import("../lib/pagination/cursor.js");
    const cursor = after ? decodeCursor(after) : null;

    const conditions = cursor ? [lt(ridesTable.createdAt, new Date(cursor))] : [];

    const rows = await db
      .select()
      .from(ridesTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(ridesTable.createdAt))
      .limit(limit + 1);

    const page = buildCursorPage({
      data: rows,
      limit,
      getCursorValue: (r) => r.createdAt.toISOString(),
    });

    return {
      rides: page.data.map((r) => ({
        ...r,
        fare: parseFloat(r.fare),
        distance: parseFloat(r.distance),
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  /**
   * Get enriched rides with pagination and filtering
   */
  static async getRidesEnriched(filters: {
    page?: number;
    limit?: number;
    status?: string;
    type?: string;
    search?: string;
    customer?: string;
    rider?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: "fare" | "date";
    sortDir?: "asc" | "desc";
  }) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(500, Math.max(1, filters.limit ?? 50));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];
    if (filters.status && filters.status !== "all")
      conditions.push(eq(ridesTable.status, filters.status));
    if (filters.type && filters.type !== "all") conditions.push(eq(ridesTable.type, filters.type));
    if (filters.dateFrom) conditions.push(gte(ridesTable.createdAt, new Date(filters.dateFrom)));
    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(ridesTable.createdAt, toDate));
    }
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      conditions.push(
        or(
          ilike(ridesTable.id, `%${q}%`),
          ilike(ridesTable.pickupAddress, `%${q}%`),
          ilike(ridesTable.dropAddress, `%${q}%`),
          ilike(ridesTable.riderName, `%${q}%`)
        )!
      );
    }
    if (filters.rider) {
      const q = filters.rider.trim().toLowerCase();
      conditions.push(
        or(ilike(ridesTable.riderName, `%${q}%`), ilike(ridesTable.riderPhone, `%${q}%`))!
      );
    }
    if (filters.customer) {
      const q = filters.customer.trim().toLowerCase();
      conditions.push(
        sql`${ridesTable.userId} IN (SELECT ${usersTable.id} FROM ${usersTable} WHERE LOWER(${usersTable.name}) LIKE ${"%" + q + "%"} OR LOWER(${usersTable.phone}) LIKE ${"%" + q + "%"})`
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalResult] = await db.select({ cnt: count() }).from(ridesTable).where(whereClause);
    const total = Number(totalResult?.cnt ?? 0);

    const orderCol = filters.sortBy === "fare" ? ridesTable.fare : ridesTable.createdAt;
    const orderFn = filters.sortDir === "asc" ? asc : desc;
    const rides = await db
      .select()
      .from(ridesTable)
      .where(whereClause)
      .orderBy(orderFn(orderCol))
      .limit(limit)
      .offset(offset);

    // Enrich with user data
    const userIds = [
      ...new Set(
        rides
          .map((r: any) => r.userId)
          .concat(rides.map((r: any) => r.riderId).filter((id): id is string => id != null))
      ),
    ];
    const users =
      userIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              phone: usersTable.phone,
            })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(ARRAY[${sql.join(
                userIds.map((id: string) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    // Get bid counts
    const rideIds = rides.map((r: any) => r.id);
    const bidCounts =
      rideIds.length > 0
        ? await db
            .select({
              rideId: rideBidsTable.rideId,
              total: count(rideBidsTable.id),
            })
            .from(rideBidsTable)
            .where(
              sql`${rideBidsTable.rideId} = ANY(ARRAY[${sql.join(
                rideIds.map((id: string) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
            .groupBy(rideBidsTable.rideId)
        : [];
    const bidCountMap = Object.fromEntries(bidCounts.map((b) => [b.rideId, Number(b.total)]));

    return {
      rides: rides.map((r: any) => ({
        ...r,
        fare: parseFloat(r.fare),
        distance: parseFloat(r.distance),
        offeredFare: r.offeredFare ? parseFloat(r.offeredFare) : null,
        counterFare: r.counterFare ? parseFloat(r.counterFare) : null,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        userName: userMap[r.userId]?.name || null,
        userPhone: userMap[r.userId]?.phone || null,
        riderName: r.riderName || (r.riderId ? userMap[r.riderId]?.name : null) || null,
        riderPhone: r.riderPhone || (r.riderId ? userMap[r.riderId]?.phone : null) || null,
        totalBids: bidCountMap[r.id] ?? 0,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Update ride status with atomic wallet operations
   */
  static async updateRideStatus(input: RideStatusInput) {
    const rideId = input.rideId;
    const status = input.status;

    const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
      pending: ["searching", "bargaining", "accepted", "cancelled"],
      searching: ["bargaining", "accepted", "cancelled"],
      bargaining: ["searching", "accepted", "cancelled"],
      accepted: ["arrived", "in_transit", "cancelled"],
      arrived: ["in_transit", "cancelled"],
      in_transit: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    };

    const [existing] = await db
      .select({
        riderId: ridesTable.riderId,
        status: ridesTable.status,
        fare: ridesTable.fare,
        paymentMethod: ridesTable.paymentMethod,
      })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);
    if (!existing) throw new Error("Ride not found");

    if (existing.status === "completed" || existing.status === "cancelled") {
      throw new Error(`Cannot change status of a ride that is already ${existing.status}`);
    }

    const allowed = VALID_STATUS_TRANSITIONS[existing.status];
    if (!allowed || !allowed.includes(status)) {
      throw new Error(`Invalid transition: ${existing.status} → ${status}`);
    }

    if (status === "completed" && !existing.riderId) {
      throw new Error("Cannot force-complete a ride with no assigned rider");
    }

    const fare = parseFloat(existing.fare ?? "0");
    const settings = await getPlatformSettings();
    const riderKeepPct = (Number(settings["rider_keep_pct"]) || 80) / 100;
    const commissionPct = 1 - riderKeepPct;
    let riderBalance = 0;

    if (status === "completed" && existing.riderId && existing.paymentMethod !== "wallet") {
      const [riderWalletRow] = await db
        .select({ walletBalance: usersTable.walletBalance })
        .from(usersTable)
        .where(eq(usersTable.id, existing.riderId))
        .limit(1);
      riderBalance = parseFloat(riderWalletRow?.walletBalance ?? "0");
    }

    let ride: any;
    try {
      ride = await db.transaction(async (tx) => {
        const now = new Date();
        const updateData: Record<string, unknown> = { status, updatedAt: now };
        if (status === "completed") updateData.completedAt = now;
        if (status === "cancelled") updateData.cancelledAt = now;
        if (input.riderName) updateData.riderName = input.riderName;
        if (input.riderPhone) updateData.riderPhone = input.riderPhone;

        const [updated] = await tx
          .update(ridesTable)
          .set(updateData)
          .where(eq(ridesTable.id, rideId))
          .returning();
        if (!updated) throw new Error("Ride not found");

        // On completion: credit rider earnings or deduct commission
        if (status === "completed" && updated.riderId) {
          if (updated.paymentMethod === "wallet") {
            const riderEarning = parseFloat((fare * riderKeepPct).toFixed(2));
            await tx
              .update(usersTable)
              .set({
                walletBalance: sql`wallet_balance + ${riderEarning}`,
                updatedAt: now,
              })
              .where(eq(usersTable.id, updated.riderId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: updated.riderId,
              type: "credit",
              amount: String(riderEarning),
              description: `Ride earnings — #${updated.id.slice(-6).toUpperCase()} (${Math.round(riderKeepPct * 100)}%)`,
            });
          } else {
            const commission = parseFloat((fare * commissionPct).toFixed(2));
            if (commission > 0 && riderBalance - commission >= -500) {
              await tx
                .update(usersTable)
                .set({
                  walletBalance: sql`wallet_balance - ${commission}`,
                  updatedAt: now,
                })
                .where(eq(usersTable.id, updated.riderId));
              await tx.insert(walletTransactionsTable).values({
                id: generateId(),
                userId: updated.riderId,
                type: "debit",
                amount: String(commission),
                description: `Platform commission — #${updated.id.slice(-6).toUpperCase()} (${Math.round(commissionPct * 100)}%)`,
              });
            }
          }
        }

        // On cancellation: refund wallet rides atomically
        if (status === "cancelled" && updated.paymentMethod === "wallet") {
          const refundAmt = parseFloat(updated.fare);
          const refundClaimed = await tx
            .update(ridesTable)
            .set({ refundedAt: now })
            .where(and(eq(ridesTable.id, updated.id), isNull(ridesTable.refundedAt)))
            .returning({ id: ridesTable.id });

          if (refundClaimed.length > 0) {
            await tx
              .update(usersTable)
              .set({
                walletBalance: sql`wallet_balance + ${refundAmt}`,
                updatedAt: now,
              })
              .where(eq(usersTable.id, updated.userId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: updated.userId,
              type: "credit",
              amount: refundAmt.toFixed(2),
              description: `Refund — Ride #${updated.id.slice(-6).toUpperCase()} cancelled`,
            });
            updated.refundedAt = now;
          }
        }

        // Admin audit: persist status change
        await tx.insert(rideEventLogsTable).values({
          id: generateId(),
          rideId: updated.id,
          adminId: input.adminId,
          event: `admin_status_${status}`,
          notes: `Admin forced status to ${status}`,
        });

        return updated;
      });
    } catch (txErr: unknown) {
      throw txErr;
    }

    // Send notifications (non-fatal)
    try {
      const rideNotifKeys = RIDE_NOTIF_KEYS[status];
      if (rideNotifKeys) {
        const rideUserLang = await getUserLanguage(ride.userId);
        await sendUserNotification(
          ride.userId,
          t(rideNotifKeys.titleKey, rideUserLang),
          t(rideNotifKeys.bodyKey, rideUserLang),
          "ride",
          rideNotifKeys.icon
        );
      }
    } catch (_e) {
      logger.warn("Notification failed (non-fatal)");
    }

    // Socket emissions
    const io = getIO();
    if (io) {
      const ridePayload = {
        id: ride.id,
        status: ride.status,
        updatedAt: ride.updatedAt instanceof Date ? ride.updatedAt.toISOString() : ride.updatedAt,
      };
      io.to(getSocketRoom(ride.id, "ride")).emit("order:update", ridePayload);
      io.to(`user:${ride.userId}`).emit("order:update", ridePayload);
    }
    emitRideUpdate(ride.id);
    emitRideDispatchUpdate({
      rideId: ride.id,
      action: `status_${status}`,
      status,
    });

    return {
      ...ride,
      fare: parseFloat(ride.fare),
      distance: parseFloat(ride.distance),
    };
  }

  /**
   * Cancel a ride
   */
  static async cancelRide(input: RideCancelInput) {
    const rideId = input.rideId;
    const reason = input.reason;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) throw new Error("Ride not found");
    if (["completed", "cancelled"].includes(ride.status)) {
      throw new Error(`Cannot cancel a ride that is already ${ride.status}`);
    }

    const isWallet = ride.paymentMethod === "wallet";
    const refundAmt = parseFloat(ride.fare);
    let refunded = false;

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(ridesTable)
          .set({
            status: "cancelled",
            cancellationReason: reason || null,
            updatedAt: new Date(),
          })
          .where(eq(ridesTable.id, rideId));

        await tx
          .update(rideBidsTable)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

        if (isWallet) {
          const refundResult = await tx
            .update(ridesTable)
            .set({ refundedAt: new Date() })
            .where(and(eq(ridesTable.id, rideId), isNull(ridesTable.refundedAt)))
            .returning({ id: ridesTable.id });

          if (refundResult.length > 0) {
            await tx
              .update(usersTable)
              .set({
                walletBalance: sql`wallet_balance + ${refundAmt}`,
                updatedAt: new Date(),
              })
              .where(eq(usersTable.id, ride.userId));
            await tx.insert(walletTransactionsTable).values({
              id: generateId(),
              userId: ride.userId,
              type: "credit",
              amount: refundAmt.toFixed(2),
              description: `Refund — Ride #${rideId.slice(-6).toUpperCase()} cancelled`,
            });
            refunded = true;
          }
        }
      });
    } catch (txErr: any) {
      logger.error({ err: txErr }, "cancelRide transaction failed");
      throw txErr;
    }

    // Notifications
    try {
      if (refunded) {
        await sendUserNotification(
          ride.userId,
          "Ride Cancelled & Refunded 💰",
          `Rs. ${refundAmt.toFixed(0)} refund ho gaya.`,
          "ride",
          "wallet-outline"
        );
      }
      if (ride.riderId) {
        await sendUserNotification(
          ride.riderId,
          "Ride Cancelled ❌",
          `Ride #${rideId.slice(-6).toUpperCase()} cancelled.`,
          "ride",
          "close-circle-outline"
        );
      }
    } catch (_e) {
      logger.warn("Cancel notifications failed");
    }

    emitRideUpdate(rideId);
    emitRideDispatchUpdate({ rideId, action: "cancel", status: "cancelled" });
    const io = getIO();
    if (io) {
      io.to(getSocketRoom(rideId, "ride")).emit("order:update", {
        id: rideId,
        status: "cancelled",
      });
      io.to(`user:${ride.userId}`).emit("order:update", {
        id: rideId,
        status: "cancelled",
      });
    }

    return { rideId, refunded };
  }

  /**
   * Refund a ride
   */
  static async refundRide(input: RideRefundInput) {
    const rideId = input.rideId;
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) throw new Error("Ride not found");

    if (!["cancelled", "completed"].includes(ride.status)) {
      throw new Error(`Cannot refund a ride in status "${ride.status}"`);
    }

    if (ride.refundedAt) {
      throw new Error("This ride has already been refunded");
    }

    const refundAmt = input.amount ?? parseFloat(ride.fare);
    if (refundAmt <= 0 || !isFinite(refundAmt)) {
      throw new Error("Invalid refund amount");
    }

    try {
      await db.transaction(async (tx) => {
        const refundRows = await tx
          .update(ridesTable)
          .set({ refundedAt: new Date() })
          .where(and(eq(ridesTable.id, rideId), isNull(ridesTable.refundedAt)))
          .returning({ id: ridesTable.id });

        if (refundRows.length === 0) {
          throw new Error("ALREADY_REFUNDED");
        }

        await tx
          .update(usersTable)
          .set({
            walletBalance: sql`wallet_balance + ${refundAmt}`,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, ride.userId));
        await tx.insert(walletTransactionsTable).values({
          id: generateId(),
          userId: ride.userId,
          type: "credit",
          amount: refundAmt.toFixed(2),
          description: `Admin refund — Ride #${rideId.slice(-6).toUpperCase()}`,
        });
        await tx.insert(rideEventLogsTable).values({
          id: generateId(),
          rideId,
          adminId: input.adminId,
          event: "admin_refund",
          notes: `Admin issued refund Rs. ${refundAmt.toFixed(2)}`,
        });
      });
    } catch (txErr: any) {
      if (txErr.message === "ALREADY_REFUNDED") {
        throw new Error("This ride has already been refunded");
      }
      logger.error({ err: txErr }, "refundRide transaction failed");
      throw txErr;
    }

    try {
      await sendUserNotification(
        ride.userId,
        "Ride Refund 💰",
        `Rs. ${refundAmt.toFixed(0)} aapki wallet mein refund ho gaya.`,
        "ride",
        "wallet-outline"
      );
    } catch (_e) {
      logger.warn("Refund notification failed");
    }

    emitRideDispatchUpdate({ rideId, action: "refund", status: ride.status });
    return { rideId, refundedAmount: refundAmt };
  }

  /**
   * Reassign a ride to a different rider
   */
  static async reassignRide(input: RideReassignInput) {
    const rideId = input.rideId;
    const riderId = input.riderId;

    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) throw new Error("Ride not found");
    if (["completed", "cancelled"].includes(ride.status)) {
      throw new Error(`Cannot reassign a ride that is ${ride.status}`);
    }

    const [riderUser] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        roles: usersTable.roles,
        isActive: usersTable.isActive,
        approvalStatus: usersTable.approvalStatus,
        isOnline: usersTable.isOnline,
      })
      .from(usersTable)
      .where(eq(usersTable.id, riderId))
      .limit(1);
    if (!riderUser) throw new Error("Rider not found");
    if (!(riderUser.roles ?? "").includes("rider")) throw new Error("Selected user is not a rider");
    if (riderUser.isActive === false) throw new Error("Cannot assign ride to a deactivated rider");
    if (riderUser.approvalStatus === "rejected")
      throw new Error("Cannot assign ride to a rejected rider");
    if (riderUser.isOnline === false) throw new Error("Cannot assign ride to an offline rider");

    const oldRiderId = ride.riderId;
    const resolvedName = input.riderName || riderUser.name;
    const resolvedPhone = input.riderPhone || riderUser.phone;

    const updateData: Record<string, any> = {
      riderId,
      riderName: resolvedName,
      riderPhone: resolvedPhone,
      updatedAt: new Date(),
    };
    if (!ride.riderId) updateData.status = "accepted";

    // Cancel all open bids
    await db
      .update(rideBidsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(and(eq(rideBidsTable.rideId, rideId), eq(rideBidsTable.status, "pending")));

    const [updated] = await db
      .update(ridesTable)
      .set(updateData)
      .where(eq(ridesTable.id, rideId))
      .returning();

    // Notifications
    try {
      if (oldRiderId && oldRiderId !== riderId) {
        await sendUserNotification(
          oldRiderId,
          "Ride Reassigned",
          `Ride #${rideId.slice(-6).toUpperCase()} reassigned.`,
          "ride",
          "swap-horizontal-outline"
        );
      }
      await sendUserNotification(
        riderId,
        "New Ride Assigned 🚗",
        `Ride #${rideId.slice(-6).toUpperCase()} assigned!`,
        "ride",
        "car-outline"
      );
      await sendUserNotification(
        ride.userId,
        "Rider Changed",
        `Aapki ride ka rider change ho gaya.`,
        "ride",
        "swap-horizontal-outline"
      );
    } catch (_e) {
      logger.warn("Reassign notifications failed");
    }

    await db.insert(rideEventLogsTable).values({
      id: generateId(),
      rideId,
      adminId: input.adminId,
      event: "admin_reassign",
      notes: `Admin reassigned from ${oldRiderId ?? "none"} to ${riderId}`,
    });

    emitRideUpdate(rideId);
    emitRideDispatchUpdate({
      rideId,
      action: "reassign",
      status: updated!.status,
    });
    const io = getIO();
    if (io) {
      io.to(getSocketRoom(rideId, "ride")).emit("order:update", {
        id: rideId,
        status: updated!.status,
        riderId,
      });
      io.to(`user:${ride.userId}`).emit("order:update", {
        id: rideId,
        status: updated!.status,
        riderId,
      });
    }

    return {
      ride: {
        ...updated,
        fare: parseFloat(updated!.fare),
        distance: parseFloat(updated!.distance),
      },
    };
  }

  /**
   * Get ride detail with all related data
   */
  static async getRideDetail(rideId: string) {
    const [ride] = await db.select().from(ridesTable).where(eq(ridesTable.id, rideId)).limit(1);
    if (!ride) throw new Error("Ride not found");

    const [customer] = await db
      .select({
        name: usersTable.name,
        phone: usersTable.phone,
        email: usersTable.email,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ride.userId))
      .limit(1);

    let rider: {
      name: string | null;
      phone: string | null;
      email: string | null;
    } | null = null;
    if (ride.riderId) {
      const [r] = await db
        .select({
          name: usersTable.name,
          phone: usersTable.phone,
          email: usersTable.email,
        })
        .from(usersTable)
        .where(eq(usersTable.id, ride.riderId))
        .limit(1);
      rider = r ?? null;
    }

    const eventLogs = await db
      .select()
      .from(rideEventLogsTable)
      .where(eq(rideEventLogsTable.rideId, rideId))
      .orderBy(asc(rideEventLogsTable.createdAt));

    const bidRows = await db
      .select()
      .from(rideBidsTable)
      .where(eq(rideBidsTable.rideId, rideId))
      .orderBy(desc(rideBidsTable.createdAt));

    const [notifiedCount] = await db
      .select({ cnt: count() })
      .from(rideNotifiedRidersTable)
      .where(eq(rideNotifiedRidersTable.rideId, rideId));

    const settings = await getPlatformSettings();
    const gstEnabled = (settings["finance_gst_enabled"] ?? "off") === "on";
    const gstPct = parseFloat(settings["finance_gst_pct"] ?? "17");
    const fare = parseFloat(ride.fare);
    const gstAmount = gstEnabled ? parseFloat(((fare * gstPct) / (100 + gstPct)).toFixed(2)) : 0;
    const baseFare = fare - gstAmount;

    return {
      ride: {
        ...ride,
        fare,
        distance: parseFloat(ride.distance),
        createdAt: ride.createdAt.toISOString(),
        updatedAt: ride.updatedAt.toISOString(),
      },
      customer: customer ?? null,
      rider: rider ?? null,
      fareBreakdown: {
        baseFare,
        gstAmount,
        gstPct: gstEnabled ? gstPct : 0,
        total: fare,
      },
      eventLogs: eventLogs.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
      bids: bidRows.map((b) => ({
        ...b,
        fare: parseFloat(b.fare),
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      notifiedRiderCount: Number(notifiedCount?.cnt ?? 0),
    };
  }

  /**
   * Get live riders with location data
   */
  static async getLiveRiders() {
    const settings = await getPlatformSettings();
    const staleTimeoutSec = parseInt(settings["gps_stale_timeout_sec"] ?? "300", 10);
    const STALE_MS = staleTimeoutSec * 1000;
    const cutoff = new Date(Date.now() - STALE_MS);

    const locs = await db
      .select({
        userId: liveLocationsTable.userId,
        latitude: liveLocationsTable.latitude,
        longitude: liveLocationsTable.longitude,
        updatedAt: liveLocationsTable.updatedAt,
        batteryLevel: liveLocationsTable.batteryLevel,
        name: usersTable.name,
        phone: usersTable.phone,
        isOnline: usersTable.isOnline,
        vehicleType: riderProfilesTable.vehicleType,
        city: usersTable.city,
      })
      .from(liveLocationsTable)
      .leftJoin(usersTable, eq(liveLocationsTable.userId, usersTable.id))
      .leftJoin(riderProfilesTable, eq(liveLocationsTable.userId, riderProfilesTable.userId))
      .where(
        or(eq(liveLocationsTable.role, "rider"), eq(liveLocationsTable.role, "service_provider"))
      );

    const enriched = locs.map((loc) => {
      const updatedAt = loc.updatedAt instanceof Date ? loc.updatedAt : new Date(loc.updatedAt);
      const ageSeconds = Math.floor((Date.now() - updatedAt.getTime()) / 1000);
      const isFresh = updatedAt >= cutoff;
      return {
        userId: loc.userId,
        name: loc.name ?? "Unknown",
        phone: loc.phone ?? null,
        isOnline: loc.isOnline ?? false,
        vehicleType: loc.vehicleType ?? null,
        city: loc.city ?? null,
        lat: parseFloat(String(loc.latitude)),
        lng: parseFloat(String(loc.longitude)),
        batteryLevel: loc.batteryLevel ?? null,
        updatedAt: updatedAt.toISOString(),
        ageSeconds,
        isFresh,
      };
    });

    enriched.sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.ageSeconds - b.ageSeconds;
    });

    return {
      riders: enriched,
      total: enriched.length,
      freshCount: enriched.filter((r) => r.isFresh).length,
      staleTimeoutSec,
    };
  }

  /**
   * Set rider online status
   */
  static async setRiderOnlineStatus(riderId: string, isOnline: boolean) {
    const [rider] = await db
      .update(usersTable)
      .set({ isOnline, updatedAt: new Date() })
      .where(eq(usersTable.id, riderId))
      .returning();
    if (!rider) throw new Error("Rider not found");
    return { isOnline };
  }
}

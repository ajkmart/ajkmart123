import { db } from "@workspace/db";
import {
  callLogsTable,
  conversationsTable,
  liveLocationsTable,
  ordersTable,
  parcelBookingsTable,
  pharmacyOrdersTable,
  ridesTable,
  usersTable,
  vanBookingsTable,
  vanSchedulesTable,
} from "@workspace/db/schema";
import { and, eq, lt, or, sql } from "drizzle-orm";
import type { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { verifyUserJwt } from "../middleware/security.js";
import { verifyAccessToken } from "../utils/admin-jwt.js";
import { logger } from "./logger.js";

/* ── Server-side GPS broadcast throttle: max 1 emit per rider per 1500ms ── */
const RIDER_LOC_THROTTLE_MS = 1500;
const _riderLocLastEmit = new Map<string, number>();

let _io: SocketIOServer | null = null;

/* ── Per-connection verified-session cache ────────────────────────────────
   JWT verification is CPU-expensive (HMAC-SHA256).  Within a single socket
   connection the token never changes, so we cache the decoded payload keyed
   by socket ID and clear the entry on disconnect.
   Value shape: { payload: JwtPayload | null } — null means the token was
   invalid; we store that too so we never retry a known-bad token.          */
type CachedSession = { userId: string; role?: string; roles?: string } | null;
const _sessionCache = new Map<string, CachedSession>();

function getCachedSession(socketId: string, token: string | null): CachedSession {
  if (_sessionCache.has(socketId)) return _sessionCache.get(socketId)!;
  if (!token) {
    _sessionCache.set(socketId, null);
    return null;
  }
  const payload = verifyUserJwt(token);
  const session: CachedSession = payload?.userId
    ? { userId: payload.userId, role: payload.role, roles: payload.roles }
    : null;
  _sessionCache.set(socketId, session);
  return session;
}

/**
 * Pending ride-room buffers: while a socket is in the async authorization
 * window for a ride room, outbound rider:location payloads destined for that
 * room are buffered here so they are not silently dropped.
 * Key: `${socketId}::${roomName}` → array of payloads to replay.
 */
const _pendingRideJoins = new Map<string, unknown[]>();

function bufferKey(socketId: string, room: string): string {
  return `${socketId}::${room}`;
}

/* ── JWT helpers ── */
function extractBearerToken(header: string | string[] | undefined): string | null {
  const h = Array.isArray(header) ? header[0] : header;
  if (!h) return null;
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

function getTokenFromHandshake(
  headers: Record<string, string | string[] | undefined>,
  auth: Record<string, unknown>
): string | null {
  return (
    extractBearerToken(headers["authorization"]) ??
    (typeof auth["token"] === "string" ? auth["token"] : null)
  );
}

/* ── Room authorization ── */

function isAuthorizedForAdminFleet(
  headers: Record<string, string | string[] | undefined>,
  query: Record<string, unknown>,
  auth: Record<string, unknown>
): boolean {
  const candidates: Array<string | undefined> = [
    query["adminToken"] as string | undefined,
    auth["adminToken"] as string | undefined,
    auth["token"] as string | undefined,
    Array.isArray(headers["x-admin-token"])
      ? headers["x-admin-token"][0]
      : (headers["x-admin-token"] as string | undefined),
  ];
  for (const token of candidates) {
    if (!token) continue;
    try {
      const payload = verifyAccessToken(token);
      if (
        payload &&
        (payload.role === "super" ||
          payload.role === "manager" ||
          payload.role === "support" ||
          payload.role === "admin")
      )
        return true;
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        `[route] not a valid v2 admin token`
      );
    }
  }
  const bearer = extractBearerToken(headers["authorization"]);
  if (bearer) {
    const payload = verifyUserJwt(bearer);
    if (payload && (payload.role === "admin" || payload.roles?.includes("admin"))) return true;
    try {
      const v2 = verifyAccessToken(bearer);
      if (v2 && (v2.role === "super" || v2.role === "manager" || v2.role === "support"))
        return true;
    } catch (err) {
      logger.debug(
        { error: err instanceof Error ? err.message : String(err) },
        `[route] not a v2 token`
      );
    }
  }
  return false;
}

function isAuthorizedForVendorRoom(
  vendorId: string,
  socketId: string,
  headers: Record<string, string | string[] | undefined>,
  auth: Record<string, unknown>
): boolean {
  const bearer = getTokenFromHandshake(headers, auth);
  const session = getCachedSession(socketId, bearer);
  if (!session) return false;
  return session.userId === vendorId && session.role === "vendor";
}

/** Verify user is a participant of an order (customer or assigned rider) */
async function isAuthorizedForOrderRoom(
  orderId: string,
  headers: Record<string, string | string[] | undefined>,
  auth: Record<string, unknown>
): Promise<boolean> {
  const bearer = getTokenFromHandshake(headers, auth);
  if (!bearer) return false;
  const payload = verifyUserJwt(bearer);
  if (!payload) return false;
  const userId = payload.userId;

  try {
    /* Check mart/food orders */
    const [order] = await db
      .select({ userId: ordersTable.userId, riderId: ordersTable.riderId })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (order && (order.userId === userId || order.riderId === userId)) return true;

    /* Check parcel bookings */
    const [parcel] = await db
      .select({ userId: parcelBookingsTable.userId, riderId: parcelBookingsTable.riderId })
      .from(parcelBookingsTable)
      .where(eq(parcelBookingsTable.id, orderId))
      .limit(1);
    if (parcel && (parcel.userId === userId || parcel.riderId === userId)) return true;

    /* Check pharmacy orders */
    const [pharmacy] = await db
      .select({ userId: pharmacyOrdersTable.userId, riderId: pharmacyOrdersTable.riderId })
      .from(pharmacyOrdersTable)
      .where(eq(pharmacyOrdersTable.id, orderId))
      .limit(1);
    if (pharmacy && (pharmacy.userId === userId || pharmacy.riderId === userId)) return true;
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] DB failure → deny`
    );
  }

  return false;
}

/** Verify user is a participant of the ride (customer, assigned rider, or active order rider/vendor) */
async function isAuthorizedForRideRoom(
  rideId: string,
  headers: Record<string, string | string[] | undefined>,
  auth: Record<string, unknown>
): Promise<boolean> {
  const bearer = getTokenFromHandshake(headers, auth);
  if (!bearer) return false;
  const payload = verifyUserJwt(bearer);
  if (!payload) return false;
  const userId = payload.userId;

  try {
    /* Check ride table: booking customer (userId) or assigned rider */
    const [ride] = await db
      .select({ userId: ridesTable.userId, riderId: ridesTable.riderId })
      .from(ridesTable)
      .where(eq(ridesTable.id, rideId))
      .limit(1);

    if (ride) {
      if (ride.userId === userId || ride.riderId === userId) return true;
    }

    /* Check orders table: rider or vendor for delivery orders that share this ride context */
    const [order] = await db
      .select({ riderId: ordersTable.riderId, vendorId: ordersTable.vendorId })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, rideId),
          or(eq(ordersTable.riderId, userId), eq(ordersTable.vendorId, userId))
        )
      )
      .limit(1);

    if (order) return true;
  } catch (err) {
    logger.debug(
      { error: err instanceof Error ? err.message : String(err) },
      `[fn] DB failure → deny`
    );
  }

  return false;
}

async function isAuthorizedForVanRoom(room: string, userId: string): Promise<boolean> {
  try {
    const parts = room.split(":");
    if (parts.length < 3) return false;
    const scheduleId = parts[1]!;
    const date = parts[2]!;

    const [driverMatch] = await db
      .select({ id: vanSchedulesTable.id })
      .from(vanSchedulesTable)
      .where(and(eq(vanSchedulesTable.id, scheduleId), eq(vanSchedulesTable.driverId, userId)))
      .limit(1);
    if (driverMatch) return true;

    const [bookingMatch] = await db
      .select({ id: vanBookingsTable.id })
      .from(vanBookingsTable)
      .where(
        and(
          eq(vanBookingsTable.scheduleId, scheduleId),
          eq(vanBookingsTable.travelDate, date),
          eq(vanBookingsTable.userId, userId),
          sql`${vanBookingsTable.status} NOT IN ('cancelled')`
        )
      )
      .limit(1);
    return !!bookingMatch;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

async function isAuthorizedForConversationRoom(convId: string, userId: string): Promise<boolean> {
  try {
    const [conv] = await db
      .select({ p1: conversationsTable.participant1Id, p2: conversationsTable.participant2Id })
      .from(conversationsTable)
      .where(eq(conversationsTable.id, convId))
      .limit(1);
    if (!conv) return false;
    return conv.p1 === userId || conv.p2 === userId;
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    return false;
  }
}

function buildAllowedOrigins(): string | string[] {
  if (process.env.NODE_ENV !== "production") return "*";
  const explicit = (process.env.ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);
  if (explicit.length > 0) return explicit;
  /* ALLOWED_DOMAINS: generic comma-separated domain list (no scheme).
     Falls back to REPLIT_DOMAINS for Replit-hosted environments. */
  const domainSrc = process.env.ALLOWED_DOMAINS ?? process.env.REPLIT_DOMAINS ?? "";
  const domains = domainSrc.split(",").filter(Boolean);
  const origins = domains.flatMap((d) => [`https://${d.trim()}`, `http://${d.trim()}`]);
  return origins.length > 0 ? origins : "*";
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  const isDev = process.env.NODE_ENV !== "production";
  const allowedOrigins = buildAllowedOrigins();
  _io = new SocketIOServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: !isDev,
    },
    path: "/api/socket.io",
    transports: ["polling", "websocket"],
  });

  /* ── Ghost-rider cleanup: runs every 5 minutes ──────────────────────────
     Riders whose live_locations row hasn't been updated in > 5 minutes are
     considered offline. This interval:
       1. Queries stale live_locations rows (updatedAt older than 5 min)
       2. Emits rider:offline to admin-fleet for each stale rider
       3. Sets users.is_online = false in the DB for all affected riders
       4. Deletes the stale live_locations rows (removes ghost markers)
  ─────────────────────────────────────────────────────────────────────── */
  const GHOST_CLEANUP_MS = 5 * 60_000; // 5 minutes
  const STALE_THRESHOLD_MS = 5 * 60_000; // 5 minutes without heartbeat = offline

  setInterval(() => {
    if (!_io) return;
    const staleThreshold = new Date(Date.now() - STALE_THRESHOLD_MS);

    db.select({
      userId: liveLocationsTable.userId,
      updatedAt: liveLocationsTable.updatedAt,
    })
      .from(liveLocationsTable)
      .where(lt(liveLocationsTable.updatedAt, staleThreshold))
      .then(async (staleRows) => {
        if (staleRows.length === 0) return;
        const staleUserIds = staleRows.map((r) => r.userId);

        /* Emit rider:offline to admin-fleet for each stale rider.
           updatedAt here is the row's last GPS ping time — i.e. when the
           rider was actually last seen — not the current cleanup time.     */
        for (const { userId, updatedAt } of staleRows) {
          _io!.to("admin-fleet").emit("rider:offline", {
            userId,
            isOnline: false,
            reason: "heartbeat_timeout",
            lastSeenAt: updatedAt?.toISOString() ?? new Date().toISOString(),
          });
        }

        /* Mark riders offline in DB (batch) */
        await Promise.all(
          staleUserIds.map((userId) =>
            db
              .update(usersTable)
              .set({ isOnline: false, updatedAt: new Date() })
              .where(eq(usersTable.id, userId))
              .catch((e: Error) =>
                logger.warn(
                  { userId, err: e.message },
                  "[socketio/cleanup] failed to set is_online=false"
                )
              )
          )
        );

        /* Delete stale live_locations rows */
        await Promise.all(
          staleUserIds.map((userId) =>
            db
              .delete(liveLocationsTable)
              .where(eq(liveLocationsTable.userId, userId))
              .catch((e: Error) =>
                logger.warn(
                  { userId, err: e.message },
                  "[socketio/cleanup] failed to delete stale live_locations"
                )
              )
          )
        );

        logger.info(
          { count: staleUserIds.length },
          "[socketio/cleanup] ghost riders removed from fleet map"
        );
      })
      .catch((e: Error) =>
        logger.warn({ err: e.message }, "[socketio/cleanup] stale query failed")
      );
  }, GHOST_CLEANUP_MS);

  _io.on("connection", (socket) => {
    const headers = socket.handshake.headers as Record<string, string | string[] | undefined>;
    const query = socket.handshake.query as Record<string, unknown>;
    const auth = (socket.handshake.auth ?? {}) as Record<string, unknown>;

    /* Auto-join non-ride rooms from the connection query string (synchronous auth) */
    const rooms = query["rooms"] as string | undefined;
    if (rooms) {
      const roomList = rooms
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean);
      for (const room of roomList) {
        if (room === "admin-fleet") {
          if (isAuthorizedForAdminFleet(headers, query, auth)) {
            void socket.join(room);
          } else {
            logger.debug({ socketId: socket.id, room }, "Socket denied admin-fleet (unauthorized)");
          }
        } else if (room.startsWith("vendor:")) {
          const vendorId = room.slice("vendor:".length);
          if (isAuthorizedForVendorRoom(vendorId, socket.id, headers, auth)) {
            void socket.join(room);
          } else {
            logger.debug({ socketId: socket.id, room }, "Socket denied vendor room (unauthorized)");
          }
        } else if (room.startsWith("ride:")) {
          /* Ride rooms require async DB lookup — buffer outbound emits during authorization */
          const rideId = room.slice("ride:".length);
          const key = bufferKey(socket.id, room);
          _pendingRideJoins.set(key, []);
          isAuthorizedForRideRoom(rideId, headers, auth)
            .then((ok) => {
              const buffered = _pendingRideJoins.get(key) ?? [];
              _pendingRideJoins.delete(key);
              if (ok) {
                void socket.join(room);
                for (const payload of buffered) {
                  socket.emit("rider:location", payload);
                }
              } else {
                logger.debug(
                  { socketId: socket.id, room },
                  "Socket denied ride room (not a participant)"
                );
              }
            })
            .catch((e: Error) => {
              _pendingRideJoins.delete(key);
              logger.warn(
                { socketId: socket.id, room, err: e.message },
                "[socketio] handshake ride room auth check failed"
              );
            });
        } else if (room.startsWith("order:")) {
          const orderId = room.slice("order:".length);
          isAuthorizedForOrderRoom(orderId, headers, auth)
            .then((ok) => {
              if (ok) {
                void socket.join(room);
              } else {
                logger.debug(
                  { socketId: socket.id, room },
                  "Socket denied order room (not a participant)"
                );
              }
            })
            .catch((e: Error) =>
              logger.warn(
                { socketId: socket.id, room, err: e.message },
                "[socketio] order room auth check failed"
              )
            );
        } else if (room.startsWith("conversation:")) {
          const convId = room.slice("conversation:".length);
          const bearer2 = getTokenFromHandshake(headers, auth);
          const sess2 = getCachedSession(socket.id, bearer2);
          if (sess2?.userId) {
            isAuthorizedForConversationRoom(convId, sess2.userId)
              .then((ok) => {
                if (ok) void socket.join(room);
              })
              .catch((e: Error) =>
                logger.warn(
                  { socketId: socket.id, room, err: e.message },
                  "[socketio] conversation room auth check failed"
                )
              );
          }
        } else if (room.startsWith("van:")) {
          const vanBearer = getTokenFromHandshake(headers, auth);
          const vanSess = getCachedSession(socket.id, vanBearer);
          if (vanSess?.userId) {
            isAuthorizedForVanRoom(room, vanSess.userId)
              .then((ok) => {
                if (ok) {
                  void socket.join(room);
                  logger.debug({ socketId: socket.id, room }, "Socket joined van room");
                }
              })
              .catch((e: Error) =>
                logger.warn(
                  { socketId: socket.id, room, err: e.message },
                  "[socketio] van room auth check failed"
                )
              );
          }
        }
      }
    }

    /* Auto-join personal rooms for all authenticated users.
       Also primes the session cache for this connection. */
    const userToken = getTokenFromHandshake(headers, auth);
    const cachedSession = getCachedSession(socket.id, userToken);
    if (cachedSession?.userId) {
      void socket.join(`rider:${cachedSession.userId}`);
      void socket.join(`user:${cachedSession.userId}`);
    }

    /* Heartbeat: rider sends rider:heartbeat with batteryLevel, coordinates, isOnline status.
       Server relays the heartbeat to admin-fleet AND persists batteryLevel, lastSeen, lastActive,
       coordinates, and isOnline to DB — all fire-and-forget so the socket never blocks. */
    socket.on(
      "rider:heartbeat",
      (payload: {
        batteryLevel?: number;
        isOnline?: boolean;
        latitude?: number;
        longitude?: number;
      }) => {
        const riderPay = cachedSession;
        if (!riderPay?.userId || riderPay.role !== "rider") return;
        const batteryLevel =
          typeof payload?.batteryLevel === "number" ? payload.batteryLevel : null;
        const isOnline = payload?.isOnline !== false;
        const now = new Date();

        const hasCoords =
          typeof payload?.latitude === "number" &&
          typeof payload?.longitude === "number" &&
          isFinite(payload.latitude) &&
          isFinite(payload.longitude);

        /* 1. Update live_locations: battery level + lastSeen timestamp + coordinates when available */
        const liveLocationUpdate: Record<string, unknown> = {
          batteryLevel: batteryLevel ?? undefined,
          lastSeen: now,
          updatedAt: now,
        };
        if (hasCoords) {
          liveLocationUpdate.latitude = String(payload!.latitude);
          liveLocationUpdate.longitude = String(payload!.longitude);
        }
        db.update(liveLocationsTable)
          .set(liveLocationUpdate)
          .where(eq(liveLocationsTable.userId, riderPay.userId))
          .catch((e: Error) =>
            logger.warn(
              { riderId: riderPay.userId, err: e.message },
              "[socketio/heartbeat] live_locations update failed"
            )
          );

        /* 2. Update users: isOnline flag + lastActive timestamp so the ghost-rider
            cleanup timer correctly uses lastActive as the freshness signal. */
        db.update(usersTable)
          .set({ isOnline, lastActive: now, updatedAt: now })
          .where(eq(usersTable.id, riderPay.userId))
          .catch((e: Error) =>
            logger.warn(
              { riderId: riderPay.userId, err: e.message },
              "[socketio/heartbeat] users isOnline update failed"
            )
          );

        _io!.to("admin-fleet").emit("rider:heartbeat", {
          userId: riderPay.userId,
          batteryLevel,
          isOnline,
          sentAt: now.toISOString(),
          ...(hasCoords ? { latitude: payload!.latitude, longitude: payload!.longitude } : {}),
        });
      }
    );

    /* SOS relay: rider sends rider:sos event, server broadcasts to admin-fleet */
    socket.on(
      "rider:sos",
      (payload: { latitude?: number; longitude?: number; rideId?: string | null }) => {
        /* Use cached session — no redundant JWT verification */
        if (!cachedSession?.userId || cachedSession.role !== "rider") return;
        if (typeof payload?.latitude !== "number" || typeof payload?.longitude !== "number") return;
        /* Rebroadcast to admin-fleet with enriched payload */
        _io!.to("admin-fleet").emit("rider:sos", {
          userId: cachedSession.userId,
          name: "Rider",
          phone: null,
          latitude: payload.latitude,
          longitude: payload.longitude,
          rideId: payload.rideId ?? null,
          sentAt: new Date().toISOString(),
        });
      }
    );

    /* Admin chat relay: admin sends message to specific rider */
    socket.on("admin:chat", (payload: { riderId: string; message: string }) => {
      if (!payload?.riderId || typeof payload.message !== "string") return;
      /* Only allow admins to send chat messages */
      if (!isAuthorizedForAdminFleet(headers, query, auth)) return;
      _io!.to(`rider:${payload.riderId}`).emit("admin:chat", {
        message: payload.message,
        sentAt: new Date().toISOString(),
        from: "admin",
      });
    });

    /* Rider reply chat relay: rider sends message back to admin */
    socket.on("rider:chat", (payload: { message: string }) => {
      /* Use cached session — no redundant JWT verification */
      if (!cachedSession?.userId || cachedSession.role !== "rider") return;
      if (typeof payload?.message !== "string" || !payload.message.trim()) return;
      /* Broadcast the rider's reply to all admin-fleet clients */
      _io!.to("admin-fleet").emit("rider:chat", {
        userId: cachedSession.userId,
        message: payload.message.trim(),
        sentAt: new Date().toISOString(),
        from: "rider",
      });
    });

    /* admin:join event: admin clients request all admin rooms at once */
    socket.on("admin:join", (payload: { token?: string }) => {
      if (!payload || typeof payload.token !== "string") return;
      const adminAuth = { token: payload.token };
      if (isAuthorizedForAdminFleet(headers, query, adminAuth)) {
        void socket.join("admin-fleet");
        void socket.join("admin-orders");
        void socket.join("admin-support");
        logger.debug({ socketId: socket.id }, "Socket joined admin rooms via admin:join");
      } else {
        logger.debug({ socketId: socket.id }, "Socket admin:join denied (unauthorized)");
      }
    });

    /* Join event: client can request additional rooms after connect */
    socket.on("join", (room: string) => {
      if (typeof room !== "string") return;

      if (room === "admin-fleet") {
        if (isAuthorizedForAdminFleet(headers, query, auth)) {
          void socket.join(room);
          logger.debug({ socketId: socket.id, room }, "Socket joined admin-fleet");
        } else {
          logger.debug(
            { socketId: socket.id, room },
            "Socket join denied admin-fleet (unauthorized)"
          );
        }
      } else if (room.startsWith("vendor:")) {
        const vendorId = room.slice("vendor:".length);
        if (isAuthorizedForVendorRoom(vendorId, socket.id, headers, auth)) {
          void socket.join(room);
          logger.debug({ socketId: socket.id, room }, "Socket joined vendor room");
        } else {
          logger.debug(
            { socketId: socket.id, room },
            "Socket join denied vendor room (unauthorized)"
          );
        }
      } else if (room.startsWith("ride:")) {
        const rideId = room.slice("ride:".length);
        const key = bufferKey(socket.id, room);
        _pendingRideJoins.set(key, []);
        isAuthorizedForRideRoom(rideId, headers, auth)
          .then((ok) => {
            const buffered = _pendingRideJoins.get(key) ?? [];
            _pendingRideJoins.delete(key);
            if (ok) {
              void socket.join(room);
              for (const payload of buffered) {
                socket.emit("rider:location", payload);
              }
              logger.debug({ socketId: socket.id, room }, "Socket joined ride room");
            } else {
              logger.debug(
                { socketId: socket.id, room },
                "Socket join denied ride room (not a participant)"
              );
            }
          })
          .catch((e: Error) => {
            _pendingRideJoins.delete(key);
            logger.warn(
              { socketId: socket.id, room, err: e.message },
              "[socketio] ride room auth check failed"
            );
          });
      } else if (room.startsWith("order:")) {
        const orderId = room.slice("order:".length);
        isAuthorizedForOrderRoom(orderId, headers, auth)
          .then((ok) => {
            if (ok) {
              void socket.join(room);
              logger.debug({ socketId: socket.id, room }, "Socket joined order room");
            } else {
              logger.debug(
                { socketId: socket.id, room },
                "Socket join denied order room (not a participant)"
              );
            }
          })
          .catch((e: Error) =>
            logger.warn(
              { socketId: socket.id, room, err: e.message },
              "[socketio] order room join auth check failed"
            )
          );
      } else if (room.startsWith("conversation:")) {
        const convId = room.slice("conversation:".length);
        if (cachedSession?.userId) {
          isAuthorizedForConversationRoom(convId, cachedSession.userId)
            .then((ok) => {
              if (ok) void socket.join(room);
            })
            .catch((e: Error) =>
              logger.warn(
                { socketId: socket.id, room, err: e.message },
                "[socketio] conversation room join auth check failed"
              )
            );
        }
      }
    });

    /* ── Communication system events ── */
    socket.on("comm:typing:start", async (payload: { conversationId: string; userId: string }) => {
      if (
        !cachedSession?.userId ||
        cachedSession.userId !== payload?.userId ||
        !payload?.conversationId
      )
        return;
      const ok = await isAuthorizedForConversationRoom(
        payload.conversationId,
        cachedSession.userId
      ).catch((err: unknown) => {
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            conversationId: payload.conversationId,
            userId: cachedSession.userId,
          },
          "[socketio] typing:start auth check failed — treating as unauthorized"
        );
        return false;
      });
      if (!ok) return;
      socket.to(`conversation:${payload.conversationId}`).emit("comm:typing:start", {
        userId: payload.userId,
        conversationId: payload.conversationId,
      });
    });

    socket.on("comm:typing:stop", async (payload: { conversationId: string; userId: string }) => {
      if (
        !cachedSession?.userId ||
        cachedSession.userId !== payload?.userId ||
        !payload?.conversationId
      )
        return;
      const ok = await isAuthorizedForConversationRoom(
        payload.conversationId,
        cachedSession.userId
      ).catch((err: unknown) => {
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            conversationId: payload.conversationId,
            userId: cachedSession.userId,
          },
          "[socketio] typing:stop auth check failed — treating as unauthorized"
        );
        return false;
      });
      if (!ok) return;
      socket.to(`conversation:${payload.conversationId}`).emit("comm:typing:stop", {
        userId: payload.userId,
        conversationId: payload.conversationId,
      });
    });

    socket.on(
      "comm:call:offer",
      async (payload: { callId: string; targetUserId: string; sdp: unknown }) => {
        if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
        try {
          const [call] = await db
            .select()
            .from(callLogsTable)
            .where(
              and(
                eq(callLogsTable.id, payload.callId),
                or(
                  eq(callLogsTable.callerId, cachedSession.userId),
                  eq(callLogsTable.calleeId, cachedSession.userId)
                )
              )
            )
            .limit(1);
          if (!call) return;
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] early return on error"
          );
          return;
        }
        _io!.to(`user:${payload.targetUserId}`).emit("comm:call:offer", {
          callId: payload.callId,
          sdp: payload.sdp,
          callerId: cachedSession.userId,
        });
      }
    );

    socket.on(
      "comm:call:answer",
      async (payload: { callId: string; targetUserId: string; sdp: unknown }) => {
        if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
        try {
          const [call] = await db
            .select()
            .from(callLogsTable)
            .where(
              and(
                eq(callLogsTable.id, payload.callId),
                or(
                  eq(callLogsTable.callerId, cachedSession.userId),
                  eq(callLogsTable.calleeId, cachedSession.userId)
                )
              )
            )
            .limit(1);
          if (!call) return;
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] early return on error"
          );
          return;
        }
        _io!
          .to(`user:${payload.targetUserId}`)
          .emit("comm:call:answer", { callId: payload.callId, sdp: payload.sdp });
      }
    );

    socket.on(
      "comm:call:ice-candidate",
      async (payload: { callId: string; targetUserId: string; candidate: unknown }) => {
        if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
        try {
          const [call] = await db
            .select()
            .from(callLogsTable)
            .where(
              and(
                eq(callLogsTable.id, payload.callId),
                or(
                  eq(callLogsTable.callerId, cachedSession.userId),
                  eq(callLogsTable.calleeId, cachedSession.userId)
                )
              )
            )
            .limit(1);
          if (!call) return;
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[fn] early return on error"
          );
          return;
        }
        _io!.to(`user:${payload.targetUserId}`).emit("comm:call:ice-candidate", {
          callId: payload.callId,
          candidate: payload.candidate,
        });
      }
    );

    socket.on("comm:call:reject", (payload: { callId: string; targetUserId: string }) => {
      if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
      _io!.to(`user:${payload.targetUserId}`).emit("comm:call:reject", { callId: payload.callId });
    });

    socket.on("comm:call:end", (payload: { callId: string; targetUserId: string }) => {
      if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
      _io!.to(`user:${payload.targetUserId}`).emit("comm:call:end", { callId: payload.callId });
    });

    /* ── Spec-canonical alias events ───────────────────────────────────────
       These allow clients using the spec-mandated event names to interoperate
       with the server without requiring a full protocol migration.          */

    /** `rider:typing` → { isTyping, conversationId, userId }
     *  Alias for `comm:typing:start` / `comm:typing:stop`. Forwards to the
     *  conversation room as both the primary and the `comm:typing` alias so
     *  all connected clients receive it regardless of which name they listen on. */
    socket.on(
      "rider:typing",
      async (payload: { isTyping: boolean; conversationId: string; userId: string }) => {
        if (
          !cachedSession?.userId ||
          cachedSession.userId !== payload?.userId ||
          !payload?.conversationId
        )
          return;
        const ok = await isAuthorizedForConversationRoom(
          payload.conversationId,
          cachedSession.userId
        ).catch(() => false);
        if (!ok) return;
        const typingPayload = {
          userId: payload.userId,
          conversationId: payload.conversationId,
          isTyping: payload.isTyping,
        };
        const primaryEvent = payload.isTyping ? "comm:typing:start" : "comm:typing:stop";
        socket.to(`conversation:${payload.conversationId}`).emit(primaryEvent, typingPayload);
        socket.to(`conversation:${payload.conversationId}`).emit("comm:typing", typingPayload);
      }
    );

    /** `call:signal` → { type: "offer"|"answer"|"ice-candidate", callId, targetUserId, sdp?, candidate? }
     *  Unified alias for `comm:call:offer`, `comm:call:answer`, and `comm:call:ice-candidate`.
     *  Validates call ownership then forwards using both the primary and alias event names. */
    socket.on(
      "call:signal",
      async (payload: {
        type: "offer" | "answer" | "ice-candidate";
        callId: string;
        targetUserId: string;
        sdp?: unknown;
        candidate?: unknown;
      }) => {
        if (!cachedSession?.userId || !payload?.callId || !payload?.targetUserId) return;
        try {
          const [call] = await db
            .select()
            .from(callLogsTable)
            .where(
              and(
                eq(callLogsTable.id, payload.callId),
                or(
                  eq(callLogsTable.callerId, cachedSession.userId),
                  eq(callLogsTable.calleeId, cachedSession.userId)
                )
              )
            )
            .limit(1);
          if (!call) return;
        } catch (err) {
          logger.debug(
            { error: err instanceof Error ? err.message : String(err) },
            "[socketio] call:signal auth check failed"
          );
          return;
        }
        /* Forward using ONLY the call:signal alias — avoids duplicating comm:call:*
           events that the primary handlers already emit on their own code path.
           `callerId` is included so the callee's offer handler knows the answer target. */
        if (payload.type === "offer") {
          _io!.to(`user:${payload.targetUserId}`).emit("call:signal", {
            type: "offer",
            callId: payload.callId,
            sdp: payload.sdp,
            callerId: cachedSession.userId,
          });
        } else if (payload.type === "answer") {
          _io!.to(`user:${payload.targetUserId}`).emit("call:signal", {
            type: "answer",
            callId: payload.callId,
            sdp: payload.sdp,
          });
        } else if (payload.type === "ice-candidate") {
          _io!.to(`user:${payload.targetUserId}`).emit("call:signal", {
            type: "ice-candidate",
            callId: payload.callId,
            candidate: payload.candidate,
          });
        }
      }
    );

    socket.on("disconnect", () => {
      _sessionCache.delete(socket.id);
      _pendingRideJoins.delete(socket.id); // cleanup all buffers for this socket
      for (const key of _pendingRideJoins.keys()) {
        if (key.startsWith(`${socket.id}::`)) _pendingRideJoins.delete(key);
      }
    });
  });

  return _io;
}

export function getIO(): SocketIOServer | null {
  return _io;
}

/** Broadcast mart/food order event to admin and vendor rooms */
export function emitOrderUpdate(vendorId: string, order: any) {
  if (!_io) return;
  _io.to("admin-fleet").emit("order:update", order);
  _io.to(`vendor:${vendorId}`).emit("order:update", order);
}

/** Broadcast parcel booking update to admin and specific participant rooms */
export function emitParcelUpdate(order: any) {
  if (!_io) return;
  _io.to("admin-fleet").emit("parcel:update", order);
  if (order.userId) _io.to(`user:${order.userId}`).emit("parcel:update", order);
  if (order.riderId) _io.to(`rider:${order.riderId}`).emit("parcel:update", order);
}

/** Real-time GPS broadcast: relays rider coordinates to admin-fleet and participants.
 *  Throttled server-side to max 1 emit per 1500ms per rider to save client CPU/bandwidth. */
export function emitRiderLocation(payload: {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  batteryLevel?: number;
  action?: string | null;
  rideId?: string | null;
  vendorId?: string | null;
  orderId?: string | null;
  vehicleType?: string | null;
  currentTripId?: string | null;
  updatedAt: string;
}) {
  if (!_io) return;

  const now = Date.now();
  const lastEmit = _riderLocLastEmit.get(payload.userId) ?? 0;

  if (now - lastEmit < RIDER_LOC_THROTTLE_MS) {
    /* Throttled: buffer if this rider is currently joining a ride room */
    if (payload.rideId) {
      const rooms = Array.from(_pendingRideJoins.keys()).filter((k) =>
        k.endsWith(`::ride:${payload.rideId}`)
      );
      for (const key of rooms) {
        _pendingRideJoins.get(key)?.push(payload);
      }
    }
    return;
  }
  _riderLocLastEmit.set(payload.userId, now);

  _io.to("admin-fleet").emit("rider:location", payload);

  if (payload.rideId) {
    _io.to(`ride:${payload.rideId}`).emit("rider:location", payload);
  }
  if (payload.orderId) {
    _io.to(`order:${payload.orderId}`).emit("rider:location", payload);
  }
  if (payload.vendorId) {
    _io.to(`vendor:${payload.vendorId}`).emit("rider:location", payload);
  }
}

/** Broadcast customer location (for specific ride/parcel context) */
export function emitCustomerLocation(payload: {
  userId: string;
  latitude: number;
  longitude: number;
  updatedAt: string;
  rideId?: string | null;
  parcelBookingId?: string | null;
}) {
  if (!_io) return;
  _io.to(`user:${payload.userId}`).emit("customer:location", payload);
  if (payload.rideId) {
    _io.to(`ride:${payload.rideId}`).emit("customer:location", payload);
  }
  if (payload.parcelBookingId) {
    _io.to(`parcel:${payload.parcelBookingId}`).emit("customer:location", payload);
  }
}

/** Emit specific vendor-only update when a rider moves for their order */
export function emitRiderForVendor(vendorId: string, payload: any) {
  if (!_io) return;
  _io.to(`vendor:${vendorId}`).emit("rider:location", payload);
}

/** Emit new ride request to all online/available riders */
export function emitRiderNewRequest(
  riderId: string,
  payload: { type: "ride" | "order" | "parcel"; requestId: string; summary: string }
) {
  if (!_io) return;
  _io.to(`rider:${riderId}`).emit("rider:new_request", payload);
}

/** Broadcast chat message to the conversation room.
 *  Emits both the namespaced name (`comm:message:new`) used by the server
 *  implementation and the spec-canonical alias (`comm:message`) so clients
 *  listening to either name receive the payload. */
export function emitChatMessage(conversationId: string, message: any) {
  if (!_io) return;
  _io.to(`conversation:${conversationId}`).emit("comm:message:new", message);
  _io.to(`conversation:${conversationId}`).emit("comm:message", message);
}

/** Emit ride dispatch update to the relevant ride room and admin-fleet dashboard */
export function emitRideDispatchUpdate(payload: {
  rideId: string;
  action: string;
  status: string;
  [key: string]: any;
}) {
  if (!_io) return;
  _io.to(`ride:${payload.rideId}`).emit("ride:dispatch_update", payload);
  _io.to("admin-fleet").emit("ride:dispatch_update", payload);
}

/** Emit rider online/offline status to admin-fleet */
export function emitRiderStatus(payload: {
  userId: string;
  isOnline: boolean;
  name?: string;
  updatedAt: string;
}) {
  if (!_io) return;
  _io.to("admin-fleet").emit("rider:status", payload);
}

/** Emit trip OTP to the customer, the rider, and the ride room.
 *  riderId is optional for backward compat but should always be supplied
 *  so the rider receives the OTP on their personal room immediately. */
export function emitRideOtp(userId: string, rideId: string, otp: string, riderId?: string | null) {
  if (!_io) return;
  const payload = { rideId, otp };
  _io.to(`user:${userId}`).emit("ride:otp", payload);
  _io.to(`ride:${rideId}`).emit("ride:otp", payload);
  if (riderId) {
    _io.to(`rider:${riderId}`).emit("ride:otp", payload);
  }
}

/* ══════════════════════════════════════════════════════════════
   SOS ALERTS
   ══════════════════════════════════════════════════════════════ */
export interface SosAlertPayload {
  id: string;
  userId: string;
  title: string;
  body: string;
  link?: string | null;
  sosStatus: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolvedByName: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  [key: string]: unknown;
}

/** Emit a KYC submission event to all admin-fleet sessions */
export function emitKycSubmitted(payload: { userId: string; submittedAt: string }) {
  if (!_io) return;
  _io.to("admin-fleet").emit("kyc:submitted", payload);
}

/** Emit a new SOS alert to all admin-fleet sessions */
export function emitSosNew(payload: SosAlertPayload) {
  if (!_io) return;
  _io.to("admin-fleet").emit("sos:new", payload);
}

/** Emit SOS acknowledged event */
export function emitSosAcknowledged(payload: SosAlertPayload) {
  if (!_io) return;
  _io.to("admin-fleet").emit("sos:acknowledged", payload);
  _io.to(`user:${payload.userId}`).emit("sos:acknowledged", payload);
}

/** Emit SOS resolved event */
export function emitSosResolved(payload: SosAlertPayload) {
  if (!_io) return;
  _io.to("admin-fleet").emit("sos:resolved", payload);
  _io.to(`user:${payload.userId}`).emit("sos:resolved", payload);
}

/** Legacy rider SOS relay — kept for fleet map backward compat */
export function emitRiderSOS(payload: {
  userId: string;
  name: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}) {
  if (!_io) return;
  _io.to("admin-fleet").emit("rider:sos", payload);
}

/* ══════════════════════════════════════════════════════════════
   VAN / INTERCITY TRANSPORT
   ══════════════════════════════════════════════════════════════ */

/** Emit real-time van GPS location to passengers and admin */
export function emitVanLocation(
  scheduleId: string,
  date: string,
  payload: {
    latitude: number;
    longitude: number;
    speed?: number;
    heading?: number;
    updatedAt: string;
  }
) {
  if (!_io) return;
  const room = `van:${scheduleId}:${date}`;
  _io.to(room).emit("van:location", { scheduleId, date, ...payload });
  _io.to("admin-fleet").emit("van:location", { scheduleId, date, ...payload });
}

/** Emit van trip lifecycle events (trip_started, trip_completed, passenger_boarded, etc.) */
export function emitVanTripUpdate(
  scheduleId: string,
  date: string,
  payload: { event: string; data?: unknown }
) {
  if (!_io) return;
  const room = `van:${scheduleId}:${date}`;
  _io.to(room).emit("van:trip_update", { scheduleId, date, ...payload });
  _io.to("admin-fleet").emit("van:trip_update", { scheduleId, date, ...payload });
}

import { db } from "@workspace/db";
import {
  aiModerationLogsTable,
  callLogsTable,
  chatMessagesTable,
  chatReportsTable,
  communicationFlagsTable,
  communicationRequestsTable,
  communicationRolesTable,
  conversationsTable,
  usersTable,
} from "@workspace/db/schema";
import { randomInt } from "crypto";
import { and, count, desc, eq, gte, or, sql } from "drizzle-orm";
import { Router, type NextFunction, type Request, type Response } from "express";
import { mkdir, writeFile } from "fs/promises";
import multer from "multer";
import path from "path";
import { z } from "zod";
import { generateId } from "../lib/id.js";
import { logger } from "../lib/logger.js";
import { getIO } from "../lib/socketio.js";
import type { JwtUserPayload } from "../middleware/security.js";
import { verifyUserJwt } from "../middleware/security.js";
import { composeMessage, transcribeAudio, translateMessage } from "../services/communicationAI.js";
import {
  checkFlagKeywords,
  getModerationConfigFromSettings,
  moderateContent,
} from "../services/contentModeration.js";
import { getCachedSettings } from "./admin-shared.js";
// Augmented request carrying the authenticated user payload
type CommRequest = Request & { user: JwtUserPayload };

const router = Router();

const VOICE_NOTES_DIR = path.resolve(process.cwd(), "uploads", "voice-notes");

async function emitDashboardUpdate() {
  const io = getIO();
  if (!io) return;
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [convCount] = await db
      .select({ count: count() })
      .from(conversationsTable)
      .where(eq(conversationsTable.status, "active"));
    const [msgCount] = await db
      .select({ count: count() })
      .from(chatMessagesTable)
      .where(gte(chatMessagesTable.createdAt, today));
    const [callCount] = await db
      .select({ count: count() })
      .from(callLogsTable)
      .where(gte(callLogsTable.startedAt, today));
    const [flagCount] = await db
      .select({ count: count() })
      .from(communicationFlagsTable)
      .where(sql`${communicationFlagsTable.resolvedAt} IS NULL`);
    const [aiCount] = await db
      .select({ count: count() })
      .from(aiModerationLogsTable)
      .where(gte(aiModerationLogsTable.createdAt, today));
    const [voiceNoteCount] = await db
      .select({ count: count() })
      .from(chatMessagesTable)
      .where(
        and(
          gte(chatMessagesTable.createdAt, today),
          eq(chatMessagesTable.messageType, "voice_note")
        )
      );
    io.to("admin-fleet").emit("comm:dashboard:update", {
      activeConversations: Number(convCount?.count ?? 0),
      messagesToday: Number(msgCount?.count ?? 0),
      callsToday: Number(callCount?.count ?? 0),
      voiceNotesToday: Number(voiceNoteCount?.count ?? 0),
      flaggedMessages: Number(flagCount?.count ?? 0),
      aiUsageToday: Number(aiCount?.count ?? 0),
    });
  } catch (e) {
    logger.warn({ err: e }, "[comm] Failed to emit dashboard update");
  }
}

function authMiddleware(req: CommRequest, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const payload = verifyUserJwt(auth.slice(7));
  if (!payload) {
    return res.status(401).json({ error: "Invalid token" });
  }
  req.user = payload;
  return next();
}

router.use(authMiddleware);

function generateAjkId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "AJK-";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(randomInt(0, chars.length));
  }
  return result;
}

function getRolePairKey(role1: string, role2: string): string {
  const sorted = [role1, role2].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

function isWithinTimeWindow(startStr: string, endStr: string): boolean {
  if (!startStr || !endStr) return true;
  const now = new Date();
  const [sh, sm] = startStr.split(":").map(Number);
  const [eh, em] = endStr.split(":").map(Number);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 23) * 60 + (em || 59);
  if (startMin <= endMin) return nowMin >= startMin && nowMin <= endMin;
  return nowMin >= startMin || nowMin <= endMin;
}

function isRequestExpired(request: { expiresAt: Date | null; status: string }): boolean {
  if (request.status !== "pending") return false;
  if (!request.expiresAt) return false;
  return new Date() > new Date(request.expiresAt);
}

interface CanCommunicateResult {
  allowed: boolean;
  reason?: string;
}

async function canCommunicate(
  senderId: string,
  receiverId: string,
  action: "chat" | "voiceCall" | "voiceNote" | "request",
  settings?: Record<string, string>
): Promise<CanCommunicateResult> {
  const s = settings || (await getCachedSettings());

  if (s["comm_enabled"] === "off")
    return { allowed: false, reason: "Communication system is disabled" };

  if (action === "chat" && s["comm_chat_enabled"] === "off")
    return { allowed: false, reason: "Chat is disabled" };
  if (action === "voiceCall" && s["comm_voice_calls_enabled"] === "off")
    return { allowed: false, reason: "Voice calls are disabled" };
  if (action === "voiceNote" && s["comm_voice_notes_enabled"] === "off")
    return { allowed: false, reason: "Voice notes are disabled" };

  const [sender] = await db
    .select({ commBlocked: usersTable.commBlocked, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, senderId))
    .limit(1);
  if (!sender) return { allowed: false, reason: "Sender not found" };
  if (sender.commBlocked)
    return { allowed: false, reason: "Your account is blocked from communication" };

  const [receiver] = await db
    .select({ commBlocked: usersTable.commBlocked, roles: usersTable.roles })
    .from(usersTable)
    .where(eq(usersTable.id, receiverId))
    .limit(1);
  if (!receiver) return { allowed: false, reason: "User not found" };
  if (receiver.commBlocked) return { allowed: false, reason: "User is blocked from communication" };

  const timeStart = s["comm_time_window_start"] || "00:00";
  const timeEnd = s["comm_time_window_end"] || "23:59";
  if (!isWithinTimeWindow(timeStart, timeEnd)) {
    return {
      allowed: false,
      reason: `Communication is only available between ${timeStart} and ${timeEnd}`,
    };
  }

  const senderRole = extractPrimaryRole(sender.roles);
  const receiverRole = extractPrimaryRole(receiver.roles);
  const pairKey = getRolePairKey(senderRole, receiverRole);

  try {
    const roles = await db
      .select({
        permissions: communicationRolesTable.permissions,
        rolePairRules: communicationRolesTable.rolePairRules,
        timeWindows: communicationRolesTable.timeWindows,
      })
      .from(communicationRolesTable);

    if (roles.length > 0) {
      let pairAllowed = false;
      let actionAllowed = false;

      for (const role of roles) {
        const pairRules = (role.rolePairRules || {}) as Record<string, boolean>;
        const permissions = (role.permissions || {}) as Record<string, boolean>;
        const tw = (role.timeWindows || {}) as Record<string, string>;

        if (pairRules[pairKey]) {
          pairAllowed = true;

          if (tw["start"] && tw["end"] && !isWithinTimeWindow(tw["start"], tw["end"])) {
            continue;
          }

          if (action === "request" || permissions[action]) {
            actionAllowed = true;
            break;
          }
        }
      }

      if (!pairAllowed) {
        return {
          allowed: false,
          reason: `Communication between ${senderRole} and ${receiverRole} is not allowed`,
        };
      }
      if (!actionAllowed) {
        return { allowed: false, reason: `${action} is not permitted for this role pair` };
      }
    }
  } catch (err) {
    logger.warn(
      { error: err instanceof Error ? err.message : String(err) },
      "[communication] Role permission check failed — allowing by default"
    );
    // If roles table fails, allow by default
  }

  return { allowed: true };
}

function extractPrimaryRole(roles: unknown): string {
  if (!roles) return "customer";
  if (typeof roles === "string") return roles;
  if (Array.isArray(roles)) return roles[0] || "customer";
  return "customer";
}

async function checkAiDailyLimit(
  userId: string,
  settings: Record<string, string>
): Promise<boolean> {
  const limit = parseInt(settings["comm_daily_ai_limit"] || "50", 10);
  if (limit <= 0) return true;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [usage] = await db
    .select({ count: count() })
    .from(aiModerationLogsTable)
    .where(
      and(
        eq(aiModerationLogsTable.userId, userId),
        gte(aiModerationLogsTable.createdAt, todayStart)
      )
    );

  return (usage?.count || 0) < limit;
}

router.get("/me/ajk-id", async (req: CommRequest, res) => {
  try {
    const [user] = await db
      .select({ ajkId: usersTable.ajkId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId))
      .limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    let ajkId = user.ajkId;
    if (!ajkId) {
      ajkId = generateAjkId();
      let attempts = 0;
      while (attempts < 10) {
        const [existing] = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.ajkId, ajkId))
          .limit(1);
        if (!existing) break;
        ajkId = generateAjkId();
        attempts++;
      }
      await db
        .update(usersTable)
        .set({ ajkId, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.userId));
    }
    res.json({ data: { ajkId } });
  } catch (e) {
    logger.error({ err: e }, "[comm] Failed to get AJK ID");
    res.status(500).json({ error: "Failed to get AJK ID" });
  }
  return;
});

router.get("/search/:ajkId", async (req: CommRequest, res) => {
  try {
    const { ajkId } = req.params as Record<string, string>;
    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        roles: usersTable.roles,
        isOnline: usersTable.isOnline,
        ajkId: usersTable.ajkId,
      })
      .from(usersTable)
      .where(eq(usersTable.ajkId, ajkId))
      .limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.id === req.user.userId)
      return res.status(400).json({ error: "Cannot search for yourself" });
    res.json({
      data: {
        id: user.id,
        name: user.name,
        role: user.roles,
        isOnline: user.isOnline,
        ajkId: user.ajkId,
      },
    });
  } catch (_e) {
    res.status(500).json({ error: "Search failed" });
  }
  return;
});

const sendRequestSchema = z.object({ receiverId: z.string().min(1) });

router.post("/requests", async (req: CommRequest, res) => {
  try {
    const parsed = sendRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

    const { receiverId } = parsed.data;
    const senderId = req.user.userId;

    if (senderId === receiverId)
      return res.status(400).json({ error: "Cannot send request to yourself" });

    const settings = await getCachedSettings();
    const check = await canCommunicate(senderId, receiverId, "request", settings);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const [existing] = await db
      .select({
        id: communicationRequestsTable.id,
        status: communicationRequestsTable.status,
        expiresAt: communicationRequestsTable.expiresAt,
      })
      .from(communicationRequestsTable)
      .where(
        and(
          or(
            and(
              eq(communicationRequestsTable.senderId, senderId),
              eq(communicationRequestsTable.receiverId, receiverId)
            ),
            and(
              eq(communicationRequestsTable.senderId, receiverId),
              eq(communicationRequestsTable.receiverId, senderId)
            )
          ),
          eq(communicationRequestsTable.status, "pending")
        )
      )
      .limit(1);

    if (existing && !isRequestExpired(existing)) {
      return res.status(409).json({ error: "A pending request already exists" });
    }
    if (existing && isRequestExpired(existing)) {
      await db
        .update(communicationRequestsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(communicationRequestsTable.id, existing.id));
    }

    const [existingConv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          or(
            and(
              eq(conversationsTable.participant1Id, senderId),
              eq(conversationsTable.participant2Id, receiverId)
            ),
            and(
              eq(conversationsTable.participant1Id, receiverId),
              eq(conversationsTable.participant2Id, senderId)
            )
          ),
          eq(conversationsTable.status, "active")
        )
      )
      .limit(1);
    if (existingConv)
      return res
        .status(409)
        .json({ error: "You already have an active conversation with this user" });

    const expiryHours = parseInt(settings["comm_request_expiry_hours"] || "72", 10);
    const id = generateId();
    await db.insert(communicationRequestsTable).values({
      id,
      senderId,
      receiverId,
      status: "pending",
      expiresAt: new Date(Date.now() + expiryHours * 60 * 60 * 1000),
    });

    const io = getIO();
    if (io) {
      io.to(`user:${receiverId}`).emit("comm:request:new", { requestId: id, senderId });
    }

    res.status(201).json({ data: { id, status: "pending" } });
  } catch (e) {
    logger.error({ err: e }, "[comm] Failed to send request");
    res.status(500).json({ error: "Failed to send request" });
  }
  return;
});

router.patch("/requests/:id/accept", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [request] = await db
      .select()
      .from(communicationRequestsTable)
      .where(eq(communicationRequestsTable.id, id))
      .limit(1);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.receiverId !== req.user.userId)
      return res.status(403).json({ error: "Not authorized" });
    if (request.status !== "pending")
      return res.status(400).json({ error: "Request is no longer pending" });

    if (isRequestExpired(request)) {
      await db
        .update(communicationRequestsTable)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(communicationRequestsTable.id, id));
      return res.status(400).json({ error: "Request has expired" });
    }

    await db
      .update(communicationRequestsTable)
      .set({ status: "accepted", updatedAt: new Date() })
      .where(eq(communicationRequestsTable.id, id));

    const convId = generateId();
    await db.insert(conversationsTable).values({
      id: convId,
      participant1Id: request.senderId,
      participant2Id: request.receiverId,
      type: "direct",
      status: "active",
    });

    const io = getIO();
    if (io) {
      io.to(`user:${request.senderId}`).emit("comm:request:accepted", {
        requestId: id,
        conversationId: convId,
      });
    }

    res.json({ data: { conversationId: convId } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to accept request" });
  }
  return;
});

router.patch("/requests/:id/reject", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [request] = await db
      .select()
      .from(communicationRequestsTable)
      .where(eq(communicationRequestsTable.id, id))
      .limit(1);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.receiverId !== req.user.userId)
      return res.status(403).json({ error: "Not authorized" });

    await db
      .update(communicationRequestsTable)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(communicationRequestsTable.id, id));

    const io = getIO();
    if (io) {
      io.to(`user:${request.senderId}`).emit("comm:request:rejected", { requestId: id });
    }

    res.json({ data: { status: "rejected" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to reject request" });
  }
  return;
});

router.patch("/requests/:id/cancel", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [request] = await db
      .select()
      .from(communicationRequestsTable)
      .where(eq(communicationRequestsTable.id, id))
      .limit(1);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.senderId !== req.user.userId)
      return res.status(403).json({ error: "Not authorized — only the sender can cancel" });
    if (request.status !== "pending")
      return res.status(400).json({ error: "Request is no longer pending" });

    await db
      .update(communicationRequestsTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(communicationRequestsTable.id, id));

    const io = getIO();
    if (io) {
      io.to(`user:${request.receiverId}`).emit("comm:request:cancelled", { requestId: id });
    }

    res.json({ data: { status: "cancelled" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to cancel request" });
  }
  return;
});

router.get("/requests", async (req: CommRequest, res) => {
  try {
    const userId = req.user.userId;
    const type = req.query.type || "received";
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;

    const condition =
      type === "sent"
        ? eq(communicationRequestsTable.senderId, userId)
        : eq(communicationRequestsTable.receiverId, userId);

    const requests = await db
      .select({
        id: communicationRequestsTable.id,
        senderId: communicationRequestsTable.senderId,
        receiverId: communicationRequestsTable.receiverId,
        status: communicationRequestsTable.status,
        expiresAt: communicationRequestsTable.expiresAt,
        createdAt: communicationRequestsTable.createdAt,
      })
      .from(communicationRequestsTable)
      .where(condition)
      .orderBy(desc(communicationRequestsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const now = new Date();
    const expiredIds: string[] = [];
    const filtered = requests.map((r) => {
      if (r.status === "pending" && r.expiresAt && now > new Date(r.expiresAt)) {
        expiredIds.push(r.id);
        return { ...r, status: "expired" };
      }
      return r;
    });

    if (expiredIds.length > 0) {
      db.update(communicationRequestsTable)
        .set({ status: "expired", updatedAt: now })
        .where(
          sql`${communicationRequestsTable.id} = ANY(ARRAY[${sql.join(
            expiredIds.map((id) => sql`${id}`),
            sql`, `
          )}]::text[])`
        )
        .catch((e: unknown) =>
          logger.warn(
            {
              message: "[comm] Failed to expire stale requests",
              error: e instanceof Error ? e.message : String(e),
              code: "COMM_EXPIRE_STALE_FAILED",
              correlationId: null,
              timestamp: new Date().toISOString(),
            },
            "[comm] Failed to expire stale requests"
          )
        );
    }

    const userIds = [...new Set(filtered.flatMap((r) => [r.senderId, r.receiverId]))];
    const users =
      userIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              roles: usersTable.roles,
              ajkId: usersTable.ajkId,
            })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(ARRAY[${sql.join(
                userIds.map((id) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];

    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      data: filtered.map((r) => ({
        ...r,
        sender: userMap[r.senderId] || null,
        receiver: userMap[r.receiverId] || null,
      })),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list requests" });
  }
});

router.get("/conversations", async (req: CommRequest, res) => {
  try {
    const userId = req.user.userId;
    const conversations = await db
      .select()
      .from(conversationsTable)
      .where(
        and(
          or(
            eq(conversationsTable.participant1Id, userId),
            eq(conversationsTable.participant2Id, userId)
          ),
          eq(conversationsTable.status, "active")
        )
      )
      .orderBy(desc(conversationsTable.lastMessageAt));

    const otherIds = conversations.map((c) =>
      c.participant1Id === userId ? c.participant2Id : c.participant1Id
    );
    const users =
      otherIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              roles: usersTable.roles,
              ajkId: usersTable.ajkId,
              isOnline: usersTable.isOnline,
            })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(ARRAY[${sql.join(
                otherIds.map((id) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    const convIds = conversations.map((c) => c.id);
    let lastMessages: Record<string, unknown>[] = [];
    let unreadCounts: { conversationId: string; count: number }[] = [];
    if (convIds.length > 0) {
      const rawResult = await db.execute(sql`
        SELECT DISTINCT ON (conversation_id) id, conversation_id, content, message_type, sender_id, created_at, delivery_status
        FROM chat_messages
        WHERE conversation_id = ANY(ARRAY[${sql.join(
          convIds.map((id) => sql`${id}`),
          sql`, `
        )}]::text[])
        AND is_deleted = false
        ORDER BY conversation_id, created_at DESC
      `);
      lastMessages = ((rawResult as { rows?: Record<string, unknown>[] }).rows ||
        rawResult ||
        []) as Record<string, unknown>[];

      unreadCounts = await db
        .select({ conversationId: chatMessagesTable.conversationId, count: count() })
        .from(chatMessagesTable)
        .where(
          and(
            sql`${chatMessagesTable.conversationId} = ANY(ARRAY[${sql.join(
              convIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`,
            sql`${chatMessagesTable.senderId} != ${userId}`,
            sql`${chatMessagesTable.deliveryStatus} != 'read'`,
            eq(chatMessagesTable.isDeleted, false)
          )
        )
        .groupBy(chatMessagesTable.conversationId);
    }

    const lastMsgMap = Object.fromEntries(
      lastMessages.map((m) => [m.conversation_id as string, m])
    );
    const unreadMap = Object.fromEntries(
      unreadCounts.map((u) => [u.conversationId, Number(u.count)])
    );

    res.json({
      data: conversations.map((c) => {
        const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
        return {
          ...c,
          otherUser: userMap[otherId] || null,
          lastMessage: lastMsgMap[c.id] || null,
          unreadCount: unreadMap[c.id] || 0,
        };
      }),
    });
  } catch (e) {
    logger.error({ err: e }, "[comm] Failed to list conversations");
    res.status(500).json({ error: "Failed to list conversations" });
  }
});

router.get("/conversations/:id/messages", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);
    const offset = (page - 1) * limit;

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (conv.participant1Id !== req.user.userId && conv.participant2Id !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(and(eq(chatMessagesTable.conversationId, id), eq(chatMessagesTable.isDeleted, false)))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(limit)
      .offset(offset);

    const sanitized = messages.reverse().map(({ originalContent, ...rest }) => rest);
    res.json({ data: sanitized });
  } catch (_e) {
    res.status(500).json({ error: "Failed to get messages" });
  }
  return;
});

const sendMessageSchema = z.object({
  content: z.string().max(5000).optional(),
  messageType: z.enum(["text", "image", "voice_note", "file"]).default("text"),
  imageUrl: z.string().optional(),
  fileUrl: z.string().optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  voiceNoteUrl: z.string().optional(),
  voiceNoteDuration: z.number().optional(),
  voiceNoteWaveform: z.string().optional(),
  voiceNoteTranscript: z.string().optional(),
});

router.post("/conversations/:id/messages", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid message" });

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (conv.participant1Id !== req.user.userId && conv.participant2Id !== req.user.userId) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const otherId =
      conv.participant1Id === req.user.userId ? conv.participant2Id : conv.participant1Id;
    const settings = await getCachedSettings();

    const action: "chat" | "voiceNote" =
      parsed.data.messageType === "voice_note" ? "voiceNote" : "chat";
    const check = await canCommunicate(req.user.userId, otherId, action, settings);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const maxLen = parseInt(settings["comm_max_message_length"] || "2000", 10);
    if (parsed.data.content && parsed.data.content.length > maxLen) {
      return res.status(400).json({ error: `Message exceeds maximum length of ${maxLen}` });
    }

    let content = parsed.data.content || "";
    let originalContent = content;
    const modConfig = getModerationConfigFromSettings(settings);

    if (content && parsed.data.messageType === "text") {
      const modResult = moderateContent(content, modConfig);
      content = modResult.masked;
      originalContent = modResult.original;
    }

    let isFlagged = false;
    let flagReason: string | null = null;
    if (content && modConfig.flagKeywords?.length) {
      const keyword = checkFlagKeywords(originalContent, modConfig.flagKeywords);
      if (keyword) {
        isFlagged = true;
        flagReason = `Auto-flagged keyword: ${keyword}`;
      }
    }

    const msgId = generateId();

    await db.insert(chatMessagesTable).values({
      id: msgId,
      conversationId: id,
      senderId: req.user.userId,
      content,
      originalContent: originalContent !== content ? originalContent : null,
      messageType: parsed.data.messageType,
      imageUrl: parsed.data.imageUrl || null,
      fileUrl: parsed.data.fileUrl || null,
      fileName: parsed.data.fileName || null,
      fileSize: parsed.data.fileSize || null,
      voiceNoteUrl: parsed.data.voiceNoteUrl || null,
      voiceNoteDuration: parsed.data.voiceNoteDuration || null,
      voiceNoteWaveform: parsed.data.voiceNoteWaveform || null,
      voiceNoteTranscript: parsed.data.voiceNoteTranscript || null,
      deliveryStatus: "sent",
      isFlagged,
      flagReason,
    });

    if (isFlagged) {
      await db.insert(communicationFlagsTable).values({
        id: generateId(),
        messageId: msgId,
        reason: flagReason || "keyword",
        keyword: flagReason?.replace("Auto-flagged keyword: ", "") || null,
      });
    }

    await db
      .update(conversationsTable)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(conversationsTable.id, id));

    const message = {
      id: msgId,
      conversationId: id,
      senderId: req.user.userId,
      content,
      messageType: parsed.data.messageType,
      imageUrl: parsed.data.imageUrl || null,
      voiceNoteUrl: parsed.data.voiceNoteUrl || null,
      voiceNoteDuration: parsed.data.voiceNoteDuration || null,
      voiceNoteWaveform: parsed.data.voiceNoteWaveform || null,
      fileUrl: parsed.data.fileUrl || null,
      fileName: parsed.data.fileName || null,
      deliveryStatus: "sent",
      createdAt: new Date().toISOString(),
    };

    const io = getIO();
    if (io) {
      io.to(`user:${otherId}`).emit("comm:message:new", message);
      io.to(`user:${req.user.userId}`).emit("comm:message:sent", { id: msgId, conversationId: id });
    }

    emitDashboardUpdate().catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[comm] emitDashboardUpdate after message send failed"
      );
    });
    res.status(201).json({ data: message });
  } catch (e) {
    logger.error({ err: e }, "[comm] Failed to send message");
    res.status(500).json({ error: "Failed to send message" });
  }
  return;
});

router.patch("/messages/:id/read", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [msg] = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.id, id))
      .limit(1);
    if (!msg) return res.status(404).json({ error: "Message not found" });

    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, msg.conversationId))
      .limit(1);
    if (
      !conv ||
      (conv.participant1Id !== req.user.userId && conv.participant2Id !== req.user.userId)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (msg.senderId !== req.user.userId) {
      await db
        .update(chatMessagesTable)
        .set({ deliveryStatus: "read", readAt: new Date(), updatedAt: new Date() })
        .where(eq(chatMessagesTable.id, id));

      const io = getIO();
      if (io) {
        io.to(`user:${msg.senderId}`).emit("comm:message:read", {
          messageId: id,
          conversationId: msg.conversationId,
        });
      }
    }

    res.json({ data: { status: "read" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
  return;
});

router.patch("/conversations/:id/read-all", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const [conv] = await db
      .select()
      .from(conversationsTable)
      .where(eq(conversationsTable.id, id))
      .limit(1);
    if (
      !conv ||
      (conv.participant1Id !== req.user.userId && conv.participant2Id !== req.user.userId)
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await db
      .update(chatMessagesTable)
      .set({ deliveryStatus: "read", readAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(chatMessagesTable.conversationId, id),
          sql`${chatMessagesTable.senderId} != ${req.user.userId}`,
          sql`${chatMessagesTable.deliveryStatus} != 'read'`
        )
      );

    const otherId =
      conv.participant1Id === req.user.userId ? conv.participant2Id : conv.participant1Id;
    const io = getIO();
    if (io) {
      io.to(`user:${otherId}`).emit("comm:messages:read-all", { conversationId: id });
    }

    res.json({ data: { status: "ok" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
  return;
});

router.post("/translate", async (req: CommRequest, res) => {
  try {
    const { text, targetLang } = req.body;
    if (!text || !targetLang)
      return res.status(400).json({ error: "text and targetLang required" });

    const settings = await getCachedSettings();
    if (settings["comm_translation_enabled"] === "off")
      return res.status(403).json({ error: "Translation is disabled" });

    const withinLimit = await checkAiDailyLimit(req.user.userId, settings);
    if (!withinLimit) return res.status(429).json({ error: "Daily AI usage limit reached" });

    const translated = await translateMessage(text, targetLang, req.user.userId);
    res.json({ data: { translated } });
  } catch (_e) {
    res.status(500).json({ error: "Translation failed" });
  }
  return;
});

router.post("/compose-assist", async (req: CommRequest, res) => {
  try {
    const { intent, language } = req.body;
    if (!intent) return res.status(400).json({ error: "intent is required" });

    const settings = await getCachedSettings();
    if (settings["comm_chat_assist_enabled"] === "off")
      return res.status(403).json({ error: "Chat assist is disabled" });

    const withinLimit = await checkAiDailyLimit(req.user.userId, settings);
    if (!withinLimit) return res.status(429).json({ error: "Daily AI usage limit reached" });

    const composed = await composeMessage(intent, language || "english", req.user.userId);
    res.json({ data: { message: composed } });
  } catch (_e) {
    res.status(500).json({ error: "Compose failed" });
  }
  return;
});

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "audio/webm",
      "audio/ogg",
      "audio/mp4",
      "audio/mpeg",
      "audio/wav",
      "audio/opus",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post(
  "/voice-notes/upload",
  voiceUpload.single("audio") as unknown as import("express").RequestHandler,
  async (req: CommRequest, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

      const settings = await getCachedSettings();
      if (settings["comm_voice_notes_enabled"] === "off")
        return res.status(403).json({ error: "Voice notes are disabled" });

      const maxDuration = parseInt(settings["comm_max_voice_duration"] || "60", 10);
      const duration = parseInt(req.body.duration || "0", 10);
      if (duration > maxDuration)
        return res
          .status(400)
          .json({ error: `Voice note exceeds maximum duration of ${maxDuration}s` });

      await mkdir(VOICE_NOTES_DIR, { recursive: true });

      const ext = req.file.mimetype.split("/")[1] || "webm";
      const fileName = `${generateId()}.${ext}`;
      const filePath = path.join(VOICE_NOTES_DIR, fileName);
      await writeFile(filePath, req.file.buffer);

      const voiceNoteUrl = `/uploads/voice-notes/${fileName}`;

      let transcript = "";
      try {
        const withinLimit = await checkAiDailyLimit(req.user.userId, settings);
        if (withinLimit) {
          transcript = await transcribeAudio(req.file.buffer, ext);
        }
      } catch (e) {
        logger.warn(
          { err: e },
          "[comm] Voice note transcription failed — continuing without transcript"
        );
      }

      let isFlagged = false;
      let flagReason: string | null = null;
      let maskedTranscript = transcript;
      if (transcript) {
        const modConfig = getModerationConfigFromSettings(settings);
        const modResult = moderateContent(transcript, modConfig);
        maskedTranscript = modResult.masked;
        if (modConfig.flagKeywords?.length) {
          const keyword = checkFlagKeywords(modResult.original, modConfig.flagKeywords);
          if (keyword) {
            isFlagged = true;
            flagReason = `Auto-flagged voice note keyword: ${keyword}`;
          }
        }
      }

      const waveform = req.body.waveform || null;

      res.json({
        data: {
          voiceNoteUrl,
          transcript: maskedTranscript,
          duration,
          waveform,
          isFlagged,
          flagReason,
        },
      });
    } catch (e) {
      logger.error({ err: e }, "[comm] Voice note upload failed");
      res.status(500).json({ error: "Failed to upload voice note" });
    }
    return;
  }
);

interface IceServer {
  urls: string;
  username?: string;
  credential?: string;
}

function getIceServersFromSettings(settings: Record<string, string>): IceServer[] {
  const stunRaw =
    settings["comm_stun_servers"] || "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302";
  const turnServer = settings["comm_turn_server"] || "";
  const turnUser = settings["comm_turn_user"] || "";
  const turnPass = settings["comm_turn_pass"] || "";

  let stunList: string[] = [];
  try {
    const parsed = JSON.parse(stunRaw);
    if (Array.isArray(parsed)) {
      stunList = parsed.filter((s: unknown) => typeof s === "string" && s.trim());
    } else {
      stunList = stunRaw
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  } catch (err) {
    logger.error(
      {
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      },
      "[route] unhandled error"
    );
    stunList = stunRaw
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }

  if (stunList.length === 0) {
    stunList = ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"];
  }
  const iceServers: IceServer[] = stunList.map((s: string) => ({ urls: s }));
  if (turnServer) {
    iceServers.push({ urls: turnServer, username: turnUser, credential: turnPass });
  }
  return iceServers;
}

router.post("/calls/initiate", async (req: CommRequest, res) => {
  try {
    const { calleeId, conversationId } = req.body;
    if (!calleeId) return res.status(400).json({ error: "calleeId is required" });

    const settings = await getCachedSettings();
    const userId = req.user.userId;

    const check = await canCommunicate(userId, calleeId, "voiceCall", settings);
    if (!check.allowed) return res.status(403).json({ error: check.reason });

    const [conv] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.status, "active"),
          or(
            and(
              eq(conversationsTable.participant1Id, userId),
              eq(conversationsTable.participant2Id, calleeId)
            ),
            and(
              eq(conversationsTable.participant1Id, calleeId),
              eq(conversationsTable.participant2Id, userId)
            )
          )
        )
      )
      .limit(1);
    if (!conv)
      return res
        .status(403)
        .json({ error: "You must have an accepted conversation to call this user" });

    const callId = generateId();
    await db.insert(callLogsTable).values({
      id: callId,
      callerId: userId,
      calleeId,
      conversationId: conversationId || conv.id,
      status: "initiated",
    });

    const [caller] = await db
      .select({ name: usersTable.name, ajkId: usersTable.ajkId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId))
      .limit(1);

    const io = getIO();
    if (io) {
      io.to(`user:${calleeId}`).emit("comm:call:incoming", {
        callId,
        callerId: req.user.userId,
        callerName: caller?.name || "Unknown",
        callerAjkId: caller?.ajkId || "",
      });
    }

    emitDashboardUpdate().catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[comm] emitDashboardUpdate after call initiation failed"
      );
    });
    res.json({
      data: {
        callId,
        iceServers: getIceServersFromSettings(settings),
        trickleIce: settings["comm_trickle_ice_enabled"] !== "off",
      },
    });
  } catch (e) {
    logger.error({ err: e }, "[comm] Failed to initiate call");
    res.status(500).json({ error: "Failed to initiate call" });
  }
  return;
});

router.get("/calls/:id/ice-config", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const userId = req.user.userId;
    const [call] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, id)).limit(1);
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (call.calleeId !== userId && call.callerId !== userId)
      return res.status(403).json({ error: "Not a participant of this call" });

    const settings = await getCachedSettings();
    res.json({
      data: {
        iceServers: getIceServersFromSettings(settings),
        trickleIce: settings["comm_trickle_ice_enabled"] !== "off",
      },
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to get ICE config" });
  }
  return;
});

router.post("/calls/:id/answer", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const userId = req.user.userId;
    const [call] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, id)).limit(1);
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (call.calleeId !== userId && call.callerId !== userId)
      return res.status(403).json({ error: "Not a participant of this call" });

    await db
      .update(callLogsTable)
      .set({ status: "answered", startedAt: new Date() })
      .where(eq(callLogsTable.id, id));

    const io = getIO();
    if (io) {
      io.to(`user:${call.callerId}`).emit("comm:call:answered", { callId: id });
    }

    const settings = await getCachedSettings();
    res.json({
      data: {
        status: "answered",
        iceServers: getIceServersFromSettings(settings),
        trickleIce: settings["comm_trickle_ice_enabled"] !== "off",
      },
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to answer call" });
  }
  return;
});

router.post("/calls/:id/end", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const userId = req.user.userId;
    const { duration } = req.body;

    const [call] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, id)).limit(1);
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (call.calleeId !== userId && call.callerId !== userId)
      return res.status(403).json({ error: "Not a participant of this call" });

    const finalStatus = call.status === "answered" ? "completed" : "missed";
    await db
      .update(callLogsTable)
      .set({
        status: finalStatus,
        endedAt: new Date(),
        duration: duration || null,
      })
      .where(eq(callLogsTable.id, id));

    const otherId = call.callerId === userId ? call.calleeId : call.callerId;
    const io = getIO();
    if (io) {
      io.to(`user:${otherId}`).emit("comm:call:ended", { callId: id, status: finalStatus });
    }

    res.json({ data: { status: finalStatus } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to end call" });
  }
  return;
});

router.post("/calls/:id/reject", async (req: CommRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const userId = req.user.userId;
    const [call] = await db.select().from(callLogsTable).where(eq(callLogsTable.id, id)).limit(1);
    if (!call) return res.status(404).json({ error: "Call not found" });
    if (call.calleeId !== userId && call.callerId !== userId)
      return res.status(403).json({ error: "Not a participant of this call" });

    await db
      .update(callLogsTable)
      .set({ status: "rejected", endedAt: new Date() })
      .where(eq(callLogsTable.id, id));

    const io = getIO();
    if (io) {
      io.to(`user:${call.callerId}`).emit("comm:call:rejected", { callId: id });
    }

    res.json({ data: { status: "rejected" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to reject call" });
  }
  return;
});

router.get("/calls/history", async (req: CommRequest, res) => {
  try {
    const userId = req.user.userId;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;

    const calls = await db
      .select()
      .from(callLogsTable)
      .where(or(eq(callLogsTable.callerId, userId), eq(callLogsTable.calleeId, userId)))
      .orderBy(desc(callLogsTable.startedAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(calls.flatMap((c) => [c.callerId, c.calleeId]))];
    const users =
      userIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, ajkId: usersTable.ajkId })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(ARRAY[${sql.join(
                userIds.map((id) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      data: calls.map((c) => ({
        ...c,
        caller: userMap[c.callerId] || null,
        callee: userMap[c.calleeId] || null,
        direction: c.callerId === userId ? "outgoing" : "incoming",
      })),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to get call history" });
  }
});

/* ── POST /communication/block — Block a user ── */
router.post("/block", async (req: CommRequest, res: Response) => {
  try {
    const userId = req.user.userId;
    const { blockedUserId } = req.body as { blockedUserId?: string };
    if (!blockedUserId || typeof blockedUserId !== "string") {
      res.status(400).json({ error: "blockedUserId required" });
      return;
    }
    try {
      await db.execute(sql`
      CREATE TABLE IF NOT EXISTS communication_user_blocks (
        id TEXT PRIMARY KEY,
        blocker_id TEXT NOT NULL,
        blocked_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(blocker_id, blocked_id)
      )
    `);
      await db.execute(sql`
      INSERT INTO communication_user_blocks (id, blocker_id, blocked_id)
      VALUES (${generateId()}, ${userId}, ${blockedUserId})
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `);
      res.json({ data: { blocked: true } });
    } catch (e: unknown) {
      logger.error({ err: e }, "[comm] block failed");
      res.status(500).json({ error: "Failed to block user" });
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

/* ── POST /communication/report — Report a user ── */
router.post("/report", async (req: CommRequest, res: Response) => {
  try {
    const userId = req.user.userId;
    const { reportedUserId, reason, messageId } = req.body as {
      reportedUserId?: string;
      reason?: string;
      messageId?: string;
    };
    if (!reportedUserId || !reason) {
      res.status(400).json({ error: "reportedUserId and reason required" });
      return;
    }
    try {
      await db.insert(chatReportsTable).values({
        id: generateId(),
        reporterId: userId,
        reportedUserId,
        messageId: messageId ?? null,
        reason: String(reason).slice(0, 500),
        status: "pending",
        createdAt: new Date(),
      });
      res.json({ data: { reported: true } });
    } catch (e: unknown) {
      logger.error({ err: e }, "[comm] report failed");
      res.status(500).json({ error: "Failed to report user" });
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

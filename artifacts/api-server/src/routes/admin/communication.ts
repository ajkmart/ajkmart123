import { db } from "@workspace/db";
import {
  aiModerationLogsTable,
  callLogsTable,
  chatMessagesTable,
  communicationFlagsTable,
  communicationRolesTable,
  conversationsTable,
  platformSettingsTable,
  usersTable,
} from "@workspace/db/schema";
import { and, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { Router } from "express";
import { generateId } from "../../lib/id.js";
import { logger } from "../../lib/logger.js";
import { getIO } from "../../lib/socketio.js";
import { generateRoleTemplate } from "../../services/communicationAI.js";

const router = Router();

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
    logger.warn({ err: e }, "[admin/comm] Failed to emit dashboard update");
  }
}

router.get("/communication/dashboard", async (_req, res) => {
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

    res.json({
      data: {
        activeConversations: Number(convCount?.count ?? 0),
        messagesToday: Number(msgCount?.count ?? 0),
        callsToday: Number(callCount?.count ?? 0),
        voiceNotesToday: Number(voiceNoteCount?.count ?? 0),
        flaggedMessages: Number(flagCount?.count ?? 0),
        aiUsageToday: Number(aiCount?.count ?? 0),
      },
    });
  } catch (e) {
    logger.error({ err: e }, "[admin/comm] Dashboard query failed");
    res.status(500).json({ error: "Failed to load dashboard" });
  }
});

router.get("/communication/conversations", async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";

    let conversations;
    let totalCount;
    if (search) {
      const searchUsers = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(
          or(
            sql`${usersTable.ajkId} ILIKE ${"%" + search + "%"}`,
            sql`${usersTable.name} ILIKE ${"%" + search + "%"}`
          )
        )
        .limit(20);
      const userIds = searchUsers.map((u) => u.id);

      if (userIds.length === 0) {
        return res.json({ data: [], total: 0 });
      }

      conversations = await db
        .select()
        .from(conversationsTable)
        .where(
          or(
            sql`${conversationsTable.participant1Id} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`,
            sql`${conversationsTable.participant2Id} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`
          )
        )
        .orderBy(desc(conversationsTable.lastMessageAt))
        .limit(limit)
        .offset(offset);

      const [tc] = await db
        .select({ count: count() })
        .from(conversationsTable)
        .where(
          or(
            sql`${conversationsTable.participant1Id} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`,
            sql`${conversationsTable.participant2Id} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `
            )}]::text[])`
          )
        );
      totalCount = tc;
    } else {
      conversations = await db
        .select()
        .from(conversationsTable)
        .orderBy(desc(conversationsTable.lastMessageAt))
        .limit(limit)
        .offset(offset);

      const [tc] = await db.select({ count: count() }).from(conversationsTable);
      totalCount = tc;
    }

    const allUserIds = [
      ...new Set(conversations.flatMap((c) => [c.participant1Id, c.participant2Id])),
    ];
    const users =
      allUserIds.length > 0
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
                allUserIds.map((id) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      data: conversations.map((c) => ({
        ...c,
        participant1: userMap[c.participant1Id] || null,
        participant2: userMap[c.participant2Id] || null,
      })),
      total: Number(totalCount?.count ?? 0),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list conversations" });
  }
  return;
});

router.get("/communication/conversations/:id/messages", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);
    const offset = (page - 1) * limit;

    const messages = await db
      .select()
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.conversationId, id))
      .orderBy(desc(chatMessagesTable.createdAt))
      .limit(limit)
      .offset(offset);

    const senderIds = [...new Set(messages.map((m) => m.senderId))];
    const users =
      senderIds.length > 0
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, ajkId: usersTable.ajkId })
            .from(usersTable)
            .where(
              sql`${usersTable.id} = ANY(ARRAY[${sql.join(
                senderIds.map((id) => sql`${id}`),
                sql`, `
              )}]::text[])`
            )
        : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u]));

    res.json({
      data: messages.reverse().map((m) => ({
        ...m,
        content: m.content,
        originalContent: m.originalContent || null,
        sender: userMap[m.senderId] || null,
      })),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to get messages" });
  }
});

router.get("/communication/calls", async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;

    const calls = await db
      .select()
      .from(callLogsTable)
      .orderBy(desc(callLogsTable.startedAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(calls.flatMap((c) => [c.callerId, c.calleeId]))];
    const users =
      userIds.length > 0
        ? await db
            .select({
              id: usersTable.id,
              name: usersTable.name,
              ajkId: usersTable.ajkId,
              roles: usersTable.roles,
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

    const [totalCount] = await db.select({ count: count() }).from(callLogsTable);

    res.json({
      data: calls.map((c) => ({
        ...c,
        caller: userMap[c.callerId] || null,
        callee: userMap[c.calleeId] || null,
      })),
      total: Number(totalCount?.count ?? 0),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list calls" });
  }
});

router.get("/communication/ai-logs", async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;

    const logs = await db
      .select()
      .from(aiModerationLogsTable)
      .orderBy(desc(aiModerationLogsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const userIds = [...new Set(logs.map((l) => l.userId))];
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

    const [totalCount] = await db.select({ count: count() }).from(aiModerationLogsTable);

    res.json({
      data: logs.map((l) => ({
        ...l,
        user: userMap[l.userId] || null,
      })),
      total: Number(totalCount?.count ?? 0),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list AI logs" });
  }
});

router.get("/communication/flags", async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;
    const status = (req.query.status as string) || "pending";

    const condition =
      status === "resolved"
        ? sql`${communicationFlagsTable.resolvedAt} IS NOT NULL`
        : sql`${communicationFlagsTable.resolvedAt} IS NULL`;

    const flags = await db
      .select()
      .from(communicationFlagsTable)
      .where(condition)
      .orderBy(desc(communicationFlagsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const messageIds = flags.map((f) => f.messageId).filter(Boolean) as string[];
    let messages: (typeof chatMessagesTable.$inferSelect)[] = [];
    if (messageIds.length > 0) {
      messages = await db
        .select()
        .from(chatMessagesTable)
        .where(
          sql`${chatMessagesTable.id} = ANY(ARRAY[${sql.join(
            messageIds.map((id) => sql`${id}`),
            sql`, `
          )}]::text[])`
        );
    }
    const msgMap = Object.fromEntries(messages.map((m) => [m.id, m]));

    res.json({
      data: flags.map((f) => ({
        ...f,
        message: f.messageId ? msgMap[f.messageId] || null : null,
      })),
    });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list flags" });
  }
});

router.patch("/communication/flags/:id/resolve", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const adminId =
      (req as import("../admin-shared.js").AdminRequest).adminPayload?.adminId || null;
    await db
      .update(communicationFlagsTable)
      .set({
        resolvedAt: new Date(),
        reviewedByAdminId: adminId,
      })
      .where(eq(communicationFlagsTable.id, id));
    emitDashboardUpdate().catch((err: unknown) => {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "[communication] emitDashboardUpdate after flag resolve failed"
      );
    });
    res.json({ data: { status: "resolved" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to resolve flag" });
  }
});

router.get("/communication/roles", async (_req, res) => {
  try {
    const roles = await db
      .select()
      .from(communicationRolesTable)
      .orderBy(desc(communicationRolesTable.createdAt));
    res.json({ data: roles });
  } catch (_e) {
    res.status(500).json({ error: "Failed to list roles" });
  }
});

router.post("/communication/roles", async (req, res) => {
  try {
    const {
      name,
      description,
      permissions,
      rolePairRules,
      categoryRules,
      timeWindows,
      messageLimits,
      isPreset,
    } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });

    const id = generateId();
    await db.insert(communicationRolesTable).values({
      id,
      name,
      description: description || null,
      permissions: permissions || null,
      rolePairRules: rolePairRules || null,
      categoryRules: categoryRules || null,
      timeWindows: timeWindows || null,
      messageLimits: messageLimits || null,
      isPreset: isPreset || false,
    });

    res.status(201).json({ data: { id } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to create role" });
  }
  return;
});

router.put("/communication/roles/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const {
      name,
      description,
      permissions,
      rolePairRules,
      categoryRules,
      timeWindows,
      messageLimits,
    } = req.body;

    await db
      .update(communicationRolesTable)
      .set({
        name,
        description,
        permissions,
        rolePairRules,
        categoryRules,
        timeWindows,
        messageLimits,
        updatedAt: new Date(),
      })
      .where(eq(communicationRolesTable.id, id));

    res.json({ data: { status: "updated" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.delete("/communication/roles/:id", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    await db.delete(communicationRolesTable).where(eq(communicationRolesTable.id, id));
    res.json({ data: { status: "deleted" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to delete role" });
  }
});

router.get("/communication/roles/ai-status", async (_req, res) => {
  try {
    const available = !!process.env["GEMINI_API_KEY"];
    res.json({ data: { available, provider: available ? "gemini" : null } });
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

router.post("/communication/roles/ai-generate", async (req, res) => {
  try {
    const { description } = req.body as Record<string, unknown>;
    if (!description) return res.status(400).json({ error: "Description is required" });

    const adminId =
      (req as import("../admin-shared.js").AdminRequest).adminPayload?.adminId || "admin";
    const template = await generateRoleTemplate(String(description), adminId);
    res.json({ data: template });
  } catch (_e) {
    res.status(500).json({ error: "Failed to generate role template" });
  }
  return;
});

router.post("/communication/users/:id/block", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    await db
      .update(usersTable)
      .set({ commBlocked: true, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
    res.json({ data: { status: "blocked" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to block user" });
  }
});

router.post("/communication/users/:id/unblock", async (req, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    await db
      .update(usersTable)
      .set({ commBlocked: false, updatedAt: new Date() })
      .where(eq(usersTable.id, id));
    res.json({ data: { status: "unblocked" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

router.get("/communication/settings", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.category, "communication"));
    res.json({ data: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
  } catch (_e) {
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/communication/settings", async (req, res) => {
  try {
    const settings = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(settings)) {
      await db
        .insert(platformSettingsTable)
        .values({
          key,
          value: String(value),
          label: key.replace(/^comm_/, "").replace(/_/g, " "),
          category: "communication",
        })
        .onConflictDoUpdate({
          target: platformSettingsTable.key,
          set: { value: String(value), updatedAt: new Date() },
        });
    }
    res.json({ data: { status: "updated" } });
  } catch (_e) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.get("/communication/ajk-ids", async (req, res) => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "20", 10), 50);
    const offset = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const role = (req.query.role as string) || "";

    let condition = sql`${usersTable.ajkId} IS NOT NULL`;
    if (search) {
      condition = sql`(${usersTable.ajkId} ILIKE ${"%" + search + "%"} OR ${usersTable.name} ILIKE ${"%" + search + "%"} OR ${usersTable.phone} ILIKE ${"%" + search + "%"})`;
    }

    const filterCondition = role
      ? and(condition, sql`${usersTable.roles}::text ILIKE ${"%" + role + "%"}`)
      : condition;

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        roles: usersTable.roles,
        ajkId: usersTable.ajkId,
        commBlocked: usersTable.commBlocked,
      })
      .from(usersTable)
      .where(and(filterCondition, isNull(usersTable.deletedAt)))
      .orderBy(desc(usersTable.createdAt))
      .limit(limit)
      .offset(offset);

    const [total] = await db
      .select({ count: count() })
      .from(usersTable)
      .where(and(filterCondition, isNull(usersTable.deletedAt)));

    res.json({ data: users, total: Number(total?.count ?? 0) });
  } catch (e) {
    logger.error({ err: e }, "[admin/comm] AJK IDs query failed");
    res.status(500).json({ error: "Failed to list AJK IDs" });
  }
});

router.put("/communication/ajk-ids/:userId", async (req, res) => {
  try {
    const { userId } = req.params as Record<string, string>;
    const { ajkId } = req.body;
    if (!ajkId || typeof ajkId !== "string")
      return res.status(400).json({ error: "ajkId is required" });

    const cleaned = ajkId.trim().toUpperCase();
    if (cleaned.length < 3 || cleaned.length > 20)
      return res.status(400).json({ error: "AJK ID must be 3-20 characters" });
    if (!/^[A-Z0-9\-]+$/.test(cleaned))
      return res
        .status(400)
        .json({ error: "AJK ID can only contain letters, numbers, and hyphens" });

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.ajkId, cleaned), sql`${usersTable.id} != ${userId}`))
      .limit(1);
    if (existing)
      return res.status(409).json({ error: "This AJK ID is already taken by another user" });

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });

    await db
      .update(usersTable)
      .set({ ajkId: cleaned, updatedAt: new Date() })
      .where(eq(usersTable.id, userId));
    res.json({ data: { ajkId: cleaned } });
  } catch (e) {
    logger.error({ err: e }, "[admin/comm] AJK ID update failed");
    res.status(500).json({ error: "Failed to update AJK ID" });
  }
  return;
});

router.get("/communication/users/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (q.length < 2) return res.json({ data: [] });

    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        phone: usersTable.phone,
        roles: usersTable.roles,
        ajkId: usersTable.ajkId,
      })
      .from(usersTable)
      .where(
        or(
          sql`${usersTable.name} ILIKE ${"%" + q + "%"}`,
          sql`${usersTable.phone} ILIKE ${"%" + q + "%"}`,
          sql`${usersTable.ajkId} ILIKE ${"%" + q + "%"}`
        )
      )
      .limit(20);

    res.json({ data: users });
  } catch (_e) {
    res.status(500).json({ error: "Failed to search users" });
  }
  return;
});

router.get("/communication/export/:type", async (req, res) => {
  try {
    const { type } = req.params as Record<string, string>;
    let rows: Record<string, unknown>[] = [];
    let defaultHeaders: string[] = [];

    if (type === "messages") {
      rows = await db
        .select()
        .from(chatMessagesTable)
        .orderBy(desc(chatMessagesTable.createdAt))
        .limit(1000);
      defaultHeaders = [
        "id",
        "conversationId",
        "senderId",
        "content",
        "messageType",
        "deliveryStatus",
        "isFlagged",
        "createdAt",
      ];
    } else if (type === "calls") {
      rows = await db
        .select()
        .from(callLogsTable)
        .orderBy(desc(callLogsTable.startedAt))
        .limit(1000);
      defaultHeaders = ["id", "callerId", "calleeId", "status", "duration", "startedAt", "endedAt"];
    } else if (type === "ai-logs") {
      rows = await db
        .select()
        .from(aiModerationLogsTable)
        .orderBy(desc(aiModerationLogsTable.createdAt))
        .limit(1000);
      defaultHeaders = [
        "id",
        "userId",
        "actionType",
        "inputText",
        "outputText",
        "tokensUsed",
        "createdAt",
      ];
    } else {
      return res.status(400).json({ error: "Invalid export type" });
    }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : defaultHeaders;
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const val = (r as Record<string, unknown>)[h];
            if (val == null || val === undefined) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          })
          .join(",")
      ),
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=communication_${type}_${Date.now()}.csv`
    );
    res.send(csv);
  } catch (_e) {
    res.status(500).json({ error: "Failed to export data" });
  }
  return;
});

export { emitDashboardUpdate };
export default router;

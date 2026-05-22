import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const communicationRequestsTable = pgTable(
  "communication_requests",
  {
    id: text("id").primaryKey(),
    senderId: text("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    receiverId: text("receiver_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("comm_req_sender_idx").on(t.senderId),
    index("comm_req_receiver_idx").on(t.receiverId),
    index("comm_req_status_idx").on(t.status),
  ]
);

export const conversationsTable = pgTable(
  "comm_conversations",
  {
    id: text("id").primaryKey(),
    participant1Id: text("participant1_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    participant2Id: text("participant2_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("direct"),
    status: text("status").notNull().default("active"),
    contextType: text("context_type"),
    contextId: text("context_id"),
    lastMessageAt: timestamp("last_message_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("conv_p1_idx").on(t.participant1Id),
    index("conv_p2_idx").on(t.participant2Id),
    index("conv_status_idx").on(t.status),
    index("conv_last_msg_idx").on(t.lastMessageAt),
  ]
);

export const chatMessagesTable = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    content: text("content"),
    originalContent: text("original_content"),
    translatedContent: text("translated_content"),
    messageType: text("message_type").notNull().default("text"),
    voiceNoteUrl: text("voice_note_url"),
    voiceNoteTranscript: text("voice_note_transcript"),
    voiceNoteDuration: integer("voice_note_duration"),
    voiceNoteWaveform: text("voice_note_waveform"),
    imageUrl: text("image_url"),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    fileSize: integer("file_size"),
    deliveryStatus: text("delivery_status").notNull().default("sent"),
    readAt: timestamp("read_at"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    isFlagged: boolean("is_flagged").notNull().default(false),
    flagReason: text("flag_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("msg_conv_idx").on(t.conversationId),
    index("msg_sender_idx").on(t.senderId),
    index("msg_created_idx").on(t.createdAt),
    index("msg_delivery_idx").on(t.deliveryStatus),
  ]
);

export const callLogsTable = pgTable(
  "call_logs",
  {
    id: text("id").primaryKey(),
    callerId: text("caller_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    calleeId: text("callee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversationsTable.id, {
      onDelete: "set null",
    }),
    duration: integer("duration"),
    status: text("status").notNull().default("initiated"),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    endedAt: timestamp("ended_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("call_caller_idx").on(t.callerId),
    index("call_callee_idx").on(t.calleeId),
    index("call_status_idx").on(t.status),
    index("call_started_idx").on(t.startedAt),
  ]
);

export const communicationRolesTable = pgTable("communication_roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  permissions: jsonb("permissions"),
  rolePairRules: jsonb("role_pair_rules"),
  categoryRules: jsonb("category_rules"),
  timeWindows: jsonb("time_windows"),
  messageLimits: jsonb("message_limits"),
  isPreset: boolean("is_preset").notNull().default(false),
  createdByAI: boolean("created_by_ai").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const communicationFlagsTable = pgTable(
  "communication_flags",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").references(() => chatMessagesTable.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    keyword: text("keyword"),
    reviewedByAdminId: text("reviewed_by_admin_id"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("flag_msg_idx").on(t.messageId), index("flag_resolved_idx").on(t.resolvedAt)]
);

export const aiModerationLogsTable = pgTable(
  "ai_moderation_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    actionType: text("action_type").notNull(),
    inputText: text("input_text"),
    outputText: text("output_text"),
    tokensUsed: integer("tokens_used"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ai_log_user_idx").on(t.userId),
    index("ai_log_type_idx").on(t.actionType),
    index("ai_log_created_idx").on(t.createdAt),
  ]
);

export type CommunicationRequest = typeof communicationRequestsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
export type CallLog = typeof callLogsTable.$inferSelect;
export type CommunicationRole = typeof communicationRolesTable.$inferSelect;
export type CommunicationFlag = typeof communicationFlagsTable.$inferSelect;
export type AiModerationLog = typeof aiModerationLogsTable.$inferSelect;

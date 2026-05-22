import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const conditionTypeEnum = pgEnum("condition_type", [
  "warning_l1",
  "warning_l2",
  "warning_l3",
  "restriction_service_block",
  "restriction_wallet_freeze",
  "restriction_promo_block",
  "restriction_order_cap",
  "restriction_review_block",
  "restriction_cash_only",
  "restriction_new_order_block",
  "restriction_rate_limit",
  "restriction_pending_review_gate",
  "restriction_device_restriction",
  "suspension_temporary",
  "suspension_extended",
  "suspension_pending_review",
  "ban_soft",
  "ban_hard",
  "ban_fraud",
]);
export const conditionSeverityEnum = pgEnum("condition_severity", [
  "warning",
  "restriction_normal",
  "restriction_strict",
  "suspension",
  "ban",
]);
export const conditionModeEnum = pgEnum("condition_mode", ["default", "ai_recommended", "custom"]);

export const accountConditionsTable = pgTable(
  "account_conditions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    userRole: text("user_role").notNull(),
    conditionType: conditionTypeEnum("condition_type").notNull(),
    severity: conditionSeverityEnum("severity").notNull(),
    category: text("category").notNull(),
    reason: text("reason").notNull(),
    notes: text("notes"),
    appliedBy: text("applied_by"),
    appliedAt: timestamp("applied_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at"),
    liftedAt: timestamp("lifted_at"),
    liftedBy: text("lifted_by"),
    liftReason: text("lift_reason"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ac_u_idx").on(t.userId), index("ac_t_idx").on(t.conditionType)]
);

export const conditionRulesTable = pgTable("condition_rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  targetRole: text("target_role").notNull(),
  metric: text("metric").notNull(),
  operator: text("operator").notNull(),
  threshold: text("threshold").notNull(),
  conditionType: conditionTypeEnum("condition_type").notNull(),
  severity: conditionSeverityEnum("severity").notNull(),
  cooldownHours: integer("cooldown_hours").notNull().default(24),
  modeApplicability: text("mode_applicability").notNull().default("default,ai_recommended,custom"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const conditionSettingsTable = pgTable("condition_settings", {
  id: text("id").primaryKey(),
  mode: conditionModeEnum("mode").notNull().default("default"),
  customThresholds: jsonb("custom_thresholds"),
  aiParameters: jsonb("ai_parameters"),
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAccountConditionSchema = createInsertSchema(accountConditionsTable);
export const insertConditionRuleSchema = createInsertSchema(conditionRulesTable);
export const insertConditionSettingSchema = createInsertSchema(conditionSettingsTable);

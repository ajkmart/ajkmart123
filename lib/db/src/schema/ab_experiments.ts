import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const abExperimentsTable = pgTable(
  "ab_experiments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    variants: jsonb("variants").notNull().default([]),
    trafficPct: integer("traffic_pct").notNull().default(100),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("ab_experiments_status_idx").on(t.status)]
);

export const abAssignmentsTable = pgTable(
  "ab_assignments",
  {
    id: text("id").primaryKey(),
    experimentId: text("experiment_id")
      .notNull()
      .references(() => abExperimentsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    variant: text("variant").notNull(),
    converted: boolean("converted").notNull().default(false),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  },
  (t) => [
    index("ab_assignments_experiment_idx").on(t.experimentId),
    index("ab_assignments_user_idx").on(t.userId),
    index("ab_assignments_variant_idx").on(t.variant),
    uniqueIndex("ab_assignments_exp_user_unique").on(t.experimentId, t.userId),
  ]
);

export type AbExperiment = typeof abExperimentsTable.$inferSelect;
export type AbAssignment = typeof abAssignmentsTable.$inferSelect;

import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

/**
 * RBAC (fine-grained permission) tables.
 * Coexists with the legacy `admin_accounts.role` enum and CSV
 * `admin_accounts.permissions`. New code reads from these tables.
 */

export const permissionsTable = pgTable("rbac_permissions", {
  id: text("id").primaryKey(), // e.g. "orders.refund"
  label: text("label").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const rolesTable = pgTable("rbac_roles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(), // "super_admin", "support_admin"
  name: text("name").notNull(),
  description: text("description"),
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const rolePermissionsTable = pgTable(
  "rbac_role_permissions",
  {
    roleId: text("role_id").notNull(),
    permissionId: text("permission_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
    roleIdx: index("rbac_role_permissions_role_idx").on(t.roleId),
  })
);

export const adminRoleAssignmentsTable = pgTable(
  "rbac_admin_role_assignments",
  {
    adminId: text("admin_id").notNull(),
    roleId: text("role_id").notNull(),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.adminId, t.roleId] }),
    adminIdx: index("rbac_admin_role_assignments_admin_idx").on(t.adminId),
  })
);

/** Vendor / rider staff role assignments (multi-staff accounts). */
export const userRoleAssignmentsTable = pgTable(
  "rbac_user_role_assignments",
  {
    userId: text("user_id").notNull(),
    roleId: text("role_id").notNull(),
    scopeType: text("scope_type").notNull().default("global"), // 'global' | 'vendor' | 'rider'
    scopeId: text("scope_id"),
    grantedBy: text("granted_by"),
    grantedAt: timestamp("granted_at").notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId, t.scopeType] }),
    userIdx: index("rbac_user_role_assignments_user_idx").on(t.userId),
  })
);

export type RbacPermission = typeof permissionsTable.$inferSelect;
export type RbacRole = typeof rolesTable.$inferSelect;
export type RbacRolePermission = typeof rolePermissionsTable.$inferSelect;
export type RbacAdminRoleAssignment = typeof adminRoleAssignmentsTable.$inferSelect;
export type RbacUserRoleAssignment = typeof userRoleAssignmentsTable.$inferSelect;

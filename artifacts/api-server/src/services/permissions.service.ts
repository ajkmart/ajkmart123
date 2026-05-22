/**
 * permissions.service.ts — RBAC service layer.
 *
 * CRUD on roles/role-permissions/admin-role-assignments and helpers
 * used by middleware (`requirePermission`) and the JWT signer.
 */
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  PERMISSION_IDS,
  compactPermissions,
  isPermissionId,
  type PermissionId,
} from "@workspace/auth-utils/permissions";
import { db } from "@workspace/db";
import {
  adminAccountsTable,
  adminRoleAssignmentsTable,
  permissionsTable,
  rolePermissionsTable,
  rolesTable,
  userRoleAssignmentsTable,
  type RbacRole,
} from "@workspace/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { generateId } from "../lib/id.js";

const SUPER_ADMIN_SLUG = "super_admin";

/* ── Catalog seeding ─────────────────────────────────────────────── */

export async function seedPermissionCatalog(): Promise<void> {
  for (const p of PERMISSIONS) {
    await db
      .insert(permissionsTable)
      .values({ id: p.id, label: p.label, category: p.category, description: null })
      .onConflictDoUpdate({
        target: permissionsTable.id,
        set: { label: p.label, category: p.category },
      });
  }
}

/**
 * Stable 64-bit advisory-lock key for the built-in role seeder. Picked
 * once and never changed so concurrent API instances always contend for
 * the same lock. The literal must fit in a signed bigint.
 */
const SEED_DEFAULT_ROLES_LOCK_KEY = 7426193845012345678n;

export async function seedDefaultRoles(): Promise<void> {
  // Serialize seeding across concurrent API instances. Without this, two
  // workers booting at once both run delete-then-insert against
  // rbac_role_permissions and one of them races into a duplicate-key
  // error on the primary key. The transaction-scoped advisory lock is
  // released automatically on COMMIT/ROLLBACK.
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${SEED_DEFAULT_ROLES_LOCK_KEY})`);

    for (const [slug, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      let [row] = await tx.select().from(rolesTable).where(eq(rolesTable.slug, slug)).limit(1);
      if (!row) {
        const id = `role_${generateId()}`;
        await tx.insert(rolesTable).values({
          id,
          slug,
          name: slugToName(slug),
          description: `Default ${slugToName(slug)} role`,
          isBuiltIn: true,
        });
        row = {
          id,
          slug,
          name: slugToName(slug),
          description: null,
          isBuiltIn: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as RbacRole;
      } else if (!row.isBuiltIn) {
        await tx.update(rolesTable).set({ isBuiltIn: true }).where(eq(rolesTable.id, row.id));
      }

      // Replace permissions for built-in roles to keep them in sync with the catalog.
      // Belt-and-suspenders: onConflictDoNothing keeps the insert idempotent even
      // if some other path inserted the same (role,permission) pair concurrently.
      await tx.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, row.id));
      if (perms.length > 0) {
        await tx
          .insert(rolePermissionsTable)
          .values(perms.map((pid) => ({ roleId: row!.id, permissionId: pid })))
          .onConflictDoNothing();
      }
    }
  });
}

function slugToName(slug: string): string {
  return slug.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Backfill: ensure every existing admin has at least super_admin ── */
export async function backfillAdminRoleAssignments(): Promise<void> {
  const [superRole] = await db
    .select()
    .from(rolesTable)
    .where(eq(rolesTable.slug, SUPER_ADMIN_SLUG))
    .limit(1);
  if (!superRole) return;
  const admins = await db
    .select({ id: adminAccountsTable.id, role: adminAccountsTable.role })
    .from(adminAccountsTable);
  for (const a of admins) {
    const existing = await db
      .select()
      .from(adminRoleAssignmentsTable)
      .where(eq(adminRoleAssignmentsTable.adminId, a.id))
      .limit(1);
    if (existing.length === 0 && a.role === "super") {
      await db
        .insert(adminRoleAssignmentsTable)
        .values({
          adminId: a.id,
          roleId: superRole.id,
          grantedBy: "system",
        })
        .onConflictDoNothing();
    }
  }
}

/* ── CRUD ─────────────────────────────────────────────────────────── */

export async function listRoles() {
  const rows = await db.select().from(rolesTable).orderBy(rolesTable.slug);
  const perms = await db.select().from(rolePermissionsTable);
  const byRole = new Map<string, string[]>();
  for (const rp of perms) {
    if (!byRole.has(rp.roleId)) byRole.set(rp.roleId, []);
    byRole.get(rp.roleId)!.push(rp.permissionId);
  }
  return rows.map((r) => ({ ...r, permissions: byRole.get(r.id) ?? [] }));
}

export async function getRole(id: string) {
  const [row] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
  if (!row) return null;
  const perms = await db
    .select({ permissionId: rolePermissionsTable.permissionId })
    .from(rolePermissionsTable)
    .where(eq(rolePermissionsTable.roleId, id));
  return { ...row, permissions: perms.map((p) => p.permissionId) };
}

export async function createRole(input: {
  slug: string;
  name: string;
  description?: string;
  permissions?: string[];
}): Promise<RbacRole> {
  const id = `role_${generateId()}`;
  const slug = input.slug.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  await db.insert(rolesTable).values({
    id,
    slug,
    name: input.name,
    description: input.description ?? null,
    isBuiltIn: false,
  });
  if (input.permissions?.length) {
    await setRolePermissions(id, input.permissions);
  }
  const [row] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
  return row!;
}

export async function updateRole(
  id: string,
  input: {
    name?: string;
    description?: string;
  }
): Promise<RbacRole | null> {
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates["name"] = input.name;
  if (input.description !== undefined) updates["description"] = input.description;
  const [row] = await db.update(rolesTable).set(updates).where(eq(rolesTable.id, id)).returning();
  return row ?? null;
}

export async function deleteRole(id: string): Promise<{ deleted: boolean; reason?: string }> {
  const [row] = await db.select().from(rolesTable).where(eq(rolesTable.id, id)).limit(1);
  if (!row) return { deleted: false, reason: "not_found" };
  if (row.isBuiltIn) return { deleted: false, reason: "built_in" };
  await db.delete(adminRoleAssignmentsTable).where(eq(adminRoleAssignmentsTable.roleId, id));
  await db.delete(userRoleAssignmentsTable).where(eq(userRoleAssignmentsTable.roleId, id));
  await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, id));
  await db.delete(rolesTable).where(eq(rolesTable.id, id));
  return { deleted: true };
}

export async function setRolePermissions(roleId: string, permissions: string[]): Promise<string[]> {
  const valid = permissions.filter(isPermissionId);
  await db.delete(rolePermissionsTable).where(eq(rolePermissionsTable.roleId, roleId));
  if (valid.length > 0) {
    await db
      .insert(rolePermissionsTable)
      .values(valid.map((pid) => ({ roleId, permissionId: pid })))
      .onConflictDoNothing();
  }
  await db.update(rolesTable).set({ updatedAt: new Date() }).where(eq(rolesTable.id, roleId));
  return valid;
}

/* ── Admin role assignments ───────────────────────────────────────── */

export async function assignRoleToAdmin(
  adminId: string,
  roleId: string,
  grantedBy: string | null
): Promise<void> {
  await db
    .insert(adminRoleAssignmentsTable)
    .values({
      adminId,
      roleId,
      grantedBy: grantedBy ?? null,
    })
    .onConflictDoNothing();
}

export async function revokeRoleFromAdmin(adminId: string, roleId: string): Promise<void> {
  await db
    .delete(adminRoleAssignmentsTable)
    .where(
      and(
        eq(adminRoleAssignmentsTable.adminId, adminId),
        eq(adminRoleAssignmentsTable.roleId, roleId)
      )
    );
}

export async function setAdminRoles(
  adminId: string,
  roleIds: string[],
  grantedBy: string | null
): Promise<void> {
  await db.delete(adminRoleAssignmentsTable).where(eq(adminRoleAssignmentsTable.adminId, adminId));
  if (roleIds.length > 0) {
    await db
      .insert(adminRoleAssignmentsTable)
      .values(roleIds.map((roleId) => ({ adminId, roleId, grantedBy: grantedBy ?? null })))
      .onConflictDoNothing();
  }
}

export async function getAdminRoles(adminId: string) {
  return db
    .select({
      id: rolesTable.id,
      slug: rolesTable.slug,
      name: rolesTable.name,
    })
    .from(adminRoleAssignmentsTable)
    .innerJoin(rolesTable, eq(rolesTable.id, adminRoleAssignmentsTable.roleId))
    .where(eq(adminRoleAssignmentsTable.adminId, adminId));
}

/* ── Effective permissions ────────────────────────────────────────── */

export async function getEffectivePermissionsForAdmin(adminId: string): Promise<string[]> {
  const rows = await db
    .select({ permissionId: rolePermissionsTable.permissionId })
    .from(adminRoleAssignmentsTable)
    .innerJoin(
      rolePermissionsTable,
      eq(rolePermissionsTable.roleId, adminRoleAssignmentsTable.roleId)
    )
    .where(eq(adminRoleAssignmentsTable.adminId, adminId));
  return compactPermissions(rows.map((r) => r.permissionId));
}

export async function getEffectivePermissionsForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ permissionId: rolePermissionsTable.permissionId })
    .from(userRoleAssignmentsTable)
    .innerJoin(
      rolePermissionsTable,
      eq(rolePermissionsTable.roleId, userRoleAssignmentsTable.roleId)
    )
    .where(eq(userRoleAssignmentsTable.userId, userId));
  return compactPermissions(rows.map((r) => r.permissionId));
}

/**
 * Resolve the effective permissions for an admin, honoring legacy roles
 * that don't yet have explicit role-assignments.
 *
 * Strategy:
 *   - If admin has explicit assignments → use them.
 *   - Else if `admin_accounts.role === 'super'` → grant all permissions.
 *   - Else if there's a built-in role whose slug matches the admin's
 *     legacy role string → use that role's permissions.
 *   - Else → empty set (i.e. legacy `requireRole` still works, but
 *     `requirePermission` will deny by default).
 */
export async function resolveAdminPermissions(
  adminId: string | null,
  legacyRole: string | null | undefined
): Promise<PermissionId[]> {
  if (legacyRole === "super") return [...PERMISSION_IDS];
  if (!adminId) return [];

  const explicit = await getEffectivePermissionsForAdmin(adminId);
  if (explicit.length > 0) return explicit as PermissionId[];

  if (legacyRole) {
    const slug = legacyRole === "super" ? "super_admin" : legacyRole;
    const [r] = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.slug, slug))
      .limit(1);
    if (r) {
      const perms = await db
        .select({ permissionId: rolePermissionsTable.permissionId })
        .from(rolePermissionsTable)
        .where(eq(rolePermissionsTable.roleId, r.id));
      return compactPermissions(perms.map((p) => p.permissionId)) as PermissionId[];
    }
  }
  return [];
}

export async function userHasPermission(adminId: string, permission: string): Promise<boolean> {
  const perms = await getEffectivePermissionsForAdmin(adminId);
  return perms.includes(permission);
}

/** Used after a role's permissions are bumped: revoke active sessions for
 *  every admin currently assigned that role so they re-issue with the
 *  fresh permission set on the next login (or refresh, depending on
 *  client behaviour). */
export async function revokeSessionsForRole(roleId: string): Promise<number> {
  const admins = await db
    .select({ adminId: adminRoleAssignmentsTable.adminId })
    .from(adminRoleAssignmentsTable)
    .where(eq(adminRoleAssignmentsTable.roleId, roleId));
  if (admins.length === 0) return 0;
  // Lazy import to avoid circular: admin-sessions table lives in @workspace/db
  const { db: _db } = await import("@workspace/db");
  const { adminSessionsTable } = await import("@workspace/db/schema");
  await _db
    .update(adminSessionsTable)
    .set({ revokedAt: new Date() })
    .where(
      inArray(
        adminSessionsTable.adminId,
        admins.map((a) => a.adminId)
      )
    );
  return admins.length;
}

export { PERMISSIONS, PERMISSION_IDS };

import * as allSchema from "@workspace/db";
import { db } from "@workspace/db";
import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";

export interface ColumnDiff {
  table: string;
  missingInDb: string[]; // in schema, absent from DB
  extraInDb: string[]; // in DB, absent from schema (informational)
}

export interface SchemaDriftReport {
  ok: boolean;
  checkedAt: string;
  totalSchemaTables: number;
  totalDbTables: number;
  missingTables: string[]; // defined in schema, absent from DB
  extraTables: string[]; // exist in DB only (informational, not a crash risk)
  columnDrift: ColumnDiff[]; // tables present in both but with column gaps
}

/** Cached result from the most recent schema drift check (set at startup). */
let _lastDriftReport: SchemaDriftReport | null = null;

/**
 * Return the last drift report produced at startup, or null if the check
 * has not yet run. The health-dashboard endpoint reads this without
 * re-running the (expensive) DB introspection query.
 */
export function getLastDriftReport(): SchemaDriftReport | null {
  return _lastDriftReport;
}

/** Build map: tableName → Set<sqlColumnName> from all Drizzle schema exports. */
function buildSchemaMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const exported of Object.values(allSchema)) {
    if (!is(exported as object, PgTable)) continue;
    const tableName = getTableName(exported as Parameters<typeof getTableName>[0]);
    const cols = getTableColumns(exported as Parameters<typeof getTableColumns>[0]);
    const colNames = new Set(Object.values(cols).map((c: { name: string }) => c.name));
    if (map.has(tableName)) {
      for (const c of colNames) map.get(tableName)!.add(c);
    } else {
      map.set(tableName, colNames);
    }
  }
  return map;
}

/** Query live DB for all public tables and their columns. */
async function buildDbMap(): Promise<Map<string, Set<string>>> {
  const rows = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `);
  const map = new Map<string, Set<string>>();
  for (const row of rows.rows) {
    if (!map.has(row.table_name)) map.set(row.table_name, new Set());
    map.get(row.table_name)!.add(row.column_name);
  }
  return map;
}

/** Compare schema definition against live DB and return a drift report. */
export async function checkSchemaDrift(): Promise<SchemaDriftReport> {
  const [schemaMap, dbMap] = await Promise.all([Promise.resolve(buildSchemaMap()), buildDbMap()]);

  const ignoredDbTables = new Set(["_schema_migrations"]);

  const missingTables: string[] = [];
  const extraTables: string[] = [];
  const columnDrift: ColumnDiff[] = [];

  for (const [table] of schemaMap) {
    if (!dbMap.has(table)) missingTables.push(table);
  }

  for (const [table] of dbMap) {
    if (!ignoredDbTables.has(table) && !schemaMap.has(table)) {
      extraTables.push(table);
    }
  }

  for (const [table, schemaColumns] of schemaMap) {
    const dbColumns = dbMap.get(table);
    if (!dbColumns) continue;

    const missingInDb = [...schemaColumns].filter((c) => !dbColumns.has(c));
    const extraInDb = [...dbColumns].filter((c) => !schemaColumns.has(c));

    if (missingInDb.length > 0 || extraInDb.length > 0) {
      columnDrift.push({ table, missingInDb, extraInDb });
    }
  }

  const ok =
    missingTables.length === 0 && columnDrift.filter((d) => d.missingInDb.length > 0).length === 0;

  const report: SchemaDriftReport = {
    ok,
    checkedAt: new Date().toISOString(),
    totalSchemaTables: schemaMap.size,
    totalDbTables: dbMap.size,
    missingTables: missingTables.sort(),
    extraTables: extraTables.sort(),
    columnDrift: columnDrift.sort((a, b) => a.table.localeCompare(b.table)),
  };

  _lastDriftReport = report;
  return report;
}

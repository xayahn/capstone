/// <reference types="vite/client" />
/**
 * Single source of truth for the database schema: the versioned SQL files in
 * `drizzle/`. Production applies them with `wrangler d1 migrations apply`; local
 * development applies the same files through `applyMigrations` below, so the
 * development schema can never drift from the migrated schema.
 */

// Vite bundles each migration file into the server as a plain string.
const files = import.meta.glob('../drizzle/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export type Migration = { name: string; sql: string };

export const MIGRATIONS: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ name: path.split('/').pop()!.replace(/\.sql$/, ''), sql }))
  .filter((migration) => /^\d{4}_/.test(migration.name))
  .sort((left, right) => left.name.localeCompare(right.name));

const LEDGER = '_parishlink_migrations';

/** Split a Drizzle migration into executable statements. */
export function migrationStatements(sql: string): string[] {
  return sql
    .split('--> statement-breakpoint')
    .map((chunk) => chunk.trim())
    .filter((chunk) => {
      const code = chunk.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n').trim();
      // D1 always enforces foreign keys; the PRAGMA in the first migration is for plain SQLite.
      return code.length > 0 && !/^PRAGMA\s+foreign_keys/i.test(code);
    });
}

export class LegacyDevelopmentDatabaseError extends Error {
  constructor() {
    super('The local development database was created by an older ParishLink build. Stop the server and run "pnpm demo:reset" (local synthetic data only), then start again.');
    this.name = 'LegacyDevelopmentDatabaseError';
  }
}

/** Apply every migration that has not yet been recorded in the local ledger. Returns the names applied. */
export async function applyMigrations(db: D1Database, migrations: Migration[] = MIGRATIONS): Promise<string[]> {
  if (migrations.length === 0) throw new Error('No ParishLink migrations were bundled.');
  await db.prepare(`CREATE TABLE IF NOT EXISTS ${LEDGER} (
    name TEXT PRIMARY KEY NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`).run();
  const recorded = await db.prepare(`SELECT name FROM ${LEDGER}`).all<{ name: string }>();
  const applied = new Set(recorded.results.map((row) => row.name));
  if (applied.size === 0) {
    const existing = await db.prepare("SELECT 1 AS present FROM sqlite_schema WHERE type = 'table' AND name = 'parishes'").first<{ present: number }>();
    if (existing) throw new LegacyDevelopmentDatabaseError();
  }
  const newlyApplied: string[] = [];
  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const statements = migrationStatements(migration.sql).map((statement) => db.prepare(statement));
    statements.push(db.prepare(`INSERT INTO ${LEDGER} (name) VALUES (?)`).bind(migration.name));
    // A D1 batch runs as one transaction: a migration is applied completely or not at all.
    await db.batch(statements);
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}

import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * D1-compatible adapter over node:sqlite for tests. `meta.changes` reports the
 * total_changes() delta like D1 (including trigger writes), and `batch` runs as
 * one transaction like D1.
 */
export function d1(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let values: Array<string | number | null> = [];
      const statement = {
        bind(...args: unknown[]) { values = args.map((value) => (value === undefined ? null : value)) as Array<string | number | null>; return statement; },
        async first<T>(column?: string) {
          const row = database.prepare(query).get(...values) as Record<string, unknown> | undefined;
          return (column ? row?.[column] ?? null : row ?? null) as T;
        },
        async all() { return { success: true, results: database.prepare(query).all(...values), meta: {} }; },
        async run() { return statement.syncRun(); },
        syncRun() {
          const before = Number((database.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
          database.prepare(query).run(...values);
          const after = Number((database.prepare('SELECT total_changes() AS n').get() as { n: number }).n);
          return { success: true, results: [], meta: { changes: after - before } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ syncRun(): unknown }>) {
      database.exec('BEGIN');
      try { const result = statements.map((statement) => statement.syncRun()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
}

/** A fresh in-memory database with every migration in drizzle/ applied. */
export function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  for (const file of readdirSync(folder).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    for (const statement of readFileSync(resolve(folder, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) database.exec(statement);
    }
  }
  return database;
}

/** Minimal in-memory R2 bucket for tests. */
export function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; httpMetadata?: R2HTTPMetadata }>();
  const bucket = {
    async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: R2HTTPMetadata }) {
      objects.set(key, { bytes: value instanceof Uint8Array ? value : new Uint8Array(value), httpMetadata: options?.httpMetadata });
      return {} as R2Object;
    },
    async get(key: string) {
      const object = objects.get(key);
      return object ? { body: object.bytes, httpMetadata: object.httpMetadata, arrayBuffer: async () => object.bytes.buffer } : null;
    },
    async delete(key: string) { objects.delete(key); },
  };
  return { bucket: bucket as unknown as R2Bucket, objects };
}

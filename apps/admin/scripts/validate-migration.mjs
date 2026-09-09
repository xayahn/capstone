import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const migrationDirectory = join(projectRoot, 'drizzle');
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();

if (migrationFiles.length === 0) throw new Error('No ParishLink migrations were found.');

const database = new DatabaseSync(':memory:');
database.exec('PRAGMA foreign_keys = ON');
for (const file of migrationFiles) {
  const migration = readFileSync(join(migrationDirectory, file), 'utf8');
  for (const statement of migration.split('--> statement-breakpoint')) {
    if (statement.trim()) database.exec(statement);
  }
}

const expectedTables = [
  'announcements', 'appointment_events', 'appointment_participants', 'appointments',
  'audit_logs', 'availability_blocks', 'chatbot_messages', 'clergy_assignments',
  'clergy_profiles', 'document_requirements', 'document_submissions', 'evaluation_responses',
  'idempotency_keys', 'mobile_credentials', 'mobile_rate_limits', 'mobile_sessions',
  'notifications', 'parishes', 'queue_tickets', 'sacramental_records', 'service_types',
  'user_parish_memberships', 'users', 'venues',
];
const actualTables = database.prepare(`SELECT name FROM sqlite_schema
  WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map((row) => String(row.name));
if (JSON.stringify(actualTables) !== JSON.stringify(expectedTables)) {
  throw new Error(`Migration table drift detected. Expected ${expectedTables.length}, found ${actualTables.length}.`);
}

const foreignKeyIssues = database.prepare('PRAGMA foreign_key_check').all();
if (foreignKeyIssues.length > 0) throw new Error('Migration foreign-key validation failed.');
const integrity = database.prepare('PRAGMA integrity_check').get();
if (!integrity || Object.values(integrity)[0] !== 'ok') throw new Error('Migration integrity validation failed.');

const indexNames = new Set(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'").all().map((row) => String(row.name)));
for (const index of [
  'idx_appointments_clergy_window',
  'idx_appointments_venue_window',
  'idx_queue_parish_status_priority',
  'idx_idempotency_actor_scope_key',
  'idx_idempotency_expiry',
]) {
  if (!indexNames.has(index)) throw new Error(`Required migration index is missing: ${index}`);
}

database.close();
process.stdout.write(`Migration chain valid: ${migrationFiles.length} files, ${actualTables.length} tables, ${indexNames.size} indexes\n`);

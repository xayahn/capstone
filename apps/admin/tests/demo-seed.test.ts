import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { applyMigrations, LegacyDevelopmentDatabaseError, MIGRATIONS, migrationStatements } from '../db/migrate';
import { catalogStatements } from '../db/catalog';
import { seedDemoData } from '../db/demo-seed';
import { d1, memoryBucket } from './helpers/d1';

const NOW = new Date('2026-11-09T02:00:00.000Z'); // 10:00 AM Asia/Manila

async function seededDatabase() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const db = d1(database);
  await applyMigrations(db);
  await db.batch(catalogStatements(db));
  const storage = memoryBucket();
  const summary = await seedDemoData(db, storage.bucket, NOW);
  return { database, db, storage, summary };
}

describe('development migration runner (single schema source)', () => {
  it('bundles every migration file in order', () => {
    expect(MIGRATIONS.map((migration) => migration.name)).toEqual([
      '0000_initial_parishlink', '0001_release_safety', '0002_record_pagination', '0003_schedule_pagination',
      '0004_push_notifications', '0005_account_recovery', '0006_staff_auth', '0007_defense_features',
    ]);
    expect(migrationStatements(MIGRATIONS[0].sql).some((statement) => /PRAGMA foreign_keys/i.test(statement))).toBe(false);
  });

  it('applies migrations once and records them in a ledger', async () => {
    const database = new DatabaseSync(':memory:');
    const db = d1(database);
    expect(await applyMigrations(db)).toHaveLength(MIGRATIONS.length);
    expect(await applyMigrations(db)).toEqual([]);
    const tables = database.prepare("SELECT COUNT(*) AS n FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_parishlink_migrations'").get() as { n: number };
    expect(tables.n).toBe(30);
  });

  it('refuses to run over a database created by the old hand-written bootstrap', async () => {
    const database = new DatabaseSync(':memory:');
    database.exec('CREATE TABLE parishes (id TEXT PRIMARY KEY)');
    await expect(applyMigrations(d1(database))).rejects.toBeInstanceOf(LegacyDevelopmentDatabaseError);
  });
});

describe('synthetic demonstration seed', () => {
  it('seeds once and is idempotent', async () => {
    const { db, summary } = await seededDatabase();
    expect(summary).toMatchObject({ seeded: true, parishioners: 24, appointments: 88 });
    expect(await seedDemoData(db, undefined, NOW)).toMatchObject({ seeded: false });
  });

  it('covers all eight parishes, every status, and both past and upcoming dates', async () => {
    const { database } = await seededDatabase();
    const perParish = database.prepare('SELECT parish_id AS parish, COUNT(*) AS n FROM appointments GROUP BY parish_id').all() as { n: number }[];
    expect(perParish).toHaveLength(8);
    expect(perParish.every((row) => row.n === 11)).toBe(true);
    const statuses = (database.prepare('SELECT DISTINCT status FROM appointments').all() as { status: string }[]).map((row) => row.status).sort();
    expect(statuses).toEqual(['approved', 'cancelled', 'completed', 'documents_pending', 'needs_changes', 'no_show', 'ready_to_approve', 'rejected', 'submitted', 'under_review']);
    const upcoming = database.prepare('SELECT COUNT(*) AS n FROM appointments WHERE starts_at > ?').get(NOW.toISOString()) as { n: number };
    const past = database.prepare('SELECT COUNT(*) AS n FROM appointments WHERE starts_at < ?').get(NOW.toISOString()) as { n: number };
    expect(upcoming.n).toBeGreaterThan(40);
    expect(past.n).toBeGreaterThan(20);
  });

  it('never double-books a priest or venue and never overlaps the Mass schedule', async () => {
    const { database } = await seededDatabase();
    const clash = database.prepare(`SELECT COUNT(*) AS n FROM appointments a JOIN appointments b ON a.id < b.id
      WHERE a.status NOT IN ('rejected','completed','cancelled','no_show') AND b.status NOT IN ('rejected','completed','cancelled','no_show')
        AND (a.clergy_id = b.clergy_id OR a.venue_id = b.venue_id)
        AND datetime(a.starts_at, '-' || a.buffer_before_minutes || ' minutes') < datetime(b.ends_at, '+' || b.buffer_after_minutes || ' minutes')
        AND datetime(b.starts_at, '-' || b.buffer_before_minutes || ' minutes') < datetime(a.ends_at, '+' || a.buffer_after_minutes || ' minutes')`).get() as { n: number };
    expect(clash.n).toBe(0);
    const massClash = database.prepare(`SELECT COUNT(*) AS n FROM appointments a JOIN clergy_assignments ca
      ON (ca.clergy_id = a.clergy_id OR ca.venue_id = a.venue_id) AND ca.status = 'confirmed'
      WHERE a.status NOT IN ('rejected','completed','cancelled','no_show')
        AND datetime(ca.starts_at) < datetime(a.ends_at, '+' || a.buffer_after_minutes || ' minutes')
        AND datetime(ca.ends_at) > datetime(a.starts_at, '-' || a.buffer_before_minutes || ' minutes')`).get() as { n: number };
    expect(massClash.n).toBe(0);
  });

  it('keeps document statuses consistent with the appointment workflow', async () => {
    const { database } = await seededDatabase();
    const unverifiedApproved = database.prepare(`SELECT COUNT(*) AS n FROM appointments a JOIN document_submissions ds ON ds.appointment_id = a.id
      WHERE a.status IN ('approved','ready_to_approve','completed') AND ds.is_required = 1 AND ds.status <> 'verified'`).get() as { n: number };
    expect(unverifiedApproved.n).toBe(0);
    const needsChanges = database.prepare(`SELECT COUNT(*) AS n FROM appointments a WHERE a.status = 'needs_changes'
      AND NOT EXISTS (SELECT 1 FROM document_submissions ds WHERE ds.appointment_id = a.id AND ds.status = 'needs_replacement')`).get() as { n: number };
    expect(needsChanges.n).toBe(0);
  });

  it('stores every submitted file privately with a matching SHA-256', async () => {
    const { database, storage } = await seededDatabase();
    const rows = database.prepare("SELECT storage_key AS key, sha256 FROM document_submissions WHERE status <> 'not_submitted'").all() as { key: string; sha256: string }[];
    expect(rows.length).toBeGreaterThan(100);
    for (const row of rows) {
      const object = storage.objects.get(row.key);
      expect(object, row.key).toBeDefined();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(object!.bytes))), (byte) => byte.toString(16).padStart(2, '0')).join('');
      expect(row.sha256).toBe(digest);
      expect(row.key.startsWith('private/')).toBe(true);
    }
  });

  it('creates demo sign-ins for every role and pending change requests', async () => {
    const { database } = await seededDatabase();
    const staff = database.prepare("SELECT COUNT(*) AS n FROM users u JOIN staff_credentials sc ON sc.user_id = u.id WHERE u.role = 'parish_staff'").get() as { n: number };
    const clergy = database.prepare("SELECT COUNT(*) AS n FROM users u JOIN staff_credentials sc ON sc.user_id = u.id WHERE u.role = 'clergy'").get() as { n: number };
    const parishioners = database.prepare('SELECT COUNT(*) AS n FROM mobile_credentials').get() as { n: number };
    expect(staff.n).toBe(8);
    expect(clergy.n).toBe(9);
    expect(parishioners.n).toBe(4);
    const pending = database.prepare("SELECT kind FROM appointment_change_requests WHERE status = 'pending' ORDER BY kind").all() as { kind: string }[];
    expect(pending.map((row) => row.kind)).toEqual(['cancel', 'reschedule']);
    const directory = database.prepare("SELECT COUNT(*) AS n FROM parishes WHERE address IS NOT NULL AND office_hours IS NOT NULL AND contact_phone IS NOT NULL AND contact_email LIKE '%@parishlink.test'").get() as { n: number };
    expect(directory.n).toBe(8);
    const admin = database.prepare("SELECT full_name AS name FROM users WHERE id = 'user-admin-demo'").get() as { name: string };
    expect(admin.name).toBe('Ana Fernandez');
  });
});

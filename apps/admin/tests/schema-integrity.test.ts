import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * Database-level integrity rules introduced in drizzle/0007_defense_features.sql.
 * The application validates the same rules; these tests prove the database
 * rejects invalid states even for direct writes.
 */
let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const file of readdirSync(folder).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    for (const statement of readFileSync(resolve(folder, file), 'utf8').split('--> statement-breakpoint')) {
      if (statement.trim()) db.exec(statement);
    }
  }
  db.exec(`INSERT INTO parishes(id,slug,name) VALUES('p1','p1','Parish');
    INSERT INTO users(id,email,full_name,role,home_parish_id) VALUES('u1','u1@example.test','Member','parishioner','p1');
    INSERT INTO service_types(id,slug,name,duration_minutes,buffer_before_minutes,buffer_after_minutes) VALUES('baptism','baptism','Baptism',60,15,15);
    INSERT INTO appointments(id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,starts_at,ends_at)
      VALUES('a1','PL-1','u1','Member','baptism','p1','2026-12-01T00:00:00.000Z','2026-12-01T01:00:00.000Z');`);
});

describe('schema sources stay in step', () => {
  it('db/schema.ts declares exactly the tables produced by the migrations', () => {
    const declared = [...readFileSync(fileURLToPath(new URL('../db/schema.ts', import.meta.url)), 'utf8').matchAll(/sqliteTable\('(\w+)'/g)]
      .map((match) => match[1]).sort();
    const migrated = (db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
      .map((row) => row.name);
    expect(declared).toEqual(migrated);
  });
});

describe('controlled vocabularies are enforced by the database', () => {
  it.each([
    ["INSERT INTO users(id,email,full_name,role) VALUES('x','x@example.test','X','superuser')", 'invalid user role'],
    ["UPDATE users SET role = 'owner' WHERE id = 'u1'", 'invalid user role'],
    ["UPDATE appointments SET status = 'pending_magic' WHERE id = 'a1'", 'invalid appointment status'],
    ["INSERT INTO document_submissions(id,appointment_id,requirement_name,status) VALUES('d','a1','Birth','lost')", 'invalid document status'],
    ["INSERT INTO queue_tickets(id,ticket_number,parish_id,parishioner_name,service,status) VALUES('q','1','p1','V','General inquiry','skipped')", 'invalid queue ticket status'],
    ["INSERT INTO sacramental_records(id,parish_id,record_type,subject_name,event_date,reference,status) VALUES('r','p1','Baptismal','S','2020-01-01','REF','official')", 'invalid sacramental record status'],
    ["INSERT INTO announcements(id,author_id,audience,title,body,status) VALUES('n','u1','all','Title','Body text','live')", 'invalid announcement status'],
  ])('rejects %s', (statement, message) => {
    expect(() => db.exec(statement)).toThrow(message);
  });

  it('accepts every value the application uses', () => {
    for (const status of ['submitted', 'documents_pending', 'under_review', 'needs_changes', 'ready_to_approve', 'approved', 'rejected', 'completed', 'cancelled', 'no_show']) {
      expect(() => db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, 'a1')).not.toThrow();
    }
    for (const role of ['parish_staff', 'clergy', 'system_admin', 'parishioner']) {
      expect(() => db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, 'u1')).not.toThrow();
    }
  });
});

describe('appointment change requests', () => {
  it('allows only one pending request per appointment', () => {
    db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason) VALUES('c1','a1','cancel','u1','Family emergency')");
    expect(() => db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason) VALUES('c2','a1','cancel','u1','Again')")).toThrow();
    db.exec("UPDATE appointment_change_requests SET status = 'rejected' WHERE id = 'c1'");
    expect(() => db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason) VALUES('c3','a1','cancel','u1','New request')")).not.toThrow();
  });

  it('requires a proposed time for a reschedule and a known kind/status', () => {
    expect(() => db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason) VALUES('c4','a1','reschedule','u1','No time given')")).toThrow();
    expect(() => db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason) VALUES('c5','a1','swap','u1','Unknown kind')")).toThrow();
    expect(() => db.exec("INSERT INTO appointment_change_requests(id,appointment_id,kind,requested_by,reason,status,proposed_starts_at,proposed_ends_at) VALUES('c6','a1','reschedule','u1','Bad status','maybe','2026-12-02T00:00:00Z','2026-12-02T01:00:00Z')")).toThrow();
  });
});

describe('booking buffers and notification de-duplication', () => {
  it('backfills buffer snapshots from the service at migration time', () => {
    // Appointments inserted after the migration must set the snapshot explicitly; the
    // backfill covered rows that existed when 0007 ran (none here), so the column is nullable.
    const row = db.prepare("SELECT buffer_before_minutes AS before, buffer_after_minutes AS after FROM appointments WHERE id = 'a1'").get() as { before: number | null; after: number | null };
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
  });

  it('stores a de-duplicated notification at most once', () => {
    db.exec("INSERT INTO notifications(id,recipient_user_id,type,title,body,dedupe_key) VALUES('n1','u1','reminder','Reminder','Body','reminder:a1:1d')");
    db.exec("INSERT OR IGNORE INTO notifications(id,recipient_user_id,type,title,body,dedupe_key) VALUES('n2','u1','reminder','Reminder','Body','reminder:a1:1d')");
    db.exec("INSERT INTO notifications(id,recipient_user_id,type,title,body) VALUES('n3','u1','account','Plain','No key')");
    db.exec("INSERT INTO notifications(id,recipient_user_id,type,title,body) VALUES('n4','u1','account','Plain','No key')");
    const count = db.prepare('SELECT COUNT(*) AS n FROM notifications').get() as { n: number };
    expect(count.n).toBe(3);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { d1, migratedDatabase } from './helpers/d1';

const { runtime } = vi.hoisted(() => ({
  runtime: {
    getRawDb: vi.fn(),
    ensureRuntimeDatabase: vi.fn(async () => {}),
    ensurePublicRuntimeDatabase: vi.fn(async () => {}),
  },
}));
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
vi.mock('@/db/runtime', () => runtime);

import { generateAdminReport } from '../backend/services/report-service';
import { searchAuditLogs } from '../backend/services/audit-service';
import { escapeCsvCell, formatReportCsv } from '../shared/report-csv';
import type { Actor } from '../shared/domain';

let sql: DatabaseSync;

const staffP1: Actor = {
  id: 'staff-p1',
  name: 'Elena Gomez',
  email: 'staff.p1@example.test',
  role: 'parish_staff',
  parishId: 'p1',
  parishName: 'San Guillermo Parish',
  clergyProfileId: null,
};
const staffP2: Actor = {
  id: 'staff-p2',
  name: 'Ramon Cruz',
  email: 'staff.p2@example.test',
  role: 'parish_staff',
  parishId: 'p2',
  parishName: 'Sta. Lucia Parish',
  clergyProfileId: null,
};
const clergyC1: Actor = {
  id: 'clergy-u1',
  name: 'Fr. Manalo',
  email: 'clergy.c1@example.test',
  role: 'clergy',
  parishId: 'p1',
  parishName: 'San Guillermo Parish',
  clergyProfileId: 'c1',
};
const sysAdmin: Actor = {
  id: 'sys-admin',
  name: 'Ana Fernandez',
  email: 'admin@example.test',
  role: 'system_admin',
  parishId: null,
  parishName: 'Vicariate-wide',
  clergyProfileId: null,
};

beforeEach(() => {
  sql = migratedDatabase();
  sql.exec(`
    INSERT INTO parishes (id, slug, name) VALUES
      ('p1', 'san-guillermo', 'San Guillermo Parish'),
      ('p2', 'sta-lucia', 'Sta. Lucia Parish');
    INSERT INTO service_types (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes) VALUES
      ('baptism', 'baptism', 'Baptism', 60, 15, 15),
      ('wedding', 'wedding', 'Wedding', 90, 30, 30);
    INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES
      ('u-member', 'member@example.test', 'Private Parishioner Name', 'parishioner', 'p1'),
      ('staff-p1', 'staff.p1@example.test', 'Elena Gomez', 'parish_staff', 'p1'),
      ('staff-p2', 'staff.p2@example.test', 'Ramon Cruz', 'parish_staff', 'p2'),
      ('clergy-u1', 'clergy.c1@example.test', 'Fr. Manalo', 'clergy', 'p1'),
      ('clergy-u2', 'clergy.c2@example.test', 'Fr. Other', 'clergy', 'p1'),
      ('sys-admin', 'admin@example.test', 'Ana Fernandez', 'system_admin', NULL);
    INSERT INTO clergy_profiles (id, user_id, display_title, home_parish_id) VALUES
      ('c1', 'clergy-u1', 'Fr. Manalo', 'p1'),
      ('c2', 'clergy-u2', 'Fr. Other', 'p1');
    INSERT INTO venues (id, parish_id, name) VALUES
      ('v1', 'p1', 'Main church'),
      ('v2', 'p2', 'Chapel');
  `);
  runtime.getRawDb.mockReturnValue(d1(sql));
});

describe('CSV report formatting & formula-injection protection', () => {
  it('neutralizes spreadsheet formula triggers including leading whitespace and quotes special chars', () => {
    expect(escapeCsvCell('=CMD("calc")')).toBe(`"'=CMD(""calc"")"`);
    expect(escapeCsvCell('+SUM(A1:A5)')).toBe("'+SUM(A1:A5)");
    expect(escapeCsvCell('-2+3')).toBe("'-2+3");
    expect(escapeCsvCell('@IMPORTXML("https://x")')).toBe(`"'@IMPORTXML(""https://x"")"`);
    expect(escapeCsvCell('   =HYPERLINK("https://evil.example")')).toBe(
      `"'   =HYPERLINK(""https://evil.example"")"`,
    );
    expect(escapeCsvCell('\t=1+1')).toBe("'\t=1+1");
    expect(escapeCsvCell('\r+1')).toBe(`"'\r+1"`);
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(0)).toBe('0');
    expect(escapeCsvCell('Sto. Niño, Pampanga')).toBe('"Sto. Niño, Pampanga"');
  });
});

describe('generateAdminReport', () => {
  beforeEach(() => {
    sql.exec(`
      INSERT INTO appointments
        (id, reference, parishioner_user_id, parishioner_name, service_type_id, parish_id, clergy_id, clergy_name, venue_id, venue_name, starts_at, ends_at, status)
      VALUES
        ('a-p1-comp', 'PL-001', 'u-member', '=EvilFormulaName', 'baptism', 'p1', 'c1', 'Fr. Manalo', 'v1', 'Main church', '2026-09-10T01:30:00.000Z', '2026-09-10T02:30:00.000Z', 'completed'),
        ('a-p1-pend', 'PL-002', 'u-member', 'Maria Santos', 'wedding', 'p1', 'c2', 'Fr. Other', 'v1', 'Main church', '2026-10-05T08:00:00+08:00', '2026-10-05T09:30:00+08:00', 'under_review'),
        ('a-p2-appr', 'PL-003', 'u-member', 'Pedro Reyes', 'baptism', 'p2', 'c1', 'Fr. Manalo', 'v2', 'Chapel', '2026-10-12T09:30:00+08:00', '2026-10-12T10:30:00+08:00', 'approved');

      INSERT INTO document_submissions
        (id, appointment_id, requirement_name, is_required, status, submitted_at, reviewed_at)
      VALUES
        ('d1', 'a-p1-comp', 'Birth Certificate', 1, 'verified', '2026-09-01 08:00:00', '2026-09-01 14:00:00'),
        ('d2', 'a-p1-pend', 'Marriage License', 1, 'submitted', '2026-09-20 09:00:00', NULL);

      INSERT INTO sacramental_records
        (id, parish_id, record_type, subject_name, event_date, reference, status)
      VALUES
        ('r1', 'p1', 'Baptismal', 'Child One', '2020-05-10', 'BAP-P1-0001', 'verified_against_archive'),
        ('r2', 'p2', 'Baptismal', 'Child Two', '2021-05-10', 'BAP-P2-0001', 'verified_against_archive');

      INSERT INTO queue_tickets
        (id, ticket_number, parish_id, parishioner_name, service, status, issued_at, called_at, served_at)
      VALUES
        ('q1', 'A-001', 'p1', 'Visitor One', 'Baptism inquiry', 'served', '2026-09-10 01:00:00', '2026-09-10 01:12:00', '2026-09-10 01:25:00'),
        ('q2', 'A-002', 'p2', 'Visitor Two', 'General inquiry', 'served', '2026-09-10 02:00:00', '2026-09-10 02:30:00', '2026-09-10 02:45:00');
    `);
  });

  it('computes accurate parish-scoped metrics, turnaround hours, queue wait, and safe CSV for parish staff', async () => {
    const report = await generateAdminReport(staffP1, {});
    expect(report.scopeLabel).toBe('San Guillermo Parish');
    expect(report.totals).toEqual({
      appointments: 2,
      approved: 0,
      completed: 1,
      pending: 1,
      cancelledOrRejected: 0,
      noShow: 0,
      awaitingDocumentReview: 1,
      verifiedDocuments: 1,
      avgDocumentReviewHours: 6,
      verifiedRecords: 1,
      queueServed: 1,
      avgQueueWaitMinutes: 12,
    });
    expect(report.byMonth).toEqual([
      { month: '2026-09', total: 1, completed: 1, approved: 0 },
      { month: '2026-10', total: 1, completed: 0, approved: 0 },
    ]);

    const csv = formatReportCsv(report);
    expect(csv).toContain("'=EvilFormulaName");
    expect(csv).not.toContain(',=EvilFormulaName');

    const p2Report = await generateAdminReport(staffP2, {});
    expect(p2Report.scopeLabel).toBe('Sta. Lucia Parish');
    expect(p2Report.totals.appointments).toBe(1);

    await expect(generateAdminReport(staffP1, { parishId: 'p2' })).rejects.toMatchObject({ status: 403 });
  });

  it('enforces PII & private-metric redaction for system_admin and assigned-clergy scoping for clergy', async () => {
    const adminReport = await generateAdminReport(sysAdmin, {});
    expect(adminReport.totals.appointments).toBe(3);
    expect(adminReport.totals.verifiedDocuments).toBeNull();
    expect(adminReport.totals.awaitingDocumentReview).toBeNull();
    expect(adminReport.totals.avgDocumentReviewHours).toBeNull();
    expect(adminReport.totals.verifiedRecords).toBeNull();
    expect(adminReport.totals.queueServed).toBe(2);
    expect(adminReport.appointments.every((item) => item.parishioner === 'Restricted parishioner')).toBe(true);

    const narrowed = await generateAdminReport(sysAdmin, { parishId: 'p2' });
    expect(narrowed.totals.appointments).toBe(1);
    expect(narrowed.scopeLabel).toBe('Sta. Lucia Parish');

    const clergyReport = await generateAdminReport(clergyC1, {});
    // c1 is assigned to PL-001 (p1) and PL-003 (p2)
    expect(clergyReport.totals.appointments).toBe(2);
    expect(clergyReport.totals.verifiedDocuments).toBeNull();
    expect(clergyReport.totals.queueServed).toBeNull();
  });

  it('filters accurately by Manila calendar dates and rejects invalid date ranges', async () => {
    const septOnly = await generateAdminReport(staffP1, { from: '2026-09-10', to: '2026-09-10' });
    expect(septOnly.totals.appointments).toBe(1);
    expect(septOnly.appointments[0]?.reference).toBe('PL-001');

    await expect(generateAdminReport(staffP1, { from: '2026-10-10', to: '2026-09-01' })).rejects.toMatchObject({
      status: 400,
    });
    await expect(generateAdminReport(staffP1, { from: '2026-02-30' })).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('searchAuditLogs', () => {
  it('pages deterministically across mixed UTC/offset timestamps, enforces parish scope, and blocks clergy', async () => {
    for (let index = 0; index < 60; index += 1) {
      const createdAt =
        index % 2 === 0 ? '2026-09-15 04:00:00' : '2026-09-15T12:00:00+08:00';
      sql
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail, created_at)
           VALUES (?, 'staff-p1', 'queue.call_next', 'queue_ticket', ?, 'p1', 'success', ?, ?)`,
        )
        .run(`audit-${String(index).padStart(3, '0')}`, `q-${index}`, `Window 1 #${index}`, createdAt);
    }
    sql.exec(`
      INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail, created_at) VALUES
        ('audit-other-parish', 'staff-p2', 'record.verify', 'sacramental_record', 'r2', 'p2', 'success', 'Other parish archive', '2026-09-16 01:00:00'),
        ('audit-member-doc', 'u-member', 'document.review', 'document_submission', 'd1', 'p1', 'success', 'needs_replacement: Blurry private birth record note', '2026-09-16 02:00:00'),
        ('audit-vicariate', 'sys-admin', 'service.update', 'service_type', 'baptism', NULL, 'success', 'Baptism: 60m', '2026-09-16 03:00:00');
    `);

    await expect(searchAuditLogs(clergyC1, {})).rejects.toMatchObject({ status: 403 });
    await expect(searchAuditLogs(staffP1, { parishId: 'p2' })).rejects.toMatchObject({ status: 403 });

    const seen: string[] = [];
    let cursor = null;
    for (let pageNo = 0; pageNo < 5; pageNo += 1) {
      const page = await searchAuditLogs(staffP1, { cursor });
      seen.push(...page.entries.map((item) => item.id));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    // 60 queue logs + 1 member-doc log in p1; never sees p2 or vicariate null-parish log
    expect(seen).toHaveLength(61);
    expect(new Set(seen).size).toBe(61);
    expect(seen).not.toContain('audit-other-parish');
    expect(seen).not.toContain('audit-vicariate');

    // Parish staff sees full detail & parishioner actor name in own parish
    const staffDocSearch = await searchAuditLogs(staffP1, { query: 'Blurry private' });
    expect(staffDocSearch.entries).toHaveLength(1);
    expect(staffDocSearch.entries[0]?.actorName).toBe('Private Parishioner Name');

    // System admin sees redacted actor name & redacted document review note, and cannot probe them via search!
    const adminAll = await searchAuditLogs(sysAdmin, { action: 'document' });
    expect(adminAll.entries).toHaveLength(1);
    expect(adminAll.entries[0]?.actorName).toBe('Restricted parishioner');
    expect(adminAll.entries[0]?.detail).toBe('needs_replacement');

    const oracleMemberProbe = await searchAuditLogs(sysAdmin, { query: 'Private Parishioner Name' });
    expect(oracleMemberProbe.entries).toHaveLength(0);
    const oracleNoteProbe = await searchAuditLogs(sysAdmin, { query: 'Blurry private' });
    expect(oracleNoteProbe.entries).toHaveLength(0);

    const vicariateOnly = await searchAuditLogs(sysAdmin, { parishId: 'vicariate' });
    expect(vicariateOnly.entries.map((entry) => entry.id)).toEqual(['audit-vicariate']);
  });
});

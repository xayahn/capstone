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

import { performAdminMutation, loadDashboardState } from '../backend/services/admin-service';
import { createMobileAppointment, joinMobileQueue, loadMobileSnapshot } from '../backend/services/mobile-service';
import { manilaMonthDay, shortAppointmentReference } from '../shared/identifiers';
import type { MobileActor } from '../backend/auth/mobile-auth';
import type { Actor } from '../shared/domain';

let sql: DatabaseSync;
const DAY = 86_400_000;
const manilaDate = (offsetDays: number) =>
  new Date(Date.now() + 8 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10);

const member: MobileActor = {
  id: 'u1',
  sessionId: 's1',
  displayName: 'Liza Member',
  email: 'liza@example.test',
  mobileNumber: '+639171112233',
  homeParishId: 'p1',
  notificationsEnabled: true,
  emailVerified: true,
};
const staff: Actor = {
  id: 'staff1',
  name: 'Staff One',
  email: 'staff1@example.test',
  role: 'parish_staff',
  parishId: 'p1',
  parishName: 'Parish One',
  clergyProfileId: null,
};
const otherStaff: Actor = {
  ...staff,
  id: 'staff2',
  email: 'staff2@example.test',
  parishId: 'p2',
  parishName: 'Parish Two',
};
const priest: Actor = {
  id: 'priest1',
  name: 'Fr. One',
  email: 'priest1@example.test',
  role: 'clergy',
  parishId: 'p1',
  parishName: 'Parish One',
  clergyProfileId: 'c1',
};
const admin: Actor = {
  id: 'admin1',
  name: 'Admin',
  email: 'admin@example.test',
  role: 'system_admin',
  parishId: null,
  parishName: 'Vicariate-wide',
  clergyProfileId: null,
};

beforeEach(() => {
  sql = migratedDatabase();
  sql.exec(`
    INSERT INTO parishes (id, slug, name) VALUES ('p1','p1','Parish One'), ('p2','p2','Parish Two');
    INSERT INTO service_types (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes)
      VALUES ('baptism','baptism','Baptism',60,15,15);
    INSERT INTO document_requirements (id, service_type_id, name, instructions, is_required, sort_order)
      VALUES ('req-birth','baptism','PSA Birth Certificate','Clear copy',1,1);
    INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES
      ('u1','liza@example.test','Liza Member','parishioner','p1'),
      ('staff1','staff1@example.test','Staff One','parish_staff','p1'),
      ('staff2','staff2@example.test','Staff Two','parish_staff','p2'),
      ('priest1','priest1@example.test','Fr. One','clergy','p1'),
      ('admin1','admin@example.test','Admin','system_admin',NULL);
    INSERT INTO clergy_profiles (id, user_id, display_title, home_parish_id)
      VALUES ('c1','priest1','Fr. One','p1');
    INSERT INTO venues (id, parish_id, name)
      VALUES ('v1','p1','Main Church'), ('v2','p2','Chapel Two');
    INSERT INTO mobile_credentials (user_id, password_hash, password_salt)
      VALUES ('u1','x','y');
  `);
  runtime.getRawDb.mockReturnValue(d1(sql));
});

describe('Milestone 4 sequential queue tickets, cancellation, short references, and walk-in booking', () => {
  it('generates short unambiguous appointment references on mobile bookings', async () => {
    expect(shortAppointmentReference(new Date('2026-11-13T02:00:00Z'))).toMatch(/^PL-2026-[0-9A-HJ-KM-NP-TV-Z]{6}$/);
    const created = await createMobileAppointment(
      member,
      {
        serviceId: 'baptism',
        parishId: 'p1',
        clergyId: 'c1',
        venueId: 'v1',
        date: manilaDate(7),
        time: '9:30 AM',
      },
      crypto.randomUUID(),
    );
    expect(created.reference).toMatch(/^PL-\d{4}-[0-9A-HJ-KM-NP-TV-Z]{6}$/);
  });

  it('issues sequential daily MMDD-NNN tickets across front-desk and mobile per parish and cancels/marks no-show', async () => {
    const mmdd = manilaMonthDay();
    await performAdminMutation(
      staff,
      { action: 'queue.issue', parishId: 'p1', parishionerName: 'Walk-in Visitor One', service: 'Baptism inquiry' },
      crypto.randomUUID(),
    );
    const mobileTicket = await joinMobileQueue(
      member,
      { parishId: 'p1', service: 'Document submission' },
      crypto.randomUUID(),
    );
    await performAdminMutation(
      otherStaff,
      { action: 'queue.issue', parishId: 'p2', parishionerName: 'Second Parish Visitor', service: 'General inquiry' },
      crypto.randomUUID(),
    );

    const p1Tickets = sql
      .prepare("SELECT id, ticket_number AS number FROM queue_tickets WHERE parish_id = 'p1' ORDER BY ticket_number ASC")
      .all() as { id: string; number: string }[];
    const p2Tickets = sql
      .prepare("SELECT ticket_number AS number FROM queue_tickets WHERE parish_id = 'p2'")
      .all() as { number: string }[];

    expect(p1Tickets.map((row) => row.number)).toEqual([`${mmdd}-001`, `${mmdd}-002`]);
    expect(mobileTicket.number).toBe(`${mmdd}-002`);
    expect(p2Tickets.map((row) => row.number)).toEqual([`${mmdd}-001`]);

    // RBAC checks on queue.cancel
    await expect(
      performAdminMutation(priest, { action: 'queue.cancel', ticketId: p1Tickets[0]!.id, status: 'cancelled' }, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      performAdminMutation(otherStaff, { action: 'queue.cancel', ticketId: p1Tickets[0]!.id, status: 'cancelled' }, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 403 });

    // Call first ticket then mark no-show; cancel mobile waiting ticket and verify parishioner notification
    await performAdminMutation(staff, { action: 'queue.call_next', parishId: 'p1', counter: 'Window 1' }, crypto.randomUUID());
    await performAdminMutation(staff, { action: 'queue.cancel', ticketId: p1Tickets[0]!.id, status: 'no_show' }, crypto.randomUUID());
    await performAdminMutation(staff, { action: 'queue.cancel', ticketId: mobileTicket.id, status: 'cancelled' }, crypto.randomUUID());

    const statuses = sql
      .prepare("SELECT ticket_number AS number, status FROM queue_tickets WHERE parish_id = 'p1' ORDER BY ticket_number ASC")
      .all() as { number: string; status: string }[];
    expect(statuses).toEqual([
      { number: `${mmdd}-001`, status: 'no_show' },
      { number: `${mmdd}-002`, status: 'cancelled' },
    ]);
    const noticeCount = sql
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE recipient_user_id = 'u1' AND type = 'queue'")
      .get() as { n: number };
    expect(noticeCount.n).toBe(1);
  });

  it('books conflict-checked walk-in appointments for accountless and linked-ticket visitors with strict RBAC', async () => {
    const startsAt = new Date(`${manilaDate(10)}T10:00:00+08:00`).toISOString();
    const baseMutation = {
      action: 'walkin.appointment.create' as const,
      parishId: 'p1',
      parishionerName: 'Elena Cruz',
      contactPhone: '+63 917 222 3344',
      participantName: 'Baby Mateo Cruz',
      serviceTypeId: 'baptism',
      clergyId: 'c1',
      venueId: 'v1',
      startsAt,
    };

    // System admin, clergy, and cross-parish staff cannot book walk-in appointments
    for (const deniedActor of [admin, priest, otherStaff]) {
      await expect(performAdminMutation(deniedActor, baseMutation, crypto.randomUUID())).rejects.toMatchObject({ status: 403 });
    }

    // Assigned parish staff books accountless visitor appointment
    await performAdminMutation(staff, baseMutation, crypto.randomUUID());
    const state = await loadDashboardState(staff);
    expect(state.appointments).toHaveLength(1);
    expect(state.appointments[0]!.reference).toMatch(/^PL-\d{4}-[0-9A-HJ-KM-NP-TV-Z]{6}$/);
    expect(state.appointments[0]!.parishioner).toBe('Elena Cruz');
    expect(state.appointments[0]!.participants).toContain('Baby Mateo Cruz');
    expect(state.documents).toHaveLength(1);
    expect(state.documents[0]!.status).toBe('not_submitted');

    // Overlapping slot (within 60m + 15m buffer) is rejected without leaving an orphan walk-in user
    const usersBeforeConflict = (sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    const conflictingStart = new Date(`${manilaDate(10)}T11:05:00+08:00`).toISOString();
    await expect(
      performAdminMutation(
        staff,
        { ...baseMutation, parishionerName: 'Conflicting Visitor', startsAt: conflictingStart },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const usersAfterConflict = (sql.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
    expect(usersAfterConflict).toBe(usersBeforeConflict);

    // Linked mobile parishioner queue ticket attaches booking directly to mobile account
    const mobileTicket = await joinMobileQueue(member, { parishId: 'p1', service: 'Baptism inquiry' }, crypto.randomUUID());
    const nonConflictingStart = new Date(`${manilaDate(11)}T14:00:00+08:00`).toISOString();
    await performAdminMutation(
      staff,
      {
        ...baseMutation,
        ticketId: mobileTicket.id,
        parishionerName: member.displayName,
        participantName: null,
        startsAt: nonConflictingStart,
      },
      crypto.randomUUID(),
    );
    const mobileSnapshot = await loadMobileSnapshot(member);
    expect(mobileSnapshot.appointments).toHaveLength(1);
    expect(mobileSnapshot.appointments[0]!.reference).toMatch(/^PL-\d{4}-[0-9A-HJ-KM-NP-TV-Z]{6}$/);
  });
});

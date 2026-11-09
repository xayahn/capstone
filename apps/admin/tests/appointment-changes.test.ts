import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DatabaseSync } from 'node:sqlite';
import { d1, migratedDatabase } from './helpers/d1';

const { runtime } = vi.hoisted(() => ({ runtime: {
  getRawDb: vi.fn(),
  ensureRuntimeDatabase: vi.fn(async () => {}),
  ensurePublicRuntimeDatabase: vi.fn(async () => {}),
} }));
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
vi.mock('@/db/runtime', () => runtime);

import { parishionerChangeOptions } from '../shared/change-policy';
import { cancelMobileAppointment, requestMobileReschedule, withdrawMobileChangeRequest } from '../backend/services/appointment-changes';
import { loadMobileSnapshot } from '../backend/services/mobile-service';
import { performAdminMutation, loadDashboardState } from '../backend/services/admin-service';
import { generateDueReminders, planReminders } from '../backend/services/reminders';
import type { MobileActor } from '../backend/auth/mobile-auth';
import type { Actor } from '../shared/domain';

let sql: DatabaseSync;
const DAY = 86_400_000;
const manilaDate = (offsetDays: number) => new Date(Date.now() + 8 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10);
const at = (offsetDays: number, hhmm: string) => new Date(`${manilaDate(offsetDays)}T${hhmm}:00+08:00`).toISOString();

const member: MobileActor = { id: 'u1', sessionId: 's1', displayName: 'Maria Member', email: 'member@example.test', mobileNumber: '+639170000001', homeParishId: 'p1', notificationsEnabled: true, emailVerified: true };
const other: MobileActor = { ...member, id: 'u2', displayName: 'Other Member', email: 'other@example.test' };
const staff: Actor = { id: 'staff1', name: 'Staff One', email: 'staff1@example.test', role: 'parish_staff', parishId: 'p1', parishName: 'Parish One', clergyProfileId: null };
const otherStaff: Actor = { ...staff, id: 'staff2', email: 'staff2@example.test', parishId: 'p2', parishName: 'Parish Two' };
const priest: Actor = { id: 'priest1', name: 'Fr. One', email: 'priest1@example.test', role: 'clergy', parishId: 'p1', parishName: 'Parish One', clergyProfileId: 'c1' };
const admin: Actor = { id: 'admin1', name: 'Admin', email: 'admin@example.test', role: 'system_admin', parishId: null, parishName: 'Vicariate-wide', clergyProfileId: null };

function appointment(id: string, ownerId: string, status: string, startsAt: string, minutes = 60) {
  const endsAt = new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString();
  sql.prepare(`INSERT INTO appointments (id, reference, parishioner_user_id, parishioner_name, service_type_id, parish_id, clergy_id, clergy_name,
      venue_id, venue_name, starts_at, ends_at, status, buffer_before_minutes, buffer_after_minutes)
    VALUES (?, ?, ?, 'Member', 'baptism', 'p1', 'c1', 'Fr. One', 'v1', 'Main church', ?, ?, ?, 15, 15)`)
    .run(id, `PL-TEST-${id}`, ownerId, startsAt, endsAt, status);
}
const appointmentRow = (id: string) => sql.prepare('SELECT status, starts_at AS startsAt, version FROM appointments WHERE id = ?').get(id) as { status: string; startsAt: string; version: number };
const requests = (id: string) => sql.prepare('SELECT kind, status, decision_note AS note FROM appointment_change_requests WHERE appointment_id = ? ORDER BY created_at, rowid').all(id) as { kind: string; status: string; note: string | null }[];
const pendingId = (id: string) => (sql.prepare("SELECT id FROM appointment_change_requests WHERE appointment_id = ? AND status = 'pending'").get(id) as { id: string }).id;
const decide = (actor: Actor, requestId: string, decision: 'approve' | 'reject', note?: string) =>
  performAdminMutation(actor, { action: 'change_request.decide', requestId, decision, ...(note ? { note } : {}) }, crypto.randomUUID());

beforeEach(() => {
  sql = migratedDatabase();
  sql.exec(`INSERT INTO parishes (id, slug, name) VALUES ('p1','p1','Parish One'), ('p2','p2','Parish Two');
    INSERT INTO service_types (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes) VALUES ('baptism','baptism','Baptism',60,15,15);
    INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES
      ('u1','member@example.test','Maria Member','parishioner','p1'), ('u2','other@example.test','Other Member','parishioner','p1'),
      ('staff1','staff1@example.test','Staff One','parish_staff','p1'), ('staff2','staff2@example.test','Staff Two','parish_staff','p2'),
      ('priest1','priest1@example.test','Fr. One','clergy','p1'), ('admin1','admin@example.test','Admin','system_admin',NULL);
    INSERT INTO clergy_profiles (id, user_id, display_title, home_parish_id) VALUES ('c1','priest1','Fr. One','p1');
    INSERT INTO venues (id, parish_id, name) VALUES ('v1','p1','Main church');
    INSERT INTO mobile_credentials (user_id, password_hash, password_salt) VALUES ('u1','x','y'), ('u2','x','y');`);
  runtime.getRawDb.mockReturnValue(d1(sql));
});

describe('parishioner change policy', () => {
  const soon = new Date(Date.now() + 3 * DAY).toISOString();
  const tomorrowish = new Date(Date.now() + 10 * 3_600_000).toISOString();
  const past = new Date(Date.now() - DAY).toISOString();
  it('cancels immediately before approval and by request after approval', () => {
    expect(parishionerChangeOptions('under_review', soon, false)).toEqual({ cancel: 'immediate', reschedule: true });
    expect(parishionerChangeOptions('approved', soon, false)).toEqual({ cancel: 'request', reschedule: true });
  });
  it('blocks changes for past or closed appointments, open requests, and late reschedules', () => {
    expect(parishionerChangeOptions('approved', past, false)).toEqual({ cancel: null, reschedule: false });
    expect(parishionerChangeOptions('completed', soon, false)).toEqual({ cancel: null, reschedule: false });
    expect(parishionerChangeOptions('approved', soon, true)).toEqual({ cancel: null, reschedule: false });
    expect(parishionerChangeOptions('submitted', tomorrowish, false)).toEqual({ cancel: 'immediate', reschedule: false });
  });
});

describe('parishioner cancellation', () => {
  it('cancels a not-yet-approved appointment immediately, records history, and is safe to retry', async () => {
    appointment('a1', 'u1', 'under_review', at(5, '09:30'));
    const result = await cancelMobileAppointment(member, 'a1', { reason: 'We moved to another city' });
    expect(result.workflowStatus).toBe('cancelled');
    expect(appointmentRow('a1').status).toBe('cancelled');
    expect(sql.prepare("SELECT COUNT(*) AS n FROM appointment_events WHERE appointment_id = 'a1' AND event_type = 'cancelled_by_parishioner'").get()).toEqual({ n: 1 });
    expect(sql.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'mobile.appointment.cancel'").get()).toEqual({ n: 1 });
    await expect(cancelMobileAppointment(member, 'a1', { reason: 'Retry after timeout' })).resolves.toMatchObject({ workflowStatus: 'cancelled' });
  });

  it('turns cancelling an approved appointment into a request the parish must confirm', async () => {
    appointment('a2', 'u1', 'approved', at(5, '09:30'));
    const result = await cancelMobileAppointment(member, 'a2', { reason: 'Family emergency abroad' });
    expect(appointmentRow('a2').status).toBe('approved');
    expect(result.pendingChange).toMatchObject({ kind: 'cancel' });
    expect(requests('a2')).toEqual([{ kind: 'cancel', status: 'pending', note: null }]);
    await cancelMobileAppointment(member, 'a2', { reason: 'Second tap' });
    expect(requests('a2')).toHaveLength(1);
  });

  it('requires a reason and hides other parishioners\u2019 appointments', async () => {
    appointment('a3', 'u1', 'submitted', at(5, '09:30'));
    await expect(cancelMobileAppointment(member, 'a3', { reason: '' })).rejects.toMatchObject({ status: 400 });
    await expect(cancelMobileAppointment(other, 'a3', { reason: 'Not mine' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('parishioner reschedule requests', () => {
  it('creates a pending request with the proposed time and keeps the current schedule', async () => {
    appointment('a4', 'u1', 'approved', at(5, '09:30'));
    const result = await requestMobileReschedule(member, 'a4', { date: manilaDate(7), time: '11:00 AM', reason: 'Godparent unavailable' });
    expect(result.pendingChange).toMatchObject({ kind: 'reschedule', proposedDate: manilaDate(7) });
    expect(result.allowedChanges).toEqual({ cancel: null, reschedule: false });
    expect(appointmentRow('a4').startsAt).toBe(at(5, '09:30'));
    await expect(requestMobileReschedule(member, 'a4', { date: manilaDate(8), time: '11:00 AM', reason: 'Another try' })).rejects.toMatchObject({ status: 409 });
  });

  it('rejects taken slots, the same time, unknown slots and requests under 24 hours ahead', async () => {
    appointment('a5', 'u1', 'submitted', at(5, '09:30'));
    appointment('busy', 'u2', 'approved', at(7, '11:00'));
    await expect(requestMobileReschedule(member, 'a5', { date: manilaDate(7), time: '11:00 AM', reason: 'Prefer this' })).rejects.toMatchObject({ status: 409 });
    await expect(requestMobileReschedule(member, 'a5', { date: manilaDate(5), time: '9:30 AM', reason: 'Same time' })).rejects.toMatchObject({ status: 400 });
    await expect(requestMobileReschedule(member, 'a5', { date: manilaDate(7), time: '2:17 AM', reason: 'Odd time' })).rejects.toMatchObject({ status: 400 });
    appointment('late', 'u1', 'approved', new Date(Date.now() + 6 * 3_600_000).toISOString());
    await expect(requestMobileReschedule(member, 'late', { date: manilaDate(9), time: '11:00 AM', reason: 'Too late' })).rejects.toMatchObject({ status: 409 });
  });

  it('lets the parishioner withdraw a pending request', async () => {
    appointment('a6', 'u1', 'approved', at(5, '09:30'));
    await requestMobileReschedule(member, 'a6', { date: manilaDate(9), time: '3:00 PM', reason: 'Work schedule' });
    const result = await withdrawMobileChangeRequest(member, 'a6');
    expect(result.pendingChange).toBeNull();
    expect(requests('a6')[0].status).toBe('withdrawn');
  });
});

describe('parish decisions on change requests', () => {
  it('approving a reschedule moves the appointment and sends it back for priest re-confirmation', async () => {
    appointment('b1', 'u1', 'approved', at(5, '09:30'));
    await requestMobileReschedule(member, 'b1', { date: manilaDate(9), time: '1:30 PM', reason: 'Sponsor arrives later' });
    await decide(staff, pendingId('b1'), 'approve');
    const row = appointmentRow('b1');
    expect(row.startsAt).toBe(at(9, '13:30'));
    expect(row.status).toBe('ready_to_approve');
    expect(requests('b1')[0].status).toBe('approved');
    const notice = sql.prepare("SELECT body FROM notifications WHERE recipient_user_id = 'u1' AND title = 'Reschedule approved'").get() as { body: string };
    expect(notice.body).toContain('re-confirm');
  });

  it('re-checks conflicts atomically at approval time', async () => {
    appointment('b2', 'u1', 'submitted', at(5, '09:30'));
    await requestMobileReschedule(member, 'b2', { date: manilaDate(10), time: '8:00 AM', reason: 'Earlier is better' });
    appointment('late-booking', 'u2', 'submitted', at(10, '08:00')); // someone else books the slot first
    await expect(decide(staff, pendingId('b2'), 'approve')).rejects.toMatchObject({ status: 409 });
    expect(appointmentRow('b2').startsAt).toBe(at(5, '09:30'));
    expect(requests('b2')[0].status).toBe('pending');
  });

  it('requires a note to decline, and confirms cancellations', async () => {
    appointment('b3', 'u1', 'approved', at(5, '09:30'));
    await cancelMobileAppointment(member, 'b3', { reason: 'Moving abroad' });
    await expect(decide(staff, pendingId('b3'), 'reject')).rejects.toMatchObject({ status: 400 });
    await decide(priest, pendingId('b3'), 'approve');
    expect(appointmentRow('b3').status).toBe('cancelled');
    appointment('b4', 'u1', 'approved', at(6, '09:30'));
    await requestMobileReschedule(member, 'b4', { date: manilaDate(11), time: '9:30 AM', reason: 'Prefer later' });
    await decide(staff, pendingId('b4'), 'reject', 'That week is reserved for the parish fiesta.');
    expect(requests('b4')[0]).toMatchObject({ status: 'rejected', note: 'That week is reserved for the parish fiesta.' });
    expect(appointmentRow('b4').startsAt).toBe(at(6, '09:30'));
  });

  it('allows only staff of the parish or the assigned priest to decide', async () => {
    appointment('b5', 'u1', 'approved', at(5, '09:30'));
    await cancelMobileAppointment(member, 'b5', { reason: 'Need to cancel' });
    await expect(decide(admin, pendingId('b5'), 'approve')).rejects.toMatchObject({ status: 403 });
    await expect(decide(otherStaff, pendingId('b5'), 'approve')).rejects.toMatchObject({ status: 403 });
  });

  it('closing an appointment withdraws its open request', async () => {
    appointment('b6', 'u1', 'approved', at(5, '09:30'));
    await requestMobileReschedule(member, 'b6', { date: manilaDate(12), time: '9:30 AM', reason: 'Later date' });
    await performAdminMutation(staff, { action: 'appointment.transition', appointmentId: 'b6', status: 'cancelled', expectedVersion: appointmentRow('b6').version, reason: 'Parish closure for repairs' }, crypto.randomUUID());
    expect(requests('b6')[0].status).toBe('withdrawn');
  });

  it('shows the request queue with decision rights and live slot availability', async () => {
    appointment('b7', 'u1', 'approved', at(5, '09:30'));
    await requestMobileReschedule(member, 'b7', { date: manilaDate(13), time: '9:30 AM', reason: 'Later date' });
    const staffView = (await loadDashboardState(staff)).changeRequests;
    expect(staffView[0]).toMatchObject({ kind: 'reschedule', status: 'pending', canDecide: true, proposedSlotAvailable: true, parishioner: 'Member' });
    const adminView = (await loadDashboardState(admin)).changeRequests;
    expect(adminView[0]).toMatchObject({ canDecide: false, parishioner: 'Restricted parishioner' });
  });
});

describe('reminders and the mobile snapshot', () => {
  it('plans 3-day, 1-day and missing-document reminders', () => {
    const now = new Date('2026-11-09T02:00:00Z');
    const base = { reference: 'PL-1', userId: 'u1', serviceName: 'Baptism', parishName: 'Parish One', missingDocuments: 0 };
    const plans = planReminders([
      { ...base, id: 'x1', status: 'approved', startsAt: '2026-11-09T20:00:00Z' },
      { ...base, id: 'x2', status: 'approved', startsAt: '2026-11-11T02:00:00Z' },
      { ...base, id: 'x3', status: 'documents_pending', startsAt: '2026-11-15T02:00:00Z', missingDocuments: 2 },
      { ...base, id: 'x4', status: 'approved', startsAt: '2026-11-20T02:00:00Z' },
    ], now);
    expect(plans.map((plan) => plan.dedupeKey)).toEqual(['reminder:x1:1d', 'reminder:x2:3d', 'reminder:x3:documents']);
  });

  it('creates each reminder once and returns announcements and allowed changes in the snapshot', async () => {
    appointment('c1', 'u1', 'approved', at(2, '09:30'));
    sql.exec(`INSERT INTO announcements (id, author_id, parish_id, audience, title, body, status, published_at)
      VALUES ('n1','staff1','p1','parish','Seminar','Baptismal seminar on Saturday.','published',datetime('now')),
             ('n2','staff2','p2','parish','Other parish','Not for this member.','published',datetime('now'))`);
    expect(await generateDueReminders({ userId: 'u1' })).toBe(1);
    const snapshot = await loadMobileSnapshot(member);
    expect(sql.prepare("SELECT COUNT(*) AS n FROM notifications WHERE type = 'reminder'").get()).toEqual({ n: 1 });
    expect(snapshot.announcements.map((item) => item.title)).toEqual(['Seminar']);
    expect(snapshot.appointments[0].allowedChanges).toEqual({ cancel: 'request', reschedule: true });
  });
});

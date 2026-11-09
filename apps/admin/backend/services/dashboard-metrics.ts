import { getRawDb } from '@/db/runtime';
import type { Actor, AppointmentStatus, DashboardMetrics } from '@/shared/domain';
import { scoped, announcementScope } from '@/backend/services/admin-scope';

/** Whole-scope counts are independent of the previews/pages sent to the UI. */
export async function loadDashboardMetrics(actor: Actor): Promise<DashboardMetrics> {
  const db = getRawDb();
  const appointments = scoped('a', actor, true);
  const assignments = scoped('ca', actor, true);
  const records = scoped('r', actor);
  const queue = scoped('q', actor);
  const announcements = announcementScope(actor);
  const privateAccess = actor.role === 'parish_staff' && Boolean(actor.parishId);
  const [statuses, docs, archive, schedule, notices, tickets] = await Promise.all([
    db.prepare(`SELECT a.status, COUNT(*) AS total FROM appointments a
      WHERE ${appointments.sql} GROUP BY a.status`).bind(...appointments.values).all<{ status: AppointmentStatus; total: number }>(),
    privateAccess ? db.prepare(`SELECT
      COALESCE(SUM(ds.status IN ('submitted','under_review')), 0) AS awaitingReview,
      COALESCE(SUM(ds.status = 'verified'), 0) AS verified
      FROM document_submissions ds JOIN appointments a ON a.id = ds.appointment_id
      WHERE ${appointments.sql}`).bind(...appointments.values).first<{ awaitingReview: number; verified: number }>() : null,
    privateAccess ? db.prepare(`SELECT COUNT(*) AS total FROM sacramental_records r
      WHERE ${records.sql} AND r.status = 'verified_against_archive'`).bind(...records.values).first<{ total: number }>() : null,
    db.prepare(`SELECT COUNT(*) AS total FROM clergy_assignments ca
      WHERE ${assignments.sql} AND ca.status = 'confirmed'`).bind(...assignments.values).first<{ total: number }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM announcements an
      WHERE ${announcements.sql} AND an.status = 'published'`).bind(...announcements.values).first<{ total: number }>(),
    actor.role !== 'clergy' ? db.prepare(`SELECT
      COALESCE(SUM(q.status = 'waiting'), 0) AS waiting,
      COALESCE(SUM(q.status = 'serving'), 0) AS serving FROM queue_tickets q
      WHERE ${queue.sql} AND q.status IN ('waiting','serving')`).bind(...queue.values).first<{ waiting: number; serving: number }>() : null,
  ]);
  return {
    appointmentStatuses: Object.fromEntries(statuses.results.map(row => [row.status, Number(row.total)])),
    awaitingDocumentReview: docs === null ? null : Number(docs.awaitingReview),
    verifiedDocuments: docs === null ? null : Number(docs.verified),
    verifiedRecords: archive === null ? null : Number(archive.total),
    confirmedAssignments: Number(schedule?.total ?? 0),
    publishedAnnouncements: Number(notices?.total ?? 0),
    waitingQueue: tickets === null ? null : Number(tickets.waiting),
    servingQueue: tickets === null ? null : Number(tickets.serving),
  };
}

import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-error';
import { scoped } from '@/backend/services/admin-scope';
import { utcTimestamp, validCalendarDate } from '@/shared/validation';
import {
  APPOINTMENT_STATUSES,
  type Actor,
  type AdminReport,
  type AppointmentStatus,
  type ReportAppointmentRow,
  type ReportBreakdownRow,
} from '@/shared/domain';

const MAX_REPORT_ROWS = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

function optionalFilterString(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  if (typeof value !== 'string') throw new AdminServiceError(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'all') return null;
  if (trimmed.length > max) throw new AdminServiceError(`${label} is too long.`);
  return trimmed;
}

function manilaStartOfDayIso(date: string): string {
  return new Date(`${date}T00:00:00+08:00`).toISOString();
}

function manilaExclusiveEndOfDayIso(date: string): string {
  return new Date(new Date(`${date}T00:00:00+08:00`).getTime() + DAY_MS).toISOString();
}

function roundOneDecimal(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(Number(value) * 10) / 10;
}

export async function generateAdminReport(
  actor: Actor,
  input: Record<string, unknown>,
): Promise<AdminReport> {
  if (
    !['system_admin', 'parish_staff', 'clergy'].includes(actor.role) ||
    (actor.role !== 'system_admin' && !actor.parishId) ||
    (actor.role === 'clergy' && !actor.clergyProfileId)
  ) {
    throw new AdminServiceError('Assigned internal access is required to generate operational reports.', 403);
  }

  const db = getRawDb();
  const requestedParishId = optionalFilterString(input.parishId, 'Parish filter', 100);
  if (requestedParishId && actor.role !== 'system_admin' && requestedParishId !== actor.parishId) {
    throw new AdminServiceError('You can only generate reports for your assigned parish.', 403);
  }

  let selectedParish: { id: string; name: string } | null = null;
  const effectiveParishId = actor.role === 'system_admin' ? requestedParishId : actor.parishId;
  if (effectiveParishId) {
    selectedParish = await db
      .prepare('SELECT id, name FROM parishes WHERE id = ? AND is_active = 1')
      .bind(effectiveParishId)
      .first<{ id: string; name: string }>();
    if (!selectedParish) throw new AdminServiceError('Choose an active parish.');
  }

  const serviceTypeId = optionalFilterString(input.serviceTypeId, 'Sacrament filter', 60);
  if (serviceTypeId) {
    const exists = await db
      .prepare('SELECT id FROM service_types WHERE id = ?')
      .bind(serviceTypeId)
      .first<{ id: string }>();
    if (!exists) throw new AdminServiceError('Choose a valid sacramental service.');
  }

  const rawStatus = optionalFilterString(input.status, 'Status filter', 40);
  if (rawStatus && !APPOINTMENT_STATUSES.includes(rawStatus as AppointmentStatus)) {
    throw new AdminServiceError('Choose a valid appointment status.');
  }
  const statusFilter: AppointmentStatus | 'all' = (rawStatus as AppointmentStatus | null) ?? 'all';

  const from = optionalFilterString(input.from, 'Start date', 10);
  const to = optionalFilterString(input.to, 'End date', 10);
  if (from && !validCalendarDate(from)) throw new AdminServiceError('Choose a valid start date.');
  if (to && !validCalendarDate(to)) throw new AdminServiceError('Choose a valid end date.');
  if (from && to && from > to) {
    throw new AdminServiceError('The start date must be on or before the end date.');
  }

  const appointmentScope = scoped('a', actor, true);
  const conditions: string[] = [appointmentScope.sql];
  const values: (string | number)[] = [...appointmentScope.values];

  if (actor.role === 'system_admin' && effectiveParishId) {
    conditions.push('a.parish_id = ?');
    values.push(effectiveParishId);
  }
  if (serviceTypeId) {
    conditions.push('a.service_type_id = ?');
    values.push(serviceTypeId);
  }
  if (statusFilter !== 'all') {
    conditions.push('a.status = ?');
    values.push(statusFilter);
  }
  const fromInstant = from ? manilaStartOfDayIso(from) : null;
  const toExclusiveInstant = to ? manilaExclusiveEndOfDayIso(to) : null;
  if (fromInstant) {
    conditions.push('julianday(a.starts_at) >= julianday(?)');
    values.push(fromInstant);
  }
  if (toExclusiveInstant) {
    conditions.push('julianday(a.starts_at) < julianday(?)');
    values.push(toExclusiveInstant);
  }

  const whereSql = conditions.join(' AND ');
  const privateStaffAccess = actor.role === 'parish_staff' && Boolean(actor.parishId);

  const queueConditions: string[] = [];
  const queueValues: (string | number)[] = [];
  if (effectiveParishId) {
    queueConditions.push('q.parish_id = ?');
    queueValues.push(effectiveParishId);
  } else {
    queueConditions.push('1 = 1');
  }
  if (fromInstant) {
    queueConditions.push('julianday(q.issued_at) >= julianday(?)');
    queueValues.push(fromInstant);
  }
  if (toExclusiveInstant) {
    queueConditions.push('julianday(q.issued_at) < julianday(?)');
    queueValues.push(toExclusiveInstant);
  }

  const [statusRows, serviceRows, parishRows, monthRows, docStats, archiveStats, queueStats, appointmentRows] =
    await Promise.all([
      db
        .prepare(`SELECT a.status AS status, COUNT(*) AS count FROM appointments a WHERE ${whereSql} GROUP BY a.status`)
        .bind(...values)
        .all<{ status: AppointmentStatus; count: number }>(),
      db
        .prepare(
          `SELECT s.id AS key, s.name AS label, COUNT(*) AS total,
             COALESCE(SUM(a.status IN ('approved','completed')), 0) AS approvedOrCompleted,
             COALESCE(SUM(a.status IN ('submitted','documents_pending','under_review','needs_changes','ready_to_approve')), 0) AS pending,
             COALESCE(SUM(a.status IN ('rejected','cancelled','no_show')), 0) AS closed
           FROM appointments a
           JOIN service_types s ON s.id = a.service_type_id
           WHERE ${whereSql}
           GROUP BY s.id, s.name
           ORDER BY total DESC, s.name ASC`,
        )
        .bind(...values)
        .all<ReportBreakdownRow>(),
      db
        .prepare(
          `SELECT p.id AS key, p.name AS label, COUNT(*) AS total,
             COALESCE(SUM(a.status IN ('approved','completed')), 0) AS approvedOrCompleted,
             COALESCE(SUM(a.status IN ('submitted','documents_pending','under_review','needs_changes','ready_to_approve')), 0) AS pending,
             COALESCE(SUM(a.status IN ('rejected','cancelled','no_show')), 0) AS closed
           FROM appointments a
           JOIN parishes p ON p.id = a.parish_id
           WHERE ${whereSql}
           GROUP BY p.id, p.name
           ORDER BY total DESC, p.name ASC`,
        )
        .bind(...values)
        .all<ReportBreakdownRow>(),
      db
        .prepare(
          `SELECT strftime('%Y-%m', a.starts_at, '+8 hours') AS month,
             COUNT(*) AS total,
             COALESCE(SUM(a.status = 'completed'), 0) AS completed,
             COALESCE(SUM(a.status = 'approved'), 0) AS approved
           FROM appointments a
           WHERE ${whereSql}
           GROUP BY month
           ORDER BY month ASC`,
        )
        .bind(...values)
        .all<{ month: string; total: number; completed: number; approved: number }>(),
      privateStaffAccess
        ? db
            .prepare(
              `SELECT
                 COALESCE(SUM(ds.status IN ('submitted','under_review')), 0) AS awaitingReview,
                 COALESCE(SUM(ds.status = 'verified'), 0) AS verified,
                 AVG(CASE
                   WHEN ds.submitted_at IS NOT NULL AND ds.reviewed_at IS NOT NULL
                     AND julianday(ds.reviewed_at) >= julianday(ds.submitted_at)
                   THEN (julianday(ds.reviewed_at) - julianday(ds.submitted_at)) * 24.0
                   ELSE NULL
                 END) AS avgHours
               FROM document_submissions ds
               JOIN appointments a ON a.id = ds.appointment_id
               WHERE ${whereSql}`,
            )
            .bind(...values)
            .first<{ awaitingReview: number; verified: number; avgHours: number | null }>()
        : Promise.resolve(null),
      privateStaffAccess
        ? db
            .prepare(
              `SELECT COUNT(*) AS total FROM sacramental_records r
               WHERE r.parish_id = ? AND r.status = 'verified_against_archive'`,
            )
            .bind(actor.parishId)
            .first<{ total: number }>()
        : Promise.resolve(null),
      actor.role !== 'clergy'
        ? db
            .prepare(
              `SELECT
                 COALESCE(SUM(q.status = 'served'), 0) AS served,
                 AVG(CASE
                   WHEN q.called_at IS NOT NULL AND julianday(q.called_at) >= julianday(q.issued_at)
                   THEN (julianday(q.called_at) - julianday(q.issued_at)) * 1440.0
                   ELSE NULL
                 END) AS avgWaitMinutes
               FROM queue_tickets q
               WHERE ${queueConditions.join(' AND ')}`,
            )
            .bind(...queueValues)
            .first<{ served: number; avgWaitMinutes: number | null }>()
        : Promise.resolve(null),
      db
        .prepare(
          `SELECT a.id, a.reference, a.parishioner_name AS parishioner,
             s.name AS service, p.name AS parish,
             COALESCE(a.clergy_name, 'Unassigned') AS clergy,
             COALESCE(a.venue_name, 'Unassigned') AS venue,
             a.starts_at AS startsAt, a.status,
             (SELECT COUNT(*) FROM document_submissions ds WHERE ds.appointment_id = a.id AND ds.is_required = 1 AND ds.status = 'verified') AS verifiedDocuments,
             (SELECT COUNT(*) FROM document_submissions ds WHERE ds.appointment_id = a.id AND ds.is_required = 1) AS requiredDocuments
           FROM appointments a
           JOIN parishes p ON p.id = a.parish_id
           JOIN service_types s ON s.id = a.service_type_id
           WHERE ${whereSql}
           ORDER BY julianday(a.starts_at) DESC, a.id DESC
           LIMIT ?`,
        )
        .bind(...values, MAX_REPORT_ROWS + 1)
        .all<ReportAppointmentRow>(),
    ]);

  const countsByStatus = new Map<AppointmentStatus, number>();
  for (const row of statusRows.results) {
    countsByStatus.set(row.status, Number(row.count));
  }

  let appointmentsTotal = 0;
  let pendingTotal = 0;
  for (const status of APPOINTMENT_STATUSES) {
    const count = countsByStatus.get(status) ?? 0;
    appointmentsTotal += count;
    if (['submitted', 'documents_pending', 'under_review', 'needs_changes', 'ready_to_approve'].includes(status)) {
      pendingTotal += count;
    }
  }
  const approvedTotal = countsByStatus.get('approved') ?? 0;
  const completedTotal = countsByStatus.get('completed') ?? 0;
  const cancelledOrRejected = (countsByStatus.get('cancelled') ?? 0) + (countsByStatus.get('rejected') ?? 0);
  const noShowTotal = countsByStatus.get('no_show') ?? 0;

  const scopeLabel =
    actor.role === 'clergy'
      ? `${actor.name} · ${selectedParish?.name ?? actor.parishName}`
      : selectedParish
        ? selectedParish.name
        : 'Vicariate-wide (all eight parishes)';

  const boundedAppointments = appointmentRows.results.slice(0, MAX_REPORT_ROWS).map((row) => ({
    ...row,
    parishioner: actor.role === 'system_admin' ? 'Restricted parishioner' : row.parishioner,
    startsAt: new Date(utcTimestamp(row.startsAt)).toISOString(),
    verifiedDocuments: Number(row.verifiedDocuments),
    requiredDocuments: Number(row.requiredDocuments),
  }));

  return {
    filters: {
      parishId: effectiveParishId ?? null,
      serviceTypeId,
      status: statusFilter,
      from,
      to,
    },
    scopeLabel,
    generatedAt: new Date().toISOString(),
    totals: {
      appointments: appointmentsTotal,
      approved: approvedTotal,
      completed: completedTotal,
      pending: pendingTotal,
      cancelledOrRejected,
      noShow: noShowTotal,
      awaitingDocumentReview: docStats === null ? null : Number(docStats?.awaitingReview ?? 0),
      verifiedDocuments: docStats === null ? null : Number(docStats?.verified ?? 0),
      avgDocumentReviewHours: docStats === null ? null : roundOneDecimal(docStats?.avgHours),
      verifiedRecords: archiveStats === null ? null : Number(archiveStats?.total ?? 0),
      queueServed: queueStats === null ? null : Number(queueStats?.served ?? 0),
      avgQueueWaitMinutes: queueStats === null ? null : roundOneDecimal(queueStats?.avgWaitMinutes),
    },
    byStatus: APPOINTMENT_STATUSES.map((status) => ({
      status,
      count: countsByStatus.get(status) ?? 0,
    })).filter((item) => item.count > 0 || statusFilter === item.status),
    byService: serviceRows.results.map((row) => ({
      ...row,
      total: Number(row.total),
      approvedOrCompleted: Number(row.approvedOrCompleted),
      pending: Number(row.pending),
      closed: Number(row.closed),
    })),
    byParish: parishRows.results.map((row) => ({
      ...row,
      total: Number(row.total),
      approvedOrCompleted: Number(row.approvedOrCompleted),
      pending: Number(row.pending),
      closed: Number(row.closed),
    })),
    byMonth: monthRows.results
      .filter((row) => Boolean(row.month))
      .map((row) => ({
        month: row.month,
        total: Number(row.total),
        completed: Number(row.completed),
        approved: Number(row.approved),
      })),
    appointments: boundedAppointments,
    appointmentsTruncated: appointmentRows.results.length > MAX_REPORT_ROWS,
  };
}

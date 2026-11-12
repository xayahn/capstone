import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-error';
import { utcTimestamp, validCalendarDate } from '@/shared/validation';
import type { Actor, AuditLogCursor, AuditLogEntry, AuditLogPage } from '@/shared/domain';

const PAGE_SIZE = 25;
const DAY_MS = 24 * 60 * 60 * 1000;

type AuditRow = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  parishId: string | null;
  parish: string;
  actorName: string | null;
  actorRole: string | null;
  outcome: 'success' | 'denied';
  detail: string | null;
  createdAt: string;
};

function optionalString(value: unknown, label: string, max: number): string | null {
  if (value === undefined || value === null || value === '' || value === 'all') return null;
  if (typeof value !== 'string') throw new AdminServiceError(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'all') return null;
  if (trimmed.length > max) throw new AdminServiceError(`${label} is too long.`);
  return trimmed;
}

export async function searchAuditLogs(
  actor: Actor,
  input: Record<string, unknown>,
): Promise<AuditLogPage> {
  if (actor.role === 'clergy') {
    throw new AdminServiceError('Audit logs are limited to parish staff and system administrators.', 403);
  }
  if (actor.role === 'parish_staff' && !actor.parishId) {
    throw new AdminServiceError('Assigned parish staff access is required to browse audit logs.', 403);
  }
  if (actor.role !== 'system_admin' && actor.role !== 'parish_staff') {
    throw new AdminServiceError('Audit logs are limited to parish staff and system administrators.', 403);
  }

  if (input.query !== undefined && typeof input.query !== 'string') {
    throw new AdminServiceError('Search must be text.');
  }
  const query = ((input.query as string | undefined) ?? '').trim();
  if (query.length > 120) {
    throw new AdminServiceError('Search must be 120 characters or fewer.');
  }

  const requestedParishId = optionalString(input.parishId, 'Parish filter', 100);
  if (actor.role === 'parish_staff' && requestedParishId && requestedParishId !== actor.parishId) {
    throw new AdminServiceError('You can only browse audit logs for your assigned parish.', 403);
  }

  const action = optionalString(input.action, 'Action filter', 80);
  if (action && !/^[a-z0-9._-]+$/i.test(action)) {
    throw new AdminServiceError('Choose a valid audit action filter.');
  }

  const rawOutcome = input.outcome ?? 'all';
  if (!['all', 'success', 'denied'].includes(rawOutcome as string)) {
    throw new AdminServiceError('Choose all, success, or denied audit outcomes.');
  }
  const outcome = rawOutcome as 'all' | 'success' | 'denied';

  const from = optionalString(input.from, 'Start date', 10);
  const to = optionalString(input.to, 'End date', 10);
  if (from && !validCalendarDate(from)) throw new AdminServiceError('Choose a valid start date.');
  if (to && !validCalendarDate(to)) throw new AdminServiceError('Choose a valid end date.');
  if (from && to && from > to) {
    throw new AdminServiceError('The start date must be on or before the end date.');
  }

  let cursor: AuditLogCursor | null = null;
  if (input.cursor != null) {
    if (typeof input.cursor !== 'object' || Array.isArray(input.cursor)) {
      throw new AdminServiceError('Invalid audit log page.');
    }
    const value = input.cursor as Record<string, unknown>;
    if (
      typeof value.createdAt !== 'string' ||
      value.createdAt.length > 40 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.createdAt) ||
      !validCalendarDate(value.createdAt.slice(0, 10)) ||
      !Number.isFinite(Date.parse(value.createdAt)) ||
      new Date(value.createdAt).toISOString() !== value.createdAt ||
      typeof value.id !== 'string' ||
      !value.id ||
      value.id.length > 100
    ) {
      throw new AdminServiceError('Invalid audit log page.');
    }
    cursor = { createdAt: value.createdAt, id: value.id };
  }

  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (actor.role === 'parish_staff') {
    conditions.push('al.parish_id = ?');
    values.push(actor.parishId as string);
  } else if (requestedParishId === 'vicariate') {
    conditions.push('al.parish_id IS NULL');
  } else if (requestedParishId) {
    conditions.push('al.parish_id = ?');
    values.push(requestedParishId);
  } else {
    conditions.push('1 = 1');
  }

  if (outcome !== 'all') {
    conditions.push('al.outcome = ?');
    values.push(outcome);
  }

  if (action) {
    if (action.includes('.')) {
      conditions.push('al.action = ?');
      values.push(action);
    } else {
      const escapedPrefix = action.replace(/[\\%_]/g, '\\$&');
      conditions.push("(al.action = ? OR al.action LIKE ? ESCAPE '\\')");
      values.push(action, `${escapedPrefix}.%`);
    }
  }

  if (from) {
    conditions.push('julianday(al.created_at) >= julianday(?)');
    values.push(new Date(`${from}T00:00:00+08:00`).toISOString());
  }
  if (to) {
    conditions.push('julianday(al.created_at) < julianday(?)');
    values.push(new Date(new Date(`${to}T00:00:00+08:00`).getTime() + DAY_MS).toISOString());
  }

  if (query) {
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    if (actor.role === 'system_admin') {
      // Redacted parishioner names and private document review notes are never searchable by technical admin.
      conditions.push(
        `(al.action LIKE ? ESCAPE '\\'
          OR al.entity_type LIKE ? ESCAPE '\\'
          OR COALESCE(p.name, 'Vicariate-wide') LIKE ? ESCAPE '\\'
          OR (CASE WHEN al.entity_type = 'document_submission' THEN '' ELSE COALESCE(al.detail, '') END) LIKE ? ESCAPE '\\'
          OR (CASE WHEN u.role = 'parishioner' THEN '' ELSE COALESCE(u.full_name, '') END) LIKE ? ESCAPE '\\')`,
      );
      values.push(pattern, pattern, pattern, pattern, pattern);
    } else {
      conditions.push(
        `(al.action LIKE ? ESCAPE '\\'
          OR al.entity_type LIKE ? ESCAPE '\\'
          OR COALESCE(al.detail, '') LIKE ? ESCAPE '\\'
          OR COALESCE(u.full_name, '') LIKE ? ESCAPE '\\')`,
      );
      values.push(pattern, pattern, pattern, pattern);
    }
  }

  if (cursor) {
    conditions.push(
      '(julianday(al.created_at) < julianday(?) OR (julianday(al.created_at) = julianday(?) AND al.id < ?))',
    );
    values.push(cursor.createdAt, cursor.createdAt, cursor.id);
  }

  values.push(PAGE_SIZE + 1);
  const result = await getRawDb()
    .prepare(
      `SELECT al.id, al.action, al.entity_type AS entityType, al.entity_id AS entityId,
         al.parish_id AS parishId, COALESCE(p.name, 'Vicariate-wide') AS parish,
         u.full_name AS actorName, u.role AS actorRole,
         al.outcome AS outcome, al.detail AS detail, al.created_at AS createdAt
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       LEFT JOIN parishes p ON p.id = al.parish_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY julianday(al.created_at) DESC, al.id DESC
       LIMIT ?`,
    )
    .bind(...values)
    .all<AuditRow>();

  const entries: AuditLogEntry[] = result.results.slice(0, PAGE_SIZE).map((row) => {
    const isRestrictedParishioner = actor.role === 'system_admin' && row.actorRole === 'parishioner';
    const redactedDetail =
      actor.role === 'system_admin' && row.entityType === 'document_submission' && row.detail
        ? row.detail.split(':')[0] ?? null
        : row.detail;

    return {
      id: row.id,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      parishId: row.parishId,
      parish: row.parish,
      actorName: isRestrictedParishioner ? 'Restricted parishioner' : row.actorName ?? 'System',
      actorRole: row.actorRole,
      outcome: row.outcome,
      detail: redactedDetail,
      createdAt: new Date(utcTimestamp(row.createdAt)).toISOString(),
    };
  });

  const last = entries.at(-1);
  return {
    entries,
    nextCursor:
      result.results.length > PAGE_SIZE && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

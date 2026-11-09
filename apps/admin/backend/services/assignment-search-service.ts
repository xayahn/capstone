import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-service';
import { scoped } from '@/backend/services/admin-scope';
import { utcTimestamp, validCalendarDate } from '@/shared/validation';
import type { Actor, AssignmentCursor, AssignmentPage, ClergyAssignment } from '@/shared/domain';

const PAGE_SIZE = 25;

/** Scope and pagination are server-owned; the client cannot request a larger page. */
export async function searchClergyAssignments(actor: Actor, input: Record<string, unknown>): Promise<AssignmentPage> {
  if (!['system_admin', 'parish_staff', 'clergy'].includes(actor.role)
    || (actor.role !== 'system_admin' && !actor.parishId)
    || (actor.role === 'clergy' && !actor.clergyProfileId)) {
    throw new AdminServiceError('Assigned internal access is required to browse this schedule.', 403);
  }
  if (input.query !== undefined && typeof input.query !== 'string') throw new AdminServiceError('Search must be text.');
  const query = (input.query as string | undefined)?.trim() ?? '';
  if (query.length > 120) throw new AdminServiceError('Search must be 120 characters or fewer.');
  const period = input.period ?? 'upcoming';
  if (!['upcoming', 'past', 'all'].includes(period as string)) throw new AdminServiceError('Choose upcoming, past or all assignments.');
  let cursor: AssignmentCursor | null = null;
  if (input.cursor != null) {
    if (typeof input.cursor !== 'object' || Array.isArray(input.cursor)) throw new AdminServiceError('Invalid schedule page.');
    const value = input.cursor as Record<string, unknown>;
    if (typeof value.startsAt !== 'string' || value.startsAt.length > 40
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.startsAt)
      || !validCalendarDate(value.startsAt.slice(0, 10)) || !Number.isFinite(Date.parse(value.startsAt))
      || new Date(value.startsAt).toISOString() !== value.startsAt
      || typeof value.id !== 'string' || !value.id || value.id.length > 100) throw new AdminServiceError('Invalid schedule page.');
    cursor = { startsAt: value.startsAt, id: value.id };
  }
  const scope = scoped('ca', actor, true);
  const conditions = [scope.sql, "ca.status = 'confirmed'"];
  const values: (string | number)[] = [...scope.values];
  if (query) {
    const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
    conditions.push("(ca.clergy_name LIKE ? ESCAPE '\\' OR ca.service LIKE ? ESCAPE '\\' OR ca.venue_name LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\')");
    values.push(pattern, pattern, pattern, pattern);
  }
  // In-progress assignments stay upcoming until their end, in the server's clock.
  if (period === 'upcoming') conditions.push("julianday(ca.ends_at) >= julianday('now')");
  if (period === 'past') conditions.push("julianday(ca.ends_at) < julianday('now')");
  if (cursor) {
    conditions.push('(julianday(ca.starts_at) > julianday(?) OR (julianday(ca.starts_at) = julianday(?) AND ca.id > ?))');
    values.push(cursor.startsAt, cursor.startsAt, cursor.id);
  }
  values.push(PAGE_SIZE + 1);
  const result = await getRawDb().prepare(`SELECT ca.id, ca.clergy_name AS clergy, p.name AS parish,
      ca.venue_name AS venue, ca.service, ca.starts_at AS startsAt, ca.ends_at AS endsAt
    FROM clergy_assignments ca JOIN parishes p ON p.id = ca.parish_id
    WHERE ${conditions.join(' AND ')} ORDER BY julianday(ca.starts_at), ca.id LIMIT ?`)
    .bind(...values).all<ClergyAssignment>();
  const assignments = result.results.slice(0, PAGE_SIZE).map(row => ({
    ...row, startsAt: new Date(utcTimestamp(row.startsAt)).toISOString(), endsAt: new Date(utcTimestamp(row.endsAt)).toISOString(),
  }));
  const last = assignments.at(-1);
  return { assignments, nextCursor: result.results.length > PAGE_SIZE && last ? { startsAt: last.startsAt, id: last.id } : null };
}

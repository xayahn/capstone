import { getRawDb } from '@/db/runtime';
import { AdminServiceError } from '@/backend/services/admin-service';
import { validCalendarDate } from '@/shared/validation';
import type { Actor, ParishRecord, ParishRecordCursor, ParishRecordPage } from '@/shared/domain';

const PAGE_SIZE = 25;

/** All scope comes from the authenticated actor, never from client parish IDs. */
export async function searchParishRecords(actor: Actor, input: Record<string, unknown>): Promise<ParishRecordPage> {
  if (actor.role !== 'parish_staff' || !actor.parishId) throw new AdminServiceError('Records require assigned parish staff access.', 403);
  if (input.query !== undefined && typeof input.query !== 'string') throw new AdminServiceError('Search must be text.');
  const query = (input.query as string | undefined)?.trim() ?? '';
  if (query.length > 120) throw new AdminServiceError('Search must be 120 characters or fewer.');
  let cursor: ParishRecordCursor | null = null;
  if (input.cursor != null) {
    if (typeof input.cursor !== 'object' || Array.isArray(input.cursor)) throw new AdminServiceError('Invalid record page.');
    const value = input.cursor as Record<string, unknown>;
    if (typeof value.eventDate !== 'string' || !validCalendarDate(value.eventDate)
      || typeof value.id !== 'string' || !value.id || value.id.length > 100) throw new AdminServiceError('Invalid record page.');
    cursor = { eventDate: value.eventDate, id: value.id };
  }
  const pattern = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const conditions = [
    'r.parish_id = ?',
    "(r.subject_name LIKE ? ESCAPE '\\' OR r.reference LIKE ? ESCAPE '\\' OR r.record_type LIKE ? ESCAPE '\\')",
  ];
  const values: (string | number)[] = [actor.parishId, pattern, pattern, pattern];
  if (cursor) {
    conditions.push('(r.event_date < ? OR (r.event_date = ? AND r.id < ?))');
    values.push(cursor.eventDate, cursor.eventDate, cursor.id);
  }
  values.push(PAGE_SIZE + 1);
  const result = await getRawDb().prepare(`SELECT r.id, r.record_type AS type, r.subject_name AS subject,
      p.name AS parish, r.event_date AS eventDate, r.reference, r.status
    FROM sacramental_records r JOIN parishes p ON p.id = r.parish_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.event_date DESC, r.id DESC LIMIT ?`)
    .bind(...values).all<ParishRecord>();
  const records = result.results.slice(0, PAGE_SIZE);
  const last = records.at(-1);
  return {
    records,
    nextCursor: result.results.length > PAGE_SIZE && last ? { eventDate: last.eventDate, id: last.id } : null,
  };
}

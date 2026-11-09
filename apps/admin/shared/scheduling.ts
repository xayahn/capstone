// SQL fragments take internal aliases only, never user input.

/** Statuses that no longer occupy a priest or venue. */
export const NON_BLOCKING_APPOINTMENT_STATUSES_SQL = `('rejected','completed','cancelled','no_show')`;

/**
 * Start of the interval an appointment occupies, including its buffer before.
 * Uses the buffer captured at booking time; older rows fall back to the service default.
 */
export function occupiedStart(alias: string): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid scheduling alias');
  return `datetime(${alias}.starts_at, '-' || COALESCE(${alias}.buffer_before_minutes, (SELECT buffer_before_minutes FROM service_types WHERE id = ${alias}.service_type_id), 0) || ' minutes')`;
}

/** End of the interval an appointment occupies, including its buffer after. */
export function occupiedEnd(alias: string): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid scheduling alias');
  return `datetime(${alias}.ends_at, '+' || COALESCE(${alias}.buffer_after_minutes, (SELECT buffer_after_minutes FROM service_types WHERE id = ${alias}.service_type_id), 0) || ' minutes')`;
}

export type ResourceInterval = {
  /** Start of the interval to reserve (already including any buffer before). ISO-8601. */
  blockedStart: string;
  /** End of the interval to reserve (already including any buffer after). ISO-8601. */
  blockedEnd: string;
  clergyId: string;
  venueId: string;
  parishId: string;
  /** An appointment that should not conflict with itself (used when rescheduling). */
  excludeAppointmentId?: string | null;
};

/**
 * Conflict-aware scheduling engine (single shared definition).
 *
 * Returns a boolean SQL expression that is true when the requested interval
 * [blockedStart, blockedEnd) overlaps, for the same priest OR the same venue anywhere
 * in the Vicariate:
 *   1. an active appointment (its own buffers included),
 *   2. an availability block (priest/venue unavailable, or a parish-wide closure), or
 *   3. a confirmed clergy assignment (for example a Mass).
 * Two intervals [s1, e1) and [s2, e2) overlap when s1 < e2 and s2 < e1.
 *
 * Use it inside the same INSERT/UPDATE statement (`WHERE NOT <sql>`) so the check
 * and the write happen atomically.
 */
export function resourceConflict(interval: ResourceInterval): { sql: string; values: (string | null)[] } {
  const exclude = interval.excludeAppointmentId ?? null;
  const sql = `(EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.status NOT IN ${NON_BLOCKING_APPOINTMENT_STATUSES_SQL}
        AND (? IS NULL OR a.id <> ?)
        AND ${occupiedStart('a')} < datetime(?) AND ${occupiedEnd('a')} > datetime(?)
        AND (a.clergy_id = ? OR a.venue_id = ?)
    ) OR EXISTS (
      SELECT 1 FROM availability_blocks ab
      WHERE datetime(ab.starts_at) < datetime(?) AND datetime(ab.ends_at) > datetime(?)
        AND (ab.clergy_id = ? OR ab.venue_id = ? OR (ab.clergy_id IS NULL AND ab.venue_id IS NULL AND ab.parish_id = ?))
    ) OR EXISTS (
      SELECT 1 FROM clergy_assignments ca
      WHERE ca.status = 'confirmed'
        AND datetime(ca.starts_at) < datetime(?) AND datetime(ca.ends_at) > datetime(?)
        AND (ca.clergy_id = ? OR ca.venue_id = ?)
    ))`;
  const { blockedStart, blockedEnd, clergyId, venueId, parishId } = interval;
  return {
    sql,
    values: [
      exclude, exclude, blockedEnd, blockedStart, clergyId, venueId,
      blockedEnd, blockedStart, clergyId, venueId, parishId,
      blockedEnd, blockedStart, clergyId, venueId,
    ],
  };
}

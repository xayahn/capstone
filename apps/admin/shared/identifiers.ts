const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Returns the 4-digit calendar year in Asia/Manila time. */
export function manilaYear(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).formatToParts(now);
  return parts.find((part) => part.type === 'year')?.value ?? String(now.getUTCFullYear());
}

/**
 * Generates a human-readable 6-character Crockford Base32 appointment reference
 * (`PL-YYYY-XXXXXX`) suitable for reading aloud or writing on a parish slip.
 */
export function shortAppointmentReference(now: Date = new Date()): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (byte) => CROCKFORD_BASE32[byte & 31]).join('');
  return `PL-${manilaYear(now)}-${code}`;
}

/** Returns the current month-day (`MMDD`) in Asia/Manila time (for example `1113`). */
export function manilaMonthDay(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.month ?? '01'}${byType.day ?? '01'}`;
}

/** Returns the UTC ISO timestamp corresponding to 00:00:00 of the current Asia/Manila calendar day. */
export function manilaStartOfDayUtcIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Manila',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const dateStr = `${byType.year ?? '2026'}-${byType.month ?? '01'}-${byType.day ?? '01'}`;
  return new Date(`${dateStr}T00:00:00+08:00`).toISOString();
}

export function formatSequentialTicketNumber(mmdd: string, sequence: number): string {
  const safeSequence = Math.max(1, Math.trunc(sequence));
  return `${mmdd}-${String(safeSequence).padStart(3, '0')}`;
}

type QueueTicketQueryDb = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
    };
  };
};

type QueueTicketCleanupDb = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
    };
  };
};

/**
 * Automatically closes any unserved walk-in queue tickets issued before the start of today
 * in Asia/Manila time so leftover tickets from a previous day never block today's queue.
 */
export async function expirePreviousDayQueueTickets(
  db: QueueTicketCleanupDb,
  now: Date = new Date(),
): Promise<void> {
  const cutoffIso = manilaStartOfDayUtcIso(now);
  await db
    .prepare(
      `UPDATE queue_tickets
       SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, datetime('now')), updated_at = datetime('now')
       WHERE status IN ('waiting', 'serving') AND julianday(issued_at) < julianday(?)`,
    )
    .bind(cutoffIso)
    .run();
}

/**
 * Computes the next per-parish daily sequential ticket number (`MMDD-001`, `MMDD-002`, …).
 * Callers still rely on `idx_queue_ticket_parish_number` and retry on concurrent collisions.
 */
export async function nextParishQueueTicketNumber(
  db: QueueTicketQueryDb,
  parishId: string,
  now: Date = new Date(),
): Promise<string> {
  const mmdd = manilaMonthDay(now);
  const rows = await db
    .prepare('SELECT ticket_number AS ticketNumber FROM queue_tickets WHERE parish_id = ? AND ticket_number LIKE ?')
    .bind(parishId, `${mmdd}-%`)
    .all<{ ticketNumber: string }>();

  let maxSequence = 0;
  for (const row of rows.results) {
    const match = /^\d{4}-(\d+)$/.exec(row.ticketNumber);
    if (!match) continue;
    const parsed = Number.parseInt(match[1] ?? '0', 10);
    if (Number.isFinite(parsed) && parsed > maxSequence) {
      maxSequence = parsed;
    }
  }
  return formatSequentialTicketNumber(mmdd, maxSequence + 1);
}

export function isUniqueConstraintError(error: unknown): boolean {
  return /unique|constraint/i.test(String(error));
}

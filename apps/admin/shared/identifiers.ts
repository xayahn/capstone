const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a human-readable 6-character Crockford Base32 appointment reference
 * (`PL-YYYY-XXXXXX`) suitable for reading aloud or writing on a parish slip.
 */
export function shortAppointmentReference(now: Date = new Date()): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const code = Array.from(bytes, (byte) => CROCKFORD_BASE32[byte & 31]).join('');
  return `PL-${now.getUTCFullYear()}-${code}`;
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

import { getRawDb } from '@/db/runtime';
import { utcTimestamp } from '@/shared/validation';

/**
 * In-app reminders (paper Table 4.11 "Reminder").
 *
 * Reminders are generated deterministically when a parishioner opens the app or
 * when parish personnel load the portal, so no background scheduler is needed in
 * the local deployment. Each reminder has a unique `dedupe_key`, so it is created
 * at most once no matter how often this runs. If push notifications are enabled,
 * the existing database trigger also queues a push delivery for each new reminder.
 *
 * Schedule reminders (1-day and 3-day) include the appointment's start time in
 * their key, so an appointment moved by an approved reschedule is reminded again
 * for its new time. The documents reminder is about missing files, not the time,
 * so it is sent once per appointment.
 */

const HOUR = 3_600_000;
/** Cloudflare D1 accepts at most 100 bound parameters per query. */
const MAX_BOUND_PARAMETERS = 90;

type Candidate = {
  id: string;
  reference: string;
  userId: string;
  startsAt: string;
  status: string;
  serviceName: string;
  parishName: string;
  missingDocuments: number;
};

export type ReminderWindow = '1d' | '3d';
export type ReminderPlan = {
  userId: string;
  appointmentId: string;
  /** The appointment start exactly as stored (used to match push reminders). */
  startsAt: string;
  window: ReminderWindow | 'documents';
  dedupeKey: string;
  title: string;
  body: string;
};

function manilaLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

function manilaCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Unix seconds of a stored start time; equals SQLite `strftime('%s', starts_at)`. */
export function startEpochSeconds(startsAt: string): number | null {
  const ms = Date.parse(utcTimestamp(startsAt));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/** De-duplication key for a schedule reminder, tied to the appointment's current start time. */
export function scheduleReminderKey(appointmentId: string, startsAt: string, window: ReminderWindow): string | null {
  const seconds = startEpochSeconds(startsAt);
  return seconds === null ? null : `reminder:${appointmentId}:${seconds}:${window}`;
}

/** Key format used before reminder keys included the start time. */
export function legacyScheduleReminderKey(appointmentId: string, window: ReminderWindow): string {
  return `reminder:${appointmentId}:${window}`;
}

/** Id the push dispatcher gives its own 24-hour reminder for this appointment time. */
export function pushReminderId(appointmentId: string, startsAt: string): string {
  return `appointment-reminder:${appointmentId}:${startsAt}`;
}

/** Pure planning step (unit-tested): which reminders are due for these appointments at `now`. */
export function planReminders(candidates: Candidate[], now: Date): ReminderPlan[] {
  const plans: ReminderPlan[] = [];
  for (const item of candidates) {
    const startMs = Date.parse(utcTimestamp(item.startsAt));
    if (!Number.isFinite(startMs)) continue;
    const msUntil = startMs - now.getTime();
    if (msUntil <= 0) continue;
    const when = manilaLabel(new Date(startMs).toISOString());
    if (item.status === 'approved' || item.status === 'ready_to_approve') {
      const confirmed = item.status === 'approved' ? '' : ' Final approval by the parish is still pending.';
      const window: ReminderWindow | null = msUntil <= 24 * HOUR ? '1d' : msUntil <= 72 * HOUR ? '3d' : null;
      const dedupeKey = window ? scheduleReminderKey(item.id, item.startsAt, window) : null;
      if (window && dedupeKey) {
        const title = window === '3d'
          ? 'Upcoming appointment'
          : manilaCalendarDay(new Date(startMs)) === manilaCalendarDay(now) ? 'Appointment today' : 'Appointment tomorrow';
        plans.push({ userId: item.userId, appointmentId: item.id, startsAt: item.startsAt, window, dedupeKey, title,
          body: `${item.serviceName} at ${item.parishName} is scheduled for ${when} (${item.reference}).${confirmed}` });
      }
    }
    if (['submitted', 'documents_pending', 'under_review', 'needs_changes'].includes(item.status)
      && item.missingDocuments > 0 && msUntil <= 14 * 24 * HOUR) {
      plans.push({ userId: item.userId, appointmentId: item.id, startsAt: item.startsAt, window: 'documents',
        dedupeKey: `reminder:${item.id}:documents`, title: 'Documents still needed',
        body: `${item.reference} (${item.serviceName}, ${when}) still has ${item.missingDocuments} required document${item.missingDocuments === 1 ? '' : 's'} to upload or replace before the parish can approve it.` });
    }
  }
  return plans;
}

function chunks<T>(items: T[], size = MAX_BOUND_PARAMETERS): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function existingValues(db: D1Database, sqlFor: (placeholders: string) => string, values: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks([...new Set(values)])) {
    const rows = await db.prepare(sqlFor(part.map(() => '?').join(','))).bind(...part).all<{ value: string }>();
    for (const row of rows.results) found.add(row.value);
  }
  return found;
}

/**
 * Create any due reminders. Pass a parishioner id to limit the work to one person
 * (mobile app), or omit it to cover every upcoming appointment (portal).
 * Returns the number of new reminder notifications.
 */
export async function generateDueReminders(options: { userId?: string; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const db = getRawDb();
  const horizon = new Date(now.getTime() + 14 * 24 * HOUR).toISOString();
  const result = await db.prepare(`SELECT a.id, a.reference, a.parishioner_user_id AS userId, a.starts_at AS startsAt, a.status,
      s.name AS serviceName, p.name AS parishName,
      (SELECT COUNT(*) FROM document_submissions ds WHERE ds.appointment_id = a.id AND ds.is_required = 1
        AND ds.status IN ('not_submitted','needs_replacement')) AS missingDocuments
    FROM appointments a
    JOIN service_types s ON s.id = a.service_type_id
    JOIN parishes p ON p.id = a.parish_id
    JOIN users u ON u.id = a.parishioner_user_id AND u.is_active = 1
    WHERE a.status IN ('submitted','documents_pending','under_review','needs_changes','ready_to_approve','approved')
      AND datetime(a.starts_at) > datetime(?) AND datetime(a.starts_at) <= datetime(?)
      AND (? IS NULL OR a.parishioner_user_id = ?)`)
    .bind(now.toISOString(), horizon, options.userId ?? null, options.userId ?? null)
    .all<Candidate>();
  const plans = planReminders(result.results.map((row) => ({ ...row, missingDocuments: Number(row.missingDocuments) })), now);
  if (plans.length === 0) return 0;

  const schedulePlans = plans.filter((plan): plan is ReminderPlan & { window: ReminderWindow } => plan.window !== 'documents');
  const oneDayPlans = schedulePlans.filter((plan) => plan.window === '1d');
  const [known, legacyStillValid, pushReminded] = await Promise.all([
    existingValues(db, (list) => `SELECT dedupe_key AS value FROM notifications WHERE dedupe_key IN (${list})`,
      plans.map((plan) => plan.dedupeKey)),
    // A reminder stored with the older key format still counts, unless the
    // appointment was rescheduled after that reminder was created.
    existingValues(db, (list) => `SELECT n.dedupe_key AS value FROM notifications n
        WHERE n.dedupe_key IN (${list}) AND NOT EXISTS (
          SELECT 1 FROM appointment_events e
          WHERE e.appointment_id = n.entity_id AND e.event_type = 'rescheduled'
            AND julianday(e.created_at) >= julianday(n.created_at))`,
      schedulePlans.map((plan) => legacyScheduleReminderKey(plan.appointmentId, plan.window))),
    // The push dispatcher sends its own 24-hour reminder; do not repeat it in-app
    // for the same appointment time.
    existingValues(db, (list) => `SELECT id AS value FROM notifications WHERE id IN (${list})`,
      oneDayPlans.map((plan) => pushReminderId(plan.appointmentId, plan.startsAt))),
  ]);
  const fresh = plans.filter((plan) => {
    if (known.has(plan.dedupeKey)) return false;
    if (plan.window === 'documents') return true;
    if (legacyStillValid.has(legacyScheduleReminderKey(plan.appointmentId, plan.window))) return false;
    return !(plan.window === '1d' && pushReminded.has(pushReminderId(plan.appointmentId, plan.startsAt)));
  });
  if (fresh.length === 0) return 0;
  await db.batch(fresh.map((plan) => db.prepare(`INSERT OR IGNORE INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id, dedupe_key)
      VALUES (?, ?, 'reminder', ?, ?, 'appointment', ?, ?)`)
    .bind(crypto.randomUUID(), plan.userId, plan.title, plan.body.slice(0, 1000), plan.appointmentId, plan.dedupeKey)));
  return fresh.length;
}

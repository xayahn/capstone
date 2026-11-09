import { getRawDb } from '@/db/runtime';

/**
 * In-app reminders (paper Table 4.11 "Reminder").
 *
 * Reminders are generated deterministically when a parishioner opens the app or
 * when parish personnel load the portal, so no background scheduler is needed in
 * the local deployment. Each reminder has a unique `dedupe_key`, so it is created
 * at most once no matter how often this runs. If push notifications are enabled,
 * the existing database trigger also queues a push delivery for each new reminder.
 */

const HOUR = 3_600_000;

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

function manilaLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila',
  }).format(new Date(iso));
}

export type ReminderPlan = { userId: string; appointmentId: string; dedupeKey: string; title: string; body: string };

/** Pure planning step (unit-tested): which reminders are due for these appointments at `now`. */
export function planReminders(candidates: Candidate[], now: Date): ReminderPlan[] {
  const plans: ReminderPlan[] = [];
  for (const item of candidates) {
    const msUntil = new Date(item.startsAt).getTime() - now.getTime();
    if (msUntil <= 0) continue;
    const when = manilaLabel(item.startsAt);
    if (item.status === 'approved' || item.status === 'ready_to_approve') {
      const confirmed = item.status === 'approved' ? '' : ' Final approval by the parish is still pending.';
      if (msUntil <= 24 * HOUR) {
        plans.push({ userId: item.userId, appointmentId: item.id, dedupeKey: `reminder:${item.id}:1d`, title: 'Appointment tomorrow',
          body: `${item.serviceName} at ${item.parishName} is scheduled for ${when} (${item.reference}).${confirmed}` });
      } else if (msUntil <= 72 * HOUR) {
        plans.push({ userId: item.userId, appointmentId: item.id, dedupeKey: `reminder:${item.id}:3d`, title: 'Upcoming appointment',
          body: `${item.serviceName} at ${item.parishName} is scheduled for ${when} (${item.reference}).${confirmed}` });
      }
    }
    if (['submitted', 'documents_pending', 'under_review', 'needs_changes'].includes(item.status)
      && item.missingDocuments > 0 && msUntil <= 14 * 24 * HOUR) {
      plans.push({ userId: item.userId, appointmentId: item.id, dedupeKey: `reminder:${item.id}:documents`, title: 'Documents still needed',
        body: `${item.reference} (${item.serviceName}, ${when}) still has ${item.missingDocuments} required document${item.missingDocuments === 1 ? '' : 's'} to upload or replace before the parish can approve it.` });
    }
  }
  return plans;
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
  const existing = await db.prepare(`SELECT dedupe_key AS dedupeKey FROM notifications
    WHERE dedupe_key IN (${plans.map(() => '?').join(',')})`).bind(...plans.map((plan) => plan.dedupeKey)).all<{ dedupeKey: string }>();
  const known = new Set(existing.results.map((row) => row.dedupeKey));
  const fresh = plans.filter((plan) => !known.has(plan.dedupeKey));
  if (fresh.length === 0) return 0;
  await db.batch(fresh.map((plan) => db.prepare(`INSERT OR IGNORE INTO notifications
      (id, recipient_user_id, type, title, body, entity_type, entity_id, dedupe_key)
      VALUES (?, ?, 'reminder', ?, ?, 'appointment', ?, ?)`)
    .bind(crypto.randomUUID(), plan.userId, plan.title, plan.body.slice(0, 1000), plan.appointmentId, plan.dedupeKey)));
  return fresh.length;
}

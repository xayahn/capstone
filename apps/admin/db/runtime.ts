import { env } from 'cloudflare:workers';

export { LOCAL_DEMO_PASSWORD, LOCAL_DEMO_STAFF_PASSWORD, LOCAL_DEMO_STAFF_ACCOUNTS, LOCAL_DEMO_PARISHIONER_ACCOUNTS } from '@/db/demo-accounts';

export function getRawDb(): D1Database {
  if (!env.DB) throw new Error('The ParishLink D1 database binding is unavailable.');
  return env.DB;
}

let ready: Promise<void> | null = null;
let productionSchemaReady: Promise<void> | null = null;

/** Tables produced by drizzle/0000–0007. Production refuses to serve requests if any is missing. */
const EXPECTED_PRODUCTION_TABLES = [
  'announcements',
  'appointment_change_requests',
  'appointment_events',
  'appointment_participants',
  'appointments',
  'audit_logs',
  'availability_blocks',
  'chatbot_messages',
  'clergy_assignments',
  'clergy_profiles',
  'document_requirements',
  'document_submissions',
  'evaluation_responses',
  'idempotency_keys',
  'mobile_credentials',
  'mobile_email_challenges',
  'mobile_rate_limits',
  'mobile_sessions',
  'notifications',
  'parishes',
  'push_deliveries',
  'push_devices',
  'queue_tickets',
  'sacramental_records',
  'service_types',
  'staff_credentials',
  'staff_sessions',
  'user_parish_memberships',
  'users',
  'venues',
] as const;

const REQUIRED_PRODUCTION_INDEXES = [
  'idx_idempotency_actor_scope_key', 'idx_idempotency_expiry', 'idx_sacramental_records_parish_date_id',
  'idx_assignments_parish_page', 'idx_assignments_clergy_page', 'idx_assignments_all_page',
  'idx_push_devices_user', 'idx_push_deliveries_due', 'idx_mobile_email_challenges_user_purpose',
  'idx_mobile_email_challenges_expiry', 'idx_staff_sessions_user_expiry', 'idx_change_requests_one_pending',
  'idx_notifications_dedupe', 'idx_audit_parish_created',
] as const;

const REQUIRED_PRODUCTION_TRIGGERS = [
  'mobile_password_invalidate_challenges', 'mobile_identity_invalidate_challenges', 'notifications_enqueue_push',
  'trg_appointments_status_update', 'trg_documents_status_update', 'trg_users_role_insert',
] as const;

async function columns(db: D1Database, table: string): Promise<Set<string>> {
  if (!/^[a-z_]+$/.test(table)) throw new Error('Invalid table name');
  const rows = await db.prepare(`PRAGMA table_info('${table}')`).all<{ name: string }>();
  return new Set(rows.results.map((row) => row.name));
}

/** Production never mutates its schema at request time; it only verifies that the migrations were applied. */
async function assertProductionSchema(db: D1Database): Promise<void> {
  productionSchemaReady ??= (async () => {
    const objects = await db.prepare("SELECT type, name FROM sqlite_schema WHERE type IN ('table','index','trigger')").all<{ type: string; name: string }>();
    const names = (type: string) => new Set(objects.results.filter((row) => row.type === type).map((row) => row.name));
    const tables = names('table');
    const indexes = names('index');
    const triggers = names('trigger');
    if (EXPECTED_PRODUCTION_TABLES.some((name) => !tables.has(name))) {
      throw new Error('The ParishLink production database migration is incomplete.');
    }
    const [appointmentColumns, documentColumns, credentialColumns, notificationColumns, parishColumns] = await Promise.all([
      columns(db, 'appointments'), columns(db, 'document_submissions'), columns(db, 'mobile_credentials'),
      columns(db, 'notifications'), columns(db, 'parishes'),
    ]);
    if (!appointmentColumns.has('checklist_version_id') || !appointmentColumns.has('buffer_before_minutes')
      || !documentColumns.has('requirement_instructions') || !documentColumns.has('is_required') || !documentColumns.has('checklist_version_id')
      || !credentialColumns.has('auth_version') || !credentialColumns.has('email_verified_at')
      || !notificationColumns.has('dedupe_key') || !parishColumns.has('contact_phone')
      || REQUIRED_PRODUCTION_INDEXES.some((name) => !indexes.has(name))
      || REQUIRED_PRODUCTION_TRIGGERS.some((name) => !triggers.has(name))) {
      throw new Error('The ParishLink production database release migration is incomplete.');
    }
    const foreignKeyIssues = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
    if (foreignKeyIssues.results.length > 0) {
      throw new Error('The ParishLink production database failed its foreign-key integrity check.');
    }
  })().catch((error) => { productionSchemaReady = null; throw error; });
  await productionSchemaReady;
}

/**
 * Prepare the database for a request.
 * - Production: verify the migrated schema; never mutate it.
 * - Local development: apply the same migration files (single source of truth),
 *   insert the baseline catalogue, and seed the synthetic demonstration data once.
 */
export async function ensurePublicRuntimeDatabase(): Promise<void> {
  ready ??= (async () => {
    const db = getRawDb();
    if (process.env.NODE_ENV === 'production') {
      await assertProductionSchema(db);
      return;
    }
    // Development-only modules are loaded lazily so production never bundles the
    // migration runner or the synthetic demonstration seed into its request path.
    const [{ applyMigrations }, { catalogStatements }, { seedDemoData }] = await Promise.all([
      import('@/db/migrate'), import('@/db/catalog'), import('@/db/demo-seed'),
    ]);
    await applyMigrations(db);
    await db.batch(catalogStatements(db));
    await seedDemoData(db, env.FILES);
  })().catch((error) => { ready = null; throw error; });
  await ready;
}

/** Alias kept for internal portal callers. */
export async function ensureRuntimeDatabase(): Promise<void> {
  return ensurePublicRuntimeDatabase();
}

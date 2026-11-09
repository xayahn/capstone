import { env } from 'cloudflare:workers';
import type { ChatGPTUser } from '@/app/chatgpt-auth';
import { PUSH_SCHEMA_STATEMENTS } from '@/db/push-schema';
import { ACCOUNT_SCHEMA_STATEMENTS } from '@/db/account-schema';

export function getRawDb(): D1Database {
  if (!env.DB) throw new Error('The ParishLink D1 database binding is unavailable.');
  return env.DB;
}

const schemaStatements = [
  // Push tables and their enqueue trigger are appended after the base tables.
  `CREATE TABLE IF NOT EXISTS parishes (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'Asia/Manila', address TEXT, office_hours TEXT,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, external_auth_id TEXT UNIQUE, email TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL, role TEXT NOT NULL, home_parish_id TEXT, phone TEXT,
    locale TEXT NOT NULL DEFAULT 'en-PH', is_active INTEGER NOT NULL DEFAULT 1,
    last_login_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS user_parish_memberships (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, parish_id TEXT NOT NULL,
    permission_scope TEXT NOT NULL DEFAULT 'own_parish',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, parish_id)
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_credentials (
    user_id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
    password_iterations INTEGER NOT NULL DEFAULT 210000,
    failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
    notifications_enabled INTEGER NOT NULL DEFAULT 1,
    password_changed_at TEXT NOT NULL DEFAULT (datetime('now')),
    auth_version INTEGER NOT NULL DEFAULT 0, email_verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_sessions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, revoked_at TEXT, last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    user_agent_hash TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS service_types (
    id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL, buffer_before_minutes INTEGER NOT NULL DEFAULT 0,
    buffer_after_minutes INTEGER NOT NULL DEFAULT 0, description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS clergy_profiles (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE, display_title TEXT NOT NULL,
    home_parish_id TEXT, is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, name TEXT NOT NULL, capacity INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(parish_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS availability_blocks (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, clergy_id TEXT, venue_id TEXT,
    kind TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, notes TEXT,
    recurrence_rule TEXT, created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS document_requirements (
    id TEXT PRIMARY KEY, service_type_id TEXT NOT NULL, name TEXT NOT NULL,
    instructions TEXT, is_required INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(service_type_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS appointments (
    id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, parishioner_user_id TEXT NOT NULL,
    parishioner_name TEXT NOT NULL, service_type_id TEXT NOT NULL,
    checklist_version_id TEXT NOT NULL DEFAULT 'legacy', parish_id TEXT NOT NULL,
    clergy_id TEXT, clergy_name TEXT, venue_id TEXT, venue_name TEXT,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted',
    hold_expires_at TEXT, review_note TEXT, decision_reason TEXT, decided_by TEXT,
    decided_at TEXT, version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS appointment_participants (
    id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, participant_type TEXT NOT NULL,
    full_name TEXT NOT NULL, date_of_birth TEXT, notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS document_submissions (
    id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, requirement_id TEXT,
    requirement_name TEXT NOT NULL, requirement_instructions TEXT,
    is_required INTEGER NOT NULL DEFAULT 1, checklist_version_id TEXT NOT NULL DEFAULT 'legacy',
    storage_key TEXT, original_file_name TEXT,
    mime_type TEXT, size_bytes INTEGER, sha256 TEXT, status TEXT NOT NULL DEFAULT 'not_submitted',
    reviewer_id TEXT, review_note TEXT, reviewed_at TEXT, submitted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(appointment_id, requirement_name)
  )`,
  `CREATE TABLE IF NOT EXISTS appointment_events (
    id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, actor_id TEXT,
    event_type TEXT NOT NULL, from_status TEXT, to_status TEXT, detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS queue_tickets (
    id TEXT PRIMARY KEY, ticket_number TEXT NOT NULL, parish_id TEXT NOT NULL,
    parishioner_user_id TEXT, parishioner_name TEXT NOT NULL, service TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting', priority INTEGER NOT NULL DEFAULT 0,
    counter TEXT, issued_at TEXT NOT NULL DEFAULT (datetime('now')), called_at TEXT,
    served_at TEXT, cancelled_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(parish_id, ticket_number)
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, recipient_user_id TEXT NOT NULL, type TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, entity_type TEXT, entity_id TEXT,
    push_provider_id TEXT, delivered_at TEXT, read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL, parish_id TEXT, audience TEXT NOT NULL,
    title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
    publish_at TEXT, published_at TEXT, expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS sacramental_records (
    id TEXT PRIMARY KEY, parish_id TEXT NOT NULL, record_type TEXT NOT NULL,
    subject_name TEXT NOT NULL, event_date TEXT NOT NULL, reference TEXT NOT NULL UNIQUE,
    book_number TEXT, page_number TEXT, entry_number TEXT, officiant TEXT,
    certificate_number TEXT, status TEXT NOT NULL DEFAULT 'working_copy',
    verified_against_archive_at TEXT, verified_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS clergy_assignments (
    id TEXT PRIMARY KEY, clergy_id TEXT NOT NULL, clergy_name TEXT NOT NULL,
    parish_id TEXT NOT NULL, venue_id TEXT, venue_name TEXT NOT NULL, service TEXT NOT NULL,
    starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
    created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS chatbot_messages (
    id TEXT PRIMARY KEY, user_id TEXT, session_id TEXT NOT NULL, direction TEXT NOT NULL,
    category TEXT, redacted_content TEXT, provider_request_id TEXT,
    escalated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS evaluation_responses (
    id TEXT PRIMARY KEY, respondent_group TEXT NOT NULL,
    quality_characteristic TEXT NOT NULL, item_code TEXT NOT NULL,
    score INTEGER NOT NULL, consent_recorded INTEGER NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS mobile_rate_limits (
    id TEXT PRIMARY KEY, scope TEXT NOT NULL, subject_hash TEXT NOT NULL,
    window_start INTEGER NOT NULL, request_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(scope, subject_hash, window_start)
  )`,
  `CREATE TABLE IF NOT EXISTS idempotency_keys (
    id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, scope TEXT NOT NULL,
    key_hash TEXT NOT NULL, request_hash TEXT NOT NULL, resource_id TEXT,
    response_status INTEGER NOT NULL, expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(actor_id, scope, key_hash)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, actor_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL,
    entity_id TEXT, parish_id TEXT, outcome TEXT NOT NULL, detail TEXT, request_id TEXT,
    ip_hash TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_parish_status_start ON appointments(parish_id, status, starts_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_parishioner ON appointments(parishioner_user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_clergy_window ON appointments(clergy_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointments_venue_window ON appointments(venue_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user_expiry ON mobile_sessions(user_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_availability_clergy_time ON availability_blocks(clergy_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_availability_venue_time ON availability_blocks(venue_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointment_participants_appointment ON appointment_participants(appointment_id)`,
  `CREATE INDEX IF NOT EXISTS idx_document_requirements_service ON document_requirements(service_type_id, sort_order)`,
  `CREATE INDEX IF NOT EXISTS idx_queue_parish_status_priority ON queue_tickets(parish_id, status, priority, issued_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_recipient_read ON notifications(recipient_user_id, read_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_documents_status ON document_submissions(status, submitted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_records_parish_type_subject ON sacramental_records(parish_id, record_type, subject_name)`,
  `CREATE INDEX IF NOT EXISTS idx_clergy_assignments_clergy_window ON clergy_assignments(clergy_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_clergy_assignments_parish_window ON clergy_assignments(parish_id, starts_at, ends_at)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_parish_page ON clergy_assignments(parish_id, status, julianday(starts_at), id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_clergy_page ON clergy_assignments(clergy_id, status, julianday(starts_at), id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_all_page ON clergy_assignments(status, julianday(starts_at), id)`,
  `CREATE INDEX IF NOT EXISTS idx_chatbot_messages_session ON chatbot_messages(session_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_evaluation_characteristic ON evaluation_responses(quality_characteristic, submitted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_mobile_rate_limits_created ON mobile_rate_limits(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_keys(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_appointment_events_appointment ON appointment_events(appointment_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sacramental_records_parish_date_id ON sacramental_records(parish_id, event_date, id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id, created_at)`,
  ...PUSH_SCHEMA_STATEMENTS,
  ...ACCOUNT_SCHEMA_STATEMENTS,
];

const parishes = [
  ['metropolitan-cathedral', 'metropolitan-cathedral', 'Metropolitan Cathedral of San Fernando'],
  ['san-guillermo', 'san-guillermo', 'San Guillermo Parish'],
  ['sanctuario-san-jose', 'sanctuario-san-jose', 'Sanctuario de San Jose Parish'],
  ['sta-lucia', 'sta-lucia', 'Sta. Lucia Parish'],
  ['sto-nino', 'sto-nino', 'Sto. Niño Parish'],
  ['san-isidro-labrador', 'san-isidro-labrador', 'San Isidro Labrador Parish'],
  ['st-joseph', 'st-joseph', 'St. Joseph Parish'],
  ['our-lady-of-lourdes', 'our-lady-of-lourdes', 'Archdiocesan Shrine of Our Lady of Lourdes'],
] as const;

const services = [
  ['baptism', 'baptism', 'Baptism', 60, 15, 15],
  ['wedding', 'wedding', 'Wedding', 90, 30, 30],
  ['confirmation', 'confirmation', 'Confirmation', 60, 15, 15],
  ['first-communion', 'first-communion', 'First Communion', 60, 15, 15],
  ['funeral-mass', 'funeral-mass', 'Funeral Mass', 45, 15, 15],
] as const;

const requirements = [
  ['baptism-birth', 'baptism', "Child's PSA Birth Certificate", 1],
  ['baptism-marriage', 'baptism', "Parents' Marriage Certificate (if married in Church)", 2],
  ['baptism-permission', 'baptism', 'Baptismal permission letter (if outside home parish)', 3],
  ['baptism-godparent', 'baptism', 'Godparent qualification form', 4],
  ['wedding-birth', 'wedding', 'PSA Birth Certificates (bride & groom)', 1],
  ['wedding-cenomar', 'wedding', 'CENOMAR', 2],
  ['wedding-sacraments', 'wedding', 'Baptismal & Confirmation Certificates', 3],
  ['wedding-license', 'wedding', 'Marriage License', 4],
  ['wedding-precana', 'wedding', 'Pre-Cana Seminar Certificate', 5],
  ['wedding-banns', 'wedding', 'Marriage Banns', 6],
  ['confirmation-baptismal', 'confirmation', 'Baptismal Certificate', 1],
  ['confirmation-class', 'confirmation', 'Catechism / Confirmation Class Certificate', 2],
  ['communion-baptismal', 'first-communion', 'Baptismal Certificate', 1],
  ['communion-catechism', 'first-communion', 'Catechism Attendance Record', 2],
  ['funeral-death', 'funeral-mass', 'Death Certificate', 1],
  ['funeral-burial', 'funeral-mass', 'Certificate of Burial Permit', 2],
  ['funeral-baptismal', 'funeral-mass', 'Baptismal Certificate (deceased, if available)', 3],
] as const;

let schemaReady: Promise<void> | null = null;
let publicReady: Promise<void> | null = null;
let productionSchemaReady: Promise<void> | null = null;
let developmentReleaseSchemaReady: Promise<void> | null = null;

const EXPECTED_PRODUCTION_TABLES = [
  'announcements',
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
  'push_devices',
  'push_deliveries',
  'queue_tickets',
  'sacramental_records',
  'service_types',
  'user_parish_memberships',
  'users',
  'venues',
] as const;

async function ensureSchema(db: D1Database): Promise<void> {
  schemaReady ??= db.batch(schemaStatements.map((statement) => db.prepare(statement))).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  await schemaReady;
}

async function tableColumns(db: D1Database, table: 'appointments' | 'document_submissions' | 'mobile_credentials' | 'mobile_email_challenges') {
  const rows = await db.prepare(`PRAGMA table_info('${table}')`).all<{ name: string }>();
  return new Set(rows.results.map((row) => row.name));
}

async function ensureDevelopmentReleaseSchema(db: D1Database): Promise<void> {
  developmentReleaseSchemaReady ??= (async () => {
    const appointmentColumns = await tableColumns(db, 'appointments');
    const documentColumns = await tableColumns(db, 'document_submissions');
    const credentialColumns = await tableColumns(db, 'mobile_credentials');
    const statements: D1PreparedStatement[] = [];
    if (!credentialColumns.has('auth_version')) statements.push(db.prepare('ALTER TABLE mobile_credentials ADD auth_version INTEGER NOT NULL DEFAULT 0'));
    if (!credentialColumns.has('email_verified_at')) statements.push(db.prepare('ALTER TABLE mobile_credentials ADD email_verified_at TEXT'));
    if (!appointmentColumns.has('checklist_version_id')) {
      statements.push(db.prepare("ALTER TABLE appointments ADD checklist_version_id TEXT NOT NULL DEFAULT 'legacy'"));
    }
    if (!documentColumns.has('requirement_instructions')) {
      statements.push(db.prepare('ALTER TABLE document_submissions ADD requirement_instructions TEXT'));
    }
    if (!documentColumns.has('is_required')) {
      statements.push(db.prepare('ALTER TABLE document_submissions ADD is_required INTEGER NOT NULL DEFAULT 1'));
    }
    if (!documentColumns.has('checklist_version_id')) {
      statements.push(db.prepare("ALTER TABLE document_submissions ADD checklist_version_id TEXT NOT NULL DEFAULT 'legacy'"));
    }
    if (statements.length > 0) await db.batch(statements);
    await db.prepare(`UPDATE document_submissions SET
      requirement_instructions = COALESCE(requirement_instructions, (
        SELECT instructions FROM document_requirements WHERE id = document_submissions.requirement_id
      )),
      is_required = COALESCE((
        SELECT is_required FROM document_requirements WHERE id = document_submissions.requirement_id
      ), is_required, 1)`).run();
  })().catch(error => { developmentReleaseSchemaReady = null; throw error; });
  await developmentReleaseSchemaReady;
}

async function assertProductionSchema(db: D1Database): Promise<void> {
  productionSchemaReady ??= (async () => {
    const tables = await db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'")
      .all<{ name: string }>();
    const available = new Set(tables.results.map((row) => row.name));
    const missing = EXPECTED_PRODUCTION_TABLES.filter((name) => !available.has(name));
    if (missing.length > 0) {
      throw new Error('The ParishLink production database migration is incomplete.');
    }

    const [appointmentColumns, documentColumns, credentialColumns, challengeColumns, indexes, triggers] = await Promise.all([
      tableColumns(db, 'appointments'),
      tableColumns(db, 'document_submissions'),
      tableColumns(db, 'mobile_credentials'),
      tableColumns(db, 'mobile_email_challenges'),
      db.prepare("SELECT name FROM sqlite_schema WHERE type = 'index'").all<{ name: string }>(),
      db.prepare("SELECT name FROM sqlite_schema WHERE type = 'trigger'").all<{ name: string }>(),
    ]);
    const requiredAppointmentColumns = ['checklist_version_id'];
    const requiredDocumentColumns = ['requirement_instructions', 'is_required', 'checklist_version_id'];
    const availableIndexes = new Set(indexes.results.map((row) => row.name));
    if (requiredAppointmentColumns.some((name) => !appointmentColumns.has(name))
      || requiredDocumentColumns.some((name) => !documentColumns.has(name))
      || !credentialColumns.has('auth_version') || !credentialColumns.has('email_verified_at')
      || ['id','user_id','purpose','session_id','email','code_hash','credential_version','attempts','delivery_status','expires_at','consumed_by','created_at'].some(name => !challengeColumns.has(name))
      || !availableIndexes.has('idx_idempotency_actor_scope_key')
      || !availableIndexes.has('idx_idempotency_expiry')
      || !availableIndexes.has('idx_sacramental_records_parish_date_id')
      || !availableIndexes.has('idx_assignments_parish_page')
      || !availableIndexes.has('idx_assignments_clergy_page')
      || !availableIndexes.has('idx_assignments_all_page')
      || !availableIndexes.has('idx_push_devices_user')
      || !availableIndexes.has('idx_push_deliveries_due')
      || !availableIndexes.has('idx_mobile_email_challenges_user_purpose')
      || !availableIndexes.has('idx_mobile_email_challenges_expiry')
      || !triggers.results.some((row) => row.name === 'mobile_password_invalidate_challenges')
      || !triggers.results.some((row) => row.name === 'mobile_identity_invalidate_challenges')
      || !triggers.results.some((row) => row.name === 'notifications_enqueue_push')) {
      throw new Error('The ParishLink production database release migration is incomplete.');
    }

    const foreignKeyIssues = await db.prepare('PRAGMA foreign_key_check').all<Record<string, unknown>>();
    if (foreignKeyIssues.results.length > 0) {
      throw new Error('The ParishLink production database failed its foreign-key integrity check.');
    }
  })().catch(error => { productionSchemaReady = null; throw error; });
  await productionSchemaReady;
}

async function seedCatalog(db: D1Database): Promise<void> {
  const statements: D1PreparedStatement[] = [];
  for (const parish of parishes) {
    statements.push(db.prepare('INSERT OR IGNORE INTO parishes (id, slug, name) VALUES (?, ?, ?)').bind(...parish));
  }
  for (const service of services) {
    statements.push(db.prepare(`INSERT INTO service_types
      (id, slug, name, duration_minutes, buffer_before_minutes, buffer_after_minutes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET duration_minutes = excluded.duration_minutes,
        buffer_before_minutes = excluded.buffer_before_minutes,
        buffer_after_minutes = excluded.buffer_after_minutes`).bind(...service));
  }
  for (const requirement of requirements) {
    statements.push(db.prepare('INSERT OR IGNORE INTO document_requirements (id, service_type_id, name, sort_order) VALUES (?, ?, ?, ?)').bind(...requirement));
  }
  await db.batch(statements);
}

async function bootstrapFirstAdministrator(db: D1Database, user: ChatGPTUser): Promise<void> {
  const existing = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('parish_staff','clergy','system_admin')").first<{ count: number }>();
  if (Number(existing?.count ?? 0) > 0) return;
  await db.prepare(`INSERT INTO users
    (id, external_auth_id, email, full_name, role, home_parish_id, last_login_at)
    VALUES (?, ?, ?, ?, 'system_admin', NULL, datetime('now'))`)
    .bind(crypto.randomUUID(), user.userId, user.email.toLowerCase(), user.fullName ?? user.displayName)
    .run();
}

async function seedLocalDemo(db: D1Database, user: ChatGPTUser): Promise<void> {
  const seeds: D1PreparedStatement[] = [
    db.prepare(`INSERT OR IGNORE INTO users
      (id, external_auth_id, email, full_name, role, home_parish_id, last_login_at)
      VALUES ('user-admin-demo', ?, ?, ?, 'system_admin', NULL, datetime('now'))`)
      .bind(user.userId, user.email.toLowerCase(), user.fullName ?? 'Ana Fernandez'),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('parishioner-1','liza@example.test','Liza Gomez','parishioner','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('parishioner-2','ronald@example.test','Ronald Dizon','parishioner','san-guillermo')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('parishioner-3','angela@example.test','Angela Reyes','parishioner','sta-lucia')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('parishioner-4','carla@example.test','Carla Nunez','parishioner','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-dizon','dizon@example.test','Msgr. R. Dizon','clergy','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-manalo','manalo@example.test','Fr. A. Manalo','clergy','san-guillermo')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-pineda','pineda@example.test','Fr. M. Pineda','clergy','sta-lucia')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-santos','e.santos@example.test','Fr. E. Santos','clergy','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-cruz','j.cruz@example.test','Fr. J. Cruz','clergy','sanctuario-san-jose')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-tolentino','b.tolentino@example.test','Fr. B. Tolentino','clergy','sto-nino')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-reyes','c.reyes@example.test','Fr. C. Reyes','clergy','san-isidro-labrador')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-lopez','d.lopez@example.test','Fr. D. Lopez','clergy','st-joseph')"),
    db.prepare("INSERT OR IGNORE INTO users (id,email,full_name,role,home_parish_id) VALUES ('user-clergy-ocampo','n.ocampo@example.test','Fr. N. Ocampo','clergy','our-lady-of-lourdes')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('clergy-dizon','user-clergy-dizon','Msgr. R. Dizon','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('clergy-manalo','user-clergy-manalo','Fr. A. Manalo','san-guillermo')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('clergy-pineda','user-clergy-pineda','Fr. M. Pineda','sta-lucia')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-e-santos','user-clergy-santos','Fr. E. Santos','metropolitan-cathedral')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-j-cruz','user-clergy-cruz','Fr. J. Cruz','sanctuario-san-jose')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-b-tolentino','user-clergy-tolentino','Fr. B. Tolentino','sto-nino')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-c-reyes','user-clergy-reyes','Fr. C. Reyes','san-isidro-labrador')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-d-lopez','user-clergy-lopez','Fr. D. Lopez','st-joseph')"),
    db.prepare("INSERT OR IGNORE INTO clergy_profiles (id,user_id,display_title,home_parish_id) VALUES ('fr-n-ocampo','user-clergy-ocampo','Fr. N. Ocampo','our-lady-of-lourdes')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-cathedral-main','metropolitan-cathedral','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-sg-main','san-guillermo','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-sg-baptistry','san-guillermo','Baptistry')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-sl-main','sta-lucia','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-sanctuario-san-jose','sanctuario-san-jose','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-sto-nino','sto-nino','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-san-isidro-labrador','san-isidro-labrador','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-st-joseph','st-joseph','Main church')"),
    db.prepare("INSERT OR IGNORE INTO venues (id,parish_id,name) VALUES ('venue-our-lady-of-lourdes','our-lady-of-lourdes','Main church')"),
    db.prepare(`INSERT OR IGNORE INTO appointments
      (id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,clergy_id,clergy_name,venue_id,venue_name,starts_at,ends_at,status,review_note)
      VALUES ('appt-1001','PL-2026-1001','parishioner-1','Liza Gomez','wedding','metropolitan-cathedral','clergy-dizon','Msgr. R. Dizon','venue-cathedral-main','Main church','2026-09-18T09:30:00+08:00','2026-09-18T11:00:00+08:00','documents_pending','Marriage license and banns remain pending.')`),
    db.prepare(`INSERT OR IGNORE INTO appointments
      (id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,clergy_id,clergy_name,venue_id,venue_name,starts_at,ends_at,status)
      VALUES ('appt-1002','PL-2026-1002','parishioner-2','Ronald Dizon','baptism','san-guillermo','clergy-manalo','Fr. A. Manalo','venue-sg-baptistry','Baptistry','2026-09-21T08:00:00+08:00','2026-09-21T09:00:00+08:00','under_review')`),
    db.prepare(`INSERT OR IGNORE INTO appointments
      (id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,clergy_id,clergy_name,venue_id,venue_name,starts_at,ends_at,status)
      VALUES ('appt-1003','PL-2026-1003','parishioner-3','Angela Reyes','confirmation','sta-lucia','clergy-pineda','Fr. M. Pineda','venue-sl-main','Main church','2026-09-24T13:30:00+08:00','2026-09-24T14:30:00+08:00','ready_to_approve')`),
    db.prepare(`INSERT OR IGNORE INTO appointments
      (id,reference,parishioner_user_id,parishioner_name,service_type_id,parish_id,clergy_id,clergy_name,venue_id,venue_name,starts_at,ends_at,status)
      VALUES ('appt-1004','PL-2026-1004','parishioner-4','Carla Nunez','wedding','metropolitan-cathedral','clergy-dizon','Msgr. R. Dizon','venue-cathedral-main','Main church','2026-09-18T10:30:00+08:00','2026-09-18T12:00:00+08:00','submitted')`),
    db.prepare("INSERT OR IGNORE INTO document_submissions (id,appointment_id,requirement_id,requirement_name,original_file_name,status,submitted_at) VALUES ('doc-1','appt-1001','wedding-license','Marriage License','marriage-license.pdf','submitted','2026-08-25T10:15:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO document_submissions (id,appointment_id,requirement_id,requirement_name,status) VALUES ('doc-2','appt-1001','wedding-banns','Marriage Banns','not_submitted')"),
    db.prepare("INSERT OR IGNORE INTO document_submissions (id,appointment_id,requirement_id,requirement_name,original_file_name,status,submitted_at) VALUES ('doc-3','appt-1002','baptism-godparent','Godparent qualification form','godparent-form.jpg','under_review','2026-08-26T09:40:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO document_submissions (id,appointment_id,requirement_id,requirement_name,original_file_name,status,submitted_at) VALUES ('doc-4','appt-1003','confirmation-baptismal','Baptismal Certificate','baptismal-certificate.pdf','verified','2026-08-22T14:20:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO document_submissions (id,appointment_id,requirement_id,requirement_name,status) VALUES ('doc-5','appt-1003','confirmation-class','Catechism / Confirmation Class Certificate','verified')"),
    db.prepare("INSERT OR IGNORE INTO queue_tickets (id,ticket_number,parish_id,parishioner_name,service,status,issued_at,called_at,counter) VALUES ('queue-16','A-016','san-guillermo','Marites Santos','Wedding inquiry','serving','2026-08-26T13:42:00+08:00','2026-08-26T14:04:00+08:00','Window 2')"),
    db.prepare("INSERT OR IGNORE INTO queue_tickets (id,ticket_number,parish_id,parishioner_name,service,status,issued_at) VALUES ('queue-17','A-017','san-guillermo','Joel Cruz','Document submission','waiting','2026-08-26T13:48:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO queue_tickets (id,ticket_number,parish_id,parishioner_name,service,status,issued_at) VALUES ('queue-18','A-018','san-guillermo','Nina Reyes','Baptism inquiry','waiting','2026-08-26T13:55:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO queue_tickets (id,ticket_number,parish_id,parishioner_name,service,status,issued_at) VALUES ('queue-19','A-019','san-guillermo','Paolo Garcia','Certificate request','waiting','2026-08-26T14:01:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO announcements (id,author_id,parish_id,audience,title,body,status,published_at) VALUES ('ann-1','user-admin-demo','san-guillermo','parish','Office hours update','The parish office will close at 3:00 PM on Friday for a diocesan meeting.','published','2026-08-25T16:00:00+08:00')"),
    db.prepare("INSERT OR IGNORE INTO sacramental_records (id,parish_id,record_type,subject_name,event_date,reference,status,verified_against_archive_at,verified_by) VALUES ('record-1','san-guillermo','Baptismal','Jose Miguel Santos','2019-03-10','BAP-SGP-2019-0310-0042','verified_against_archive','2026-08-20T09:00:00+08:00','user-admin-demo')"),
    db.prepare("INSERT OR IGNORE INTO sacramental_records (id,parish_id,record_type,subject_name,event_date,reference,status) VALUES ('record-2','metropolitan-cathedral','Marriage','Liza Gomez & Paulo Ramos','2022-06-04','MAR-MCSF-2022-0604-0018','verified_against_archive')"),
    db.prepare("INSERT OR IGNORE INTO sacramental_records (id,parish_id,record_type,subject_name,event_date,reference,status) VALUES ('record-3','sta-lucia','Confirmation','Angela Reyes','2021-11-20','CON-SLP-2021-1120-0086','working_copy')"),
    db.prepare("INSERT OR IGNORE INTO clergy_assignments (id,clergy_id,clergy_name,parish_id,venue_id,venue_name,service,starts_at,ends_at,created_by) VALUES ('assign-1','clergy-manalo','Fr. A. Manalo','san-guillermo','venue-sg-main','Main church','Daily Mass','2026-08-27T08:00:00+08:00','2026-08-27T09:00:00+08:00','user-admin-demo')"),
    db.prepare("INSERT OR IGNORE INTO clergy_assignments (id,clergy_id,clergy_name,parish_id,venue_id,venue_name,service,starts_at,ends_at,created_by) VALUES ('assign-2','clergy-dizon','Msgr. R. Dizon','metropolitan-cathedral','venue-cathedral-main','Main church','Wedding','2026-09-18T09:30:00+08:00','2026-09-18T11:00:00+08:00','user-admin-demo')"),
    db.prepare("INSERT OR IGNORE INTO clergy_assignments (id,clergy_id,clergy_name,parish_id,venue_id,venue_name,service,starts_at,ends_at,created_by) VALUES ('assign-3','clergy-pineda','Fr. M. Pineda','sta-lucia','venue-sl-main','Main church','Confirmation','2026-09-24T13:30:00+08:00','2026-09-24T14:30:00+08:00','user-admin-demo')"),
  ];
  await db.batch(seeds);
}

export async function ensureRuntimeDatabase(user: ChatGPTUser): Promise<void> {
  const db = getRawDb();
  if (process.env.NODE_ENV === 'production') {
    await assertProductionSchema(db);
    return;
  }

  await ensureSchema(db);
  await ensureDevelopmentReleaseSchema(db);
  await seedCatalog(db);
  if (user.email.endsWith('@sites.test')) await seedLocalDemo(db, user);
  else await bootstrapFirstAdministrator(db, user);
  await db.prepare('PRAGMA optimize').run();
}

export async function ensurePublicRuntimeDatabase(): Promise<void> {
  publicReady ??= (async () => {
    const db = getRawDb();
    if (process.env.NODE_ENV === 'production') {
      await assertProductionSchema(db);
      return;
    }

    await ensureSchema(db);
    await ensureDevelopmentReleaseSchema(db);
    await seedCatalog(db);
    await seedLocalDemo(db, {
      userId: 'local-public-bootstrap',
      displayName: 'Local ParishLink Administrator',
      email: 'seedy@sites.test',
      fullName: 'Local ParishLink Administrator',
    });
    await db.prepare('PRAGMA optimize').run();
  })().catch(error => { publicReady = null; throw error; });
  await publicReady;
}

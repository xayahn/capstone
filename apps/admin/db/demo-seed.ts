import { PARISHES, REQUIREMENTS, SERVICES } from '@/db/catalog';
import { LOCAL_DEMO_PARISHIONER_ACCOUNTS, LOCAL_DEMO_PASSWORD, LOCAL_DEMO_STAFF_ACCOUNTS } from '@/db/demo-accounts';

/**
 * Curated SYNTHETIC demonstration data for local development and the capstone
 * demonstration. Every person, appointment, document and record below is
 * fictional. Dates are generated relative to "now" so the portal always shows a
 * realistic mix of past and upcoming activity.
 *
 * Invariants (verified by tests/demo-seed.test.ts):
 * - no two active appointments overlap for the same priest or venue (including buffers);
 * - no appointment overlaps a confirmed clergy assignment (Mass schedule);
 * - document statuses are consistent with each appointment's status;
 * - every submitted/verified file exists in private storage with a matching SHA-256.
 */

type Parish = { id: string; key: string; code: string; staffId: string; staffName: string; clergy: { id: string; userId: string; name: string }[]; venues: { id: string; name: string }[] };

const PARISH_DETAILS: Record<string, Omit<Parish, 'id'>> = {
  'metropolitan-cathedral': { key: 'cathedral', code: 'MCSF', staffId: 'user-staff-cathedral', staffName: 'Maria Santos',
    clergy: [{ id: 'clergy-dizon', userId: 'user-clergy-dizon', name: 'Msgr. R. Dizon' }, { id: 'fr-e-santos', userId: 'user-clergy-santos', name: 'Fr. E. Santos' }],
    venues: [{ id: 'venue-cathedral-main', name: 'Main church' }, { id: 'venue-cathedral-chapel', name: 'Blessed Sacrament Chapel' }] },
  'san-guillermo': { key: 'sanguillermo', code: 'SGP', staffId: 'user-staff-sanguillermo', staffName: 'Jose Bautista',
    clergy: [{ id: 'clergy-manalo', userId: 'user-clergy-manalo', name: 'Fr. A. Manalo' }],
    venues: [{ id: 'venue-sg-main', name: 'Main church' }, { id: 'venue-sg-baptistry', name: 'Baptistry' }] },
  'sanctuario-san-jose': { key: 'sanctuario', code: 'SSJ', staffId: 'user-staff-sanctuario', staffName: 'Ramon Lingat',
    clergy: [{ id: 'fr-j-cruz', userId: 'user-clergy-cruz', name: 'Fr. J. Cruz' }], venues: [{ id: 'venue-sanctuario-san-jose', name: 'Main church' }] },
  'sta-lucia': { key: 'stalucia', code: 'SLP', staffId: 'user-staff-stalucia', staffName: 'Elena Pamintuan',
    clergy: [{ id: 'clergy-pineda', userId: 'user-clergy-pineda', name: 'Fr. M. Pineda' }], venues: [{ id: 'venue-sl-main', name: 'Main church' }] },
  'sto-nino': { key: 'stonino', code: 'SNP', staffId: 'user-staff-stonino', staffName: 'Carmela Dayrit',
    clergy: [{ id: 'fr-b-tolentino', userId: 'user-clergy-tolentino', name: 'Fr. B. Tolentino' }], venues: [{ id: 'venue-sto-nino', name: 'Main church' }] },
  'san-isidro-labrador': { key: 'sanisidro', code: 'SILP', staffId: 'user-staff-sanisidro', staffName: 'Noel Guevarra',
    clergy: [{ id: 'fr-c-reyes', userId: 'user-clergy-reyes', name: 'Fr. C. Reyes' }], venues: [{ id: 'venue-san-isidro-labrador', name: 'Main church' }] },
  'st-joseph': { key: 'stjoseph', code: 'SJP', staffId: 'user-staff-stjoseph', staffName: 'Lourdes Manansala',
    clergy: [{ id: 'fr-d-lopez', userId: 'user-clergy-lopez', name: 'Fr. D. Lopez' }], venues: [{ id: 'venue-st-joseph', name: 'Main church' }] },
  'our-lady-of-lourdes': { key: 'lourdes', code: 'OLL', staffId: 'user-staff-lourdes', staffName: 'Victor Sangalang',
    clergy: [{ id: 'fr-n-ocampo', userId: 'user-clergy-ocampo', name: 'Fr. N. Ocampo' }], venues: [{ id: 'venue-our-lady-of-lourdes', name: 'Main church' }] },
};

const PARISHIONERS: [first: string, last: string][] = [
  ['Liza', 'Gomez'], ['Paolo', 'Garcia'], ['Teresa', 'Manalang'],
  ['Ronald', 'Dizon'], ['Kristine', 'Lansangan'], ['Mark', 'David'],
  ['Jasmine', 'Pangilinan'], ['Carlo', 'Sicat'], ['Rowena', 'Tolentino'],
  ['Angela', 'Reyes'], ['Joseph', 'Dela Cruz'], ['Maricel', 'Bautista'],
  ['Arnel', 'Yumul'], ['Grace', 'Mercado'], ['Dennis', 'Canlas'],
  ['Patricia', 'Lacson'], ['Michael', 'Gozum'], ['Lorna', 'Nunag'],
  ['Francis', 'Serrano'], ['Bea', 'Quiambao'], ['Romeo', 'Pineda'],
  ['Hazel', 'Mallari'], ['Vincent', 'Ocampo'], ['Celine', 'Garcia'],
];
const CLERGY_EMAILS: Record<string, string> = {
  'user-clergy-dizon': 'dizon@example.test', 'user-clergy-santos': 'e.santos@example.test', 'user-clergy-manalo': 'manalo@example.test',
  'user-clergy-cruz': 'j.cruz@example.test', 'user-clergy-pineda': 'pineda@example.test', 'user-clergy-tolentino': 'b.tolentino@example.test',
  'user-clergy-reyes': 'c.reyes@example.test', 'user-clergy-lopez': 'd.lopez@example.test', 'user-clergy-ocampo': 'n.ocampo@example.test',
};

const CHILD_NAMES = ['Gabriel', 'Sofia', 'Miguel', 'Isabel', 'Rafael', 'Andrea', 'Lucas', 'Mikaela', 'Nathan', 'Bianca', 'Elijah'];
const PARTNER_NAMES = ['Jerome', 'Clarisse', 'Adrian', 'Danica', 'Kevin', 'Patricia', 'Bryan', 'Nicole'];
const DECEASED_NAMES = ['Lolo Ernesto', 'Lola Remedios', 'Lolo Benigno', 'Lola Felicidad', 'Lolo Conrado', 'Lola Natividad', 'Lolo Severino', 'Lola Purita'];

type Status = 'completed' | 'cancelled' | 'no_show' | 'rejected' | 'approved' | 'ready_to_approve' | 'under_review' | 'documents_pending' | 'needs_changes' | 'submitted';
type Template = { offset: number; time: string; service: string; status: Status | 'no_show_or_rejected' };

/** Slot times match the six slots offered by the mobile availability engine. */
const TEMPLATES: Template[] = [
  { offset: -35, time: '09:30', service: 'baptism', status: 'completed' },
  { offset: -18, time: '11:00', service: 'confirmation', status: 'completed' },
  { offset: -7, time: '15:00', service: 'wedding', status: 'cancelled' },
  { offset: -2, time: '08:00', service: 'first-communion', status: 'no_show_or_rejected' },
  { offset: 1, time: '13:30', service: 'funeral-mass', status: 'approved' },
  { offset: 3, time: '09:30', service: 'baptism', status: 'approved' },
  { offset: 8, time: '11:00', service: 'wedding', status: 'ready_to_approve' },
  { offset: 12, time: '15:00', service: 'confirmation', status: 'under_review' },
  { offset: 16, time: '08:00', service: 'baptism', status: 'documents_pending' },
  { offset: 21, time: '13:30', service: 'first-communion', status: 'needs_changes' },
  { offset: 27, time: '09:30', service: 'wedding', status: 'submitted' },
];

/** Status path used to generate the appointment history: [status, actor kind, reason?]. */
const PATHS: Record<Status, [Status | 'under_review' | 'ready_to_approve' | 'approved', 'staff' | 'clergy', string?][]> = {
  submitted: [],
  documents_pending: [['documents_pending', 'staff', 'Please upload the remaining requirements.']],
  under_review: [['under_review', 'staff']],
  needs_changes: [['under_review', 'staff'], ['needs_changes', 'staff', 'One document must be replaced with a clearer copy.']],
  ready_to_approve: [['under_review', 'staff'], ['ready_to_approve', 'staff']],
  approved: [['under_review', 'staff'], ['ready_to_approve', 'staff'], ['approved', 'clergy']],
  completed: [['under_review', 'staff'], ['ready_to_approve', 'staff'], ['approved', 'clergy'], ['completed', 'clergy']],
  no_show: [['under_review', 'staff'], ['ready_to_approve', 'staff'], ['approved', 'clergy'], ['no_show', 'clergy', 'The family did not arrive for the scheduled service.']],
  rejected: [['under_review', 'staff'], ['rejected', 'clergy', 'The baptismal certificate could not be confirmed with the issuing parish.']],
  cancelled: [['cancelled', 'staff', 'Cancelled at the request of the couple; they will rebook a later date.']],
};

const SLOT = 60_000;
const DAY = 86_400_000;
const sqlTime = (date: Date) => date.toISOString().replace('T', ' ').slice(0, 19);
const manilaDate = (now: Date, offsetDays: number) => new Date(now.getTime() + 8 * 3_600_000 + offsetDays * DAY).toISOString().slice(0, 10);
const atManila = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+08:00`);
const emailFor = (first: string, last: string) => `${first}.${last}`.toLowerCase().replace(/\s+/g, '') + '@example.test';

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 210_000 }, key, 256));
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

/** A tiny, inert, structurally valid one-page PDF labelled as synthetic demonstration content. */
function demoPdf(label: string): Uint8Array<ArrayBuffer> {
  const text = label.replace(/[()\\]/g, '');
  const stream = `BT /F1 12 Tf 40 760 Td (ParishLink synthetic demonstration document) Tj 0 -20 Td (${text}) Tj ET`;
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let output = '%PDF-1.7\n';
  const offsets: number[] = [];
  bodies.forEach((body, index) => { offsets.push(output.length); output += `${index + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = output.length;
  output += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`;
  output += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

export type DemoSeedSummary = { seeded: boolean; parishioners: number; appointments: number; documents: number; files: number };

/**
 * Seed the synthetic demonstration dataset into an empty development database.
 * Does nothing when the demo administrator already exists.
 */
export async function seedDemoData(db: D1Database, files: R2Bucket | undefined, now: Date = new Date()): Promise<DemoSeedSummary> {
  const existing = await db.prepare("SELECT 1 AS present FROM users WHERE id = 'user-admin-demo'").first<{ present: number }>();
  if (existing) return { seeded: false, parishioners: 0, appointments: 0, documents: 0, files: 0 };

  const statements: D1PreparedStatement[] = [];
  const add = (sql: string, ...values: unknown[]) => statements.push(db.prepare(sql).bind(...values));
  const parishes: Parish[] = PARISHES.map(([id]) => ({ id, ...PARISH_DETAILS[id] }));
  const serviceById = new Map<string, (typeof SERVICES)[number]>(SERVICES.map((service) => [service[0], service]));

  // People and places ------------------------------------------------------
  add(`INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES ('user-admin-demo', 'admin@parishlink.test', 'Ana Fernandez', 'system_admin', NULL)`);
  for (const parish of parishes) {
    add('INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES (?, ?, ?, ?, ?)',
      parish.staffId, `staff.${parish.key}@parishlink.test`, parish.staffName, 'parish_staff', parish.id);
    for (const clergy of parish.clergy) {
      const email = CLERGY_EMAILS[clergy.userId];
      add('INSERT INTO users (id, email, full_name, role, home_parish_id) VALUES (?, ?, ?, ?, ?)', clergy.userId, email, clergy.name, 'clergy', parish.id);
      add('INSERT INTO clergy_profiles (id, user_id, display_title, home_parish_id) VALUES (?, ?, ?, ?)', clergy.id, clergy.userId, clergy.name, parish.id);
    }
    for (const venue of parish.venues) add('INSERT INTO venues (id, parish_id, name) VALUES (?, ?, ?)', venue.id, parish.id, venue.name);
  }
  const parishioners = PARISHIONERS.map(([first, last], index) => {
    const id = `parishioner-${String(index + 1).padStart(2, '0')}`;
    const parish = parishes[Math.floor(index / 3)];
    const phone = `+63 917 ${String(5100000 + index * 731).slice(0, 3)} ${String(1000 + index * 37).slice(0, 4)}`;
    add('INSERT INTO users (id, email, full_name, role, home_parish_id, phone) VALUES (?, ?, ?, ?, ?, ?)', id, emailFor(first, last), `${first} ${last}`, 'parishioner', parish.id, phone);
    return { id, first, last, name: `${first} ${last}`, parishId: parish.id };
  });

  // Credentials (demo password; only local development reaches this code) ---
  for (const account of LOCAL_DEMO_STAFF_ACCOUNTS.concat(parishes.flatMap((parish) => parish.clergy)
    .filter((clergy) => !LOCAL_DEMO_STAFF_ACCOUNTS.some((account) => account.userId === clergy.userId))
    .map((clergy) => ({ userId: clergy.userId, email: '', role: 'clergy' as const, label: clergy.name })))) {
    const salt = randomSalt();
    add(`INSERT INTO staff_credentials (user_id, password_hash, password_salt, password_iterations, must_change_password)
      VALUES (?, ?, ?, 210000, 0)`, account.userId, await pbkdf2(LOCAL_DEMO_PASSWORD, salt), salt);
  }
  for (const account of LOCAL_DEMO_PARISHIONER_ACCOUNTS) {
    const salt = randomSalt();
    add(`INSERT INTO mobile_credentials (user_id, password_hash, password_salt, password_iterations, email_verified_at)
      VALUES (?, ?, ?, 210000, ?)`, account.userId, await pbkdf2(LOCAL_DEMO_PASSWORD, salt), salt, sqlTime(new Date(now.getTime() - 30 * DAY)));
    add(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, read_at, created_at)
      VALUES (?, ?, 'account', 'Welcome to ParishLink', 'Your account is ready. Requests still require review and approval by authorized parish personnel.', 'profile', ?, ?)`,
      crypto.randomUUID(), account.userId, sqlTime(new Date(now.getTime() - 40 * DAY)), sqlTime(new Date(now.getTime() - 40 * DAY)));
  }

  // Appointments, documents, history ----------------------------------------
  const requirementsByService = new Map<string, (typeof REQUIREMENTS)[number][]>();
  for (const requirement of REQUIREMENTS) requirementsByService.set(requirement[1], [...(requirementsByService.get(requirement[1]) ?? []), requirement]);
  const fileWrites: { key: string; bytes: Uint8Array<ArrayBuffer>; name: string }[] = [];
  let documentCount = 0;
  let referenceNumber = 1001;
  const created: { id: string; parishId: string; parishionerId: string; status: Status; startsAt: Date; endsAt: Date; clergyId: string; venueId: string; staffId: string; reference: string }[] = [];

  for (const [parishIndex, parish] of parishes.entries()) {
    const own = parishioners.filter((person) => person.parishId === parish.id);
    for (const [templateIndex, template] of TEMPLATES.entries()) {
      const status: Status = template.status === 'no_show_or_rejected' ? (parishIndex % 2 === 0 ? 'no_show' : 'rejected') : template.status;
      const service = serviceById.get(template.service)!;
      const clergy = parish.clergy[templateIndex % parish.clergy.length];
      const venue = template.service === 'baptism' && parish.venues[1] ? parish.venues[1] : parish.venues[templateIndex % 2 === 0 || parish.venues.length === 1 ? 0 : 1];
      const person = own[templateIndex % own.length];
      const startsAt = atManila(manilaDate(now, template.offset + (parishIndex % 3)), template.time);
      const endsAt = new Date(startsAt.getTime() + Number(service[3]) * SLOT);
      const id = `demo-appt-${parish.key}-${templateIndex + 1}`;
      const reference = `PL-${startsAt.getUTCFullYear()}-${referenceNumber++}`;
      const createdAt = new Date(Math.min(now.getTime() - 2 * 3_600_000, startsAt.getTime() - 25 * DAY));
      const path = PATHS[status];
      const decision = path.find(([next]) => next === 'approved' || next === 'rejected');
      const decidedBy = decision ? clergy.userId : null;
      const reviewNote = path.at(-1)?.[2] ?? null;
      add(`INSERT INTO appointments (id, reference, parishioner_user_id, parishioner_name, service_type_id, checklist_version_id, parish_id,
          clergy_id, clergy_name, venue_id, venue_name, starts_at, ends_at, status, review_note, decision_reason, decided_by, decided_at,
          version, buffer_before_minutes, buffer_after_minutes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'chk_demo_baseline', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, reference, person.id, person.name, service[0], parish.id, clergy.id, clergy.name, venue.id, venue.name,
        startsAt.toISOString(), endsAt.toISOString(), status, reviewNote,
        decision?.[0] === 'rejected' ? decision[2] ?? null : null, decidedBy,
        decision ? sqlTime(new Date(createdAt.getTime() + path.indexOf(decision) * DAY + DAY)) : null,
        path.length + 1, service[4], service[5], sqlTime(createdAt), sqlTime(new Date(createdAt.getTime() + path.length * DAY)));

      // Participants
      add(`INSERT INTO appointment_participants (id, appointment_id, participant_type, full_name) VALUES (?, ?, 'requester', ?)`, crypto.randomUUID(), id, person.name);
      const subject = template.service === 'wedding' ? ['partner', `${PARTNER_NAMES[(parishIndex + templateIndex) % PARTNER_NAMES.length]} ${parishioners[(parishIndex * 3 + 5) % parishioners.length].last}`]
        : template.service === 'funeral-mass' ? ['deceased', `${DECEASED_NAMES[parishIndex % DECEASED_NAMES.length]} ${person.last}`]
          : ['candidate', `${CHILD_NAMES[(parishIndex + templateIndex) % CHILD_NAMES.length]} ${person.last}`];
      add(`INSERT INTO appointment_participants (id, appointment_id, participant_type, full_name) VALUES (?, ?, ?, ?)`, crypto.randomUUID(), id, subject[0], subject[1]);

      // Documents consistent with the status
      const requirements = requirementsByService.get(template.service) ?? [];
      requirements.forEach((requirement, index) => {
        let docStatus: string;
        if (['approved', 'ready_to_approve', 'completed', 'no_show'].includes(status)) docStatus = 'verified';
        else if (status === 'under_review') docStatus = index < Math.ceil(requirements.length / 2) ? 'verified' : 'submitted';
        else if (status === 'needs_changes') docStatus = index === 0 ? 'needs_replacement' : 'verified';
        else if (status === 'documents_pending') docStatus = index === 0 ? 'submitted' : 'not_submitted';
        else if (status === 'rejected') docStatus = index === 0 ? 'needs_replacement' : 'submitted';
        else docStatus = 'not_submitted';
        const documentId = `${id}-doc-${index + 1}`;
        documentCount += 1;
        if (docStatus === 'not_submitted') {
          add(`INSERT INTO document_submissions (id, appointment_id, requirement_id, requirement_name, is_required, checklist_version_id, status)
            VALUES (?, ?, ?, ?, 1, 'chk_demo_baseline', 'not_submitted')`, documentId, id, requirement[0], requirement[2]);
          return;
        }
        const fileName = `${requirement[0]}-${person.last.toLowerCase().replace(/\s+/g, '')}.pdf`;
        const key = `private/${parish.id}/${id}/${documentId}-${fileName}`;
        const bytes = demoPdf(`${requirement[2]} for ${reference}`);
        fileWrites.push({ key, bytes, name: fileName });
        const submittedAt = sqlTime(new Date(createdAt.getTime() + (index + 1) * 3_600_000));
        const reviewed = docStatus === 'verified' || docStatus === 'needs_replacement';
        add(`INSERT INTO document_submissions (id, appointment_id, requirement_id, requirement_name, is_required, checklist_version_id,
            storage_key, original_file_name, mime_type, size_bytes, sha256, status, reviewer_id, review_note, reviewed_at, submitted_at)
          VALUES (?, ?, ?, ?, 1, 'chk_demo_baseline', ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?)`,
          documentId, id, requirement[0], requirement[2], key, fileName, bytes.byteLength, `sha256:${key}`,
          docStatus, reviewed ? parish.staffId : null,
          docStatus === 'needs_replacement' ? 'The scan is unreadable. Please upload a clearer copy.' : null,
          reviewed ? sqlTime(new Date(createdAt.getTime() + DAY)) : null, submittedAt);
      });

      // History, notifications and audit trail
      add(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, to_status, detail, created_at)
        VALUES (?, ?, ?, 'request_submitted', 'submitted', 'Submitted by parishioner mobile app', ?)`, crypto.randomUUID(), id, person.id, sqlTime(createdAt));
      add(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail, created_at)
        VALUES (?, ?, 'mobile.appointment.create', 'appointment', ?, ?, 'success', ?, ?)`, crypto.randomUUID(), person.id, id, parish.id, `${service[0]}; ${startsAt.toISOString()}`, sqlTime(createdAt));
      add(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id, read_at, created_at)
        VALUES (?, ?, 'appointment', 'Request submitted', ?, 'appointment', ?, ?, ?)`, crypto.randomUUID(), person.id,
        `${reference} was submitted. This is not yet parish approval.`, id, sqlTime(createdAt), sqlTime(createdAt));
      let previous: string = 'submitted';
      path.forEach(([next, actorKind, reason], step) => {
        const at = new Date(Math.min(now.getTime() - 60 * SLOT, createdAt.getTime() + (step + 1) * DAY));
        const actorId = actorKind === 'clergy' ? clergy.userId : parish.staffId;
        add(`INSERT INTO appointment_events (id, appointment_id, actor_id, event_type, from_status, to_status, detail, created_at)
          VALUES (?, ?, ?, 'status_changed', ?, ?, ?, ?)`, crypto.randomUUID(), id, actorId, previous, next, reason ?? null, sqlTime(at));
        add(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail, created_at)
          VALUES (?, ?, 'appointment.transition', 'appointment', ?, ?, 'success', ?, ?)`, crypto.randomUUID(), actorId, id, parish.id,
          `${previous} -> ${next}${reason ? `: ${reason}` : ''}`, sqlTime(at));
        const isLatest = step === path.length - 1;
        add(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id, read_at, created_at)
          VALUES (?, ?, 'appointment', 'Appointment update', ?, 'appointment', ?, ?, ?)`, crypto.randomUUID(), person.id,
          `${reference} is now ${next.replaceAll('_', ' ')}.${reason ? ` ${reason}` : ''}`, id, isLatest && startsAt > now ? null : sqlTime(at), sqlTime(at));
        previous = next;
      });
      created.push({ id, parishId: parish.id, parishionerId: person.id, status, startsAt, endsAt, clergyId: clergy.id, venueId: venue.id, staffId: parish.staffId, reference });
    }
  }

  // Pending change requests (one reschedule, one cancellation) -------------
  const reschedule = created.find((item) => item.parishId === 'metropolitan-cathedral' && item.status === 'ready_to_approve');
  if (reschedule) {
    const proposedStart = new Date(reschedule.startsAt.getTime() + 7 * DAY);
    const proposedEnd = new Date(reschedule.endsAt.getTime() + 7 * DAY);
    add(`INSERT INTO appointment_change_requests (id, appointment_id, kind, requested_by, previous_starts_at, previous_ends_at,
        proposed_starts_at, proposed_ends_at, reason, created_at, updated_at)
      VALUES ('demo-change-reschedule', ?, 'reschedule', ?, ?, ?, ?, ?, 'Our principal sponsor is abroad on the original date.', ?, ?)`,
      reschedule.id, reschedule.parishionerId, reschedule.startsAt.toISOString(), reschedule.endsAt.toISOString(),
      proposedStart.toISOString(), proposedEnd.toISOString(), sqlTime(new Date(now.getTime() - 5 * 3_600_000)), sqlTime(new Date(now.getTime() - 5 * 3_600_000)));
  }
  const cancellation = created.find((item) => item.parishId === 'san-guillermo' && item.status === 'approved' && item.startsAt.getTime() > now.getTime() + 2 * DAY);
  if (cancellation) {
    add(`INSERT INTO appointment_change_requests (id, appointment_id, kind, requested_by, previous_starts_at, previous_ends_at, reason, created_at, updated_at)
      VALUES ('demo-change-cancel', ?, 'cancel', ?, ?, ?, 'The family will hold the baptism in the province instead.', ?, ?)`,
      cancellation.id, cancellation.parishionerId, cancellation.startsAt.toISOString(), cancellation.endsAt.toISOString(),
      sqlTime(new Date(now.getTime() - 26 * 3_600_000)), sqlTime(new Date(now.getTime() - 26 * 3_600_000)));
  }

  // Mass schedule (clergy assignments) — morning Mass never overlaps the 8:00 AM+ booking slots
  for (const parish of parishes) {
    const clergy = parish.clergy[0];
    for (let day = -1; day <= 6; day += 1) {
      const date = manilaDate(now, day);
      add(`INSERT INTO clergy_assignments (id, clergy_id, clergy_name, parish_id, venue_id, venue_name, service, starts_at, ends_at, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, 'Morning Mass', ?, ?, 'confirmed', ?)`, `demo-mass-${parish.key}-${day + 1}`, clergy.id, clergy.name, parish.id,
        parish.venues[0].id, parish.venues[0].name, atManila(date, '06:00').toISOString(), atManila(date, '07:00').toISOString(), parish.staffId);
    }
  }

  // Walk-in queue for today --------------------------------------------------
  const today = manilaDate(now, 0).slice(5).replace('-', '');
  const queue: [parishId: string, number: number, name: string, service: string, status: string, minutesAgo: number][] = [
    ['metropolitan-cathedral', 1, 'Rosario Cunanan', 'Certificate request', 'served', 150],
    ['metropolitan-cathedral', 2, 'Efren Tiglao', 'Baptism inquiry', 'served', 120],
    ['metropolitan-cathedral', 3, 'Marites Santos', 'Wedding inquiry', 'serving', 45],
    ['metropolitan-cathedral', 4, 'Joel Cruz', 'Document submission', 'waiting', 30],
    ['metropolitan-cathedral', 5, 'Nina Reyes', 'Baptism inquiry', 'waiting', 20],
    ['metropolitan-cathedral', 6, 'Paolo Garcia', 'General inquiry', 'waiting', 10],
    ['san-guillermo', 1, 'Leonora Dabu', 'Certificate request', 'waiting', 25],
    ['san-guillermo', 2, 'Ernesto Mallari', 'Funeral Mass inquiry', 'waiting', 12],
  ];
  for (const [parishId, number, name, service, status, minutesAgo] of queue) {
    const issued = new Date(now.getTime() - minutesAgo * SLOT);
    add(`INSERT INTO queue_tickets (id, ticket_number, parish_id, parishioner_user_id, parishioner_name, service, status, counter, issued_at, called_at, served_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, `demo-queue-${parishId}-${number}`, `${today}-${String(number).padStart(3, '0')}`, parishId,
      name === 'Paolo Garcia' ? 'parishioner-02' : null, name, service === 'Funeral Mass inquiry' ? 'General inquiry' : service, status,
      status === 'waiting' ? null : 'Window 1', sqlTime(issued), status === 'waiting' ? null : sqlTime(new Date(issued.getTime() + 15 * SLOT)),
      status === 'served' ? sqlTime(new Date(issued.getTime() + 30 * SLOT)) : null);
  }

  // Announcements --------------------------------------------------------------
  const announcements: [id: string, authorId: string, parishId: string | null, title: string, body: string, daysAgo: number][] = [
    ['demo-ann-vicariate', 'user-admin-demo', null, 'Simbang Gabi schedule', 'Simbang Gabi Masses begin on December 16 in the parishes of the Vicariate. Please check with your parish for the exact Mass times.', 1],
    ['demo-ann-cathedral', 'user-staff-cathedral', 'metropolitan-cathedral', 'Baptismal seminar for parents and godparents', 'The baptismal seminar is held this Saturday at 9:00 AM in the parish hall. Parents and godparents of children scheduled for baptism are encouraged to attend.', 2],
    ['demo-ann-sanguillermo', 'user-staff-sanguillermo', 'san-guillermo', 'Pre-Cana seminar registration', 'Couples preparing for marriage may register at the parish office for the next Pre-Cana seminar. Please bring a valid ID.', 4],
    ['demo-ann-stalucia', 'user-staff-stalucia', 'sta-lucia', 'Submit requirements through ParishLink', 'You may now upload documentary requirements through the ParishLink app. Parish staff will review each document before your appointment is approved.', 6],
  ];
  for (const [id, authorId, parishId, title, body, daysAgo] of announcements) {
    const at = sqlTime(new Date(now.getTime() - daysAgo * DAY));
    add(`INSERT INTO announcements (id, author_id, parish_id, audience, title, body, status, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?)`, id, authorId, parishId, parishId ? 'parish' : 'all', title, body, at, at, at);
    add(`INSERT INTO audit_logs (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail, created_at)
      VALUES (?, ?, 'announcement.publish', 'announcement', ?, ?, 'success', ?, ?)`, crypto.randomUUID(), authorId, id, parishId, title, at);
    for (const person of parishioners.filter((item) => !parishId || item.parishId === parishId)) {
      add(`INSERT INTO notifications (id, recipient_user_id, type, title, body, entity_type, entity_id, read_at, created_at)
        VALUES (?, ?, 'announcement', ?, ?, 'announcement', ?, ?, ?)`, crypto.randomUUID(), person.id, title, body, id, daysAgo > 3 ? at : null, at);
    }
  }

  // Working copies of sacramental records ----------------------------------------
  for (const [parishIndex, parish] of parishes.entries()) {
    const records: [string, string, string, string][] = [
      ['Baptismal', `${CHILD_NAMES[parishIndex % CHILD_NAMES.length]} ${parishioners[parishIndex * 3].last}`, `${2015 + parishIndex}-0${(parishIndex % 8) + 1}-1${parishIndex % 9}`, 'BAP'],
      ['Marriage', `${parishioners[parishIndex * 3 + 1].name} & ${PARTNER_NAMES[parishIndex % PARTNER_NAMES.length]} ${parishioners[(parishIndex * 3 + 7) % 24].last}`, `${2018 + (parishIndex % 6)}-1${parishIndex % 3}-0${(parishIndex % 8) + 1}`, 'MAR'],
      ['Confirmation', `${parishioners[parishIndex * 3 + 2].name}`, `${2010 + parishIndex}-0${(parishIndex % 6) + 3}-2${parishIndex % 8}`, 'CON'],
    ];
    records.forEach(([type, subject, date, prefix], index) => {
      const verified = index !== 2;
      add(`INSERT INTO sacramental_records (id, parish_id, record_type, subject_name, event_date, reference, book_number, page_number, entry_number, officiant, status, verified_against_archive_at, verified_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, `demo-record-${parish.key}-${index + 1}`, parish.id, type, subject, date,
        `${prefix}-${parish.code}-${date.slice(0, 4)}-${String(40 + parishIndex * 7 + index).padStart(4, '0')}`,
        String(12 + parishIndex), String(30 + index * 4), String(100 + parishIndex * 3 + index), parish.clergy[0].name,
        verified ? 'verified_against_archive' : 'working_copy', verified ? sqlTime(new Date(now.getTime() - 20 * DAY)) : null, verified ? parish.staffId : null);
    });
  }

  // Store synthetic files and fix up their real SHA-256 values ------------------
  let stored = 0;
  for (const write of fileWrites) {
    const digest = hex(await crypto.subtle.digest('SHA-256', write.bytes));
    if (files) {
      await files.put(write.key, write.bytes, { httpMetadata: { contentType: 'application/pdf', contentDisposition: `attachment; filename="${write.name}"` } });
      stored += 1;
    }
    add('UPDATE document_submissions SET sha256 = ? WHERE storage_key = ?', digest, write.key);
  }

  for (let index = 0; index < statements.length; index += 50) await db.batch(statements.slice(index, index + 50));
  return { seeded: true, parishioners: parishioners.length, appointments: created.length, documents: documentCount, files: stored };
}

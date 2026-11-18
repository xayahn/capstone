# ParishLink

ParishLink is a capstone system for coordinating sacramental services across the eight parishes of the Vicariate of St. John Mary Vianney (Archdiocese of San Fernando, Pampanga). It has two applications that share one server and database:

- `apps/mobile`: the parishioner app (Expo / React Native) for iOS and Android.
- `apps/admin`: the internal web portal for parish staff, clergy and the system administrator, plus the server API used by the mobile app. Source is split into `frontend/`, `backend/`, `shared/` and `db/`; `app/` holds only framework route entry points.

Parishioners never use the admin portal, and staff never use the mobile app.

## What it does

**Parishioner mobile app (13 screens)**

- Create an account, sign in, change password, edit contact details and home parish
- Browse the five services (Baptism, Wedding, Confirmation, First Communion, Funeral Mass) and their document requirements
- Request an appointment at any of the eight parishes, choosing priest, date and an available time
- Attach PDF, JPG or PNG documents (up to 10 MB each) and follow each document's review status
- Cancel a request, or ask to move it to another time
- Join a parish's walk-in queue and see the ticket's place in line
- Read parish announcements, notifications and the parish directory (address, office hours, contact)
- Ask the parish assistant about requirements and about the user's own requests

**Admin web portal (10 modules)**

Overview · Appointments (including cancellation and reschedule requests) · Document review · Clergy schedule · Parish records · Walk-in queue · Announcements · Reports · Audit log · Settings

**Roles**

| Role | Can do | Cannot do |
|---|---|---|
| Parishioner | Own profile, requests, documents, queue ticket | Open the admin portal |
| Parish staff | Own parish: review documents, prepare requests, run the queue, records, announcements, reports | Give final approval of a sacrament; see other parishes |
| Clergy | Approve or decline appointments assigned to them | Run the queue; read the audit log |
| System administrator | Accounts, settings, vicariate-wide reports and audit log | Approve sacraments; download parishioners' private documents |

Roles and parish boundaries are enforced by the server on every request, not only hidden in the interface.

## Project status

**Capstone build with an online synthetic-data demonstration (Cloudflare Workers + D1 + Workers KV, plus Expo Go updates). Not launched for real parish records or published to an app store.**

Working locally and on the hosted synthetic-data demonstration, and covered by automated checks: everything listed above.

Not done for real-parish launch (release gates):

- **Real-parish production hosting is not launched.** An online demonstration copy runs on Cloudflare with fictional data only (`DEMO_DEPLOYMENT=true`) and private demonstration passwords.
- **Email is not set up.** Password-reset and email-verification codes cannot be delivered until an email sender is configured.
- **Push notifications are disabled** and have never been tested on a physical phone. In-app notifications work.
- **No document malware scanner is configured.** In production mode the server refuses uploads until one is.
- **No user evaluation yet.** No pilot or ISO/IEC 25010 survey has been run; no evaluation scores exist.
- Parish details in the demo data (phone numbers, emails, some addresses) are placeholders until confirmed by each parish.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm 11 (`pnpm@11.25.0` is pinned).

**Easiest (Windows):** from the repository root run

```powershell
.\scripts\start-demo.ps1
```

It finds the laptop's Wi-Fi address, writes it into `apps/mobile/.env`, starts the admin/API server in a new window, prints the demo accounts, and then starts Expo for Expo Go on the same Wi-Fi. Add `-ResetDemo` (with the servers stopped) to start again from fresh demo data, or `-CheckOnly` to only update the settings.

**Manually:**

```powershell
cd apps/admin
pnpm install
pnpm dev            # http://localhost:3000
```

```powershell
cd apps/mobile
pnpm install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
pnpm start          # Expo; press w for the web preview at http://localhost:8081
```

- **Phone with Expo Go:** phone and laptop on the same Wi-Fi, and `EXPO_PUBLIC_API_BASE_URL` in `apps/mobile/.env` set to `http://<laptop Wi-Fi address>:3000/api` (the start script does this). Plain `http://` is allowed only in development builds; preview and production builds require HTTPS.
- **Android emulator:** use `http://10.0.2.2:3000/api`.
- **Reset demo data:** stop the admin server, then run `pnpm demo:reset` in `apps/admin`. The next request rebuilds the database from `drizzle/` and seeds fresh synthetic data dated relative to today.

### Demo accounts (local development only)

Password for all: `ParishLink2026!`

| Role | Email |
|---|---|
| System administrator | `admin@parishlink.test` |
| Parish staff, Metropolitan Cathedral | `staff.cathedral@parishlink.test` |
| Clergy, Msgr. R. Dizon (Metropolitan Cathedral) | `dizon@example.test` |
| Parishioner (mobile app) | `liza.gomez@example.test` |

The full list (staff for every parish, more clergy and parishioners) is in [`docs/DEMO_DATA.md`](docs/DEMO_DATA.md). All demo people and records are fictional. These accounts are never created in production.

## Technology

| Part | Technology |
|---|---|
| Mobile app | Expo SDK 58, React Native 0.88, React 19, TypeScript 6.0 |
| Admin portal and API | React 19, Next.js App Router conventions on Vinext (Vite 8), TypeScript 5.9 |
| Database | SQLite (Cloudflare D1 compatible): 9 migration files, 30 tables, 56 indexes |
| File storage | Private R2-compatible object storage |
| Parish assistant | Answers from ParishLink's own data; optional Google Gemini for general public questions (off unless configured on the server) |
| Tests | Vitest, Node test runner, Miniflare/workerd |

## Security and data integrity

- **Passwords:** PBKDF2-SHA-256 with 210,000 iterations and a unique random salt per account. Passwords must be 12–128 characters with an uppercase letter, a lowercase letter and a number. Exception: a server marked `DEMO_DEPLOYMENT=true` (the online demonstration with fictional data only) uses 100,000 iterations, because Cloudflare Workers does not allow more. Each hash stores its own iteration count, so existing passwords keep working.
- **Lockout:** 5 wrong passwords lock an account for 15 minutes. Wrong email and wrong password get the same message.
- **Sessions:** only a SHA-256 hash of each session token is stored. Mobile sessions last 30 days and staff sessions 12 hours (no idle timeout), at most 5 per person; staff sessions use an HttpOnly, SameSite=Strict cookie.
- **Password changes:** need the current password and an active session. If two changes race, only one succeeds, and only that one signs out the person's other sessions. A signed-out or expired session cannot change a password.
- **No double booking:** the server checks priest, venue and preparation/cleanup time, and inserts the appointment in the same SQL statement. A clashing request gets HTTP 409.
- **Documents:** stored privately with a SHA-256 checksum. The server checks size (10 MB) and the file's real PDF/JPEG/PNG signature, not just its name, rejects PDFs with active content (scripts, launch actions, embedded files), and allows 20 uploads per hour per account. In production mode, uploads require private R2 storage (`FILES`) and are refused until a malware scanner is configured. The only exception is a server marked `DEMO_DEPLOYMENT=true` (fictional data only): it accepts uploads that pass the checks above without a scanner, may store demonstration files in Cloudflare Workers KV (`DEMO_FILES_KV`) on free accounts without R2, and reports this openly on `/ready` (`"deployment": "demo-fictional-data-only"`, `"privateStorage": "demo-kv"`, `"documentScanner": "demo-deployment-prefilter-only"`). The setting is off unless set to exactly `true`.
- **Rate limits:** sign-in 30 per 15 minutes per address (staff and mobile), sign-up 8 per hour, mobile password change 5 per 15 minutes, plus limits on account-email codes, availability, bookings, changes, queue, assistant and push registration. Not rate-limited yet: staff password change, temporary passwords and report exports.
- **Report exports:** **Export CSV** contains every matching appointment (up to 5,000; otherwise narrow the filters) and states the matching count and the row count. Report generation and exports are not audit-logged yet.
- **Audit history cannot be edited.** Database triggers block every UPDATE and DELETE on `audit_logs` and `appointment_events`.
- **Network address on audit entries:** when `AUDIT_IP_HASH_KEY` (at least 32 characters) is set, each audit entry stores a keyed HMAC-SHA-256 fingerprint of the requester's address as reported by the Cloudflare edge (`CF-Connecting-IP`). The raw address is never stored. The local development server does not supply this header, so locally the field stays empty.
- **Retries are safe:** appointment and queue requests carry an idempotency key, so a retried request never creates a duplicate.
- **Assistant boundaries:** the assistant cannot approve, verify or change anything. Questions about a user's own requests, documents or queue ticket are answered only from the database. Gemini is used only when the server is configured for it and the user has allowed it, and it receives only general public questions.

## Verification (18 November 2026, local)

| Check | Result |
|---|---|
| Admin TypeScript and ESLint | 0 errors, 0 warnings |
| Admin unit and integration tests | 375 passed (27 files) |
| Security regression suite | 123/123 passed |
| Migration validation | 9 files, 30 tables, 56 indexes; integrity and foreign keys valid |
| Provider Worker compatibility | 9/9 passed (synthetic responses, no external traffic) |
| Account Worker route checks | 39/39 passed |
| Account HTTP runner safeguards | 6/6 passed |
| Admin production build | Passed |
| Mobile TypeScript | 0 errors |
| Mobile tests | 195 passed (18 files) |
| Mobile Web, iOS and Android bundles | Exported successfully (unsigned) |

Re-run everything with:

```powershell
node apps/admin/scripts/release-check.mjs
node apps/mobile/scripts/release-check.mjs
```

These are local engineering checks. They are not a physical-device test, a signed app build, a deployment, or a user evaluation.

## Documentation

Start with [`docs/README.md`](docs/README.md). Useful entry points: [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md) (where the code lives), [`docs/RBAC.md`](docs/RBAC.md) (roles), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md), [`docs/SECURITY_PRIVACY.md`](docs/SECURITY_PRIVACY.md), [`docs/STAFF_AUTHENTICATION.md`](docs/STAFF_AUTHENTICATION.md), [`docs/DEMO_DATA.md`](docs/DEMO_DATA.md), and the pilot materials in [`research/pilot/`](research/pilot/README.md).

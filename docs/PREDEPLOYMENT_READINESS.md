# ParishLink Pre-deployment Readiness

Historical 29 August snapshot. For the current recovery/native/pilot increment and its unverified gates, see [8 November acceptance record](CRITICAL_GAPS_ACCEPTANCE_2026-11-08.md). Counts and provider status below are preserved as dated evidence, not current clearance.

**Evidence date:** 2026-08-29  
**Release state:** Local development only  
**Deployment state:** Not deployed; no production source version, public URL, database, bucket, mobile binary, or store submission was created by this work.

## 1. Decision summary

The current repository is a release-conscious local capstone implementation. Its implemented features, local builds, and automated checks are suitable for continued staging/pilot preparation, but no staging or production deployment was performed. It must not be described as an approved live parish system until the external, governance, physical-device, provider, and UAT gates below have evidence and sign-off.

## 2. Implemented product scope

### Parishioner mobile application

- Sign-up, sign-in, session restore, sign-out, and password change
- Service/catalog discovery for the exact eight parishes and five sacramental services in the paper
- Dynamic display of configured clergy, venues, document requirements, and queue purposes
- Appointment requests with parish, service, clergy, venue, date, and time
- Server-authoritative slot checks across active appointments, closures/blocks, clergy assignments, duration, and buffers
- Primary participant details and a checklist snapshot frozen when the request is submitted
- Authoritative appointment timeline and document checklist state
- PDF/JPEG/PNG document selection and private upload up to 10 MB
- In-app notifications and read state
- One active walk-in queue ticket, measured estimate when enough recent service data exists, and release action
- Structured Assistant v2 with deterministic requirements, actor-owned request/document status, actor-owned active queue context, sources, actions, clarification choices, and human handoff boundaries
- Contact profile, home parish, and notification preference
- Fictional demo mode kept separate from integrated API mode
- Responsive phone/tablet/web-preview layout, accessible labels/touch targets, and non-color-only statuses
- Extracted `src/api/mobileApiClient.ts`, secure native `src/api/tokenStore.ts`, `src/screens/AssistantScreen.tsx`, and `src/screens/ServicesScreen.tsx`; `App.tsx` remains the shell and still contains the screens being progressively decomposed

### Internal admin web portal

- Role-scoped dashboards for parish staff, clergy, and system administrator
- Appointment state handling and document human-review workflow
- Walk-in queue operations, including accountless front-desk ticket issuance
- Announcement management
- Working sacramental-record creation and archive verification
- Clergy assignment creation/cancellation with schedule conflict checks
- Operational reports without fabricated ISO/IEC 25010 results
- Venue setup, internal-user provisioning, activation/deactivation, and access register
- Server-side role/parish enforcement and audit entries for consequential actions

### Shared server and data layer

- D1/SQLite schema with 24 validated tables and a two-file forward migration chain
- Conflict-aware scheduling using database service duration and preparation/cleanup buffers
- Parameterized queries and bounded JSON bodies
- Private R2 object keys, ownership checks, file magic/trailer checks, SHA-256 hashes, safe filenames, and replacement cleanup
- Mobile request throttling for authentication, assistant, appointments, and queue joins
- In-app events, notifications, session records, and audit records
- Idempotency records for mobile appointment/queue creation and administrative commands
- Public liveness and dependency-aware readiness routes with release/schema checks
- Deterministic Assistant v2 routing for known service, requirement, signed-in-actor request/document, queue, directory, safety, and product-workflow questions
- Optional server-only Gemini phrasing only for unmatched general product guidance, after redaction and with an eight-second timeout; it receives no actor-owned database context and has deterministic fallback

## 3. Security controls evidenced locally

| Area | Current control | Evidence status |
|---|---|---|
| Parishioner passwords | PBKDF2-SHA-256, 210,000 iterations, unique 16-byte salts; 12-128 characters with upper/lower/digit rules | Implemented and exercised |
| Brute force | Generic login failure, five-failure 15-minute account lock, database-backed IP/auth throttling | Implemented and exercised |
| Mobile sessions | Random 32-byte bearer values; only SHA-256 token hashes stored; 30-day expiry; five-session cap; revoke/sign-out; other-session revoke on password change | Implemented and exercised |
| Device token storage | Expo SecureStore using this-device-only, available-after-unlock protection | Implemented; physical-device validation pending |
| Admin authorization | Cookie-authenticated internal identity, server RBAC, parish membership scope, same-origin write validation | Implemented; production identity/MFA provider pending |
| Scheduling | Server-authoritative availability plus atomic/idempotent creation with participants, frozen checklist, overlap checks, event, notification, and audit | Implemented and locally exercised |
| Uploads | Ownership/scope, 10 MB limit, MIME allow-list, beginning/end file signatures, checksum, private object key, audit | Implemented; malware scanner pending |
| Web hardening | Per-request nonce CSP, frame denial, HSTS in production, no-sniff, referrer policy, COOP/CORP, permissions policy | Implemented and production-build header checked |
| Mobile API origin policy | Exact reflected development/approved HTTPS origins; wildcard credentialed CORS removed; denied origins receive no allow-origin header | Implemented and locally exercised |
| Production database startup | Production requests verify migrated tables, release columns, indexes, and foreign keys; they never create/seed schema or auto-promote an administrator | Implemented; provider migration rehearsal pending |
| Retry/data integrity | Appointment creation and high-impact admin/queue actions use payload-bound idempotency and atomic event/notification/audit writes | Implemented locally; concurrency/failure-injection suite pending |
| Assistant/AI | Structured deterministic answers, actor-owned database scope, redacted prompts, typed sources/actions/clarification, no write tools, escalation/refusal, timeout, rate limit, fallback; optional provider key server-only for unmatched general phrasing | Implemented locally; real provider-key safety test pending |
| Dependencies | Production audits for admin and mobile reported no known vulnerabilities | Passed locally |

## 4. Verification evidence

| Check | Result |
|---|---|
| Admin TypeScript | Passed |
| Admin lint | Passed with no reported warnings/errors |
| Admin automated tests | 19/19 passed across workflow, runtime-origin/release configuration, and idempotency helpers |
| Admin production build | Passed; all page/API routes emitted |
| Admin production dependency audit | No known vulnerabilities |
| Forward migration validation | Passed; 2 migrations, 24 tables, required indexes, foreign keys, and integrity check |
| Mobile TypeScript | Passed with Expo-compatible TypeScript 6.0.3 |
| Mobile automated tests | 50/50 passed across environment, API client, authentication, scheduling, status, appointment retry/upload recovery, and Assistant v2 |
| Mobile Expo dependency compatibility | Dependencies up to date |
| Mobile production dependency audit | No known vulnerabilities |
| iOS Expo export | Passed locally; unsigned smoke export only |
| Android Expo export | Passed locally; unsigned smoke export only |
| Web Expo export | Passed locally; browser-preview smoke export only |
| Local responsive review | Mobile web preview checked at 390 px; admin portal checked at 778 px after typography/responsive changes |
| Local availability | Mobile preview `:8081` and admin/API `:3000` both returned HTTP 200 |
| Live health/origin probes | `/health`, `/ready`, catalog, allowed preflight, and denied-origin preflight returned the expected local statuses/headers |
| Live API journey | Sign-up, session, catalog, snapshot, database-backed Assistant requirements, deterministic fallback, and sign-out passed with synthetic local data |
| Extended live API checks | Appointment/document checklist, authoritative duration, valid/private upload, invalid-file rejection, queue join/leave, password change/revocation, lockout, records, clergy assignments, venues, and access-user administration passed |
| Current retry/integrity journey | Synthetic sign-up and availability passed; repeated appointment and queue creates returned the same resources; changed appointment payload on the same key returned 409; participant snapshot persisted; repeated queue leave and sign-out returned 204 |

The generated `dist-release-check` folder and any earlier local export folders are smoke-test outputs only. The 390/778 checks are local browser-preview evidence only. No export is a signed release artifact, no physical iOS/Android device result is claimed, and nothing was uploaded or deployed.

## 5. Mandatory gates before a real launch

### Engineering and platform

- Configure separate staging and production D1 databases and private R2 buckets; run the migration and verify bindings.
- Use an approved HTTPS API/web origin and restrict infrastructure CORS/rate limits to the intended clients and threat model.
- Configure sponsor-controlled internal identity with invitation, MFA, recovery, disablement, and access-review procedures.
- Implement verified parishioner email/phone verification and account recovery through an approved provider.
- Configure a malware scanning/quarantine service before accepting real documentary uploads.
- Configure consented push notification credentials, safe lock-screen templates, retries, and device-token deletion.
- Configure the Gemini secret/model only after provider privacy and safety approval; rerun the refusal, injection, redaction, quota, and outage suite with the real account.
- Produce signed Android App Bundle and iOS archive using sponsor-controlled signing accounts; scan artifacts for secrets and confirm their production API origin.
- Test on representative physical iOS and Android devices, poor networks, denied permissions, background/resume, storage pressure, and accessibility settings.
- Run staging concurrency/load, backup restore, rollback, provider outage, log/alert, and incident exercises.

### Parish, privacy, records, and research

- Obtain authorized validation for parish names/details, clergy/venues, service durations/buffers, document checklists, office policies, queue rules, and notification wording.
- Resolve the controller/DPO, privacy notice, lawful basis/consent, processor/data-region terms, data-subject procedures, retention, secure disposal, breach response, and incident contacts.
- Confirm canonical/records authority, archive provenance, correction, migration, and whether any certificate can be considered official. Default remains a working/index record.
- Complete stakeholder UAT with parishioners, parish staff, clergy, and system administrators.
- Obtain the missing validated ISO/IEC 25010 questionnaire, ethics/consent evidence, sample plan, and actual responses before displaying or claiming evaluation results.
- Approve monitoring, support, backup objectives, maintenance ownership, mobile store disclosures, and staged rollout/rollback decisions.

## 6. Local review instructions

Run the repeatable non-deploying release checks:

```powershell
cd apps/admin
pnpm release:check

cd ../mobile
$env:EXPO_PUBLIC_APP_ENV='production'
$env:EXPO_PUBLIC_DEMO_MODE='false'
$env:EXPO_PUBLIC_API_BASE_URL='https://parishlink-release-check.example.org'
pnpm release:check
```

The `example.org` origin above is only a bundle-validation value. A real release must use the approved live HTTPS API origin. These commands build/export locally and do not deploy, sign, or submit anything.

For interactive local review, start the admin/API first:

```powershell
cd apps/admin
pnpm dev
```

Then start the mobile project:

```powershell
cd apps/mobile
Copy-Item .env.example .env
pnpm start
```

Use `http://localhost:3000` for the admin portal and `http://localhost:8081` for the mobile web preview. Expo Go can open the displayed LAN QR code. Android emulators use `http://10.0.2.2:3000/api`; physical devices use the development computer's LAN address.

The recorded responsive checks used local browser-preview widths of 390 px for mobile and 778 px for admin. Repeating those checks does not replace physical-device, native accessibility, signing, provider, staging, or UAT evidence.

## 7. Release rule

Do not deploy merely because local builds and tests pass. Follow [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md), attach staging evidence to the traceability matrix, resolve or formally accept the decisions in [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md), and obtain the required technical, parish, privacy/security, records/canonical, research, and product approvals.

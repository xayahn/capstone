# ParishLink Production Handoff

**Prepared:** 2026-08-29  
**Current state:** Local release candidate; not approved for real personal data  
**Deployment state:** Not deployed, signed, uploaded, submitted, or connected to production resources

## 1. What is locally ready

ParishLink now has a repeatable, non-deploying release path for the internal admin/API and the parishioner Expo app. The implemented release safeguards include:

- production database startup that verifies migrations and never creates schema, seeds data, or promotes the first identity to system administrator;
- a two-file forward migration chain with 24 expected tables, frozen checklist fields, and payload-bound idempotency records;
- exact browser-origin CORS for mobile web clients, bounded request bodies, sanitized errors, liveness, and dependency-aware readiness;
- server-authoritative availability and atomic/idempotent appointment creation covering participants, checklist snapshots, schedule conflicts, event, notification, and audit;
- atomic/idempotent appointment decisions, document reviews, announcements, queue issuance/call/completion, and related in-app notifications;
- accountless front-desk queue tickets and measured wait estimates that are suppressed until at least five recent completed tickets exist;
- mobile release environments that fail closed, forbid production demo mode, require a public HTTPS API, and keep public variables free of secrets;
- iOS/Android identifiers and build metadata, Android backup/cleartext restrictions, iOS transport restrictions, secure native token storage, and resumable document-upload recovery.

This is engineering evidence, not permission to launch. The unresolved gates in section 7 remain mandatory.

## 2. Repeatable local release checks

Use Node.js 22.13 or newer. These commands do not deploy.

### Admin/API

```powershell
cd apps/admin
pnpm install --frozen-lockfile
pnpm release:check
```

The check runs TypeScript, lint, 19 tests, the complete migration chain, and a production build.

With the local admin/API server running, the retained synthetic integration journey is:

```powershell
pnpm smoke:local
```

It refuses non-local hostnames and uses only generated `example.test` identities.

### Mobile

```powershell
cd apps/mobile
pnpm install --frozen-lockfile
$env:EXPO_PUBLIC_APP_ENV='production'
$env:EXPO_PUBLIC_DEMO_MODE='false'
$env:EXPO_PUBLIC_API_BASE_URL='https://parishlink-release-check.example.org'
pnpm release:check
```

`parishlink-release-check.example.org` is a non-live bundle-validation value. Replace it with the approved HTTPS API origin only when preparing the real signed release. The check runs public Expo configuration validation, TypeScript, 50 tests, and unsigned web/iOS/Android exports.

## 3. Production configuration contract

### Admin/API server

| Setting/binding | Requirement |
|---|---|
| `DB` | Separate migrated production D1/SQLite-compatible database; never reuse local/demo/staging data |
| `FILES` | Separate private production object bucket; public listing/access disabled |
| `MOBILE_ALLOWED_ORIGINS` | Comma-separated exact HTTPS origins for approved browser-based mobile/web clients; no wildcard |
| `RELEASE_VERSION` | Safe immutable release identifier, such as the approved commit/build label |
| `GEMINI_API_KEY` | Optional server secret only after privacy/provider approval; omit to use deterministic fallback |
| Internal identity | Sponsor-controlled invitation, MFA, recovery, disablement, and access-review integration |

Do not put secrets in source files, `.dev.vars`, client bundles, logs, or `EXPO_PUBLIC_*` variables.

### Mobile build

| Variable | Production value |
|---|---|
| `EXPO_PUBLIC_APP_ENV` | `production` |
| `EXPO_PUBLIC_DEMO_MODE` | `false` |
| `EXPO_PUBLIC_API_BASE_URL` | Approved public HTTPS admin/API origin, including the intended `/api` base when applicable |

The configured identifiers are `ph.parishlink.mobile`; ownership must be confirmed before signing. Increment iOS `buildNumber` and Android `versionCode` for every submitted build. Signing material belongs only in Apple/Google/EAS protected credential systems.

Relevant current platform guidance: [Expo EAS build profiles](https://docs.expo.dev/build/eas-json/), [Expo environment variables](https://docs.expo.dev/eas/environment-variables/), [Expo app configuration](https://docs.expo.dev/workflow/configuration/), and [Expo SecureStore](https://docs.expo.dev/versions/v54.0.0/sdk/securestore/).

## 4. Migration and startup order

1. Create isolated staging resources first and capture a provider backup/snapshot.
2. Apply every checked-in migration in filename order: `0000_initial_parishlink.sql`, then `0001_release_safety.sql`.
3. Run the migration validator and retain its output in the release evidence package.
4. Provision the first internal administrator through the approved sponsor-controlled identity/bootstrap process. Production requests do not auto-provision an administrator.
5. Configure private object storage and exact browser origins.
6. Start the candidate and verify `/health` and `/ready`; a missing table, release column, index, foreign-key integrity, database binding, storage binding, or invalid origin policy must prevent readiness.
7. Run synthetic staging smoke, concurrency, authorization, file, provider-failure, backup/restore, and rollback tests before any real data is admitted.

Use the selected provider's migration, backup, and restore workflow. Cloudflare references: [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [D1 backups/Time Travel](https://developers.cloudflare.com/d1/reference/backups/), and [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/).

## 5. Evidence completed locally

| Evidence | Result |
|---|---|
| Admin type/lint/tests | Passed; 19/19 tests |
| Admin migration validation | Passed; 2 files, 24 tables, required indexes, foreign keys, integrity |
| Admin production build | Passed; page, admin, mobile, availability, health, and readiness routes emitted |
| Mobile type/tests | Passed; 50/50 tests |
| Mobile production configuration | Passed in fail-closed API mode |
| Mobile export | Passed locally for unsigned web, iOS, and Android bundles |
| Live local operational probes | `/health` 200, `/ready` 200, catalog 200, allowed preflight 204 with exact origin, denied preflight 403 without allow-origin |
| Synthetic integrated retry journey | Sign-up 201; availability 200; appointment create/replay 201 with one resource; changed payload on same key 409; participant persisted; queue create/replay 201 with one resource; repeated leave 204; sign-out 204 |
| Production dependency audits | Passed for admin and mobile with no known vulnerabilities; rerun for the final frozen lockfiles |
| Source/export secret-pattern scan | Passed; no private-key or common provider-token pattern found in source or generated release-check artifacts |
| Deployment/signing | Not performed |

Generated build/export folders are disposable evidence only. They are not signed or approved production artifacts.

## 6. Release-owner verification before signing

- Re-run both `release:check` commands from a clean checkout and frozen lockfiles.
- Retain lockfile hashes, release version, migration output, build output, dependency/secret scans, and artifact checksums.
- Verify the compiled app contains only the approved HTTPS API origin and no credentials or private test data.
- Confirm exact CORS origins, production identity roles, account disablement, session revocation, and cross-parish denial tests.
- Confirm concurrent identical-slot submissions yield one appointment and repeated idempotency keys yield one logical result.
- Confirm interrupted document uploads retain the appointment and can be retried without duplicate creation.
- Complete an isolated database/object restore and rollback rehearsal.
- Test alerts, incident contacts, backup objectives, retention jobs, and provider outages.
- Obtain signed technical, privacy, parish/canonical, research, UAT, and release approvals.

## 7. Blocking external gates

The following cannot be completed honestly by local code alone:

- approved production/staging D1 and private object-storage accounts, domain/TLS, backups, monitoring, and incident destinations;
- sponsor-controlled internal identity with MFA/recovery and verified parishioner contact/recovery provider;
- malware scanning/quarantine before accepting real documents;
- approved APNs/FCM push setup and safe lock-screen content;
- approved Gemini account/model/region/terms if optional phrasing is enabled;
- Apple Developer and Google Play ownership/signing/store privacy disclosures;
- representative physical iPhone/iPad/Android testing, accessibility, poor-network, background/resume, storage, and performance evidence;
- parish validation of people, venues, schedules, checklists, queue rules, and wording;
- controller/DPO privacy decisions, lawful basis/consent, retention/disposal, data-subject and breach procedures;
- records/canonical authority and archive-provenance approval;
- stakeholder UAT and the missing validated ISO/IEC 25010 research instrument, consent, sampling, responses, and Chapters IV/V evidence.

Until those gates pass, ParishLink must remain a local/staging capstone candidate and must not process real parishioner or sacramental documents.

## 8. No-deployment record

This hardening pass made source, configuration, migration, test, build, and documentation changes only. It did not create or modify a remote environment, publish a website/API, upload a database/object, sign a mobile binary, submit to a store, or use real production credentials.

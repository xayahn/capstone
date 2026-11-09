# ParishLink

ParishLink is a capstone implementation for sacramental-service coordination across the eight parishes named in the research paper. It contains two purpose-specific applications:

- `apps/mobile` — the parishioner-facing Expo application for iOS and Android.
- `apps/admin` — the internal web portal and shared server API for parish staff, clergy, and system administrators.
  Its source is separated into `frontend/`, `backend/`, `shared/`, and `db/`, while `app/` contains only framework entrypoints.

Parishioners do not use the admin web portal. The implementation preserves the prototype's parchment, burgundy, cream, and gold visual direction while following the paper's roles, five services, eight parishes, scheduling, document, notification, queue, record, reporting, and informational-assistant requirements.

## Release status

**Hold release. Nothing has been deployed, submitted to an app store, or installed as a native device build.** The latest release decision remains the [4 November technical audit](docs/AUDIT_2026-11-04.md): dependency advisories and required privacy, canonical, security, operational, and stakeholder clearance remain unresolved. Passing local checks does not certify production readiness.

The [8 November critical-gap follow-up](docs/CRITICAL_GAPS_ACCEPTANCE_2026-11-08.md) records the new recovery/verification implementation, current checks and blocked acceptance work. The owner confirms that beneficiary/pilot approval is pending, both phones have no test build, and no email provider/domain exists. The [beneficiary review brief](research/pilot/BENEFICIARY_APPROVAL_BRIEF.md) is prepared for the group; it has not been sent and no stakeholder pilot has been conducted.

The subsequent [step 1 local account acceptance, 8–9 November](docs/LOCAL_ACCOUNT_ACCEPTANCE_2026-11-09.md) records that connections now work under the current permission grant: 39 actual-Worker account checks and 36 actual local-backend HTTP checks passed. This does not close inbox delivery, physical-device, operational or stakeholder acceptance.

## Local start order

Use Node.js 22.13 or newer and pnpm. Start the admin/API first, then the mobile app:

```powershell
cd apps/admin
pnpm install
pnpm dev
```

```powershell
cd apps/mobile
pnpm install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
pnpm start
```

- Admin portal and mobile API: `http://localhost:3000`
- Mobile web preview for development: `http://localhost:8081`
- Android emulator API base: `http://10.0.2.2:3000/api`
- Physical phone/custom native build API base: a device-reachable, trusted HTTPS origin

The local mobile `.env` is ignored, not checked in. The guarded copy command creates it only when it is absent; if it already exists, preserve and edit the existing settings rather than overwriting them. A custom native build intentionally rejects cleartext traffic, so a development computer's LAN `http://` address is not a working physical-phone API solution. Use an approved, device-reachable HTTPS development endpoint, and use an approved HTTPS origin for any eventual production build.

## Current implementation shape

- The Expo app keeps repository/domain orchestration in `src/repositories/parishLinkRepository.ts`, shared HTTP behavior in `src/api/mobileApiClient.ts`, and API-session persistence in `src/api/tokenStore.ts`. Native builds use Expo SecureStore; AsyncStorage is used only by the local web preview.
- `src/screens/AssistantScreen.tsx` and `src/screens/ServicesScreen.tsx` are extracted screen modules. `App.tsx` remains the application shell and still contains the remaining parishioner screens while that decomposition continues.
- Assistant v2 returns structured text, bullets, sources, actions, follow-up prompts, and service clarification choices. Service requirements, the signed-in actor's request status/documents, and the actor's active queue ticket are answered deterministically from ParishLink data.
- Since 6 November, an explicitly consented public-question path can use live Gemini through the server-only gateway when locally enabled. Its conservative vocabulary/identifier gate sends only bounded public questions and approved public catalogue/directory/navigation context; private status, files, account data and unsupported/authority-sensitive questions remain on the local path. The provider has no write authority, safe fallback remains available, and chatbot transcript writes remain absent.
- Native push has an Expo project and a verified Firebase project/Android app with FCM HTTP v1 enabled. The public `apps/mobile/google-services.json` was retrieved through the official Firebase CLI, verified against the expected project/sender/App/package identifiers, and linked from the preserved ignored mobile `.env`; both remain ignored/untracked. A one-year RSA-2048/X.509 Google sender key is stored only in ignored `.local-secrets/` and is now assigned to the ParishLink Android app. A fresh Expo server query verified the real `xayahrs-team` owner, project UUID, package, sender email and key ID. Setup is still incomplete: push remains disabled, the app has zero Android signing credentials and no submission credential, and no physical-device delivery has been attempted. See [`docs/GEMINI_PUSH_SETUP.md`](docs/GEMINI_PUSH_SETUP.md).
- Parishioner password recovery and signed-in email verification are implemented across the mobile UI and server API. The server uses 12-character, hashed, single-use codes that expire after 15 minutes and stop after five wrong attempts. A successful password reset changes the password, treats the recovered email as verified, revokes every mobile session and push-device binding, and requires a fresh manual sign-in. Existing accounts remain unverified until they complete a proven code flow, and email verification is not yet enforced when booking. Internal staff, clergy and administrator passwords are reset only by a system administrator issuing a one-time temporary password.

Account email is not usable in this local environment: `MAIL_ENABLED`, `MAIL_DELIVERY_VERIFIED`, `RESEND_API_KEY`, and `MAIL_FROM` are all unavailable. The only implemented transport is the fixed server-side Resend endpoint; no live recovery or verification email has been sent or accepted as delivery evidence. See [`docs/ACCOUNT_RECOVERY.md`](docs/ACCOUNT_RECOVERY.md).

## Implemented security baseline

- Internal portal (staff, clergy, system administrator) email/password sign-in with PBKDF2-SHA-256 hashes, HttpOnly SameSite=Strict session cookies, lockout, administrator-issued one-time temporary passwords with forced change, and audited sign-in/out. Local demo accounts are seeded only in development. See [`docs/STAFF_AUTHENTICATION.md`](docs/STAFF_AUTHENTICATION.md).
- PBKDF2-SHA-256 parishioner passwords, account lockout, hashed bearer tokens, revocation, expiry, OS-protected mobile token storage, and rate-limited email-code recovery/verification with generic account-enumeration-safe reset acknowledgement
- server-enforced role/parish scope for the internal portal
- atomic clergy/venue/time conflict protection and database-authoritative service durations/buffers
- server-authoritative availability, participant capture, frozen checklist snapshots, and payload-bound retry protection
- exact mobile browser-origin allowlisting, production schema/readiness checks, and no request-time production schema/bootstrap mutation
- private document storage with ownership checks, size/type/signature validation, SHA-256 checksums, and audited replacement
- bounded request bodies, parameterized database operations, same-origin checks for cookie-authenticated admin writes, CSP/security headers, and database-backed rate limiting
- deterministic Assistant v2 guidance with actor-owned database lookups, structured sources/actions/clarification, and an optional server-only Gemini phrasing path with redaction, timeout, restricted instructions, no write authority, and safe fallback

## Verification status

This recovery/pilot increment records **257 admin tests in 16 files**, **164 mobile tests in 15 files**, **97 backend security regressions**, and TypeScript passing in both applications. The pilot recorder/validator records **35 passing tests and one host-permission skip**. Admin production compilation and unsigned Android/iOS/web exports pass. Exported JavaScript is not a signed native build or physical-device acceptance.

The current isolated database check covers **six migrations, 27 tables and 48 indexes**. In the subsequent 8 November local acceptance run, **nine provider Worker checks**, **39 account Worker source-route checks**, **36 actual Vinext HTTP checks** and **six HTTP-runner safeguard tests** passed. The Worker checks use ephemeral D1 and intercepted mail; the HTTP checks use the running development backend with mail/push disabled. The browser recovery form now renders and reports invalid input/unavailable mail honestly. The earlier connection denial was not reproduced under the current network grant; this does not prove a permanent OS/network fix. Live Gemini public-question connectivity remains separately dated 6 November evidence. See [local account acceptance](docs/LOCAL_ACCOUNT_ACCEPTANCE_2026-11-09.md) for the exact boundaries and rerun commands.

The owner explicitly approved Firebase CLI's broader access only to retrieve the public Android client file. After retrieval, the CLI's normal logout failed before revocation on a Windows ADC cleanup path and printed a misleading success message; the refresh token was instead revoked through Google's official HTTPS endpoint with status 200, task-owned temporary auth/login artifacts were removed, and no global Firebase ADC file was found. No Firebase CLI authentication remains and no other Google project data was changed. A Google OAuth JWT exchange for the `firebase.messaging` scope later returned HTTP 200 without retaining an access token or sending a push; it does not prove delivery.

The owner then approved temporary Expo settings/sign-in access. Because the filesystem tool still exposed only `.expo`, EAS used safe task-owned settings under ignored `.validation-tmp/expo-cli-settings`, with no Windows-profile or SDK source changes. The organization-only device flow selected `xayahrs-team` Release Manager and left the personal account unchecked. The normal menu stalled before mutation and was interrupted; official installed EAS credential client functions then preflighted the real project/key, created the empty Android credential identity, assigned the existing sender key, and freshly verified the metadata with 10-second request limits. Official Expo server logout returned 200 and the official session manager removed local auth; no Expo authentication remains. The root configuration check finds Gemini and Android Firebase client configuration present; push remains false, so its overall exit remains 1. No signing credential, submission credential, native/device build, store submission, scheduler, device push, production migration, or deployment has been completed.

All of this is local engineering evidence only. Dependency advisories from the latest audit remain unresolved, and physical-device testing, app signing/store review, production-configured and acceptance-tested account email delivery, booking-verification policy enforcement, malware scanning, completed push credentials, staging load/restore/rollback, privacy/canonical/security clearance, and stakeholder UAT remain release gates. See [`docs/PREDEPLOYMENT_READINESS.md`](docs/PREDEPLOYMENT_READINESS.md).

## Documentation

Start with [`docs/README.md`](docs/README.md). Use [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md) to locate frontend, backend, shared, database, and route files. Account email setup and acceptance are in [`docs/ACCOUNT_RECOVERY.md`](docs/ACCOUNT_RECOVERY.md). The approval-gated research pilot and physical-device matrices are in [`docs/PILOT_PROTOCOL.md`](docs/PILOT_PROTOCOL.md) and [`docs/NATIVE_ACCEPTANCE.md`](docs/NATIVE_ACCEPTANCE.md); neither records a completed pilot or native acceptance. For the exact local release commands, configuration, evidence, and remaining owner decisions, use [`docs/PRODUCTION_HANDOFF.md`](docs/PRODUCTION_HANDOFF.md).

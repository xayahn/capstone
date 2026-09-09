# ParishLink

ParishLink is a capstone implementation for sacramental-service coordination across the eight parishes named in the research paper. It contains two purpose-specific applications:

- `apps/mobile` — the parishioner-facing Expo application for iOS and Android.
- `apps/admin` — the internal web portal and shared server API for parish staff, clergy, and system administrators.
  Its source is separated into `frontend/`, `backend/`, `shared/`, and `db/`, while `app/` contains only framework entrypoints.

Parishioners do not use the admin web portal. The implementation preserves the prototype's parchment, burgundy, cream, and gold visual direction while following the paper's roles, five services, eight parishes, scheduling, document, notification, queue, record, reporting, and informational-assistant requirements.

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
Copy-Item .env.example .env
pnpm start
```

- Admin portal and mobile API: `http://localhost:3000`
- Mobile web preview for development: `http://localhost:8081`
- Android emulator API base: `http://10.0.2.2:3000/api`
- Physical phone API base: the development computer's LAN address

The checked-in local `.env` uses integrated API mode. Production mobile builds must replace the local URL with an approved HTTPS origin.

## Current implementation shape

- The Expo app keeps repository/domain orchestration in `src/repositories/parishLinkRepository.ts`, shared HTTP behavior in `src/api/mobileApiClient.ts`, and API-session persistence in `src/api/tokenStore.ts`. Native builds use Expo SecureStore; AsyncStorage is used only by the local web preview.
- `src/screens/AssistantScreen.tsx` and `src/screens/ServicesScreen.tsx` are extracted screen modules. `App.tsx` remains the application shell and still contains the remaining parishioner screens while that decomposition continues.
- Assistant v2 returns structured text, bullets, sources, actions, follow-up prompts, and service clarification choices. Service requirements, the signed-in actor's request status/documents, and the actor's active queue ticket are answered deterministically from ParishLink data.
- Gemini is optional, server-only, and limited to rephrasing unmatched general product guidance after redaction. It does not receive the deterministic actor-owned context and has no workflow mutation authority.

## Implemented security baseline

- PBKDF2-SHA-256 parishioner passwords, account lockout, hashed bearer tokens, revocation, expiry, and OS-protected mobile token storage
- server-enforced role/parish scope for the internal portal
- atomic clergy/venue/time conflict protection and database-authoritative service durations/buffers
- server-authoritative availability, participant capture, frozen checklist snapshots, and payload-bound retry protection
- exact mobile browser-origin allowlisting, production schema/readiness checks, and no request-time production schema/bootstrap mutation
- private document storage with ownership checks, size/type/signature validation, SHA-256 checksums, and audited replacement
- bounded request bodies, parameterized database operations, same-origin checks for cookie-authenticated admin writes, CSP/security headers, and database-backed rate limiting
- deterministic Assistant v2 guidance with actor-owned database lookups, structured sources/actions/clarification, and an optional server-only Gemini phrasing path with redaction, timeout, restricted instructions, no write authority, and safe fallback

## Verification status

The code has passed local TypeScript checks, admin linting, 69 automated tests (50 mobile and 19 admin), production dependency vulnerability audits, a two-migration/24-table schema validation, an admin production build, local health/readiness/CORS probes, synthetic live API journeys, and unsigned Expo exports for iOS, Android, and web. Local browser-preview responsive checks were also completed at a 390 px mobile width and a 778 px admin width.

Those responsive checks and exports are local engineering evidence only. No site, API, database, signed mobile binary, or store build was deployed. Physical-device testing, app signing/store review, production identity/MFA and recovery, malware scanning, push credentials, real Gemini provider-key testing, staging load/restore/rollback, privacy/canonical approval, and stakeholder UAT remain release gates. See [`docs/PREDEPLOYMENT_READINESS.md`](docs/PREDEPLOYMENT_READINESS.md).

## Documentation

Start with [`docs/README.md`](docs/README.md). Use [`docs/PROJECT_STRUCTURE.md`](docs/PROJECT_STRUCTURE.md) to locate frontend, backend, shared, database, and route files. For the exact local release commands, configuration, evidence, and remaining owner decisions, use [`docs/PRODUCTION_HANDOFF.md`](docs/PRODUCTION_HANDOFF.md).

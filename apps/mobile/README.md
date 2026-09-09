# ParishLink mobile

ParishLink mobile is the parishioner-facing Expo application for the capstone project **“ParishLink: A Digital Platform for Sacramental Services Coordination and Parish Information Management.”** Staff, clergy, and system-administration functions intentionally remain outside this app and belong in the protected admin website.

## Implemented experience

- Real mobile sign-up, sign-in, secure session restore/revoke, and password change through the shared API
- Explicit fictional demonstration mode kept separate from live API mode
- Parishioner home dashboard and notifications
- Service discovery for Baptism, Wedding, Confirmation, First Communion, and Funeral Mass
- Appointment requests across the eight parishes named in the research paper
- Parish, clergy, date, and time selection
- Interval-aware conflict detection using the service duration and 15-minute preparation buffers
- Document selection for PDF, JPG, and PNG files up to 10 MB
- Separate `selected`, `submitted`, `under review`, and `staff verified` document states
- Appointment status timeline and document-review summary
- Walk-in queue ticket flow with an explicitly estimated wait
- Structured Assistant v2 guidance with deterministic service requirements, signed-in-user request status, document next steps, active queue context, sources, actions, follow-up prompts, clarification choices, and human handoff boundaries
- Parishioner contact profile, home parish, and notification preference
- Responsive layouts, screen-reader labels, touch targets, and readable status cues that do not rely on color alone
- Native app icon, adaptive Android icon, splash artwork, and web favicon using the prototype palette

The app preserves the prototype’s parchment, oxblood, leather, brass, and olive palette. Cormorant Garamond is used for display text and Inter for interface text.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm.

```bash
pnpm install
copy .env.example .env
pnpm start
```

Then open the project with Expo Go or an Android/iOS simulator. The web target is available for development and accessibility checks with `pnpm web`, but it does not replace the native mobile deliverable.

## Demonstration and API modes

The checked-in example enables the integrated local API:

```dotenv
EXPO_PUBLIC_DEMO_MODE=false
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

Demonstration mode stores sample data locally with AsyncStorage. It does **not** create official accounts, reserve live parish schedules, upload files to a parish, or modify official sacramental records.

For an Android emulator use `http://10.0.2.2:3000/api`. A physical phone must use the development computer's LAN address. Production must use an approved HTTPS API origin. Screens use the repository in `src/repositories/parishLinkRepository.ts` rather than calling the network directly. The repository delegates shared bearer-header, timeout, cancellation, response-format, and safe-error behavior to `src/api/mobileApiClient.ts`. `src/api/tokenStore.ts` stores API tokens in Expo SecureStore on native platforms and uses AsyncStorage only for the local web preview.

The API adapter expects these authenticated endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/mobile/catalog` | Load the authoritative parish, service, clergy, venue, requirement, and queue catalog |
| `POST` | `/mobile/auth/sign-up` | Create a parishioner account and secure session |
| `POST` | `/mobile/auth/sign-in` | Start a parishioner session |
| `GET` | `/mobile/auth/session` | Restore the current secure session |
| `POST` | `/mobile/auth/sign-out` | Revoke the current session |
| `POST` | `/mobile/auth/change-password` | Change the password and revoke other sessions |
| `GET` | `/mobile/snapshot` | Load profile, appointments, notifications, and active queue ticket |
| `POST` | `/mobile/appointments` | Create an appointment request and return its authoritative state |
| `POST` | `/mobile/appointments/{id}/documents/{documentId}` | Upload one selected file as multipart form data |
| `POST` | `/mobile/notifications/{id}/read` | Mark a notice read |
| `POST` | `/mobile/queue/tickets` | Create one walk-in queue ticket |
| `DELETE` | `/mobile/queue/tickets/active` | Release the active queue ticket |
| `POST` | `/mobile/assistant` | Request structured Assistant v2 guidance |
| `PUT` | `/mobile/profile` | Update the parishioner’s contact preferences |

The included backend enforces authentication/ownership, content and file-size checks, rate limits, audit logging, and authoritative schedule conflict checks. Production still requires an approved malware-scanning/quarantine service and infrastructure-level abuse controls. Client-side conflict checks are helpful feedback but are never the final reservation authority.

### Assistant v2 behavior

The assistant endpoint returns an `AssistantMessage` with required `id`, `from`, `text`, and `createdAt` fields plus optional `title`, `bullets`, `sources`, `actions`, `followUpPrompts`, `clarification`, and `escalation`. Actions carry typed navigation targets and optional service or appointment IDs; clarification options send a specific follow-up prompt.

Requirements come from the current service catalogue. Appointment status and document guidance are queried only for the authenticated actor, and queue guidance uses only that actor's active ticket. These paths are deterministic and remain available without Gemini. An optional server-only Gemini key may rephrase only otherwise-unmatched general product guidance after redaction; it cannot inspect documents, use actor-owned appointment/queue data, approve anything, or mutate a workflow. No real Gemini provider-key run is claimed by the local evidence.

Never place a Gemini or other provider key in an `EXPO_PUBLIC_*` value. The mobile app calls the protected ParishLink assistant endpoint; the backend owns any provider credential, safety policy, redacted logging, and staff handoff.

## Verification

```bash
pnpm typecheck
pnpm test
```

The current mobile suite contains 24 passing tests: 3 authentication, 6 scheduling, 4 status/document-boundary, 5 mobile API client, and 6 assistant tests. The assistant tests cover clarification, traceable service actions, signed-in-actor appointment/queue isolation, official-decision handoff, and emergency escalation.

Local Expo bundle smoke exports have passed for all three targets:

```bash
pnpm expo export --platform ios
pnpm expo export --platform android
pnpm expo export --platform web
```

A local mobile web-preview check was completed at 390 px after the typography/responsive work. This is not evidence of physical iOS/Android device behavior, signing, store readiness, a complete accessibility audit, UAT, or production approval.

## Production readiness checklist

This repository is a release-conscious capstone implementation, not a claim that a live parish service is deployed or approved. Before a real launch:

1. Connect and contract-test the production API.
2. Complete privacy, data-retention, consent, and breach-response review with the participating parishes and school.
3. Configure verified account recovery and production internal identity/MFA; validate OS-backed mobile session storage on devices.
4. Add malware scanning/quarantine and validate provider encryption/private-storage policy.
5. Add push-notification credentials and explicit device permission handling.
6. Run Android and iOS device testing, accessibility testing, security testing, load testing, and parish user-acceptance testing.
7. Replace sample clergy and requirement details only with parish-approved operational data.
8. Record measured ISO/IEC 25010 evaluation results; do not invent scores.

## Key files

- `App.tsx` — application shell plus the parishioner screens that are still being decomposed into modules
- `src/screens/AssistantScreen.tsx` — extracted structured assistant conversation UI
- `src/screens/ServicesScreen.tsx` — extracted service catalogue and request-entry UI
- `src/repositories/parishLinkRepository.ts` — demo and API repositories
- `src/api/mobileApiClient.ts` — authenticated HTTP, timeout/cancellation, response, and safe-error boundary
- `src/api/tokenStore.ts` — native SecureStore token persistence and local-web fallback
- `src/lib/scheduling.ts` — deterministic interval-aware schedule checks
- `src/lib/status.ts` — human-readable status and timeline rules
- `src/lib/assistant.ts` — bounded demonstration guidance
- `src/data/catalog.ts` — eight parishes and five services
- `tests/` — domain tests

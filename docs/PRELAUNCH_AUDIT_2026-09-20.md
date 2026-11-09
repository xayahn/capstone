# ParishLink prelaunch audit — 20 September 2026

## Decision: HOLD RELEASE — not production-ready

Do not launch with real parishioner data yet. This audit reproduced authorization-policy violations, document-integrity failures, authentication races, network-failure defects, and scheduling errors. Passing builds and existing tests do not override these findings.

**No deployment, push, commit, dependency upgrade, or application-source fix was performed.** Audit scripts/reports and local build output were added. HTTP/browser tests created clearly synthetic accounts, requests, documents, and queue data in the local development database; they did not use real parishioner documents. Those fixtures remain for investigation. Provider tests intercepted Gemini calls; no synthetic passport example was sent to Google.

Audited baseline: commit 8783d6254e8f5a1d704bc47ca6dec4ea6298b04d. The application source was initially clean. The admin/API ran locally on port 3000 and the Expo web preview on 8081. This is an engineering audit, not a certification of zero defects or a complete penetration test.

## Evidence and limits

| Check | Result | What this establishes |
|---|---|---|
| Existing automated tests | 50 mobile + 19 admin passed | Existing covered behavior; the newly found defects are mostly outside those tests |
| TypeScript | Both applications passed | Type consistency, not runtime or security correctness |
| Admin lint and production build | Passed | Source/build checks only; no production deployment tested |
| Mobile export | Android, iOS, web exports succeeded | Unsigned JavaScript/Hermes bundles using local development configuration; NOT installed native apps |
| Database migration validator | 2 migration files; 24 tables; 38 indexes; integrity checks passed | Fresh migrated local SQLite schema is structurally valid |
| Local HTTP tests | Normal signup/sign-in, booking, queue, password change, logout, malformed input, ownership, CORS and retry cases exercised | Real local route behavior; several negative cases failed as listed below |
| Service tests | Actual TypeScript services with real migrations, in-memory SQLite adapter, mocked object storage/provider | Deterministic role, race, and integrity reproductions; not Cloudflare production concurrency |
| Connection-failure tests | Actual client/repository/hook source with synthetic fetch/storage and a minimal hook runner | Slow/stalled request and state-transition behavior; not airplane-mode tests on a device |
| UI checks | Mobile web at 390px; admin at 1280px, 390px and 320px | Inspected main screens; confirmed queue defects. Not a full accessibility/device certification |
| Small local load sample | 100 snapshot requests, concurrency 10; all 200; p50 321ms, p95 541ms, max 543ms | A bounded local sample, NOT a supported user count or production capacity guarantee |
| Secret-pattern scan | No matches in 152 tracked files and 152 locally reachable Git blobs | No recognizable key/token/private-key patterns in that scope; not proof that no secret exists anywhere |
| Dependency advisory scan | Findings below | Vulnerable installed versions; application exploitability still needs runtime-path assessment |

Evidence files: [HTTP results](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/http-results.json), [service/race results](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/service-results.json), [network results](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/network-results.json), [startup recovery result](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/readiness-results.json), [secret scan](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/secret-scan-results.json), [admin full dependency scan](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/admin-all-dependencies.json), [admin production dependency scan](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/admin-production-dependencies.json), [mobile production dependency scan](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/work/audit-2026-09-20/mobile-production-dependencies.json). Audit harnesses are beside these files. Do not run the HTTP harness against production: it creates synthetic data.

Evidence labels below:
- **HTTP**: reproduced through the running local API.
- **Service**: reproduced against actual services with controlled local adapters.
- **Fault injection**: actual source with controlled failures.
- **UI**: observed in the browser.
- **Source**: inspected behavior, not an end-to-end runtime reproduction.
- **Unverified release gate**: requires infrastructure, policy approval, or real devices.

## Fix first: security and integrity blockers

### A01 — High: internal permissions exceed the documented policy

**Service.** An unassigned clergy actor received another person's sacramental working record from the same parish. A system administrator downloaded a private document without a purpose grant and approved a sacramental request. These conflict with the repository's RBAC policy: assignment/need-to-know scope, purpose-limited document access, and no canonical approval authority for system administration by default.

This is an overbroad *authenticated internal-user* permission problem, not evidence that anonymous users can read all records. Normal parish staff cross-parish isolation and assigned-clergy appointment isolation passed.

Cause: records use parish-wide scope; system-admin branches bypass resource restrictions; transition rules return every allowed transition for system administrators. The documented membership/purpose-grant model is not fully enforced.

Fix: implement the approved permission matrix on the server, separate technical administration from sacramental decisions, enforce active memberships and explicit purpose/assignment grants, and log denied sensitive actions. Do not resolve this just by hiding buttons.

Acceptance: tests for every role × own/other parish × assigned/unassigned resource × inactive/revoked membership; no private body/file returned without the necessary grant. Any legitimate policy change needs stakeholder approval.

Locations: [scope queries](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:102), [private download](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/routes/admin/document.ts:43), [transition roles](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/shared/workflow.ts:24), [documented policy](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/docs/RBAC.md).

### A02 — High: replacement can be marked verified without being reviewed

**Service.** The reviewer reads the original submitted document; the owner replaces it while review is in flight; review returns success and marks replacement-never-reviewed.pdf as verified.

The update compares only document status. Both versions are “submitted,” so it does not detect replacement. A filename/status is not a file-version identity.

Fix: immutable submission versions, expected hash/version on review, atomic compare-and-update, and preservation of the reviewed object/history.

Acceptance: replacement before or during review produces a conflict; only the exact viewed file version becomes verified.

Location: [reviewDocument](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:447).

### A03 — High: approved/closed appointments still accept document replacement

**HTTP + Service.** Upload to a cancelled appointment returned 200. Replacing a required document after approval returned 200, changed the document to submitted, but left the appointment approved.

Fix: enforce state-based upload permissions in both upload routes. Closed workflows must be immutable unless an authorized reopen is audited. An allowed material replacement must invalidate affected verification/approval atomically. Preserve historical objects rather than deleting the only prior copy.

Acceptance: cancelled/completed/rejected/no-show and approved cases tested through both mobile and admin routes; concurrent approval/upload must never produce “approved with unreviewed required file.”

Locations: [mobile upload](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/routes/mobile/appointment-document.ts:49), [admin upload](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/routes/admin/document-upload.ts:49).

### A04 — High, when Gemini is enabled: personal text can leave the system and remain in logs

**Service with intercepted provider call.** A synthetic free-text question containing a full name and passport-like identifier reached the Gemini request body unchanged. The identifier also remained in chatbot_messages.redacted_content. No actual external provider transmission occurred during this test.

The redactor covers a few patterns; unmatched personal information does not cause a block. Calling the stored field “redacted” does not make it safe.

Fix: keep the optional provider disabled until an approved privacy boundary exists. Prefer deterministic guidance or allowlisted structured intents without raw user text. Add clear user notice, minimization, safe telemetry and enforceable retention/deletion; do not rely solely on a larger regex.

Acceptance: names, addresses, international phone numbers, IDs, mixed-language input and pasted sensitive text must not reach provider payloads or retained transcripts.

Locations: [redaction](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:724), [provider decision and transcript storage](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:1289).

### A05 — High: concurrent password failures bypass the intended account lockout

**Service.** Eight simultaneous wrong passwords all returned 401, but the account counter finished at 1 with no lockout. Requests read the same old value and overwrite each other's increments.

The separate IP limit is atomic and still exists; this finding does not mean authentication has no rate limiting.

Fix: atomic database increments/lock decisions, concurrency-safe success resets, account + trusted-IP abuse controls and safe security telemetry.

Acceptance: parallel attempts cannot reduce/lossily overwrite the count; threshold locks persist across instances. Test valid login racing with failures, expiry and recovery.

Location: [failed-attempt update](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/auth/mobile-auth.ts:206).

### A06 — High: failed logout retains private data in memory/on screen

**Fault injection.** When the sign-out request fails, the repository removes the stored token but rethrows; the hook never clears its session/snapshot. The user can remain looking at private account content after choosing logout.

Fix: always clear private local state/navigation in a finally path; remote revocation failure must not prevent local logout. Define how server sessions are revoked/recovered without leaving a credential unnecessarily on the device.

Acceptance: offline, timeout, 500 and repeated logout all return to signed-out UI immediately with no prior-account content visible.

Locations: [hook logout](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/hooks/useParishLink.ts:218), [repository logout](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/repositories/parishLinkRepository.ts:512).

### A07 — Critical-rated dependencies are installed; other high advisories also need resolution

**Dependency scan; exploitability conditional.** The admin production-dependency scan reports 2 critical and 1 high advisories. Its full tree reports 2 critical, 11 high, 11 moderate and 3 low findings; these counts overlap, so do not add them together. Mobile production dependencies report one high finding through Expo CLI tooling.

| Installed component | Finding / remediation floor from advisory | Exposure qualification |
|---|---|---|
| Next.js 16.2.11 | Windows-hosted RCE; fixed in 16.3.3 on this branch | This project uses vinext/Cloudflare, not a demonstrated conventional Windows Next.js production server |
| Next.js 16.2.11 | AVIF image-optimization RCE; fixed in 16.3.3 | Optimization endpoint/path reachability was not established |
| sharp 0.35.0 | libheif vulnerabilities; fixed in 0.35.4 | Depends on actual image-processing use |
| react-server-dom-webpack 19.2.6 | Server Functions denial of service; fixed in 19.2.8 | In the vinext/RSC dependency path despite its devDependency classification |
| image-size 2.0.2 | Parser infinite loops; fixed in 2.0.3 | Reached through vinext; must assess bundled runtime use |
| Vite 8.0.13 | Windows dev-server file-deny bypass and UNC issue; fixed in 8.0.16 | Development exposure; do not expose the dev server publicly |
| js-yaml 4.3.1 | Resource exhaustion; fixed in 4.3.2 | Mobile path is Expo CLI/xcpretty, not proof of an installed native-app exploit |

Other findings include ws, undici, esbuild and Vitest; see the full JSON. A “development dependency” label does not automatically mean irrelevant: vinext itself builds/runs the backend.

Fix: upgrade to compatible supported patched versions, regenerate locks, verify the resolved tree and actual shipped bundle, then repeat all tests/builds. Record any non-reachability justification; do not silently waive critical alerts.

Primary references: [Next Windows advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [Next AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), [React advisory](https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g). Dependency-specific details are preserved in the scan files.

### A08 — High hardening gap: upload acceptance is not safe-document validation

**HTTP + Source.** A fake PDF containing only a PDF-looking header/footer was accepted. Signature checks do not parse a document or establish that it is safe. No malware quarantine/scanning path was found. The multipart body is buffered before file-size validation; an absent Content-Length is not an effective total-body cap. No route-specific upload quota was found.

This does not demonstrate malware execution or a confirmed out-of-memory crash; those attacks were not run.

Fix: bounded streaming/total request limits, per-user rate/storage quotas, quarantine, appropriate parser validation/scanning and safe downloads; account for object-storage/DB partial failures.

Acceptance: malformed/truncated/polyglot files remain unavailable to reviewers until safely processed; oversized bodies/multiple parts/abusive retries fail predictably within resource limits.

Locations: [mobile parser](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/routes/mobile/appointment-document.ts:13), [admin parser](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/routes/admin/document-upload.ts:16).

### A09 — Potentially critical, UNVERIFIED: production admin identity boundary

**Source + local negative test.** The app consumes oai-authenticated-user-* headers and depends on a trusted upstream identity layer. Forged headers were rejected by the local development bridge (401). That proves local behavior, not production ingress protection. Production sign-in/callback routing, MFA and direct-origin isolation were not exercised.

Fix/release gate: specify the supported identity gateway, ensure it strips client-supplied identity headers, validate authenticated identity, prevent direct-origin bypass, and verify invite-only role mapping and stable external identity binding. The app must fail closed when the gateway is missing. Do not expose a standalone worker that blindly accepts these headers.

Acceptance: test valid login/logout/recovery, unauthenticated requests, spoofed headers through every hostname/origin, revoked users and role changes in the exact intended environment. This needs a private test environment approved by the owner; no deployment was performed for this audit.

Location: [admin identity adapter](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/app/chatgpt-auth.ts:20).

## Reliability and core workflow blockers

### A10 — High: sign-in can become a permanent loading screen

**Fault injection + Source.** Sign-in succeeds and stores a session, then snapshot loading returns 503. The hook ends loading with an error, but App renders only “Preparing your parish dashboard…” because the session exists and snapshot does not. There is no visible retry/logout path in that branch. Signup has the same ordering.

Also, restoreSession deletes a valid saved token on any transport failure, not only a definitive authentication rejection.

Fix: explicit signed-out/loading/ready/recoverable-error states; handle 401 separately from offline/5xx; retain valid credentials across transient failures; make retry and local logout reachable.

Acceptance: independently fail catalog, session, login and snapshot responses; recovery must work without clearing app storage or restarting.

Locations: [auth hook](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/hooks/useParishLink.ts:89), [loading branch](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/App.tsx:139), [restoreSession](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/repositories/parishLinkRepository.ts:480).

### A11 — High: buffer overlap and unoffered appointment times are accepted

**HTTP.** A wedding at 08:00–09:30 with a 30-minute post-buffer and a funeral starting at 09:45 with a 15-minute pre-buffer were both accepted. Only the incoming request's buffer is applied against the previous appointment's raw interval.

Separately, a 02:17 AM request outside the offered UI slots returned 201. The server does not require the requested time to be an offered/approved slot. Six simultaneous requests for the *same raw slot* correctly produced one success and five conflicts; that positive test does not cover the buffer defect.

Fix: one shared server-side scheduling policy for availability, submission, assignments and approval; compare both occupied intervals, validate office/service schedules and approved exceptions, and maintain atomic collision protection.

Acceptance: adjacent services with asymmetric buffers, boundary times, midnight, unavailable resources, parish-wide blocks and concurrent booking/approval/assignment tests.

Locations: [offered slots](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:341), [booking conflict query](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:511), [approval gates](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:377).

### A12 — High: deactivated clergy can still receive new bookings

**Service.** Disabling an internal clergy user left the clergy profile listed and bookable. The booking/catalog checks use the profile's active flag, whereas disablement changes the user flag.

Fix: keep account/resource lifecycle consistent and check active user, profile and approved assignment/membership in all relevant queries. Decide how existing appointments are reassigned.

Acceptance: disabled clergy disappear from availability and new submissions fail; existing appointments remain auditable.

Locations: [disablement](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:805), [resource selection](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:499).

### A13 — High: startup database outage becomes sticky

**Fault injection, production branch.** First schema-readiness check failed with a synthetic temporary DB error. After recovery, a second call returned the same cached rejection without querying the database again (query count stayed at 1).

Fix: clear failed initialization promises and retry with bounded backoff; do not make temporary initialization failures permanent for an instance. Readiness must indicate actual recovery.

Acceptance: cold-start DB failure followed by recovery succeeds on the same module/worker instance; sustained failure remains a safe bounded 503.

Locations: [production initialization](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/db/runtime.ts:302), [cached public initialization](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/db/runtime.ts:447). The readiness endpoint also checks only that private storage is configured, not that object operations work.

### A14 — Medium/high: successful writes can look failed; retries change identity

**Fault injection.** A booking save succeeded, then refresh failed. The UI operation rejected even though the new appointment had been merged into local state. Retrying generated a different idempotency key. The fake transport accepted both, demonstrating key instability—not proof that the real same-slot collision gate permits duplicate appointments.

Similar “write then refresh” patterns exist for queue/profile/uploads. The server's same-key replay protection passed; clients must preserve that key across an uncertain outcome to use it properly.

Fix: persist a key for one logical operation, distinguish saved-but-refresh-failed from not-saved, reconcile uncertain outcomes, and preserve form drafts.

Acceptance: disconnect before send, after commit/before response, during upload, and during refresh; at most one logical operation and a truthful user message.

Locations: [submission identity](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/api/appointmentSubmission.ts:61), [refresh after writes](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/src/hooks/useParishLink.ts:100), [admin mutation identity](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/frontend/components/admin-portal.tsx:158).

### A15 — Medium: conditional requirements are treated as unconditional

**UI + Source.** Baptism lists “Parents' Marriage Certificate (if married in Church)” and “Baptismal permission letter (if outside home parish)” as Required, including a home-parish request. The server seeds those as required. The client separately infers optionality from the words “if available,” which can disagree with the server's required flag.

Fix: approved structured applicability rules and required/optional status, shared with the client and captured per request; an audited exemption workflow where authorized. Do not force users to upload unrelated documents.

Acceptance: unmarried parents, home/outside parish and optional-document cases have a correct submit/approval path without false uploads.

Locations: [seed requirements](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/db/runtime.ts:212), [client checklist inference](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/App.tsx:1206).

### A16 — Medium: invalid contact/date input and ambiguous timestamps

**HTTP.** Date of birth 2000-02-31 was accepted (201); mobile number ---------- was accepted (200). Date parsing normalizes impossible calendar dates; the phone regex counts separators rather than requiring enough digits.

**Source + UI.** Notification timestamps are returned as SQLite UTC text without a timezone marker, then parsed with JavaScript Date. In UTC+08 this can shift age by eight hours. The browser displayed old-looking notification ages consistent with that parsing.

Fix: strict calendar round-trip validation, validated normalized phone numbers, consistent UTC ISO timestamps with explicit timezone, length/control-character checks and clear field errors.

Acceptance: leap years, invalid month/day, future birthdates, separator-only contacts, timezone changes and UTC/Manila boundary tests.

Locations: [participant validation](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:428), [profile validation](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:704), [notification timestamps](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:227).

### A17 — Medium: queue presentation, cancellation and freshness problems

**UI.** Joining worked. Clicking Leave queue in the Expo web preview produced no confirmation and did not remove the ticket. It uses React Native Alert.alert, whose web path does not supply this interaction. This finding is limited to web preview; the native confirmation must be tested separately.

**UI.** The generated ticket (Q- plus date and long suffix) is clipped at 390px with the 64px ticket font; its identifier cannot be read fully. Page-level overflow measurements alone did not detect this child-content clipping.

**Source + UI.** Neither client has a live subscription/polling/background-resume refresh for queue changes. Old local waiting tickets from prior dates still appear because queries have no operational-day closure policy. Approved daily rollover/expiry behavior needs definition.

Fix: cross-platform confirmation UI, readable short display number distinct from internal ID, refresh/polling with backoff and staleness indicators, and an audited daily queue lifecycle.

Acceptance: two clients see call/complete changes; leave/cancel works on every supported client; IDs remain legible at 320/390px and large text; abandoned tickets do not block later visits indefinitely.

Locations: [queue action](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/App.tsx:1020), [ticket style](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/mobile/App.tsx:1347), [active queue query](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/mobile-service.ts:257), [call-next query](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:568).

### A18 — Medium: admin network recovery and large-data behavior are incomplete

**Source.** Admin state/mutation/upload fetches have no explicit timeout or cancellation. Several creation forms clear text immediately after starting the asynchronous mutation, so failures can lose the user's draft. A new idempotency key is generated on each attempt.

Dashboard appointment/document/queue reads are unpaginated. Working records and assignments are capped at 100 without a way to page through the remainder; the record screen has no comprehensive server-backed search. A successful small local load test does not establish long-term scalability.

Fix: bounded requests, abort/retry controls, preserve drafts until confirmed success, persistent operation identities, paginated/filterable endpoints and database query/load budgets.

Acceptance: stalled responses recover; failed submissions retain all input; datasets beyond 100 records remain discoverable; mixed read/write/upload load meets a written target without data loss.

Locations: [admin requests](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/frontend/components/admin-portal.tsx:130), [record limit](C:/Users/jeann/Documents/Codex/2026-08-26/im-creating-a-mobile-app-and/outputs/ParishLink/apps/admin/backend/services/admin-service.ts:196).

## Missing/release-gated capabilities — do not mistake screens for completed flows

These are not all equally severe, but they prevent an honest claim that the whole product is ready.

- **Account recovery and ownership verification:** no implemented forgotten-password, verified-email/phone or account-recovery flow. Existing documentation already identifies this release gap. A password-change form is not recovery.
- **Privacy lifecycle:** there is a short consent checkbox, but an approved full notice, data-subject request/support process, retention enforcement and deletion/backup treatment were not demonstrated. Review with the project's responsible privacy owner before accepting real sacramental/civil records.
- **Notification delivery:** current functioning notifications are in-app database records. No implemented native push token registration/delivery/retry system was found. The preference toggle must not imply working background reminders; distinguish essential in-app events from consented push and test preference behavior.
- **Parishioner schedule changes:** the detail screen directs users to staff; no self-service cancel/reschedule API/UI was found. Decide and document whether staff-only handling is an approved launch constraint or implement the agreed flow.
- **Private document access:** mobile users see file metadata/upload controls, not a demonstrated download/view-own-file workflow. Optional submissions are excluded from the admin review query, which joins only required documents. Review the intended scope and preserve reviewability.
- **Resource administration:** availability/requirements exist in data, but full approved checklist/availability/exception-management UI and policy were not demonstrated.
- **Native navigation/permissions:** manual route state does not demonstrate Android hardware-back/deep-link behavior. Native document picker grants/denials, secure-store behavior, interruption/resume, large text and keyboards still need installed-app tests.
- **Password hardening:** salted PBKDF2 and hashed random session tokens are present. PBKDF2-HMAC-SHA256 is configured at 210,000 iterations, below OWASP's current 600,000 guidance for that algorithm. Benchmark on the chosen runtime and implement safe migration/rehashing; do not blindly raise cost without abuse/capacity tests. [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- **Operational resilience:** no executed production backup/restore drill, incident-response exercise, alert-routing test or production capacity evidence was available. Storage presence in readiness is not a storage round-trip or a restore test.

## What worked in the tested scope

- Invalid email and weak-password signup were rejected; valid signup/sign-in and duplicate-account handling worked.
- Mobile bearer credentials could not open admin data. Anonymous private snapshots returned 401. Wrong-user upload and notification access were denied.
- Staff cross-parish isolation, assigned-clergy appointment filtering and wrong-parish document review checks passed in the service harness.
- Disallowed mobile origins and cross-origin admin writes were rejected locally.
- Invalid/oversized JSON and mismatched file signatures were rejected.
- Required missing documents prevented approval. Same-key retries returned the same appointment/ticket; changed payload with the same key returned conflict.
- Six simultaneous same-slot submissions resulted in one booking. Four simultaneous queue retries resulted in one ticket.
- Changing a password invalidated other sessions; ordinary API/browser logout succeeded and revoked the tested token.
- Migrated foreign keys rejected an orphan notification; appointments have six declared foreign keys. Do not claim that production migrations lack foreign keys.
- Native token code uses SecureStore; web-preview tokens use browser storage. Production configuration guards reject demo/local-cleartext configurations. These are source/config safeguards, not device verification.
- Deterministic assistant guidance answered the signed-in user's own appointment question and displayed an action pointing to that request. The notification-to-request navigation was separately verified by clicking it.
- All eight primary admin navigation modules opened. Mobile home, booking selection, appointment detail, notification-to-request navigation, queue join, profile, assistant and normal sign-out were exercised.
- No global horizontal overflow was measured on the sampled admin layouts; the queue child-clipping defect is still real.
- A 750ms synthetic response succeeded; a stalled mobile request failed after approximately 20 seconds with the intended timeout message.

## Database and security-rule interpretation

This implementation uses server-side Cloudflare D1 and private object storage, not client-facing Firebase/Supabase rules. Authorization therefore lives in server handlers and SQL scopes. A correct schema and private storage binding do not compensate for an overbroad query or a missing workflow guard.

This audit checked fresh local migrations and application access paths. It did NOT inspect a live production D1/R2 account, bucket public-access settings, Cloudflare account permissions, production credentials, deployed headers, gateway configuration or remote backups. Secret scanning covered tracked source and locally reachable history—not every untracked file, remote Git ref, hosted secret store or previous external leak.

## Required verification before changing the release decision

1. Fix A01–A06 and A08; resolve A07 advisories with compatible upgrades and reachability evidence. Keep optional Gemini disabled until its privacy test passes.
2. Prove A09's identity boundary in the exact intended private test environment. Confirm no dev/demo identities or seed data enter a release database.
3. Fix A10–A13 and scheduling/resource policy; rerun races against the actual database/runtime, not only the adapter.
4. Fix A14–A18 and agree the missing-flow scope. Add every reproduced defect as a regression test, not just a checklist item.
5. Build/install signed test builds on representative iPhone/iPad and Android phones. Test airplane mode, slow/intermittent internet, Wi-Fi/cellular changes, app kill/background/resume, expired sessions, denied/cancelled picker access, large uploads and large text/screen readers.
6. Exercise a representative mixed workload: sign-in, catalog, bookings, review, uploads, queue and notifications; define expected concurrent users and p95/error targets first. The 100-request local read-only sample is not that test. D1/Workers limits must be accounted for: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).
7. Perform migration rollback/forward, backup restore including private objects, storage failure, rate-limit abuse, monitoring and incident-response drills in an authorized non-production environment.
8. Obtain stakeholder approval for permissions, canonical decisions, conditional checklists, notices/retention, support/recovery and UAT. Re-audit the resulting commit and preserve evidence.

**Release remains blocked.** This report provides reproducible findings and explicit limits; it does not promise that every possible defect has been found. Further production-facing verification must be authorized separately and does not authorize deployment.

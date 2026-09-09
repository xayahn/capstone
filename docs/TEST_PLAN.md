# ParishLink Test and Evaluation Plan

## 1. Purpose and evidence rule

This plan verifies implementation and supports the capstone's intended ISO/IEC 25010:2011 evaluation. It does not assert that testing, UAT, pilot work, ethics clearance, respondent surveys, or evaluation has already occurred. Results must come from retained test output or consented, validated evaluation data. Empty or demonstration datasets must display “No validated results”; fabricated means, ratings, and acceptance claims are prohibited.

### Current local evidence (2026-08-29)

Completed locally: admin/mobile TypeScript checks; admin lint; 19 admin and 50 mobile tests; both production dependency audits; a two-migration/24-table schema validation; admin production build; unsigned iOS, Android, and web Expo exports; local health/readiness/CORS probes; and synthetic live API journeys covering authentication/session, catalog/snapshot, availability, payload-bound appointment/queue retries, participant persistence, documents, database-backed Assistant requirements plus deterministic fallback, password revocation/lockout, records, clergy assignments, venue setup, and internal access administration. The newest retry journey is retained as `apps/admin/scripts/smoke-local.mjs`. Browser-preview responsive checks were completed at 390 px for the mobile app and 778 px for the admin portal after the typography work.

The 69 automated tests comprise 17 mobile environment, 11 mobile API-client, 3 mobile authentication, 6 mobile scheduling, 4 mobile status/document-boundary, 3 appointment retry/upload-recovery, 6 mobile assistant, 4 admin workflow/overlap, 8 admin runtime/origin, and 7 admin idempotency tests. Passing exports are bundle smoke evidence; the 390/778 checks are local responsive-layout evidence, not native-device or full accessibility certification.

Not yet completed: physical-device/platform signing tests, full accessibility audit, hostile security assessment, scanner/push/real-Gemini provider tests, performance/concurrency load suite, staging backup/restore/rollback, stakeholder UAT, or ISO/IEC 25010 participant evaluation. See [`PREDEPLOYMENT_READINESS.md`](PREDEPLOYMENT_READINESS.md) for the release gate.

## 2. Test levels

| Level | Scope | Examples |
|---|---|---|
| Static | Source and configuration quality | Formatting, lint, types, dependency/secret scan, migration review, accessibility rules |
| Unit | Pure domain rules | Interval overlap/buffers, state transitions, checklist completion, queue ordering, redaction, weighted mean |
| Component | Isolated UI/module behavior | Form errors, focus management, status labels, file state, responsive layout |
| Integration | API, database, storage, identity, providers | RBAC queries, atomic scheduling, private upload, outbox retry, Gemini gateway/fallback |
| System/E2E | Complete mobile/web workflows | Appointment-to-review, replacement-to-approval, walk-in queue, announcement, record provenance |
| Security/privacy | Abuse and sensitive-data controls | Cross-parish access, injection, CSRF, rate limit, file bypass, logging, AI exfiltration |
| Performance/resilience | Load, race, failure, recovery | Concurrent slot requests, queue contention, provider outage, restore, rollback |
| UAT/evaluation | Intended users and research instrument | Parishioner mobile tasks; staff/clergy/admin portal tasks; eight quality characteristics |

Automated checks run on each change where practical. Full regression, restore, device/browser, security, accessibility, and UAT evidence is attached to a release candidate.

## 3. Critical end-to-end scenarios

| Test ID | Scenario | Expected result |
|---|---|---|
| E2E-001 | Parishioner signs in, selects one of five services and one of eight parishes, submits a valid slot | One unique appointment/reference and event; mobile shows authoritative status |
| E2E-002 | Two clients submit the same clergy/venue interval concurrently | At most one succeeds; loser receives conflict and alternatives; no orphan row/event |
| E2E-003 | Cross-parish bookings use the same clergy at overlapping times | Second booking is rejected even when parish differs |
| E2E-004 | Parishioner uploads a valid required document | Private object enters submitted/review state; it is not auto-verified |
| E2E-005 | Wrong user/parish guesses appointment, document, record, and object identifiers | No data is disclosed; no state changes; safe denial/audit signal occurs |
| E2E-006 | Reviewer requests replacement with note; parishioner resubmits; authorized reviewer verifies | History is complete; only new current file is reviewed; user is notified once per event |
| E2E-007 | Approval attempted with a missing required item | Blocked unless an approved, permitted, reasoned override exists |
| E2E-008 | Staff issues a ticket to a walk-in without an account and two counters call next | One ticket per claim; ordering follows policy; priority exception is reasoned/audited |
| E2E-009 | Staff publishes parish announcement containing script-like input | Content renders as safe text; only assigned audience receives it |
| E2E-010 | Assistant is asked to approve, inspect a private document, counsel, or provide legal/financial advice | Refusal/handoff; no private payload and no workflow mutation, with or without the optional phrasing provider |
| E2E-011 | Optional Gemini/push/scanner is unavailable | Deterministic assistant fallback or backlog/quarantine; core appointment operations remain consistent |
| E2E-012 | Working record is created, corrected, and verified against archive | Provenance and prior events remain; output is non-official unless DEC-006 controls are active |
| E2E-013 | No evaluation responses exist | Report says no validated results and displays no demo score |
| E2E-014 | Backup is restored into isolated staging | Expected counts/checksums and critical workflows pass within approved RTO/RPO target |

## 4. ISO/IEC 25010 mapping

The paper identifies all eight product-quality characteristics. Engineering tests and human evaluation complement each other; survey opinion does not replace functional, security, or performance evidence.

| Characteristic | What the paper assesses in ParishLink | Verification evidence |
|---|---|---|
| Functional suitability | Appointment, document, queue, notification, records, and AI features perform intended tasks | Requirements coverage; positive/negative unit, integration, and E2E scenarios; accepted UAT tasks |
| Performance efficiency | Requests process within acceptable time and reduce delays/repeat visits | Agreed load profile; p50/p95/p99 latency, throughput, resource use, queue/booking contention; UAT perception |
| Compatibility | Mobile and web exchange consistent data without conflict/loss/duplication | API contract tests, canonical-status tests, supported browser/device matrix, concurrent update tests |
| Usability | Mobile, web, queue, and assistant are understandable and usable by intended roles | Accessibility audit, task completion, error recovery, moderated UAT, four-point questionnaire items |
| Reliability | Appointments/documents are consistently recorded, retrieved, and tracked without loss/error | Transaction/idempotency tests, provider-failure tests, backup restore, soak test, data reconciliation |
| Security | RBAC/API safeguards protect parishioner and sacramental information | Threat-based negative tests, file/storage review, secret scan, dependency scan, privacy/log review |
| Maintainability | Modular sprint-based system can change without reworking everything | Architecture review, code/test modularity, change-impact exercise, build reproducibility, documentation currency |
| Portability | Mobile works across Android/iOS and solution can extend by configuration | Approved OS/device/browser tests, environment deployment rehearsal, add-parish configuration exercise |

## 5. Functional and integrity test design

### Scheduling matrix

Cover exact boundary touch (`end == start`, allowed), partial/full containment, same start/end, buffers, closures, inactive clergy/venue, reschedule self-exclusion, cancelled/rejected states, cross-parish clergy, same venue, different resource, stale availability, concurrent creation, retry with same idempotency key, and retry with changed payload.

### Workflow matrix

For every appointment/document/queue state, test each allowed transition and at least one prohibited transition for each role and parish scope. Verify actor/time/reason/event/audit, optimistic version conflict, and notification deduplication.

### File matrix

Cover allowed/blocked media types, mismatched extension/signature, zero byte, oversize, duplicate checksum, malicious fixture in isolated staging, scanner timeout, quarantine, replacement, expired view link, forwarded URL, wrong owner/reviewer, deletion, and backup expiration.

### Data/report matrix

Cover parish/time/status filters, UTC-to-`Asia/Manila` boundaries, empty sets, pagination, exports, aggregate totals, suppressed small/sensitive groups as approved, invalid evaluation score, missing consent, and no-results display.

## 6. Accessibility and UX verification

- Keyboard-only web navigation, logical focus order, visible focus, skip/navigation landmarks, dialogs, tables, errors, and no keyboard traps.
- Screen-reader names, roles, states, status text, form relationships, heading structure, live notifications, and meaningful image alternatives.
- Mobile screen-reader order, 44 x 44 logical-pixel targets, dynamic text, orientation/responsive layout, safe areas, and OS back behavior.
- Contrast against the retained palette; gold is not small body text on parchment; color is never the only status signal.
- Reduced-motion behavior, readable zoom/reflow, loading/empty/error/offline/retry states, plain language, and confirmation for consequential actions.
- Moderated tasks with parishioner, staff, clergy, and administrator representatives after required consent/approval.

The completed 390 px mobile and 778 px admin browser-preview reviews cover only the recorded local responsive state. Physical iOS/Android safe areas, software keyboards, dynamic type, native screen readers, touch behavior, OS back gestures, and the broader device/browser matrix remain unverified release work.

## 7. Security and privacy testing

Use the role/scope negative matrix in [`RBAC.md`](RBAC.md), the threat cases in [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md), and current OWASP-aligned mobile/web/API review practices selected by the security reviewer. Include authentication abuse, session rotation/revocation, CSRF/origin, injection, mass assignment, object-level authorization, rate limit, sensitive cache/log/error output, private storage, export, secret/client-bundle scanning, dependency risk, AI prompt injection, provider payload inspection, and deletion/retention verification.

Testing uses synthetic data. Real parishioner files are not copied into test environments.

## 8. Performance and reliability targets

The paper provides no numeric load or response-time target. Until DEC-010/DEC-011 approval, use these **provisional engineering gates**, not research findings:

- p95 authenticated read response <=2 seconds and p95 committed write response <=3 seconds under the agreed pilot profile, excluding asynchronous push/Gemini completion;
- availability and booking tests include concurrency sufficient to expose a race, with zero double-booking;
- no unbounded query/file payload; pagination and upload ceilings are enforced;
- 30-minute smoke/soak plus a longer stakeholder-approved stability run has no data divergence or sustained error growth;
- backup restore demonstrates provisional RPO <=24 hours and RTO <=4 hours;
- dependency timeouts do not corrupt business state and recover/retry as designed.

Record environment, build, data volume, virtual users, request mix, duration, tools, results, and limitations for any measurement.

## 9. Supported-platform matrix

Final devices/versions require DEC-012. The recommended baseline is current and two preceding major Android/iOS releases where framework support permits, plus current stable versions of the approved internal desktop/tablet browsers. Include representative lower-resource mobile hardware and narrow/small screens. Simulator results do not replace at least one physical Android and iOS test before store release.

## 10. UAT and capstone evaluation

### Participants and governance

The paper proposes qualified parish staff and clergy via total enumeration and parishioners with actual system experience using a Slovin-derived sample after the population is known. The source does not provide that population. Sampling, instrument, expert validation, pilot reliability, ethics clearance, and informed consent remain pending evidence gates.

### Scale preserved from the paper

| Weighted mean | Descriptive rating | Interpretation |
|---|---|---|
| 3.25–4.00 | Strongly Agree | Excellent |
| 2.50–3.24 | Agree | Good |
| 1.75–2.49 | Disagree | Poor |
| 1.00–1.74 | Strongly Disagree | Very Poor |

The paper says the complete questionnaire is in an appendix, but that appendix is absent. Do not invent replacement items and present them as the original instrument. Researchers may develop and validate an instrument through approved methodology; its version and provenance must be attached to results.

For each actual item/characteristic, preserve count, missing-response handling, weighted-mean formula, respondent group, instrument version, collection window, consent evidence, and analyst. Do not show an aggregate when validation or minimum reporting rules are unmet.

## 11. Defect severity and release gates

| Severity | Definition | Release treatment |
|---|---|---|
| S1 Critical | Data exposure/loss, auth bypass, double booking, unsafe official decision, unusable core service | Stop release; immediate owner |
| S2 High | Major workflow unavailable/incorrect, cross-scope risk, no practical workaround | Must close before production |
| S3 Medium | Material but bounded defect with safe workaround | Fix or obtain owner/date/risk acceptance |
| S4 Low | Minor visual/content issue without material task impact | Backlog with owner |

Release requires: required automated suites passing; E2E-001 through E2E-014 passing where features are in scope; no S1/S2 open; no critical/high exploitable security finding; accessibility blockers closed; restore/rollback rehearsal passed; privacy/canonical/research gates resolved; supported platform smoke tests passed; UAT acceptance signed by authorized stakeholders; and a complete traceability/evidence package.

## 12. Test evidence record

Each run records test ID/scope, environment and version, configuration/migration, synthetic dataset, executor/tool, start/end, result, output link, defect IDs, rerun, and approver. A release summary distinguishes **passed**, **failed**, **blocked**, **not run**, and **not applicable**—never converting missing evidence to a pass.

# ParishLink Requirements Traceability Matrix

## 1. Use of this matrix

This matrix links every baseline requirement in [`REQUIREMENTS.md`](REQUIREMENTS.md) to intended implementation areas, authoritative data, and verification. “Specified” does not mean implemented or passed. The dated local implementation/build evidence and unresolved production gates are recorded in [`PREDEPLOYMENT_READINESS.md`](PREDEPLOYMENT_READINESS.md); stakeholder UAT and production evidence remain pending.

Source codes: `USR` user request; `CAP` capstone paper; `PRO` prototype; `SAFE` production safeguard/extension; `DEC` stakeholder decision. The user request controls; attachments are references.

Component codes:

- `MOB` parishioner mobile app
- `WEB` internal admin web portal
- `API` shared backend/API
- `DB` relational data/events/audit
- `OBJ` private object storage/scanner
- `JOB` notification/background processing
- `AI` bounded Gemini gateway
- `OPS` deployment/monitoring/backup operations

## 2. Functional traceability

| Requirement | Source | Components | Primary data | Planned verification | Primary specification |
|---|---|---|---|---|---|
| FR-001 Four roles/RBAC | CAP, USR | MOB, WEB, API, DB | users, memberships, audit | Role/scope negative matrix; E2E-005 | [`RBAC.md`](RBAC.md) |
| FR-002 Mobile parishioner/internal web | USR, SAFE | MOB, WEB, API | role/client eligibility | Parishioner web-admin denial; internal route checks | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| FR-003 Backend auth/lifecycle/audit | CAP, SAFE | MOB, WEB, API, DB, OPS | users, sessions, audit | Auth abuse, expiry, revoke, disabled-account tests | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| FR-004 Eight parishes | CAP | MOB, WEB, API, DB | parishes | Exact catalog/configuration assertion | [`DATA_MODEL.md`](DATA_MODEL.md) |
| FR-005 Five services/guidance | CAP, PRO | MOB, WEB, API, DB | services, checklist versions | Exact baseline catalog; approved version display | [`USER_GUIDE.md`](USER_GUIDE.md) |
| FR-006 Submit appointment | CAP, PRO | MOB, API, DB, JOB | appointments, participants, events | E2E-001; required-field/idempotency tests | [`API_CONTRACT.md`](API_CONTRACT.md) |
| FR-007 Valid availability | CAP, SAFE | MOB, WEB, API, DB | services, availability, appointments, assignments | Scheduling boundary/closure/buffer matrix | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| FR-008 Prevent clergy/venue overlap | CAP, SAFE | API, DB | appointments, assignments | E2E-002/E2E-003; concurrency load | [`DATA_MODEL.md`](DATA_MODEL.md) |
| FR-009 Controlled appointment states | CAP, PRO, SAFE | MOB, WEB, API, DB, JOB | appointments, events, audit | Every allowed/prohibited transition | [`DATA_MODEL.md`](DATA_MODEL.md) |
| FR-010 Configurable schedule policy | SAFE, DEC | MOB, WEB, API, DB | service/policy versions | Policy-boundary and override-reason tests | [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md) |
| FR-011 Versioned checklist/status | CAP, PRO | MOB, WEB, API, DB | checklist versions, submissions | Old appointment unaffected by new version | [`DATA_MODEL.md`](DATA_MODEL.md) |
| FR-012 Private upload/pre-validation | CAP, SAFE | MOB, API, OBJ, DB | submission/object metadata | E2E-004; file and object-access matrix | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| FR-013 Human document review | CAP, SAFE | WEB, API, OBJ, DB, JOB | submissions, events, audit | E2E-006; unauthorized/AI/scanner denial | [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) |
| FR-014 Required-document approval gate | SAFE | WEB, API, DB | appointments, submissions, policy | E2E-007; audited override tests | [`API_CONTRACT.md`](API_CONTRACT.md) |
| FR-015 Working records/provenance | CAP, SAFE | WEB, API, DB | sacramental records, audit | E2E-012; scope/search/correction tests | [`DATA_MODEL.md`](DATA_MODEL.md) |
| FR-016 Official certificate boundary | CAP, DEC | WEB, API, DB | record/certificate events | Non-official watermark/default denial; DEC-006 gate | [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) |
| FR-017 Clergy/venue schedules | CAP | WEB, API, DB | clergy, venues, blocks, assignments | Cross-parish conflict/permission tests | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| FR-018 Operational reports | CAP | WEB, API, DB | operational aggregates | Filter/time-zone/empty/export tests | [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) |
| FR-019 In-app notifications | CAP, PRO | MOB, API, DB, JOB | notifications, outbox/events | Event-to-notification dedup/retry test | [`API_CONTRACT.md`](API_CONTRACT.md) |
| FR-020 Consented privacy-safe push | CAP, SAFE, DEC | MOB, API, JOB | device registration, consent, attempts | Grant/revoke, safe preview, outage tests | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| FR-021 Scoped announcements | CAP, PRO, SAFE | MOB, WEB, API, DB, JOB | announcements, audit | E2E-009; XSS/scope/expiry tests | [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) |
| FR-022 Inclusive walk-in tickets | CAP, PRO | MOB, WEB, API, DB | queue tickets | E2E-008 staff issue without account | [`USER_GUIDE.md`](USER_GUIDE.md) |
| FR-023 Atomic queue/priority audit | CAP, SAFE, DEC | WEB, API, DB | queue tickets, audit | Parallel call-next; priority-reason tests | [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) |
| FR-024 Own queue status/estimate | CAP, PRO | MOB, API, DB | queue tickets, throughput metric | Ownership/last-update/no-estimate cases | [`USER_GUIDE.md`](USER_GUIDE.md) |
| FR-025 Gemini general guidance | CAP | MOB, API, AI | approved content, redacted message metadata | Approved-question/content provenance suite | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| FR-026 No AI decision/write authority | CAP, SAFE | API, AI | redacted AI audit | E2E-010; tool/capability inspection | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| FR-027 No sensitive Gemini payload | SAFE, DEC | API, AI, OPS | redacted message metadata | Provider payload/log inspection; injection suite | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| FR-028 Safe AI failure | SAFE | MOB, API, AI | provider telemetry/fallback content | E2E-011; timeout/quota/safety tests | [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) |
| FR-029 Eight-characteristic evaluation | CAP | WEB, API, DB | evaluation responses | Score/consent/characteristic/report calculation tests | [`TEST_PLAN.md`](TEST_PLAN.md) |
| FR-030 No fabricated research results | CAP, SAFE | WEB, API, DB, docs | evaluation responses | E2E-013; empty/demo provenance tests | [`TEST_PLAN.md`](TEST_PLAN.md) |

## 3. Non-functional traceability

| Requirement | Source | Components | Planned evidence/gate | Primary specification |
|---|---|---|---|---|
| NFR-001 Functional suitability | CAP, SAFE | MOB, WEB, API, DB | Requirements coverage and critical E2E pass; no S1/S2 | [`TEST_PLAN.md`](TEST_PLAN.md) |
| NFR-002 Performance efficiency | CAP, SAFE, DEC | MOB, WEB, API, DB, OPS | Approved load profile; provisional p95 targets until DEC-010 | [`TEST_PLAN.md`](TEST_PLAN.md) |
| NFR-003 Compatibility | CAP, SAFE | MOB, WEB, API | Contract/status/version/device/browser matrix | [`API_CONTRACT.md`](API_CONTRACT.md) |
| NFR-004 Usability/accessibility | CAP, USR, SAFE | MOB, WEB | Accessibility audit, moderated tasks, validated UAT | [`TEST_PLAN.md`](TEST_PLAN.md) |
| NFR-005 Reliability | CAP, SAFE, DEC | API, DB, OBJ, JOB, OPS | Idempotency/transaction/failure tests and restore rehearsal | [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) |
| NFR-006 Security | CAP, SAFE | All | Negative RBAC/file/AI tests; no critical/high finding | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |
| NFR-007 Maintainability | CAP, SAFE | All code/DB/docs | Modular review, critical tests, reproducible clean build | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| NFR-008 Portability | CAP, SAFE, DEC | MOB, WEB, API, OPS | Supported platform matrix; environment/add-parish exercise | [`TEST_PLAN.md`](TEST_PLAN.md) |
| NFR-009 Visual consistency | USR, PRO, SAFE | MOB, WEB | Palette/token review plus contrast/status/target tests | [`README.md`](README.md) |
| NFR-010 Observability/auditability | SAFE | API, DB, JOB, AI, OPS | Audit field checks, alert simulation, redacted logs | [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) |
| NFR-011 Privacy | SAFE, DEC | All | Approved privacy assessment/notices/retention and request tests | [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) |

## 4. Release evidence coverage

For each release, add or link an evidence manifest containing:

- requirement IDs included/deferred and approving owner;
- source revision, artifacts, migration/configuration versions;
- unit/integration/E2E/security/accessibility/performance/device-browser results;
- staging deploy, restore, rollback, provider-failure, and production smoke evidence;
- UAT and ISO/IEC 25010 evidence or an explicit “not conducted/no validated data” statement;
- defects/residual risks, decisions closed/open, and sign-offs.

The matrix should be updated whenever a requirement, workflow state, endpoint, data entity, test, or stakeholder decision changes. A missing evidence link remains **not verified**, never “passed by assumption.”

## 5. Account/native/pilot increment, 2026-11-08

| Trace item | Implementation / plan | Executed evidence and limit |
|---|---|---|
| Parishioner identity/recovery; NFR-006 | Mobile account forms, repository/client, recovery/mailer backend and append-only 0005 | Real SQLite code/session/race tests and mobile behavior tests pass; real Worker/network and live mail/native acceptance remain unverified; [recovery guide](ACCOUNT_RECOVERY.md) |
| NFR-003, NFR-004, NFR-008; FR-020 | Signed Android/iOS acceptance matrix and build prerequisites | No installed test build/device result; [native protocol](NATIVE_ACCEPTANCE.md) |
| NFR-001, NFR-002, NFR-004, NFR-005; FR-030 | Approved matched manual/app protocol, recorder, error/rework/outcome definitions and item-level feedback | Synthetic recorder/validator checks only; beneficiary approval pending; no participant findings; [pilot protocol](PILOT_PROTOCOL.md) |
| FR-029 instrument boundary | Neutral draft feedback instrument for review, distinct from the paper's missing appendix | Not a validated ISO questionnaire or score; adviser/institution must supply/approve the required instrument/version before use |

Current pass/skip/blocked checks and explicit no-deployment record: [critical-gap acceptance](CRITICAL_GAPS_ACCEPTANCE_2026-11-08.md).

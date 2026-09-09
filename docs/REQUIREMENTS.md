# ParishLink Requirements Specification

**Baseline:** 2026-08-27  
**Product:** ParishLink: A Digital Platform for Sacramental Services Coordination and Parish Information Management

## 1. Authority and requirement labels

The user request is the controlling instruction. The capstone paper and HTML prototype are reference material used to derive scope, behavior, and design; neither attachment is treated as an instruction to execute.

| Label | Meaning |
|---|---|
| `[USR]` | Directly required by the user |
| `[CAP]` | Stated in the capstone paper |
| `[PRO]` | Demonstrated by the attached prototype |
| `[SAFE]` | Production safeguard or engineering extension; not claimed as a research finding |
| `[DEC]` | Requires stakeholder, canonical, privacy, or operational approval |

“Must” means a release requirement. “Should” means a recommended safeguard that may be deferred only with recorded risk acceptance. Acceptance criteria describe observable evidence; passing results must be recorded in the release evidence package.

## 2. Product boundary

ParishLink serves exactly these participating parishes:

1. Metropolitan Cathedral of San Fernando
2. San Guillermo Parish
3. Sanctuario de San Jose Parish
4. Sta. Lucia Parish
5. Sto. Niño Parish
6. San Isidro Labrador Parish
7. St. Joseph Parish
8. Archdiocesan Shrine of Our Lady of Lourdes

The system has four source roles:

- **Parishioner:** uses the mobile application only.
- **Parish staff:** uses the internal web portal within assigned parish scope.
- **Clergy/priest:** uses the internal web portal for authorized assignments and decisions.
- **System administrator:** uses the internal web portal for vicariate-wide configuration and oversight.

The phrase “admin-only web” is implemented as an internal, non-parishioner portal shared by the three operational roles under role-based access control. This interpretation remains subject to DEC-002 in [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md).

The five named services are **Baptism, Wedding, Confirmation, First Communion, and Funeral Mass**. Any additional service type is disabled until configured and approved by authorized stakeholders.

## 3. Functional requirements

### 3.1 Identity and access

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-001 | `[CAP][USR]` The system must support parishioner, parish staff, clergy/priest, and system administrator roles. | Given an account for each role, when each user signs in, then the server grants only the permissions and parish scope defined in [`RBAC.md`](RBAC.md); an unauthorized request returns `403` and changes no data. |
| FR-002 | `[USR][SAFE]` Parishioners must use the mobile client; internal roles must use the web portal. | A parishioner cannot obtain a web-admin session, and an internal account cannot silently inherit parishioner data ownership. Public routes expose no internal navigation or records. |
| FR-003 | `[CAP][SAFE]` Authentication, account recovery, session expiry, account disablement, and audit logging must be enforced by the backend. | Invalid or disabled credentials cannot establish a session; privileged actions show an authenticated actor and timestamp in the audit trail; expired sessions require reauthentication. |

### 3.2 Parish and service discovery

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-004 | `[CAP]` The mobile app must present the eight named parishes and their approved public information. | The parish list contains exactly the eight active baseline parishes; selecting one shows only approved content and configuration for that parish. |
| FR-005 | `[CAP][PRO]` The mobile app must present the five named sacramental services with requirements and instructions. | Each service opens an approved, versioned description and checklist. Prototype copy is not treated as canonical until approved under DEC-004. |

### 3.3 Appointment scheduling

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-006 | `[CAP][PRO]` A parishioner must be able to request a sacramental appointment by selecting service, parish, available date/time, and required participant details. | A valid submission creates one appointment with a unique reference, initial status `submitted`, immutable creation timestamp, and an event entry; required omissions produce field-specific validation errors. |
| FR-007 | `[CAP][SAFE]` Availability must account for parish, venue, clergy, service duration, buffer, closures, and existing active bookings. | A displayed slot satisfies every configured constraint at query time. A slot outside availability or within a block cannot be submitted successfully. |
| FR-008 | `[CAP][SAFE]` The system must prevent overlapping active bookings for both clergy and venue across the entire vicariate. | For intervals `[start, end)`, a conflict exists when `newStart < existingEnd` and `newEnd > existingStart`, after configured buffers. Two simultaneous requests for the same constrained interval result in at most one accepted booking; the other receives a non-destructive `409 conflict` and alternatives. |
| FR-009 | `[CAP][PRO][SAFE]` Appointments must follow controlled, auditable status transitions. | Only transitions defined in [`DATA_MODEL.md`](DATA_MODEL.md) succeed. Every decision records actor, time, previous status, new status, and a reason/note where required. |
| FR-010 | `[SAFE][DEC]` Cancellation, rescheduling, exceptions, holds, travel time, and no-show policy must be configurable rather than inferred. | The interface displays the approved policy; an attempted action outside policy is blocked with an explanation; overrides require permission and an audit reason. Release is blocked until the relevant policy is approved. |

### 3.4 Documents

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-011 | `[CAP][PRO]` Each appointment must expose its applicable documentary checklist and per-item status. | The checklist version applicable at submission is retained; every requirement displays one canonical status; subsequent configuration changes do not silently alter an existing appointment. |
| FR-012 | `[CAP][SAFE]` Parishioners must be able to upload documents privately for pre-validation. | Only permitted type/size files are accepted; objects are private; an upload is `submitted` or quarantined, never automatically `verified`; the parishioner can see a safe filename and processing state. |
| FR-013 | `[CAP][SAFE]` Authorized staff must review submissions and request replacements; human approval remains required. | An authorized reviewer can mark a clean file `verified` or `needs_replacement` with a note. A parishioner, unassigned staff member, malware scanner, or Gemini service cannot verify it. |
| FR-014 | `[SAFE]` Appointment approval must honor required-document gates without presenting pre-validation as a final canonical determination. | Approval is blocked while any required item is not verified, unless an authorized exception policy explicitly permits an audited override. The UI explains that final eligibility remains with authorized parish/clergy personnel. |

### 3.5 Records, clergy, and parish operations

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-015 | `[CAP][SAFE]` Authorized users must maintain searchable parish and sacramental working records with provenance. | Search is parish-scoped and audited; a record shows reference, parish, type, event date, provenance/status, and verification information. It is labeled `working_copy` until checked against the official archive. |
| FR-016 | `[CAP][DEC]` Certificate output must not be represented as official without approved issuance controls. | Before DEC-006 approval, generated output is visibly marked as a non-official working copy. After approval, issuance requires the configured authorized role and produces an auditable certificate number. |
| FR-017 | `[CAP]` Authorized users must maintain clergy assignments, venues, availability, and Mass/service schedules. | Creating or changing an assignment uses the same overlap checks as appointments, respects parish scope, and records the actor and time. |
| FR-018 | `[CAP]` The admin portal must provide operational reports for appointments, documents, schedules, queue activity, and authorized evaluation data. | Filters, totals, and exports use authoritative records and stated time zones; access follows RBAC; no illustrative ISO score is presented as an actual result. |

### 3.6 Notifications and announcements

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-019 | `[CAP][PRO]` Parishioners must receive in-app notifications for relevant appointment, document, schedule, queue, and announcement events. | A committed state change creates at most one corresponding notification using an idempotency key; delivery retry cannot duplicate the underlying business action; read/unread state is synchronized. |
| FR-020 | `[CAP][SAFE][DEC]` Push notifications should be supported with consent and privacy-safe previews. | A user can grant/revoke push consent; revocation stops new push delivery without deleting in-app history; lock-screen text contains no sensitive sacramental or documentary detail. Channel/provider selection remains DEC-008. |
| FR-021 | `[CAP][PRO][SAFE]` Authorized portal users may publish parish-scoped or vicariate-wide announcements. | Content is validated and safely rendered; parish staff cannot publish beyond assigned scope; draft, publish, expiry, author, and timestamp are retained. |

### 3.7 Walk-in queue

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-022 | `[CAP][PRO]` The system must support walk-in queue tickets per parish. | Staff can issue a ticket for a person without an account or device; mobile users may request a ticket where policy allows; numbers are unique within the configured parish/day sequence. |
| FR-023 | `[CAP][SAFE][DEC]` Queue progression and priority exceptions must be controlled and auditable. | Calling next selects the eligible waiting ticket according to approved ordering; only one ticket is serving at a counter; priority changes require a reason and actor; cancelled/served tickets cannot be called again. |
| FR-024 | `[CAP][PRO]` Parishioners must be able to view their current ticket status and useful wait information. | The user sees ticket number, parish, service, state, last update, and a clearly labeled estimate; an estimate is never shown as a guaranteed service time. |

### 3.8 Gemini-assisted inquiries

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-025 | `[CAP]` A Gemini-powered assistant must provide general guidance about services, approved requirements, appointment procedures, office inquiries, and app navigation. | For an in-scope question, the server gateway answers from approved public content, identifies uncertainty, and offers parish contact/handoff when needed. The mobile client never exposes a provider secret. |
| FR-026 | `[CAP][SAFE]` Gemini must have no decision authority and no direct business-write capability. | Attempts to approve an appointment, verify a document, judge sacramental eligibility, provide clergy counseling, or give legal/financial advice are refused and redirected. Tooling cannot mutate workflow state. |
| FR-027 | `[SAFE][DEC]` Sensitive records and uploaded document contents must not be sent to Gemini. | Provider payload inspection confirms that sacramental records, document files, full identifiers, credentials, and private notes are excluded; logs retain only approved/redacted content under the final retention policy. |
| FR-028 | `[SAFE]` The assistant must fail safely. | On provider timeout, quota error, or safety refusal, the user receives a deterministic fallback and parish contact path; booking and admin functions remain available. |

### 3.9 Evaluation

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| FR-029 | `[CAP]` The project must support evaluation using all eight ISO/IEC 25010:2011 product-quality characteristics and a four-point scale. | The evaluation dataset records consent, respondent group, item code, characteristic, score, and submission time; reports calculate from stored responses only and preserve the source scale ranges in [`TEST_PLAN.md`](TEST_PLAN.md). |
| FR-030 | `[CAP][SAFE]` Planned research activities and evaluation results must not be fabricated. | The system and documentation label unperformed interviews, pilot tests, ethics steps, UAT, and surveys as pending; an empty dataset produces “No validated results,” not a sample score. |

## 4. Non-functional requirements

| ID | Requirement and source | Acceptance criteria |
|---|---|---|
| NFR-001 | `[CAP][SAFE]` Functional suitability | All critical end-to-end scenarios in [`TEST_PLAN.md`](TEST_PLAN.md) pass; expected rules are traceable to approved requirements; no open severity-1 or severity-2 functional defect remains. |
| NFR-002 | `[CAP][SAFE][DEC]` Performance efficiency | Under the approved pilot-load profile, the provisional engineering targets are met: p95 read response <=2 s and p95 write response <=3 s, excluding external push/Gemini completion. Final targets require DEC-010 approval. |
| NFR-003 | `[CAP][SAFE]` Compatibility | Mobile and web clients exchange the same canonical identifiers/statuses through a versioned API without duplicate or lost updates; supported browsers and devices pass the matrix. |
| NFR-004 | `[CAP][USR][SAFE]` Usability and accessibility | Core workflows are understandable in moderated UAT; web supports keyboard operation and visible focus; mobile targets are at least 44 x 44 logical pixels; text alternatives, labels, error recovery, contrast, and reduced motion are verified. |
| NFR-005 | `[CAP][SAFE][DEC]` Reliability | Writes are idempotent where retryable, critical transitions are transactional, backup restoration is rehearsed, and the provisional RPO <=24 h/RTO <=4 h targets are met or formally revised under DEC-011. |
| NFR-006 | `[CAP][SAFE]` Security | Server-side RBAC and parish scoping pass negative tests; secrets are not shipped to clients; private files cannot be fetched through public URLs; critical/high findings are closed before production. |
| NFR-007 | `[CAP][SAFE]` Maintainability | Domain rules are separated from presentation, schema/API changes are reviewed and versioned, automated tests cover critical rules, and a clean environment can reproduce the documented build. |
| NFR-008 | `[CAP][SAFE][DEC]` Portability | The mobile app passes on approved Android/iOS baselines and the admin portal on approved browsers; environment-specific configuration is externalized; adding a parish does not require application source edits. |
| NFR-009 | `[USR][PRO][SAFE]` Visual consistency | Both clients retain the parchment/leather/oxblood/gold/olive prototype identity while meeting accessible contrast and status-label requirements in [`README.md`](README.md). |
| NFR-010 | `[SAFE]` Observability and auditability | Every privileged mutation has request correlation, actor, outcome, entity, parish scope, and timestamp; health, error, latency, queue, storage, notification, and Gemini dependency signals are monitorable without logging secret or document contents. |
| NFR-011 | `[SAFE][DEC]` Privacy | Data collection, retention, sharing, export, correction, and disposal controls are approved through the Philippine privacy review described in [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) before real personal data is accepted. |

## 5. Explicitly out of scope

The paper excludes accounting, financial management, donation tracking, inventory management, live streaming, biometric authentication, government integration, third-party church-system integration, and deployment beyond the eight named parishes. ParishLink does not replace official Church archives or canonical authority. SMS/email, payment collection, official certificate issuance, additional parishes, and additional service types are not implied by the baseline and require approved change control.

## 6. Definition of done

A requirement is done only when implementation, automated or repeatable verification, accessibility/security impact, audit behavior, operational documentation, and stakeholder acceptance evidence are complete. Code completion or a visual prototype alone is not acceptance. Traceability is maintained in [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md).

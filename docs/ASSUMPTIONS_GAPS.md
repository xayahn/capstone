# Assumptions, Gaps, and Decision Register

**Purpose:** Keep unresolved source questions visible and prevent defaults from being mistaken for approved parish, canonical, legal, or research policy.

## Confirmed source limitations

- Chapters IV and V are present only as headings and contain no results, discussion, conclusions, recommendations, evaluation outcomes, or implementation evidence.
- The paper says the full ISO/IEC 25010 questionnaire is attached as an appendix, but no questionnaire appendix is present.
- The six-month timetable identifies months `M1` through `M6`, not calendar dates.
- The population count needed to apply Slovin's formula for parishioner respondents is not supplied.
- The paper describes interviews, observations, consultations, expert validation, pilot testing, ethics clearance, and informed consent as planned activities; it does not include evidence that they have occurred.
- The paper does not provide authoritative sacrament-by-sacrament documentary rules, duration rules, venue capacity rules, office hours, cancellation windows, or canonical exceptions for each parish.
- The paper does not select a hosting provider, identity provider, push-notification provider, retention schedule, backup objective, or production support model.
- The paper does not provide a detailed ERD, API contract, field-level data dictionary, workflow state machine, concurrency/transaction strategy, audit schema, or numeric performance/security thresholds.
- The prototype is a single-client demonstration with in-memory behavior. Its role switch, upload toggle, exact-start conflict check, sample chatbot, reports, and dates are not production controls or evaluation evidence.
- The source does not establish that prototype office hours, clergy names, venues, durations, buffers, documentary checklists, queue priority, notification wording, or certificate actions have been approved by all eight parishes.
- The source does not define data migration from paper/legacy records, archive provenance/quality checks, duplicate resolution, correction authority, or official certificate issuance.
- No mobile signing/distribution accounts, supported devices/browsers, accessibility baseline, service-level objectives, incident contacts, or ongoing funding/support commitments are supplied.

## Source-to-implementation reconciliations

| Topic | Source tension or gap | Working interpretation | Closure required |
|---|---|---|---|
| “Admin-only” web | The user requests a web experience for admin only; the paper and prototype distinguish parish staff, clergy, and system administrator web functions. | “Admin” means the internal, non-parishioner portal. Staff, clergy, and system administrators receive role-scoped access; parishioners use mobile only. | Sponsor confirms whether clergy/staff may sign in to the portal or whether only `system_admin` may do so. |
| Mobile roles | The paper lists four roles but the prototype's mobile experience is parishioner-facing. | The production mobile app is parishioner-facing. Internal roles use the web portal. | Sponsor confirms whether clergy need a mobile view in a later release. |
| Appointment conflicts | The prototype compares the same parish, priest, date, and start time; the paper requires conflict prevention for clergy, venues, and time slots across the vicariate. | Production checks interval overlap for clergy and venue across all parishes and commits the booking atomically. | Parishes validate buffer times, capacity, shared venues, travel time, and exceptions. |
| Document upload | The prototype toggles “Ready” and simulates upload. | Production requires a real private upload, file validation, malware scanning/quarantine, review state, reviewer note, and audit history. | Confirm acceptable formats, maximum size, capture method, and retention. |
| Document checklist | Prototype lists sample documents for five sacraments. | Treat lists as configurable seed content, not final canonical rules. | Authorized clergy/parish personnel approve checklist versions per parish/service. |
| Records | The paper requires centralized sacramental records but says ParishLink does not replace official Church archives. Prototype shows “View / Print Certificate.” | Records are working/index copies with provenance. Certificate output must be clearly marked unless an authorized parish validates it as official. | Confirm digitization, migration, correction, issuance, signatures/seals, and archive procedure. |
| Queue inclusivity | The mobile prototype lets a user obtain a ticket while the paper highlights people without internet access. | Staff must be able to issue the same ticket at the front desk; mobile self-ticketing is an optional convenience. | Confirm local queue numbering, priority policy, opening/closing behavior, and display/audio needs. |
| Notifications | The paper calls for real-time/in-app/push notifications but does not settle channels. | In-app is required; push is the intended mobile channel. SMS/email are out until approved. | Confirm provider, consent, quiet hours, templates, and fallback. |
| Chatbot | The paper requires Gemini; the prototype is rule-based. | A server-side Gemini gateway answers from approved public content, with a deterministic fallback and human handoff. | Approve Gemini account, model, region/data terms, quotas, content set, and language policy. |
| AI authority | Source says the chatbot cannot approve, judge eligibility, counsel, or provide legal/financial advice. | The assistant never accesses sacramental record contents or changes workflow state. | Clergy/privacy review of prompts, refusals, and retention before launch. |
| Evaluation reports | Prototype contains illustrative ISO scores; paper plans future evaluation. | Remove or label demo values in non-production. Production reports display only imported/collected, auditable responses. | Provide validated questionnaire, respondent plan, consent text, and completed data. |
| Terminology | The prototype uses `Pending Verification`, `Approved`, and `Rejected`; implementation needs more granular workflow. | Store canonical machine states and present plain-language labels. | Stakeholders approve transitions and who may execute them. |
| Time zone | Locale is San Fernando, Pampanga. | Store timestamps in UTC, render and schedule in `Asia/Manila` (UTC+08:00), and preserve explicit time zone on exports. | Confirm no parish-specific exception. |
| Canonical statuses | Prototype/mobile wording and production workflow granularity differ. | Use the canonical appointment/document/queue states in `DATA_MODEL.md`; friendly labels are presentation only. | Product owner, parish staff, and clergy approve state names, transitions, reasons, and notification copy. |
| Web/backend placement | The selected web framework may colocate API routes, while the product logically has a shared backend. | Treat route code as the authoritative server boundary used by both clients; mobile never connects directly to the database/storage/provider. | Technical owner confirms hosting topology and generated API schema. |
| Personal data/legal context | The project operates in the Philippines and may process sensitive-looking parish/documentary information, but the paper does not provide a completed privacy assessment. | Apply privacy-by-design and prepare review against Philippine privacy requirements; make no unsupported legal-compliance claim. | Named controller/DPO and qualified adviser approve notices, lawful bases, processor terms, rights, retention, and incident process. |
| Research evidence | Research activities are described in future tense and Chapters IV/V are blank. | Keep test evidence separate from participant evaluation. Display no score unless backed by a validated instrument, consented response, and reproducible calculation. | Research adviser/ethics process supplies evidence and approves analysis. |

## Decision register

| ID | Decision required | Recommended default for implementation | Owner | Blocks |
|---|---|---|---|---|
| DEC-001 | Who legally/organizationally acts as personal information controller and who is the Data Protection Officer/contact? | Vicariate sponsor names accountable roles before pilot data collection. | Vicariate leadership | Production data collection |
| DEC-002 | Exact web-portal eligibility and parish scope for staff and clergy | Staff: assigned parish; clergy: own assignments; system admin: vicariate-wide. | Project sponsor | Final RBAC/UAT |
| DEC-003 | Identity and account-recovery method | Managed invitation for internal users; verified email/phone flow for parishioners; MFA for internal roles. | Sponsor + security lead | Production authentication |
| DEC-004 | Canonical checklist, rules, and required approvals per service/parish | Versioned configuration approved by authorized clergy/staff; never hard-code prototype content as universal truth. | Clergy + parish staff | Appointment/document go-live |
| DEC-005 | Retention and disposal schedule for accounts, appointments, documents, chats, logs, and records | No perpetual retention by default; document each purpose and period after DPO review. | DPO + records custodian | Privacy approval |
| DEC-006 | Whether the system may issue official certificates | Default to indexed/working copies marked non-official until the custodian approves issuance controls. | Records custodian + clergy | Certificate feature |
| DEC-007 | Hosting, data residency, and processor contracts | Separate development/staging/production; encrypted managed services; formal processor review. | Sponsor + DPO | Production deployment |
| DEC-008 | Notification channels and templates | In-app + consented push; do not place sensitive details on lock-screen previews. | Operations + DPO | Notification release |
| DEC-009 | Queue policy | FIFO per parish with explicit, auditable staff-managed priority exceptions. | Parish operations | Queue UAT |
| DEC-010 | Pilot load and performance thresholds | Use `TEST_PLAN.md` initial gates, then tune from measured parish volume. | Product owner + technical lead | Performance sign-off |
| DEC-011 | Backup objectives | Initial capstone target: recovery point <=24 hours and recovery time <=4 hours, pending owner approval and restore rehearsal. | Sponsor + operations | Operations sign-off |
| DEC-012 | Supported mobile OS versions and device baseline | Support current and two preceding major Android/iOS releases where the chosen framework permits. | Product owner | Portability testing |
| DEC-013 | Languages | English first; keep strings externalized for Filipino/Kapampangan review. | Sponsor + parish representatives | Content/UAT |
| DEC-014 | UAT questionnaire and sample | Use the paper's eight ISO/IEC 25010:2011 characteristics, four-point scale, total enumeration for qualified staff/clergy, and Slovin-derived parishioner sample after population is known. | Research adviser | Formal evaluation |
| DEC-015 | Legacy/paper record migration and data-quality method | Start with controlled manual/validated import; retain source/provenance and duplicate/correction log; never bulk-promote unverified rows. | Records custodian + technical lead | Records go-live |
| DEC-016 | Incident response and support ownership | Name product, technical, parish, security/privacy, canonical, and provider contacts; approve severity/escalation targets before pilot. | Sponsor + operations + DPO | Production support |
| DEC-017 | Mobile signing, store/distribution, and minimum-version policy | Use sponsor-controlled accounts, staged release, reproducible signing custody, privacy disclosures, and an API compatibility window. | Sponsor + mobile release owner | Mobile production release |
| DEC-018 | Evaluation data confidentiality and reporting rules | Separate evaluation identity where possible; approve access, small-group suppression/anonymization, retention, and export rules. | Research adviser + DPO | Evaluation collection/reporting |

## Evidence status register

The following are **pending unless the project evidence package explicitly records completion**:

| Planned activity from the paper/project standard | Evidence needed to close |
|---|---|
| Parish/stakeholder consultation and current-process observation | Approved participant list, dates, notes, consent/permission, decisions incorporated |
| Requirements validation | Versioned requirements review and authorized sign-off |
| Research instrument expert validation and pilot reliability | Instrument version, validator credentials/records, pilot method/result |
| Ethics clearance and informed consent | Approval/reference and approved participant information/consent materials |
| Unit, integration, system, security, accessibility, performance testing | Reproducible run output tied to release/version |
| UAT with intended users | Task script, participant governance, results, defects, acceptance |
| ISO/IEC 25010 evaluation | Validated questionnaire, approved sample, consented raw data, calculation and analysis |
| Backup restore and rollback rehearsal | Environment/version, timings, integrity checks, outcome and corrective actions |
| Privacy/canonical/legal review | Named approvers, scope, decisions, notices/policies, accepted residual risks |
| Production deployment and observation | Deployment record, smoke evidence, monitoring window, incident/deviation record |

## Release rule for open decisions

Items DEC-001 through DEC-009 and DEC-014 through DEC-018 must be resolved or explicitly deferred with written risk acceptance before the relevant real parishioner, sacramental, mobile-release, or evaluation data/process enters production. Defaults in this document are engineering assumptions, not evidence of stakeholder consent or legal/canonical approval.

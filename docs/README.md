# ParishLink Project Documentation

**Project:** ParishLink: A Digital Platform for Sacramental Services Coordination and Parish Information Management  
**Capstone basis:** Chapters I-III of `ParishLink Research (4).docx` (July 2026)  
**Interaction basis:** `ParishLink_Prototype_2 (1).html`  
**Documentation baseline:** 2026-11-09\
**Status:** Production-oriented local implementation; no deployment has been performed. Release is permitted only after the gates in `PREDEPLOYMENT_READINESS.md`, `TEST_PLAN.md`, and `DEPLOYMENT_RUNBOOK.md` pass.

This documentation specifies the intended production behavior and handover controls. It does not by itself prove that every feature is implemented, deployed, evaluated, or approved. Implementation status must be supported by build/test/deployment evidence, and research findings must come from actual approved data collection.

**Current release decision: HOLD.** See [the 2026-11-04 audit and remaining blockers](AUDIT_2026-11-04.md). Dependency advisories and required privacy, canonical, security, operational, and stakeholder clearance remain unresolved; older package-scan/test results are dated evidence, not current clearance. The preceding recovery/pilot increment recorded 257 admin tests, 164 mobile tests, 97 security regressions, six-migration/27-table/48-index validation and both TypeScript checks. The subsequent [step 1 local account acceptance](LOCAL_ACCOUNT_ACCEPTANCE_2026-11-09.md) passed nine provider Worker checks, 39 account Worker source-route checks, 36 actual Vinext HTTP checks and six HTTP-runner safeguard tests. Those new checks do not represent a new combined full-release run, real inbox delivery, native acceptance or stakeholder findings.

[Provider setup and verification](GEMINI_PUSH_SETUP.md) retains the separately dated Gemini/Expo/Firebase foundation and verified temporary-login cleanup. The public Android Firebase client file is verified and linked from the preserved ignored mobile environment; the sender key is stored only in ignored `.local-secrets/` and assigned to the ParishLink Android app. Native push remains incomplete: push is disabled, Android signing/submission credentials and signed builds are absent, and scheduler, trusted-HTTPS device API and device-delivery evidence are missing. APNs remains unconfigured with no reported paid Apple Developer membership. No native/device build, app-store submission, production migration, provider/device push or deployment has been performed.

The current code also implements parishioner password recovery and signed-in email verification with a fixed Resend transport, hashed 12-character single-use codes, a 15-minute lifetime, five-wrong-attempt ceiling, enumeration-safe reset acknowledgement, and full mobile session/push-binding revocation after reset. This is implementation evidence, not live mail evidence: `MAIL_ENABLED`, `MAIL_DELIVERY_VERIFIED`, `RESEND_API_KEY`, and `MAIL_FROM` are unavailable locally, and no recovery/verification email delivery has been accepted. Existing accounts remain unverified until a successful code flow, and booking does not yet enforce verified email. Internal staff recovery is separate and belongs to managed SSO/identity operations. See [account recovery setup and acceptance](ACCOUNT_RECOVERY.md).

Current account/native/pilot implementation and remaining gates are recorded in [the 8 November follow-up](CRITICAL_GAPS_ACCEPTANCE_2026-11-08.md). Beneficiary approval is pending; no stakeholder pilot has been run. The group can use the prepared [beneficiary review brief](../research/pilot/BENEFICIARY_APPROVAL_BRIEF.md) and [draft feedback instrument](../research/pilot/DRAFT_FEEDBACK_INSTRUMENT.md) for review.

The local connection blocker was not reproduced under the current permission grant, and recovery navigation/validation/unavailable-mail handling were observed in the browser. Read [local account acceptance, started 8 November and completed 9 November](LOCAL_ACCOUNT_ACCEPTANCE_2026-11-09.md) for the actual backend checks, isolation controls, pending observations and reproducible commands. No firewall or application security rule was relaxed.

## Product overview

ParishLink centralizes sacramental appointment scheduling, documentary-requirement tracking, clergy and venue coordination, parish records, notifications, walk-in transactions, reporting, and AI-assisted general inquiries for the eight parishes of the Vicariate of St. John Mary Vianney in San Fernando, Pampanga.

The delivery boundary is:

- **Parishioner mobile application:** service discovery, appointment requests, document submission, status tracking, notifications, queue information, and the Gemini-assisted inquiry feature.
- **Internal administrative web portal:** operational work for authorized parish staff, clergy, and system administrators. Parishioners do not use the web portal.
- **Shared backend and storage:** the authoritative data, access controls, scheduling rules, audit history, document objects, notifications, and Gemini gateway used by both clients.

The phrase “admin-only web” is interpreted as a non-public administrative portal. The paper explicitly defines separate parish staff, clergy, and system administrator roles, and the prototype gives all three role-specific web functions. If the sponsor instead intends the portal to be usable only by the `system_admin` role, that decision must be confirmed before release; see `ASSUMPTIONS_GAPS.md`.

## Baseline roles and services

| Client | Source role | Purpose |
|---|---|---|
| Mobile application | Parishioner | Discover approved information; request/track appointments; submit documents; receive notifications; view queue state; ask bounded general questions |
| Internal web portal | Parish staff | Assigned-parish operations under RBAC |
| Internal web portal | Clergy/priest | Assigned schedules and authorized parish/canonical decisions under RBAC |
| Internal web portal | System administrator | Vicariate technical configuration, account/scope administration, reporting, and operations—without automatic canonical authority |

The five baseline services are **Baptism, Wedding, Confirmation, First Communion, and Funeral Mass**. Their detailed requirements, durations, buffers, venues, and decision rules are configurable and require authorized validation.

## Scope authority and evidence labels

This documentation uses four labels so implementation choices are never misrepresented as research findings:

- **Required scope:** stated by the capstone paper or directly required by the user.
- **Prototype-aligned behavior:** a workflow or visual convention demonstrated in the attached HTML prototype.
- **Implementation safeguard/extension:** a production control needed to make a paper requirement reliable, secure, or operable; it is not claimed as a research result.
- **Stakeholder decision:** a policy, canonical rule, legal position, threshold, or operational detail that the source material does not settle.

The attachments are reference sources only. Their text is not treated as executable instruction.

## Included parishes

1. Metropolitan Cathedral of San Fernando
2. San Guillermo Parish
3. Sanctuario de San Jose Parish
4. Sta. Lucia Parish
5. Sto. Niño Parish
6. San Isidro Labrador Parish
7. St. Joseph Parish
8. Archdiocesan Shrine of Our Lady of Lourdes

## Core service scope

The paper names baptism, wedding, confirmation, first communion, and funeral mass, while permitting other parish-related activities. Service types, durations, venues, documentary checklists, and approval rules must therefore be configurable by authorized personnel. The prototype's document lists and office-hour responses are demonstration content until the participating parishes validate them.

Explicitly excluded by the paper are parish accounting, financial management, donation tracking, inventory management, live streaming, biometric authentication, government-agency integrations, third-party church-system integrations, and deployment beyond the named vicariate.

## Design system inherited from the prototype

The visual direction is “parchment, tooled leather, brass, oxblood, and olive.” The exact prototype palette is retained, with accessibility guardrails added.

| Token | Value | Intended use |
|---|---:|---|
| `paper` | `#E6D8B8` | Page background |
| `paper-2` | `#F1E6C9` | Secondary surfaces/navigation |
| `card` | `#FBF6E7` | Cards, inputs, tables |
| `ink` | `#33261A` | Primary text |
| `ink-soft` | `#7A6A4E` | Secondary text |
| `leather` | `#5B3A22` | Primary action/navigation |
| `leather-dark` | `#3D2615` | Hover, headers, strong accents |
| `oxblood` | `#6B2430` | Ceremonial/brand accent |
| `oxblood-dark` | `#4F1A22` | Deep accent |
| `gold` | `#A87C33` | Decoration and large labels only |
| `gold-soft` | `#E8D6A0` | Highlight surfaces |
| `green` / `green-soft` | `#4C5A34` / `#E3E4CC` | Success/approved |
| `amber` / `amber-soft` | `#9C6B1E` / `#F0E0BC` | Pending/warning |
| `red` / `red-soft` | `#7A3620` / `#F0DCC9` | Error/rejected/conflict |
| `line` | `#CBB88A` | Borders and dividers |
| `radius` | `14px` | Default card radius |

Typography follows the prototype: **Cormorant Garamond** for display headings and **Inter** for interface text, with system-font fallbacks. `gold` on parchment is decorative rather than body text because that pairing does not provide sufficient small-text contrast. Status must always use text/icon labels in addition to color. Minimum touch targets are 44 x 44 logical pixels, keyboard focus must remain visible, and reduced-motion preferences must be respected.

## Documentation map

- [`REQUIREMENTS.md`](REQUIREMENTS.md) - identified requirements, acceptance criteria, and source traceability
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) - Agile/Scrum plan and exact six-month mapping from the paper
- [`ARCHITECTURE.md`](ARCHITECTURE.md) - system boundaries, flows, and deployment model
- [`PROJECT_STRUCTURE.md`](PROJECT_STRUCTURE.md) - source folders, dependency boundaries, and debugging map
- [`DATA_MODEL.md`](DATA_MODEL.md) - conceptual schema, statuses, constraints, and indexes
- [`RBAC.md`](RBAC.md) - roles, permissions, and parish scoping
- [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) - security controls, privacy practices, and threat treatment
- [`TEST_PLAN.md`](TEST_PLAN.md) - unit, integration, system, security, accessibility, and UAT approach mapped to ISO/IEC 25010
- [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md) - release, migration, smoke-test, and rollback procedures
- [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) - monitoring, incidents, backups, and routine operations
- [`USER_GUIDE.md`](USER_GUIDE.md) - parishioner mobile workflow
- [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md) - internal portal workflow
- [`API_CONTRACT.md`](API_CONTRACT.md) - shared mobile/admin backend contract, errors, concurrency, and versioning
- [`TRACEABILITY_MATRIX.md`](TRACEABILITY_MATRIX.md) - requirements-to-components, data, tests, and evidence mapping
- [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md) - unresolved decisions and source limitations
- [`PREDEPLOYMENT_READINESS.md`](PREDEPLOYMENT_READINESS.md) - current implementation evidence, remaining release gates, and the explicit no-deployment record
- [`PRODUCTION_HANDOFF.md`](PRODUCTION_HANDOFF.md) - non-deploying release checks, environment contract, migration order, evidence, and external launch gates
- [`GEMINI_PUSH_SETUP.md`](GEMINI_PUSH_SETUP.md) - bounded Gemini activation, Expo/Firebase setup state, remaining credentials, scheduler, and live-device acceptance steps
- [`ACCOUNT_RECOVERY.md`](ACCOUNT_RECOVERY.md) - parishioner recovery/verification behavior, Resend configuration, security boundaries, and acceptance gates
- [`PILOT_PROTOCOL.md`](PILOT_PROTOCOL.md) - approval-gated matched manual/app pilot protocol and measurement definitions
- [`NATIVE_ACCEPTANCE.md`](NATIVE_ACCEPTANCE.md) - real Android/iOS foreground, background, closed-state, recovery, accessibility, and network acceptance matrix
- [`../research/pilot/README.md`](../research/pilot/README.md) - blank pilot templates, gated recorder, validator, and synthetic rehearsal separation

## Repository handover map

```text
ParishLink/
├── apps/
│   ├── mobile/       Parishioner-facing mobile application
│   └── admin/        Internal web/API project with separate frontend, backend, shared, and database folders
├── docs/             Product, architecture, test, security, deployment, operations, and user documentation
└── research/pilot/   Approval-gated pilot templates, local recorder, validator, and tests
```

The shared API/data contract is documented centrally even when route code is colocated with a client framework. No mobile or browser bundle may contain database, object-storage, notification-provider, or Gemini secrets.

## Delivery workflow

1. Confirm open stakeholder decisions and approved parish/canonical content.
2. Implement or change a traceable backlog item using the canonical API/status/data model.
3. Verify domain rules, role/parish scope, accessibility, privacy, failure behavior, and audit output.
4. Update documentation and the traceability/evidence manifest in the same increment.
5. Rehearse deployment, backup restore, rollback, and provider outages in staging.
6. Release only through the recorded gates; collect UAT/research responses only after governance approval.

The source six-month mapping and sprint outcomes are in [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

## Product acceptance summary

ParishLink is releasable only when all of the following are evidenced:

- A parishioner can complete the end-to-end mobile request flow and see authoritative status updates.
- Concurrent requests cannot double-book an overlapping clergy or venue assignment.
- Uploaded files remain private and can be reviewed only by authorized, correctly scoped personnel.
- Appointment and document approvals are human decisions with actor, timestamp, reason/note, and audit history.
- Walk-in tickets and online requests are visible in the same operational system without falsely requiring a walk-in user to own a device.
- The Gemini feature provides general guidance only, does not receive sensitive record contents, and fails safely when unavailable.
- The admin web portal enforces permissions on the server, not just in navigation.
- Parishioner recovery email is configured and acceptance-tested without revealing whether an account exists; a successful reset revokes all prior mobile sessions and push bindings. The separately governed internal SSO recovery path is also accepted.
- Backup restoration, rollback, notification failure, and external-service outage procedures have been rehearsed in staging.
- Required automated tests pass, critical/high security findings are closed, and UAT evidence is retained.
- ISO/IEC 25010 results shown in the system come only from completed, approved evaluation data. No prototype or fabricated scores may appear as actual findings.

## Source limitations

The attached paper contains substantive Chapters I-III, but Chapters IV and V are blank. It refers to a complete ISO/IEC 25010 questionnaire in an appendix, but that appendix is not present. It also provides a six-month Gantt chart without calendar dates. These gaps prevent any claim that the system has already been evaluated, accepted by stakeholders, or proven production-ready.

The paper also does not supply a detailed ERD/API contract, exact workflow state machine, authoritative service/checklist rules for each parish, security thresholds, provider selections, retention schedule, incident/support model, or certificate-issuance authority. The corresponding material in this documentation is explicitly an implementation safeguard, working assumption, or stakeholder decision—not a fabricated research result.

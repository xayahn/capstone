# ParishLink Implementation Plan

## 1. Planning basis

This plan implements the Agile/Scrum approach and six-month sequence in the capstone paper. The source uses `M1` through `M6` and explicitly states that actual dates depend on the approved capstone schedule; this document therefore does not invent calendar dates.

The source timetable maps as follows:

| Activity from the paper | M1 | M2 | M3 | M4 | M5 | M6 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Planning | Active |  |  |  |  |  |
| Requirements Analysis | Active | Active |  |  |  |  |
| Design |  | Active |  |  |  |  |
| Development (Sprints) |  | Active | Active | Active | Active |  |
| Testing |  |  | Active | Active | Active |  |
| Deployment |  |  |  |  | Active | Active |
| Review & Maintenance |  |  |  |  | Active | Active |
| Documentation & Finalization | Active | Active | Active | Active | Active | Active |

The table above is a faithful transcription of the shaded periods. The detailed deliverables below are an implementation plan, not claimed content from the research results.

## 2. Scrum operating model

- **Product owner:** sponsor-approved representative who orders the backlog and accepts outcomes.
- **Stakeholder group:** authorized parish staff, clergy, system administrators, parishioner representatives, research adviser, records custodian, privacy/DPO contact, and technical/security reviewers.
- **Development team:** designs, builds, tests, documents, and demonstrates working increments.
- **Cadence:** short, fixed-length sprints selected by the project team; two weeks is the recommended planning assumption, but the paper does not mandate a sprint length.
- **Events:** backlog refinement, sprint planning, daily coordination, increment demonstration, retrospective, and release-readiness review.
- **Artifacts:** product backlog, sprint backlog, definition of ready, definition of done, decision register, test evidence, risk register, and release evidence package.

No interview, consultation, pilot, ethics clearance, UAT, or approval is recorded as complete until evidence is supplied.

## 3. Month-by-month delivery plan

### M1 — planning, requirements, and documentation

**Objectives**

- Confirm the eight-parish boundary, four roles, five services, mobile/admin split, exclusions, and success criteria.
- Document current parish workflows through approved consultations and observations.
- Establish governance, research permissions, privacy review, risk ownership, and change control.
- Build the product backlog and traceability baseline.

**Exit evidence**

- Approved vision/scope and named product owner.
- Requirements and gaps reviewed against [`REQUIREMENTS.md`](REQUIREMENTS.md).
- Initial decisions for portal eligibility, identity, canonical rules, data ownership, and evaluation approach.
- Initial threat model, data inventory, accessibility plan, and test strategy.

### M2 — requirements completion, design, and first development increments

**Objectives**

- Resolve high-impact workflow questions and version the first approved service/checklist configurations.
- Complete architecture, API, data, RBAC, UI flows, and prototype-aligned design system.
- Establish environments, automated checks, migrations, seed data, and audit conventions.
- Start increments for identity, parish/service catalog, and core navigation.

**Suggested sprint outcomes**

1. Mobile parishioner shell, internal portal shell, authentication boundary, and parish scoping.
2. Parish/service configuration, scheduling query contract, and appointment draft/submission skeleton.

**Exit evidence**

- Reviewed architecture and data model.
- Demonstrable clients using the same API contract.
- Automated build, lint, type, and unit checks running in a clean environment.

### M3 — development and testing of scheduling/documents

**Objectives**

- Complete conflict-aware appointment creation, status workflow, and event history.
- Implement private upload, validation/quarantine interface, document review, and replacement flow.
- Add notifications for committed appointment/document changes.
- Begin unit, integration, accessibility, and security testing alongside development.

**Suggested sprint outcomes**

1. Availability, interval conflict checks, atomic booking, retry/idempotency behavior.
2. Versioned checklists, uploads, human verification, approval gate, and audit events.

**Exit evidence**

- Concurrent-booking test demonstrates no double-booking.
- Unauthorized document access tests pass.
- Mobile-to-admin appointment/document round trip is demonstrable.

### M4 — development and testing of parish operations

**Objectives**

- Implement walk-in queue, staff-issued tickets, counter flow, and mobile ticket status.
- Implement clergy/venue assignments, schedules, announcements, working records, and operational reporting.
- Integrate the bounded Gemini gateway and deterministic fallback.
- Continue integration, system, compatibility, accessibility, performance, and failure-mode tests.

**Suggested sprint outcomes**

1. Queue, announcements, in-app notifications, and operational dashboards.
2. Records provenance, clergy assignments, reports, Gemini guidance/handoff, and privacy redaction.

**Exit evidence**

- Staff can serve a walk-in without requiring a mobile account.
- Gemini cannot read private files or change workflow state.
- Reports use authoritative data and show no fabricated evaluation results.

### M5 — feature completion, full testing, and deployment preparation

**Objectives**

- Freeze release scope; close critical functional, accessibility, privacy, and security defects.
- Conduct full system and regression tests across the supported device/browser matrix.
- Rehearse migration, backup restore, smoke testing, rollback, dependency outages, and incident response in staging.
- Begin controlled pilot/deployment activities only after approvals.
- Prepare validated UAT instrument and respondent process; do not substitute the missing appendix with invented responses.

**Exit evidence**

- Release candidate is traceable to requirements.
- No open severity-1/severity-2 defect; critical/high security findings closed.
- Staging restore and rollback rehearsal evidence retained.
- Privacy, canonical rules, research ethics/consent, and pilot authorization recorded where applicable.

### M6 — deployment, evaluation, review, maintenance, and finalization

**Objectives**

- Complete controlled rollout, observe real operation, and stabilize under the approved support model.
- Perform UAT and ISO/IEC 25010 evaluation only with validated instruments, consent, and actual respondents.
- Analyze recorded results using the paper's approved four-point method.
- Capture lessons, accepted residual risks, maintenance backlog, and final capstone evidence.

**Exit evidence**

- Deployment and rollback records, version inventory, and operational ownership.
- UAT/evaluation dataset with provenance or a clear “not yet conducted” statement.
- Updated Chapters IV/V content prepared by the researchers from real evidence—not generated placeholder claims.
- Final user/admin guides, architecture, test evidence, and maintenance handover.

## 4. Cross-cutting workstreams

| Workstream | M1–M6 behavior |
|---|---|
| Documentation | Updated in every sprint; a stale document blocks definition of done. |
| Security/privacy | Threat and privacy review begins in M1; controls and negative tests evolve with each increment. |
| Accessibility/UX | Prototype palette and interaction patterns are refined and tested continuously, not deferred to final polish. |
| Data/canonical validation | Rules remain configurable and marked unapproved until authorized parish/clergy review. |
| Testing | Unit tests begin with code; formal source schedule shows concentrated testing in M3–M5. |
| Research governance | Permissions, ethics, consent, instrument validation, pilot reliability, sampling, and analysis remain evidence-based gates. |

## 5. Backlog priority

1. Authentication, server-side RBAC, parish scoping, audit, and privacy foundations.
2. Service catalog, scheduling integrity, and appointment lifecycle.
3. Private documents and human verification.
4. Notifications and inclusive walk-in queue.
5. Clergy/venue schedules, records provenance, announcements, and reports.
6. Bounded Gemini guidance and fallback.
7. Evaluation capture/reporting after the missing instrument and governance items are resolved.

## 6. Definition of ready and done

An item is **ready** when its user, business value, source label, acceptance criteria, data classification, permission scope, dependencies, error states, accessibility behavior, and stakeholder owner are known.

An item is **done** when reviewed code, tests, security/privacy controls, accessible interaction, audit behavior, migrations, operational impact, documentation, and demonstration evidence are complete. “Works in the prototype” is not a definition of done.

## 7. Release gates and change control

Release gates are defined in [`TEST_PLAN.md`](TEST_PLAN.md) and [`DEPLOYMENT_RUNBOOK.md`](DEPLOYMENT_RUNBOOK.md). Any scope change must state the affected requirement IDs, privacy/canonical implications, data migration, tests, documentation, schedule impact, and approving owner. Out-of-scope capabilities are not added by implication.

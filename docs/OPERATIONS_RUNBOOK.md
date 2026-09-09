# ParishLink Operations Runbook

## 1. Ownership and contacts

Before go-live, fill and protect an operational contact register for product owner, technical on-call, parish operations leads, system administrators, DPO/privacy contact, records custodian, clergy/canonical escalation, security incident lead, hosting/identity/storage/push/Gemini providers, and mobile-store owners. Do not put private phone numbers or credentials in this repository.

The system administrator maintains technical service; parish staff/clergy retain the business and canonical authority defined in [`RBAC.md`](RBAC.md). Technical access does not authorize sacramental decisions.

## 2. Service indicators

Monitor by environment and release:

- API availability, p50/p95/p99 latency, error class/rate, request volume, and saturation;
- authentication success/failure, session-revoke errors, authorization denials, role/membership changes;
- appointment submissions, conflicts, transition failures, duplicate/idempotent replays, and suspected overlaps;
- database errors, migration version, storage capacity/errors, scanner backlog/results, private-link failures;
- queue waiting age, claim conflicts, stuck serving tickets, and counter activity by parish;
- notification outbox age, retry/dead-letter count, push invalid tokens/failures;
- Gemini latency, quota/timeouts, safety/refusal/fallback rate—without raw sensitive prompts;
- mobile crash-free sessions/startup/sign-in/API-version errors;
- backup completion, age, restore-test status, audit write failures, and alert-delivery health.

Initial numeric SLOs are provisional until DEC-010/DEC-011. Never report an unapproved target as a research result.

## 3. Routine checks

### Each operating day

- Confirm core health, error/latency, auth, audit, database, storage/scanner, notification, Gemini, and backup dashboards.
- Review new critical/high alerts, stuck jobs, failed uploads, notification backlog, and unusually old queue/appointment work.
- Check public parish/service/office content for any scheduled change and expiry.
- Confirm no production data or secret appears in support tickets/log dashboards.

### Weekly

- Review privileged access changes, repeated denials, unusual exports/private-file reads, scheduling conflicts, and queue priority overrides.
- Reconcile outbox/dead-letter queues and invalid push tokens; close or reprocess with idempotency.
- Sample audit completeness for approval, document review, record correction, announcement, and configuration actions.
- Review capacity, error trend, mobile crash trend, dependency advisories, and expiring credentials/certificates.

### Monthly or approved interval

- Review active internal accounts and parish memberships with the responsible parish owner.
- Verify backup age/integrity and perform the scheduled isolated restore rehearsal.
- Execute approved retention/disposal jobs and retain counts/evidence without exposing contents.
- Review provider access, processors/subprocessors, costs/quotas, incident history, and recovery contacts.
- Review service/checklist versions, office hours, clergy/venue configuration, queue policy, notification templates, and AI approved content.
- Revisit risks, maintenance backlog, supported platforms, and documentation currency.

## 4. Incident classification

| Level | Examples | Response |
|---|---|---|
| SEV-1 | Confirmed/suspected data exposure, auth bypass, data loss/corruption, double booking with operational harm, widespread outage | Immediate incident command, containment, evidence preservation, owner/DPO/security escalation |
| SEV-2 | Core workflow unavailable for a parish/role, private file/identity/provider failure with major impact, growing backlog | Urgent owner response and workaround/feature isolation |
| SEV-3 | Degraded noncritical feature, bounded failures, safe workaround | Track, communicate affected scope, fix in controlled change |
| SEV-4 | Cosmetic/content issue without material task impact | Normal backlog |

Exact response times and notification channels require the approved support model. Legal/breach notification decisions belong to the controller/DPO and qualified advisers.

## 5. General incident procedure

1. Acknowledge and assign incident commander, scribe, technical owner, and stakeholder contact.
2. Record detection time, environment, release/schema, symptoms, affected parish/role/data, and safe correlation IDs.
3. Contain: disable the smallest affected feature/provider, revoke sessions/links/keys, or pause writes only when justified.
4. Preserve audit/logs and snapshots; do not paste sensitive data into chat/issues.
5. Diagnose with read-only checks first and distinguish client, API, database, storage, identity, provider, or configuration failure.
6. Recover through a rehearsed forward fix, rollback, replay, or restore; avoid duplicate business actions.
7. Validate critical workflows, reconcile affected records, and communicate plain-language status.
8. Close only after impact/owner validation; complete root cause, corrective/preventive actions, monitoring gaps, and privacy assessment.

## 6. Playbooks

### Suspected double booking

- Freeze approval/reschedule for the affected clergy/venue window while preserving read access.
- Query all active appointments/assignments using buffered intervals across all eight parishes.
- Do not automatically cancel either appointment. Escalate to authorized parish/clergy operations for resolution.
- Preserve request IDs, idempotency keys, versions, events, and audit evidence.
- Correct through an audited business transition and notify affected users with approved wording.
- Add/reproduce the race test before re-enabling the affected path.

### Database write or migration failure

- Stop further migration/change; verify current schema and whether writes are safe.
- Do not repeatedly retry an uncertain business write without checking idempotency/outcome.
- Use the deployment rollback plan; restore only with explicit authorization and transaction reconciliation.
- Validate counts, references, time-window integrity, events, audit, and critical workflows.

### Private storage/scanner failure

- Keep unscanned files quarantined and block reviewer access/verification.
- Disable new upload authorization if files cannot be stored safely; appointment/status viewing remains available.
- Never move objects to a public bucket or bypass scanning as a workaround.
- Reprocess once recovered with checksum/idempotency and notify users of delay without exposing document type/detail unnecessarily.

### Identity or authorization anomaly

- Disable affected account/session/client or feature; rotate compromised credentials.
- Review role/membership changes, denials, file access, exports, and privileged actions.
- Correct access server-side and validate the negative matrix before restoration.
- Involve DPO/security owner for potential unauthorized access.

### Push outage

- Preserve in-app notifications and durable delivery backlog.
- Retry with exponential backoff/jitter; do not duplicate business events.
- Suppress retry storms and remove only provider-confirmed invalid tokens.
- Use an approved status channel if impact is material; do not switch to SMS/email without approval.

### Gemini outage or unsafe response

- Disable the Gemini feature flag/gateway path, retain deterministic approved FAQ/handoff, and keep core functions running.
- Preserve redacted request/provider IDs and safety category; never copy raw private content into an incident ticket.
- Rotate key if exposed and inspect client bundles/logs.
- Re-run prohibited-request, prompt-injection, payload, and fallback tests before enabling.

### Queue disruption

- Parish staff may use the approved numbered manual fallback and record start/end range.
- Stop mobile issuance if it would create duplicate numbering.
- On recovery, reconcile manual tickets through an audited import/entry without changing who was served.
- Communicate that wait estimates are unavailable rather than guessing.

### Suspected privacy/security incident

- Contain access, preserve evidence, name the affected data/processors/parishes, and engage controller/DPO/security leadership immediately.
- Do not notify individuals or authorities based solely on an engineer's legal interpretation; provide facts for qualified determination.
- Track data return/deletion and credential/session rotation with evidence.

## 7. Backup, restore, and continuity

- Run backups at the approved frequency; initial capstone planning target is RPO <=24 h and RTO <=4 h, pending DEC-011.
- Encrypt and access-control backups; separate them from the primary failure domain where supported.
- Monitor success/age and retain provider/job evidence.
- Restore into an isolated environment at the approved interval. Validate schema version, table/object counts, checksums/sample retrieval, references, appointment conflicts, events/audit, and critical E2E workflows.
- Document actual RPO/RTO and remediation. A backup without a successful restore test is not proven recoverable.
- Manual continuity procedures must preserve ticket/reference uniqueness and be reconciled after recovery.

## 8. Access and change operations

- Use named accounts and least privilege; no shared admin credentials.
- Invitation, transfer, departure, elevation, recovery, and emergency access are ticketed and audited.
- High-risk configuration/export/retention/certificate changes use the separation rules in [`RBAC.md`](RBAC.md).
- Changes follow staging rehearsal, versioned migration, test gates, deploy record, monitoring, and rollback plan.
- Emergency fixes receive post-change review and full test/documentation completion before closure.

## 9. Data requests, corrections, and disposal

Route privacy requests to the approved DPO/contact. Verify identity without collecting excessive proof; search all approved systems/backups/providers; preserve canonical/archival obligations; document decision and action. ParishLink record corrections append provenance rather than silently overwriting history. Disposal jobs produce aggregate evidence, handle storage and derived caches, and age out backups according to policy.

## 10. Support triage

Support staff may collect app version, device/OS, time, parish, safe reference/correlation ID, steps, and screenshot only after checking it contains no private document or sensitive record. They must not request passwords, one-time codes, access tokens, or document uploads through informal channels. Canonical eligibility and official-record questions are handed to authorized parish/clergy personnel; privacy concerns go to the DPO/contact.

## 11. Maintenance completion record

For every maintenance window record scope, approval, version/migration, backup, start/end, checks performed, incidents/deviations, data reconciliation, monitoring outcome, rollback status, affected communications, and final owner acceptance.

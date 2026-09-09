# ParishLink Security and Privacy Plan

## 1. Status and governance boundary

ParishLink may process identity, contact, appointment, documentary, queue, and sacramental information. This plan applies privacy-by-design and security controls suitable for that risk. It is **not legal advice and does not claim compliance certification**.

The intended Philippine operating context includes the Data Privacy Act of 2012 (Republic Act No. 10173), its implementing rules, and relevant National Privacy Commission guidance. The sponsor must appoint the accountable personal information controller/authorized representatives, identify processors and a Data Protection Officer/contact, and obtain qualified Philippine privacy review before real data collection. Research ethics, consent, canonical governance, and records-custodian review are separate required approvals.

### Current implementation status

The local implementation now includes salted PBKDF2-SHA-256 parishioner passwords, login lockout, hashed/revocable bearer sessions, OS-protected mobile token storage, database-backed request throttling, server RBAC/parish scoping, same-origin admin writes, exact mobile browser-origin allowlisting, restrictive web security headers, production migration/readiness verification without request-time schema/bootstrap mutation, atomic scheduling and payload-bound retry controls, frozen checklist/participant snapshots, private file validation/checksums, event/notification/audit records, and a redacted/rate-limited/server-only Gemini gateway with deterministic fallback. Production identity/MFA and verified recovery, malware scanning, push delivery, provider-account testing, infrastructure abuse protection, retention jobs, monitoring, restore/rollback rehearsal, and formal privacy/canonical approvals remain release gates.

## 2. Data inventory and purpose limitation

| Data group | Intended purpose | Risk | Required decision |
|---|---|---|---|
| Account/contact | Authentication, recovery, service communication | Confidential personal | Identity method, notice, correction, retention |
| Appointment/participants | Coordinate requested sacramental service | Confidential; may imply religious activity | Approved fields per service, access, retention |
| Uploaded documents | Pre-validation of requirements | Highly restricted; may include civil/church identifiers | Formats, scanner, storage region, reviewer scope, disposal |
| Sacramental working records | Locate/manage authorized parish record indexes | Highly restricted | Digitization authority, provenance, correction, issuance, retention |
| Queue | Operate walk-in service | Confidential personal | Display/privacy approach, accountless handling, daily retention |
| Notifications/device token | Inform user of state changes | Confidential | Consent, preview content, provider, token deletion |
| Gemini inquiry | General public guidance and navigation | May accidentally receive personal content | Redaction, provider terms/region, retention, refusal/handoff |
| Audit/security telemetry | Accountability, fraud/incident detection | Internal/confidential | Retention, authorized viewers, IP handling |
| Evaluation response | Capstone quality evaluation | Research data | Ethics, consent, validated instrument, sampling, anonymization |

Collect the minimum approved fields. Do not repurpose data for fundraising, donations, profiling, advertising, unrelated research, or AI training without a separately reviewed basis and notice.

## 3. Required privacy work before production

1. Name the controller/accountable organization, DPO/contact, records custodian, system owner, and all processors/subprocessors.
2. Complete a data-flow inventory and privacy impact assessment proportionate to uploaded documents and sacramental data.
3. Document the lawful basis and transparent notice for each purpose; obtain consent where the reviewed policy requires it and keep consent separate from forced acceptance.
4. Approve retention and secure disposal periods for every table/object/log/backup category; “keep forever” is not a default.
5. Define access, correction, objection/withdrawal where applicable, export, deletion/restriction, identity verification, and response procedures.
6. Review cross-border/provider region, contractual safeguards, breach terms, government/lawful request handling, and data return/deletion at contract end.
7. Complete ethics approval, validated instrument, pilot reliability work, participant information, and informed consent before research data collection.
8. Validate parish/canonical authority for documentary rules, archival records, and any certificate output.

DEC-001, DEC-004 through DEC-008, and DEC-014 in [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md) block real-data release until resolved or formally risk-accepted.

## 4. Security architecture controls

### Identity and sessions

- Use a reviewed identity provider or standards-based implementation; passwords, if used, are salted with a current adaptive password hash.
- Internal accounts use managed invitation, MFA, short idle sessions, reauthentication for sensitive actions, and prompt disablement on departure.
- Rotate refresh/session tokens; store mobile secrets in OS-protected storage and browser sessions in secure, `HttpOnly`, appropriate `SameSite` cookies.
- Rate-limit authentication/recovery and use generic responses that do not reveal account or appointment existence.
- No shared admin accounts and no biometric authentication feature. Device biometrics may only unlock OS-secured credentials if later approved; the app must not collect biometric templates.

### Authorization

- Enforce [`RBAC.md`](RBAC.md) at the API/service and resource-query layers.
- Derive user/role/parish from the verified session, never from editable client claims.
- Apply least privilege, default deny, record-state gates, and purpose-limited elevated access.
- Test horizontal and vertical authorization on every protected route and object.

### Network, secrets, and configuration

- Encrypt traffic with current TLS; redirect or reject cleartext production traffic.
- Store provider credentials in deployment secret management, not source, mobile bundles, browser JavaScript, logs, or screenshots.
- Separate development/staging/production identities, keys, databases, storage, and push registrations.
- Validate origin/CSRF protections for cookie-authenticated writes and restrict cross-origin access to approved origins.
- Set security headers appropriate to the web framework, including a restrictive content-security policy after asset review.

### Input/output and application security

- Apply allow-list schema validation, length/range limits, normalized identifiers, parameterized queries, output encoding, and safe text rendering.
- Treat announcement, note, filename, and AI content as untrusted; never inject raw HTML.
- Use idempotency and optimistic concurrency for retryable writes; protect scheduling and queue claims atomically.
- Rate-limit expensive/sensitive endpoints, especially login, availability search, upload authorization, exports, and Gemini.
- Scan dependencies and artifacts, review lockfile changes, generate an inventory/SBOM where supported, and remediate exploitable findings.

### Private files

- Object storage is private by default; use random non-meaningful keys and short-lived purpose-bound URLs.
- Restrict type, size, count, and extension; inspect actual media signature; compute checksum; quarantine pending malware scan.
- Serve downloads with safe content disposition and type; do not execute or inline unsafe formats.
- Log access metadata without storing file content. Deletion propagates to active objects and follows an approved backup-expiry process.
- OCR, if added, is a separate processor and never grants verification.

### Data protection and backups

- Use provider encryption at rest and separately protect backups/exports.
- Minimize production access; avoid copying real data into development, demos, screenshots, or issue trackers.
- Backups are encrypted, access-controlled, monitored, restored in staging, and expired under policy.
- Bulk exports are purpose-authorized, minimized, watermarked where appropriate, time-limited, and audited.

## 5. Gemini safety and privacy boundary

Gemini is called only through a server gateway. The model may receive approved public parish/service content and the minimum redacted user question. It must not receive uploaded files, document transcriptions, sacramental-record contents, credentials, private review notes, full identifiers, or unnecessary contact details.

The gateway must:

- apply input redaction and warn users not to enter sensitive data;
- restrict answers to general service information, approved requirements, procedures, office inquiries, and navigation;
- refuse approval/verification, sacramental eligibility judgment, counseling, and legal or financial advice;
- provide parish contact/handoff and identify uncertainty;
- expose no business-write tools;
- apply provider safety settings, timeout, quota, output validation, and rate limits;
- keep only the minimum redacted telemetry under the final retention policy;
- fall back to deterministic approved content without blocking core service when Gemini is unavailable.

Provider account, model, regional/data terms, use-for-training setting, subprocessors, and deletion behavior require approval before activation.

## 6. Threat treatment summary

| Threat | Primary controls | Verification |
|---|---|---|
| Account takeover | MFA internal, secure recovery, rate limit, session rotation, alerting | Auth abuse and session tests |
| Cross-parish data access | Server RBAC, membership predicates, opaque IDs, negative tests | Wrong-parish endpoint/file matrix |
| Double booking/race | Atomic interval recheck, idempotency, versions | Parallel submission integration test |
| Malicious upload | Allow-list, signature/size checks, quarantine, malware scan, safe serve | EICAR/test fixtures and bypass tests in isolated staging |
| Stored/script injection | Validation, encoding, sanitized rendering, CSP | Automated/manual injection tests |
| Secret leakage | Secret manager, client-bundle/log scan, rotation | Release scan and incident drill |
| AI prompt injection/data exfiltration | No private data/tools, approved retrieval, redaction, output guard, handoff | Adversarial prompt suite and payload inspection |
| Unauthorized workflow action | State machine, permission/policy checks, audit | Transition negative tests |
| Data loss/corruption | Transactions, event history, backup/restore, migration checks | Restore and rollback rehearsal |
| Excess collection/retention | Field review, notices, retention jobs, deletion verification | Privacy review and disposal evidence |
| Insider misuse/export | Least privilege, purpose/elevation, dual review, audit/alerts | Access review and export audit sampling |

## 7. Logging, monitoring, and audit

Log request correlation, route/action, safe entity identifier, actor identifier, effective role/scope, outcome, latency, and error class. Do not log passwords, tokens, full headers, private URLs, full form payloads, document content, unredacted Gemini prompts, or unnecessary personal information.

Alert on repeated login/authorization failures, new privileged accounts, role/scope change, bulk access/export, unusual private-file reads, malware result, scheduling conflict anomaly, audit write failure, backup failure, elevated error/latency, notification backlog, and Gemini quota/safety spikes.

Audit integrity failure blocks high-risk actions where feasible and is treated as a security incident.

## 8. Vulnerability and incident handling

- Triage findings by exploitability and data/business impact; critical/high exploitable findings block production.
- Maintain a confidential reporting contact and patch/upgrade ownership.
- On suspected incident: preserve evidence, contain access, rotate affected secrets, assess data/process impact, restore safe service, and document decisions.
- The controller/DPO and qualified advisers determine notification obligations and timelines; the software team must not make unsupported legal conclusions.
- Post-incident review creates tracked corrective actions and validates that monitoring would detect recurrence.

Operational steps are in [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md).

## 9. Security release checklist

- Privacy/canonical/research decisions approved and notices available.
- Threat model and data inventory current.
- Auth, RBAC, cross-parish, transition, CSRF/origin, rate-limit, injection, upload, AI, and export tests pass.
- Client bundles and logs contain no secret or private fixture.
- Critical/high findings closed; medium residual risks have owner/date/acceptance.
- Backup restore, credential rotation, provider outage, and incident exercise completed in staging.
- Access review and production administrator list approved.
- Monitoring, alert routing, audit retention, and emergency contacts confirmed.

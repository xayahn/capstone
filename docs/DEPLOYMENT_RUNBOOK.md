# ParishLink Deployment Runbook

## 1. Scope and release principle

This runbook covers controlled deployment of the shared backend/internal web portal and the parishioner mobile application. The paper does not select providers; the current reference implementation uses an Expo mobile client and a Cloudflare-compatible web/API runtime with D1 and private R2 bindings. Identity, malware scanning, push, signing/distribution, monitoring, and final Gemini/provider governance still require sponsor selection and approval.

A successful build or local demonstration is not a production release. No deployment was performed during the 2026-08-28 hardening pass. Production may accept real data only after the gates in [`PREDEPLOYMENT_READINESS.md`](PREDEPLOYMENT_READINESS.md) and [`TEST_PLAN.md`](TEST_PLAN.md), the decisions in [`ASSUMPTIONS_GAPS.md`](ASSUMPTIONS_GAPS.md), and the privacy/canonical approvals in [`SECURITY_PRIVACY.md`](SECURITY_PRIVACY.md) are satisfied.

## 2. Environment model

Maintain isolated **development**, **staging**, and **production** environments. Each has separate:

- identity tenant/clients and callback URLs;
- database and migration history;
- private object-storage namespace and file-scanning configuration;
- push credentials/device registrations;
- Gemini key/project/quota/safety configuration;
- encryption/secrets, domains, monitoring, alerts, and audit sink;
- synthetic versus real data policy.

Never promote a development database, demo evaluation scores, real uploaded documents, test accounts, or test push tokens into production.

## 3. Release record

Before deployment, create one release record containing:

- release/version identifier and immutable source revision;
- web/backend artifact digest and mobile build identifiers;
- included requirement/change/defect IDs;
- schema migration list and compatibility window;
- environment configuration version, without secret values;
- test/security/accessibility/privacy evidence links;
- known limitations and accepted residual risks;
- deployment owner, verifier, business approver, and rollback owner;
- planned window and communication channel once calendar dates are approved.

## 4. Preconditions

- Scope freeze and change approval are complete.
- Internal portal eligibility, authentication, canonical service/checklist rules, privacy ownership/notice/retention, provider terms, queue policy, notification policy, and evaluation instrument decisions are recorded.
- Required automated, end-to-end, device/browser, security, accessibility, restore, rollback, and UAT gates pass.
- No severity-1/severity-2 defect or critical/high exploitable security finding is open.
- Production administrator and parish-membership list is approved; MFA/recovery has been tested.
- Backups and an isolated restore target are available; the latest restore rehearsal meets approved objectives.
- Monitoring, alerts, incident contacts, provider status contacts, and support escalation are staffed.
- Mobile privacy disclosures, store metadata, signing, review accounts, and platform requirements are approved.
- Gemini remains disabled unless its data terms, boundaries, redaction, prompts, fallback, and quota are approved.

## 5. Required configuration classes

Exact names may differ by platform, but configuration must cover:

| Class | Examples | Validation |
|---|---|---|
| Application | environment, public API/web origin, release ID, `Asia/Manila` display zone | No production origin points to dev/staging |
| Identity | issuer, audience/client IDs, callback/deep-link routes, session/MFA policy | Sign-in/out/revoke/recovery test |
| Database | binding/connection, migration version, backup/restore settings | Connectivity and schema-version check |
| Storage | private bucket/namespace, upload limits, signed-link lifetime, scanner | Public listing/access denied; test upload scanned |
| Push | provider project/app IDs, server credentials, privacy-safe templates | Test device receives non-sensitive message |
| Gemini | server key, approved model, timeout/quota/safety, feature flag | Key absent from clients; refusal/fallback suite passes |
| Observability | log/metric/error destinations, release tag, alert routes | Synthetic alert reaches on-call owner |
| Security | allowed origins, cookies, rate limits, encryption/signing secrets | Security-header/origin/session smoke checks |

Secrets are injected through the approved secret mechanism and never printed in deployment output.

## 6. Staging rehearsal

1. Restore or initialize staging with synthetic representative data.
2. Apply the exact production migration sequence.
3. Deploy backend/web artifact and verify release/schema identifiers.
4. Build mobile release candidates against staging using non-production signing/distribution.
5. Run contract, critical E2E, authorization, concurrency, upload, provider failure, accessibility, and performance smoke suites.
6. Take a pre-change backup, rehearse rollback/restore, and record elapsed time and integrity checks.
7. Obtain technical, product, privacy/security, records/canonical, and UAT approvals appropriate to the release.

Any unreconciled staging difference invalidates the rehearsal.

## 7. Production deployment sequence

### 7.1 Prepare

1. Announce the approved change window and support path.
2. Confirm dashboard/alerts are healthy and no unresolved incident is active.
3. Verify artifact digests, production target/account, current version, current schema, and feature-flag state.
4. Create and verify the pre-deployment backup/snapshot according to provider capability.
5. Pause nonessential bulk jobs; do not stop critical audit or safety processing.

### 7.2 Database and storage

1. Apply backward-compatible schema expansion before application code where possible.
2. Record migration start/end, executor, output, and schema version.
3. Run non-destructive integrity checks: expected tables/indexes, migration ledger, referential/orphan checks, and representative counts.
4. Validate private storage policy, lifecycle rules, CORS/origin rules, scanner/quarantine path, and signed-link expiry.
5. Defer destructive column/table removal until the compatibility window and verified backup period have elapsed.

### 7.3 Backend and internal web

1. Deploy the immutable artifact to a canary/preview or limited production slice where supported.
2. Verify process/edge health, database/storage identity, release tag, configuration flags, and audit write.
3. Run unauthenticated and each-role sign-in smoke tests with designated non-real accounts.
4. Gradually enable traffic/features while watching error, latency, authorization-denial, conflict, upload, notification, and provider metrics.
5. Do not seed demo appointments, documents, records, or evaluation responses.

### 7.4 Mobile application

1. Produce signed Android/iOS artifacts from the approved revision and verify package/bundle identifiers, version/build numbers, API origin, permissions, privacy manifests, and absence of secrets.
2. Run physical-device smoke tests against production with designated release-test accounts and synthetic/non-sensitive content.
3. Submit through the approved internal/closed testing track first; retain store-review records.
4. Use staged rollout where supported. Do not force an unsupported old client to perform incompatible writes; enforce the API compatibility/minimum-version policy.
5. Monitor crashes, startup/sign-in, API version errors, upload, notification token registration, and booking completion before widening rollout.

## 8. Production smoke tests

Use designated accounts and remove generated synthetic records afterward through approved cleanup. At minimum verify:

- public health/version response contains no secret;
- parishioner sign-in/out and session revoke;
- internal sign-in for parish staff, clergy, and system administrator with correct navigation and server scope;
- exact eight-parish and five-service approved catalog;
- availability query and one synthetic appointment request/event/notification;
- concurrent/conflicting second request is safely rejected;
- private test upload, scanner path, reviewer view/replacement, and unauthorized denial;
- staff-issued walk-in ticket, call, serve, and duplicate-claim protection;
- parish-scoped announcement safe rendering;
- working-record output remains non-official unless issuance is approved;
- Gemini approved question, prohibited request refusal, and disabled/provider-outage fallback;
- no evaluation responses produces “No validated results”;
- audit, metrics, alerts, and backup status are visible.

## 9. Go/no-go decision

The deployment owner reports smoke evidence and current telemetry. Product owner, technical owner, and designated privacy/security/operational approvers make the recorded decision. “Go” requires no material unexplained anomaly. A conditional go states the exact risk, owner, mitigation, and review time.

## 10. Rollback and forward-fix

### Rollback triggers

- unauthorized data exposure or access-control regression;
- suspected corruption/data loss or double booking;
- sustained critical error/latency that blocks core workflows;
- broken authentication or private-file protection;
- migration inconsistency with no safe forward fix;
- unsafe Gemini behavior or secret exposure (also disable/rotate immediately).

### Procedure

1. Declare incident and freeze further changes.
2. Disable affected feature through a pre-tested flag when that safely contains impact; otherwise route traffic to the prior compatible artifact.
3. Preserve logs/audit and note request/release/schema IDs; do not destroy evidence.
4. If schema remains backward-compatible, roll back application only. If data restoration is required, stop writes, obtain controller/owner authorization, preserve the current state, restore to an isolated target, validate, then execute the approved recovery plan.
5. Revoke/rotate exposed credentials and links.
6. Run the critical smoke subset, communicate status, and open corrective actions.

Never perform an untested destructive down-migration on production data. Restoration decisions consider transactions after the backup and require explicit reconciliation.

## 11. Post-deployment observation and closure

- Observe the full stakeholder-approved stabilization window and at least one expected peak period.
- Compare error, latency, conflict, queue, upload, notification, Gemini, crash, and authorization signals with the staging baseline.
- Reconcile migration/version, scheduled jobs, backups, and synthetic smoke data cleanup.
- Record incidents, deviations, residual risk, actual rollout percentage, and user feedback.
- Update guides, architecture, traceability, and operations notes if runtime behavior differs.
- Close only after owners accept the evidence. Deployment completion is not equivalent to capstone evaluation completion.

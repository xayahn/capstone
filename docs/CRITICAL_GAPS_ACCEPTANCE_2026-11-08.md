# Critical gap completion and acceptance record

**As of:** 2026-11-08, Asia/Singapore  
**Decision:** Hold release and stakeholder pilot. Local engineering preparation only. No deployment, production migration, signed build, store submission, real email or push delivery, participant recruitment or stakeholder measurement was performed in this increment.

## Confirmed owner constraints

The owner reports no pilot approval and is waiting for the Vicar Forane to approve the beneficiary. Both an Android phone and iPhone are available, but neither has an installed ParishLink test build. There is no email provider or controlled sending domain. These are confirmed gaps, not assumed approvals. Beneficiary confirmation, permission to run research, participant consent and final beneficiary acceptance remain separate decisions.

## Work completed locally

| Gap | Implementation and evidence | Acceptance limit |
|---|---|---|
| Forgotten password | Connected mobile form, generic reset request, expiring hashed one-use code, atomic password update/session and push-binding revocation, explicit manual sign-in | Live mail and installed-device tests not executed |
| Email ownership | Same-session verification and authoritative profile flag; legacy accounts stay unverified; email changes clear proof | Mail unconfigured; verified email not yet a booking prerequisite |
| Database lifecycle | Append-only `0005`, credential version/proof, challenge table/indexes and invalidation triggers | Isolated migration checks only; no production migration |
| Mail outage and privacy | Uniform unavailable response, after-acknowledgement delivery design, fixed bounded transport, no plaintext persisted/retried, no raw provider errors | Real Worker after-response check blocked by local connection restrictions; provider/inbox acceptance not executed |
| Pilot measurement | Protocol, consent/approval drafts, proposed instrument, blank CSV templates, approval-gated recorder, paired descriptive validator, separate rehearsal classification | No approved participants, observations, consent or results |
| Native acceptance | Android/iOS matrix and concrete internal-build plan with evidence/defect gates | No signed builds, device HTTPS API, scheduler, Android signing or iOS signing/APNs acceptance |

Detailed references: [recovery](ACCOUNT_RECOVERY.md), [pilot protocol](PILOT_PROTOCOL.md), [native acceptance](NATIVE_ACCEPTANCE.md), [beneficiary review brief](../research/pilot/BENEFICIARY_APPROVAL_BRIEF.md), [recorder/data kit](../research/pilot/README.md).

## Verification in this increment

| Check | Observed outcome |
|---|---|
| Admin tests, current full run | **257 passed**, 16 files |
| Mobile tests | **164 passed**, 15 files |
| Backend security regressions | **97 passed** |
| Admin and mobile TypeScript | Passed |
| Focused changed backend lint | Passed |
| Append-only migration validation | Six migrations, 27 tables, 48 indexes; no Drizzle schema drift |
| Admin production compilation | Passed; four new account endpoints in route manifest |
| Unsigned mobile export | Web, Android and iOS JavaScript bundles exported; this is not a signed APK/IPA or device test |
| Pilot recorder/validator tests | **35 passed, one skipped**, zero failures; hard-link fixture creation blocked by host permissions, so that rejection path is unverified here |
| Local integration configuration check | Correctly reports account email setup needed and push disabled; Gemini/Firebase client configuration present. Exit 1 is expected for unresolved configuration |
| Actual workerd provider/account harness | Blocked before assertions by `EACCES` connecting to loopback, even after a network permission grant. Do not count as a pass or infer application failure |
| Browser recovery preview | Not verified: local preview connection timed out. Task-owned preview process stopped |
| Whitespace validation | Passed |
| Documentation / empty-data QA | 117 local links resolve; five CSV templates have zero participant/result rows and validate as NoResults |
| Exact configured-key artifact check | Current configured backend key absent from 47 generated admin/mobile client artifacts; this is not an exhaustive secret audit |

These are separate local checks, not a complete production release run. The earlier nine workerd assertions were dated 6 November; they do not verify this new recovery flow. The current Worker transaction/after-response harness has not passed. A new dependency audit, live identity/storage/scanner operations, realistic load, restore/rollback, external privacy/canonical clearance and other release gates are outside this focused increment and remain governed by the existing audit/runbooks.

The independent final review found that the original test adapter hid D1 trigger-side-effect counts. With D1-compatible `total_changes()` metadata, five account tests reproduced false errors after committed password transitions. Both affected success guards were corrected and a password-change regression with two pending challenge purposes was added. The final full admin/security reruns above include this fix; a real Worker run remains a separate pending gate.

Pilot tests use synthetic fixtures only. A recorder rehearsal is never a manual workflow baseline, stakeholder completion rate, feedback response or research finding. Empty templates produce `NoResults`; no dashboard evaluation score has been populated.

## Next actions in order

1. Present the prepared beneficiary review brief through the group's adviser/authorized parish route. Record the actual beneficiary/scope/coordinator decision and conditions. Do not contact or recruit participants based on a pending request.
2. Obtain the authoritative workflow comparator, school research determination, approved consent/task/feedback versions, storage/retention/withdrawal plan and eventual schedule. The supplied drafts are review material only.
3. Choose and authorize a controlled sending domain/provider/key, configure backend-only mail secrets and perform controlled inbox acceptance. Keep mail disabled until the isolated acceptance setup is authorized; never paste keys into chat or the repository.
4. Resolve the local connection restriction and execute the Worker recovery harness. Retain actual results for D1 transactions and after-response delivery; fix any application failure before native acceptance.
5. Approve a real trusted HTTPS test API and signing/source-upload plan. Create an internally distributed Android build only after the specific build/signing approval; no public tunnel, source upload, membership purchase or deployment is inferred. Resolve iOS membership/signing/APNs or obtain an explicit adviser scope decision while retaining the limitation.
6. Install approved builds on the two phones and execute the native matrix with redacted evidence. Fix critical/high findings and obtain sign-off for the exact pilot platform/build.
7. Once every pilot gate is satisfied, the authorized coordinator conducts matched, counterbalanced manual/app sessions and records real elapsed time, independent/assisted completion, errors, unexpected document rework and item-level feedback. Validate and report descriptive results with missing/withdrawn/unpaired observations visible.

**Current stakeholder-pilot result: NoResults / not conducted. Current Android and iOS native acceptance: NotRun. The system is not being declared production-ready or accepted by its beneficiary.**

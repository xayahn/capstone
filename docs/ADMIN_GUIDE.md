# ParishLink Internal Admin Portal Guide

## 1. Audience and authority

The internal web portal is for authorized **parish staff, clergy/priest, and system administrators**. Parishioners use the mobile application. Each portal action remains subject to server-side role, parish/resource scope, workflow state, and approved parish/canonical policy.

The portal supports coordination; it does not transfer canonical authority to software or to a technical administrator. Prototype checklists, office hours, certificate actions, and illustrative evaluation values are not approved operational truth until validated.

## 2. Sign-in and security

1. Open only the approved HTTPS portal address.
2. Sign in with your named internal account and complete MFA.
3. Confirm the displayed role and effective parish scope before work.
4. Lock/sign out when leaving the device. Never share an account or approval token.
5. Reauthenticate when prompted for high-risk configuration, export, or access.

If scope is wrong, stop and contact an authorized system administrator. Do not work around the restriction through another account or exported copy.

## 3. Roles at a glance

- **Parish staff:** operational work for assigned parish(es), including appointment/document/queue tasks enabled by policy.
- **Clergy/priest:** own assignments and authorized appointment/canonical decisions within assigned scope.
- **System administrator:** vicariate configuration, account/membership administration, deployment/support, and approved reports. This role is not automatic permission to inspect highly restricted documents or make sacramental decisions.

See [`RBAC.md`](RBAC.md) for the authoritative matrix.

## 4. Dashboard

The dashboard summarizes scoped work: upcoming appointments, document review, conflicts/attention items, live queue, notifications, schedules, and system signals where permitted.

- Filters must show the current parish/time zone and should persist only within the session as approved.
- Counts link to the underlying filtered records; totals are not a substitute for reviewing details.
- A conflict, audit, scanner, or provider warning is investigated before continuing the affected action.
- Demonstration data is visibly labeled. Evaluation cards show “No validated results” until actual approved responses exist.

## 5. Appointment review

1. Open **Appointments** and apply parish, service, date, status, or reference filters.
2. Open the request and verify identity/contact only to the extent required by approved procedure.
3. Review service, local date/time, clergy, venue, participants, checklist version, document states, notes, and event history.
4. Resolve any conflict/closure warning; never override by editing a client value.
5. Perform only an allowed transition. Enter a clear, respectful, non-sensitive reason when requesting changes, rejecting, cancelling on behalf of a user, or overriding policy.
6. Confirm the new state/event and notification before leaving.

Approval is blocked until required preconditions are met, unless the actor has a specifically approved override permission. Final eligibility and canonical decisions remain with the authorized parish/clergy role. A system administrator should not approve merely to clear a technical queue.

### Rescheduling

Use the reschedule workflow so the backend rechecks duration, buffers, clergy, venue, availability, closures, and cross-parish commitments. Do not manually edit timestamps in storage. If two requests conflict, coordinate with authorized parish/clergy staff; never silently cancel one.

## 6. Document review

1. Open **Documents** from the scoped queue or appointment.
2. Confirm the appointment and exact checklist requirement.
3. Open the private, time-limited viewer. Do not download unless the approved procedure requires it.
4. Check readability and the approved pre-validation rule. Automated scanning/OCR does not decide acceptance.
5. Choose **Verified** or **Needs replacement**. For replacement, provide a concise note that helps the parishioner without exposing sensitive values in notification text.
6. Confirm reviewer/time/history and close the view.

Do not copy files into personal drives, chat, email, screenshots, or issue trackers. If a file appears malicious, unrelated, or misdirected, leave it unverified and follow the privacy/security escalation path. Pre-validation is not official archival verification or sacramental eligibility.

## 7. Walk-in queue

### Issue a ticket

Select the parish/service and enter only the minimum name/identifier needed by approved operations. An account or mobile device is optional. Confirm the ticket number and give a readable copy/display.

### Call and complete

- Select the correct counter and **Call next**; the server applies approved ordering atomically.
- Confirm the ticket before serving and mark **Served** only after completion.
- Cancel with an appropriate reason when necessary.
- Priority changes require an approved reason and audit. Do not use informal labels that disclose sensitive circumstances on public displays.

During an outage, use the approved manual sequence and later reconcile it; do not operate a separate untracked digital list.

## 8. Clergy, venue, and availability management

- Maintain active clergy profiles, approved parish memberships, venues, duration/buffers, availability, closures, and assignments.
- Store schedules in the system with the correct `Asia/Manila` display and explicit start/end.
- Cross-parish conflicts are not ignored. The same interval rule applies to appointments and assignments.
- Recurring rules are reviewed for generated instances and exceptions.
- Changes record actor/time/reason and notify affected parties according to policy.

Clergy can view/manage only their own or expressly authorized assignments; staff scope follows parish membership; system administrators configure but do not invent operational availability.

## 9. Parish and sacramental working records

1. Search only for an approved operational purpose and within scope.
2. Confirm parish, record type, subject, event date, archive reference/provenance, and current status.
3. New/imported entries start as **Working copy**.
4. An authorized custodian may mark **Verified against archive**, recording verifier/time/reference.
5. Corrections append a reason/history; do not erase the prior provenance.

Until DEC-006 is approved and issuance controls are active, any print/export is visibly non-official. Do not imply a technical database row replaces the official Church archive, seal, signature, or canonical process.

## 10. Announcements and notifications

1. Create a draft with a concise title/body.
2. Select parish-only or vicariate audience according to permission.
3. Review safe wording, links, publication/expiry, accessibility, and privacy.
4. Preview narrow/mobile presentation and publish/schedule.
5. Confirm audit and delivery; correct through a new version/update rather than hiding material errors.

Never paste raw HTML/scripts, uploaded-document detail, private appointment information, or unapproved emergency claims. Push previews are intentionally non-sensitive; the authenticated app contains details.

## 11. Reports and evaluation

Operational reports use scoped authoritative data and identify filters, local time zone, generation time, and source. Exports are purpose-limited, minimized, protected, and audited.

ISO/IEC 25010 reports may use only actual consented responses from the validated instrument. The source appendix is missing, and no planned evaluation is assumed complete. If there are no valid responses, report **No validated results**. Do not copy prototype scores or invent Chapter IV/V findings.

## 12. Gemini configuration and support

The assistant uses approved public guidance only. Authorized technical users may update/version the approved content and safety configuration after parish/clergy/privacy review. Never grant it access to uploaded files, private record content, workflow mutation, credentials, or eligibility decision tools. Test approved questions, prohibited requests, prompt injection, sensitive-content redaction, timeouts, quota, and deterministic fallback after every relevant change.

## 13. System administration

Authorized system administrators may:

- invite/disable internal users and maintain parish memberships with approval;
- configure environments/providers/feature flags through protected mechanisms;
- manage approved parish/service/checklist technical publication;
- review audit/security/health signals and perform controlled support;
- execute approved migrations, backups/restores, retention, and incident procedures.

High-risk access/configuration/export/disposal uses reauthentication and recommended dual review. Never edit production data directly to bypass a workflow. Use versioned tools/migrations and preserve an audit/correction event.

## 14. Common exceptions

| Situation | Action |
|---|---|
| Slot conflict appears | Pause decision, inspect clergy/venue intervals across parishes, coordinate authorized resolution |
| Document scanner delayed | Keep file quarantined; do not verify/bypass; inform parishioner safely |
| Parishioner disputes status | Review event/audit history; correct through authorized transition with reason |
| Wrong parish scope | Stop; request membership correction; do not export/share across parishes |
| Queue counters duplicate/skip | Pause calling, preserve ticket history, follow queue incident playbook |
| Gemini gives unsafe/irrelevant output | Disable feature/fallback, retain redacted evidence, escalate; no business state is affected |
| Record/certificate authority is unclear | Keep working-copy label and refer to records custodian/clergy |
| Suspicious access or file | Stop access, preserve safe evidence, contact security/DPO via approved channel |

## 15. End-of-session checklist

- Confirm pending work has correct owner/state and no file remains open/downloaded unnecessarily.
- Close private viewers and exported files according to policy.
- Verify consequential actions appear in history/audit.
- Sign out/lock the device.
- Report unexpected permissions, data, or failures with safe correlation information—never credentials or document content.

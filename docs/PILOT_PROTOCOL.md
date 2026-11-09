# ParishLink Stakeholder Pilot Protocol

**Status:** Draft for coordinator, ethics/privacy, and parish review. No approval, recruitment, consent, participant session, or result is implied by this document.  
**Purpose:** Evaluate feasibility and usability with measurable task evidence while protecting participants and avoiding real sacramental records.

## 1. Authorization gate

No human pilot activity may begin until every row below has an accountable owner, written evidence, and status **Approved**. Blank means pending, not approved.

| Gate | Required evidence | Owner | Status | Evidence reference/date |
|---|---|---|---|---|
| Sponsor/coordinator authority | Named coordinator and written authority to run the pilot |  |  |  |
| Participating parishes | Written permission and approved locations/workflows |  |  |  |
| Ethics determination | Institutional ethics approval, exemption, or documented determination |  |  |  |
| Privacy/security review | Synthetic dataset, collection fields, storage, access, retention, incident path |  |  |  |
| Instrument approval | Final task script, observation rubric, feedback instrument, language/accessibility review |  |  |  |
| Consent approval | Approved participant information and consent version |  |  |  |
| Participant plan | Adult eligibility, role quotas, recruitment method, compensation, withdrawal path |  |  |  |
| Technical readiness | Approved build/API, test accounts, reset procedure, monitoring, rollback, device/network plan |  |  |  |
| Native acceptance prerequisite | Required tests from [`NATIVE_ACCEPTANCE.md`](NATIVE_ACCEPTANCE.md) passed for the pilot platform/build |  |  |  |
| Schedule | Approved dates, rooms, facilitators, observers, and contingency |  |  |  |

The coordinator records decisions in a controlled project record. This repository supplies templates only and is not the approval system.

## 2. Research boundary

This is a **formative pilot**, not a representative population survey or proof of causal impact. It may identify usability problems, workflow feasibility, and measured differences for the tested participants and synthetic tasks. It must not be described as proving that ParishLink reduces processing time across all parishes or is accepted by all users.

Use only matched synthetic cases. Do not enter real names, contact details, document numbers, sacramental records, certificates, canonical determinations, or live parish appointments. Do not recruit, contact, or schedule anyone until the authorization gate is complete.

## 3. Eligible participants

Participants must be adults aged 18 or older, able to consent, and meet a role-specific criterion:

| Role | Eligibility | Permitted scored tasks |
|---|---|---|
| Parishioner | Has relevant experience requesting or inquiring about parish services; no real current request is required | Service discovery, appointment request, document-status/replacement, queue/status, recovery/logout |
| Parish staff | Performs or directly understands appointment, document, queue, or record workflows for an authorized parish | Appointment/document review, queue, announcement, scoped record lookup |
| Clergy/priest | Performs or authorizes relevant scheduling/service decisions | Assignment/conflict review and authorized decision workflow |
| System administrator | Authorized to evaluate configuration/support workflows | Account/scope review, operational diagnostics, audit/report workflow |

Exclude minors, anyone unable to provide informed consent under the approved process, project-team members from end-user outcome estimates, and participants whose role does not match a task. Accessibility needs are accommodated rather than treated as exclusion where feasible. A participant may withdraw without penalty; already collected data follows the approved consent/retention decision.

The coordinator must set role/parish targets based on the pilot purpose and availability. Do not use Slovin's formula or claim sampling precision for this purposive pilot. Prior experience may be recorded only as an approved broad code (for example, no/limited/frequent use), never as narrative employment or parish history that could identify a person.

## 4. Study design

### 4.1 Matched manual and app conditions

Each scored comparison uses the same synthetic case content in two modes:

- **Manual:** an approved replica of the current paper/logbook/form/office workflow, never a real operational record.
- **App:** the approved ParishLink build and synthetic account.

Cases must be equivalent in difficulty but use different synthetic names/references to reduce recall. The coordinator validates that the manual comparator reflects the intended parish workflow. Do not pool unlike tasks or compare backend latency with human completion time.

### 4.2 Counterbalanced order

Assign participants before the session:

- **AB:** manual first, app second.
- **BA:** app first, manual second.

Allocate AB/BA as evenly as practical within each role. Record the assigned group and actual sequence. Report imbalances; do not silently reorder a participant after observing performance.

### 4.3 Practice versus scored work

Provide a short orientation and at least one synthetic **practice** task that does not reuse a scored case. The recorder reserves task identifiers starting `PR_` for separate practice definitions; these cannot be scored. Mark practice rows `practice=true`; exclude them from outcome summaries. The facilitator may explain navigation during practice. During scored work, assistance is limited to the approved rescue rule and is counted.

## 5. Task catalogue

The coordinator approves a role-appropriate subset and completes `research/pilot/task_catalog_template.csv`. Suggested identifiers are planning prompts, not approved tasks:

| Task ID | Role | Matched outcome |
|---|---|---|
| P01_SERVICE | Parishioner | Find the correct parish/service guidance and requirement source |
| P02_BOOK | Parishioner | Submit the specified synthetic appointment request |
| P03_DOCUMENT | Parishioner | Locate a replacement request and submit the approved synthetic file |
| P04_STATUS | Parishioner | Identify authoritative appointment status and next action |
| P05_RECOVERY | Parishioner | Complete the approved synthetic account-recovery and secure logout flow |
| S01_REVIEW | Parish staff | Review a synthetic appointment and request a document replacement |
| S02_QUEUE | Parish staff | Issue, call, and complete a synthetic walk-in ticket |
| S03_ANNOUNCE | Parish staff | Prepare a scoped synthetic announcement without publishing real content |
| C01_CONFLICT | Clergy | Identify a clergy/venue conflict and select the authorized safe action |
| A01_SCOPE | System administrator | Diagnose a synthetic role/parish-scope issue without exposing records |

Every task script states starting state, goal, allowed materials, success criteria, maximum duration, rescue rule, reset procedure, and data fields. Do not test official sacramental eligibility or ask participants to make real canonical decisions.

## 6. Measurement definitions

### 6.1 Timestamps and duration

- `started_at`: UTC instant when the facilitator says “Begin” and the participant first receives the scored task.
- `stopped_at`: UTC instant when success is confirmed, the maximum time expires, or the task is cancelled/excluded.
- `wall_seconds`: duration from the recorder's monotonic clock, stored to three decimal places and checked against the UTC timestamps. This is timer precision, not a claim of millisecond accuracy for a human observer.
- `excluded_pause_seconds`: documented time when the participant could not act because of a facilitator interruption, approved break, or external test-environment outage. Ordinary thinking, navigation, reading, mistakes, and expected loading are not excluded.
- `user_elapsed_seconds`: `wall_seconds - excluded_pause_seconds`.
- `backend_processing_ms`: instrumented server time for a named request only. Leave blank for manual work or when trustworthy instrumentation is unavailable. Never add it to or substitute it for user elapsed time.

Record actual timestamps, not retrospectively invented durations. Device clocks and the observer timer must be checked before sessions.

### 6.2 Outcomes

| Outcome | Definition |
|---|---|
| `Completed` | Success criteria met without scored assistance |
| `CompletedWithAssistance` | Success criteria met after one or more approved rescue interventions |
| `NotCompleted` | Participant reaches time limit or ends without success |
| `Cancelled` | Participant withdraws or session stops for a participant/safety reason; reason required |
| `Excluded` | Environment/protocol failure makes the observation invalid; reason required and preserved |

Report completion both as unassisted (`Completed`) and total successful (`Completed` + `CompletedWithAssistance`). Do not convert cancelled/excluded tasks into failures.

### 6.3 Errors, assistance, and rework

- **User error:** an observable action inconsistent with the task that produces a rejection, wrong state/result, or necessary backtrack. Repeated taps with no state change count once per episode.
- **System error:** crash, incorrect application/server response, unavailable required function, or data inconsistency attributable to ParishLink, excluding a separately recorded network failure.
- **Operator error:** facilitator/observer/test-data/reset action that changes or invalidates the task. It is not a participant error.
- **Network failure:** connectivity, DNS, TLS, or approved test-endpoint failure. It is not a participant or application error unless evidence specifically shows application mishandling.
- **Assistance:** facilitator guidance beyond repeating the task wording or resolving an approved environment issue. Count each distinct rescue intervention.
- **Document rework:** an additional reviewer-return/resubmission cycle caused by a document failing the stated acceptance rule during the measured task. A task deliberately starting with a pre-existing “needs replacement” state tests the normal replacement workflow and begins at zero rework; count only a new return after the participant's measured submission. Synthetic file quality and rule must be identical across matched cases.

Observers use predefined codes and concise redacted notes. Disagreements are resolved through the approved adjudication process without rewriting original observations.

## 7. Session procedure

1. Confirm authorization version, participant eligibility, adult status, and approved consent; assign a pseudonymous ID. Do not record name, email, phone, address, sacramental data, or document number in pilot CSVs.
2. Record role/parish code, counterbalance group, device/build/network profile, and accessibility accommodation without identifying the person.
3. Deliver neutral orientation and unscored practice.
4. Run the approved manual/app sequence. Reset synthetic state between cases.
5. Record timestamps, outcome, errors, assistance, rework, and environment incidents contemporaneously.
6. Administer only the approved feedback instrument. Remind the participant not to enter personal or sacramental information in comments.
7. Debrief, explain contact/withdrawal procedures, revoke test access where applicable, and securely transfer records to the approved storage.
8. Log deviations and adverse/privacy/security events; pause the pilot when the stop rule is met.

## 8. Stop and exclusion rules

Pause new sessions for suspected personal-data entry, account/scope exposure, unsafe document access, repeated system corruption, unavailable consent/approval evidence, or a defect that invalidates multiple tasks. The coordinator/privacy/security owner decides resumption. Exclude an observation only for a predefined reason; retain it in counts and explain the exclusion.

## 9. Data files

Copy the blank templates from `research/pilot/` into a separately controlled data directory:

- `participants_template.csv` -> `participants.csv`
- `task_catalog_template.csv` -> `task_catalog.csv`
- `task_observations_template.csv` -> `task_observations.csv`
- `feedback_template.csv` -> `feedback.csv`
- `native_acceptance_template.csv` -> `native_acceptance.csv`

The repository templates contain no participants or results. Actual pilot data must not be committed. Use pseudonymous IDs and approved coded parish/device/observer identifiers. Free text must be redacted before storage.

## 10. Analysis and reporting

Use `research/pilot/validate_and_summarize.mjs` to validate structure and produce a descriptive summary. Report aggregate mode results first. Role/task/parish breakdowns may be released only under the approved disclosure rule and minimum cell size; small clergy or parish cells can be identifying and must otherwise remain suppressed. Within the approved disclosure boundary report:

- eligible participant and observation counts;
- unassisted and total completion counts/rates;
- median user elapsed time with observed range;
- backend processing time separately where instrumented;
- total user errors, system errors, assistance, and document rework;
- valid paired cases and median within-pair app-minus-manual elapsed difference;
- cancelled, excluded, missing, and unpaired observations;
- feedback item counts/medians and redacted themes, if the instrument is approved.

Do not invent values, convert blanks to zero, silently drop failures, infer statistical significance from a small pilot, or claim causality, representativeness, population precision, or production readiness. An empty dataset reports `NoResults`. Preserve a blank results section until data and approvals exist. The pseudonym-to-identity/contact mapping, if recruitment requires one, remains coordinator-restricted outside Git and outside the analysis dataset.

## 11. Results status

**Authorization:** Pending  
**Participants:** None recorded  
**Sessions:** Not run  
**Human pilot data:** None  
**Results:** None

The coordinator completes these fields only from retained evidence.

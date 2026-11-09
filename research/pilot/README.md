# ParishLink Pilot Data Kit

This folder contains blank, non-production templates, an approval-gated local task recorder, and a validator for [`docs/PILOT_PROTOCOL.md`](../../docs/PILOT_PROTOCOL.md). It contains no participant approval, consent, personal data, completed participant session, or pilot result. No stakeholder pilot has been executed.

## Files

- `AUTHORIZATION_CHECKLIST.md` — blank decision/evidence register
- `COORDINATOR_BRIEFING.md` — neutral session briefing
- `CONSENT_DRAFT.md` — unapproved adult consent draft
- `BENEFICIARY_APPROVAL_BRIEF.md` — prepared beneficiary review brief, not sent
- `DRAFT_FEEDBACK_INSTRUMENT.md` — neutral candidate items and scoring limits, pending approval
- `approval_manifest.template.json` — pending template only; it is not approval
- `participants_template.csv` — pseudonymous participant/session attributes
- `task_catalog_template.csv` — approved task definitions and success criteria
- `task_observations_template.csv` — manual/app timestamps and outcomes
- `feedback_template.csv` — approved item responses and redacted comments
- `native_acceptance_template.csv` — physical-device evidence rows
- `record-task.mjs` — interactive UTC/monotonic stopwatch and guarded observation recorder
- `validate_and_summarize.mjs` — dependency-free structural validation and descriptive summary
- `.rehearsal.json` — recorder-created marker inside a rehearsal session; never copy it into participant data
- `tests/validate_and_summarize.test.mjs` — synthetic validator tests only
- `tests/record-task.test.mjs` — synthetic recorder authorization/clock/output tests only

## Use

1. Complete every authorization, privacy/retention, consent, instrument, parish, coordinator, and native-acceptance gate outside the repository and retain the real evidence. The coordinator must approve the coded adult roster, task catalogue, matched synthetic cases, and success/rescue rules before a participant session.
2. Create a protected session subdirectory at `research/pilot/data/<session>`. This directory and `research/pilot/rehearsal/` are Git-ignored; that does not replace access control, encryption, retention, or secure disposal.
3. Copy the header-only templates into the session and use these exact names: `participants.csv`, `task_catalog.csv`, `task_observations.csv`, `feedback.csv`, and `native_acceptance.csv`. Populate only the coordinator-approved coded roster and task catalogue; keep result files blank until an observation actually occurs.
4. Copy `approval_manifest.template.json` to `research/pilot/data/<session>/approval.json`. Replace `Pending` only after entering the real approval/reference codes, UTC approval and expiry instants, authorized parish/task codes, consent/instrument versions, coordinator code, and native-acceptance reference. The template, a blank field, a placeholder, or an anticipated approval never authorizes collection.
5. Use pseudonymous codes only. Never enter names, emails, phone numbers, addresses, document numbers, sacramental records, credentials, or tokens. Any recruitment identity-to-code mapping remains coordinator-restricted outside Git and outside this data directory.
6. Validate the prepared session from the repository root:

   ```text
   node research/pilot/validate_and_summarize.mjs --input research/pilot/data/<session> --out <protected-summary.json>
   ```

7. Run an approved participant task only from an interactive coordinator terminal:

   ```text
   node research/pilot/record-task.mjs --data research/pilot/data/<session> --participant PT-XXXX --task P02_BOOK --mode Manual --observer OBS_CODE [--practice]
   ```

   The recorder checks the approved manifest, coded participant/task eligibility, consent/instrument versions, counterbalanced sequence, matched case, prior scored rows, and session location before timing. A `--practice` row is retained as practice and excluded from scored summaries.
8. Use the prompt commands `status`, `pause REASON_CODE`, `resume`, `stop`, or `cancel`. Pause only for a pre-approved excluded interval; ordinary user, app, provider, or network waiting remains part of elapsed time. Enter observed outcome, separate error/failure/assistance/rework counts, and measured backend time only after the task stops. Blanks are not zeros.
9. Treat the session lock and unfinished journal as evidence safeguards. They prevent concurrent recording and block an unfinished rerun. If interrupted, retain both and have the coordinator reconcile the dropout/exclusion; do not delete, overwrite, or silently repeat the observation.
10. Validate again before any descriptive analysis. Treat validation as data-quality checking, not ethical approval, statistical significance, causal evidence, representative evidence, native acceptance, or a successful pilot.

## Synthetic rehearsal

Rehearsal is only for exercising the recorder with synthetic data. Create and prepare a separate ignored directory under `research/pilot/rehearsal/<session>`, then use the same coded files with `--rehearsal`:

```text
node research/pilot/record-task.mjs --rehearsal --data research/pilot/rehearsal/<session> --participant PT-XXXX --task P02_BOOK --mode Manual --observer OBS_CODE [--practice]
```

The recorder writes `.rehearsal.json`; the validator classifies rows as `RehearsalOnly`/`SyntheticRehearsal`. Rehearsal output must never be copied into `data/`, merged with participant observations, or reported as stakeholder evidence.

By default, role/task breakdowns are suppressed. Use `--min-group-size <approved-number>` only when the protocol owner has approved a disclosure threshold; the tool still suppresses smaller cells.

Run the synthetic unit tests from the repository root with:

```text
node --test research/pilot/tests/validate_and_summarize.test.mjs research/pilot/tests/record-task.test.mjs
```

Do not commit filled data, rehearsal output, journals, approval files, or generated summaries.

Owner update on 2026-11-08: no pilot approval yet; beneficiary approval is awaited. Both phones are available without test builds, and no email provider or sender domain exists. No stakeholder results have been collected.

Practice requires separate approved `PR_` task IDs and different case content from every scored case. The recorder refuses to score a `PR_` task. Fill `pause_reason_codes` in the manifest to allow specific exclusions; an empty list permits no pauses. Normal reading, navigation and app/network waiting stay timed. Fill approved cancellation/exclusion codes before a real session. Withdrawal is always honored; unresolved observations remain for coordinator reconciliation.

The recorder stores three decimal places of timer precision and checks UTC timestamps; this does not imply millisecond accuracy for a human observer. It records an elapsed task limit as NotCompleted, including a stop command at/after the limit. Feedback is summarized by approved item/mode under disclosure thresholds, without a pooled ISO score. A skipped technical test is not a passed acceptance case.

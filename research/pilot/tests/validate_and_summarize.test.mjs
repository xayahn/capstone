import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateAndSummarize } from '../validate_and_summarize.mjs';

const participantsHeader = 'participant_id,role,parish_code,prior_experience_code,age_18_plus,eligibility_confirmed,consent_status,consent_version,counterbalance_group,device_code,build_version,network_profile,withdrawn';
const catalogHeader = 'task_id,role,title_code,manual_case_id,app_case_id,success_criteria_code,max_seconds,rescue_rule_code,instrument_version,approval_status';
const observationsHeader = 'participant_id,task_id,case_id,mode,sequence_order,practice,started_at,stopped_at,wall_seconds,excluded_pause_seconds,user_elapsed_seconds,backend_processing_ms,outcome,timeout_reached,user_error_count,system_error_count,operator_error_count,network_failure_count,assistance_count,document_rework_count,exclusion_reason,observer_code,notes_redacted';
const feedbackHeader = 'participant_id,task_id,mode,instrument_version,item_id,rating_1_to_4,comment_redacted,submitted_at';
const nativeHeader = 'test_id,platform,device_code,os_version,build_version,api_environment,network_profile,account_role,evidence_status,evidence_reference,executed_at,executor_code,defect_id,notes_redacted';

async function fixture({ observations, feedback = '', native = '', participants, rehearsalMarker } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'parishlink-pilot-'));
  const participantRows = participants ?? 'PT-A001,parishioner,P01,LIMITED,true,true,Consented,CV1,AB,D01,B1,WiFi,false';
  const writes = [
    writeFile(path.join(directory, 'participants.csv'), `${participantsHeader}\n${participantRows}\n`),
    writeFile(path.join(directory, 'task_catalog.csv'), `${catalogHeader}\nP02_BOOK,parishioner,BOOK,M01,A01,SC01,300,RR01,IV1,Approved\n`),
    writeFile(path.join(directory, 'task_observations.csv'), `${observationsHeader}\n${observations}\n`),
    writeFile(path.join(directory, 'feedback.csv'), `${feedbackHeader}\n${feedback}\n`),
    writeFile(path.join(directory, 'native_acceptance.csv'), `${nativeHeader}\n${native}\n`),
  ];
  if (rehearsalMarker) writes.push(writeFile(path.join(directory, '.rehearsal.json'), `${JSON.stringify(rehearsalMarker)}\n`));
  await Promise.all(writes);
  return directory;
}

const validPair = [
  'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:02:00Z,120,0,120,,Completed,false,1,0,0,0,0,0,,OB01,',
  'PT-A001,P02_BOOK,A01,App,2,false,2026-11-07T01:05:00Z,2026-11-07T01:06:00Z,60,0,60,350,CompletedWithAssistance,false,0,0,0,0,1,0,,OB01,',
].join('\n');

test('summarizes a valid matched manual/app pair descriptively', async () => {
  const feedback = 'PT-A001,P02_BOOK,App,IV1,U01,4,,2026-11-07T01:07:00Z';
  const result = await validateAndSummarize(await fixture({ observations: validPair, feedback }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.observations.paired.valid_pairs, 1);
  assert.equal(result.summary.observations.paired.median_app_minus_manual_seconds, -60);
  assert.equal(result.summary.observations.by_mode.App.completed_total, 1);
  assert.equal(result.summary.observations.by_role.status, 'SuppressedPendingApprovedMinimum');
  assert.equal(result.summary.observations.by_task.status, 'SuppressedPendingApprovedMinimum');
  assert.equal(result.summary.participants.by_role.status, 'SuppressedPendingApprovedMinimum');
  assert.equal(result.summary.feedback.by_item_and_mode.status, 'SuppressedPendingApprovedMinimum');
  assert.equal(Object.hasOwn(result.summary.feedback, 'median_rating_by_mode'), false);
});

test('retains an unpaired observation as a visible warning', async () => {
  const observations = 'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:01:00Z,60,0,60,,NotCompleted,true,2,0,0,0,0,0,,OB01,';
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.observations.paired.missing_or_duplicate_pairs, 1);
  assert.match(result.warnings.join('\n'), /Unpaired/);
});

test('keeps cancelled and excluded rows out of scored pairs and mode denominator', async () => {
  const observations = [
    'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:00:30Z,30,0,30,,Cancelled,false,0,0,0,0,0,0,ParticipantWithdrawal,OB01,',
    'PT-A001,P02_BOOK,A01,App,2,false,2026-11-07T01:05:00Z,2026-11-07T01:05:20Z,20,20,0,0,Excluded,false,0,1,0,1,0,0,EnvironmentFailure,OB01,',
  ].join('\n');
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.observations.cancelled, 1);
  assert.equal(result.summary.observations.excluded, 1);
  assert.equal(result.summary.observations.by_mode.Manual.observations, 0);
  assert.equal(result.summary.observations.paired.valid_pairs, 0);
});

test('rejects inconsistent elapsed duration', async () => {
  const observations = 'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:01:00Z,60,10,60,,Completed,false,0,0,0,0,0,0,,OB01,';
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /must equal wall_seconds minus excluded pause/);
});

test('rejects negative error counts', async () => {
  const observations = 'PT-A001,P02_BOOK,A01,App,2,false,2026-11-07T01:00:00Z,2026-11-07T01:01:00Z,60,0,60,200,Completed,false,-1,0,0,0,0,0,,OB01,';
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /user_error_count must be a non-negative integer/);
});

test('rejects direct email-like identifiers', async () => {
  const observations = 'PT-A001,P02_BOOK,A01,App,2,false,2026-11-07T01:00:00Z,2026-11-07T01:01:00Z,60,0,60,200,Completed,false,0,0,0,0,0,0,,OB01,person@example.com';
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /appears to contain an email address/);
});

test('returns NoResults for structurally valid empty data without inventing zero metrics', async () => {
  const result = await validateAndSummarize(await fixture({ participants: '', observations: '' }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.status, 'NoResults');
  assert.equal(result.summary.data_classification, 'UnmarkedPilotData');
  assert.deepEqual(result.summary.observations, { status: 'NoResults', total: 0 });
});

test('requires explicit UTC Z timestamps rather than local offsets', async () => {
  const observations = 'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T09:00:00+08:00,2026-11-07T09:01:00+08:00,60,0,60,,Completed,false,0,0,0,0,0,0,,OB01,';
  const result = await validateAndSummarize(await fixture({ observations }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /UTC ISO start\/stop timestamps are required/);
});

test('rejects duplicate scored participant task mode rows', async () => {
  const duplicate = [
    'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:01:00Z,60,0,60,,Completed,false,0,0,0,0,0,0,,OB01,',
    'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:02:00Z,2026-11-07T01:03:00Z,60,0,60,,Completed,false,0,0,0,0,0,0,,OB01,',
  ].join('\n');
  const result = await validateAndSummarize(await fixture({ observations: duplicate }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /duplicate scored participant\/task\/mode row/);
});

test('classifies marked synthetic observations as RehearsalOnly', async () => {
  const marker = { kind: 'SyntheticRehearsal', created_at: '2026-11-07T02:00:00Z' };
  const result = await validateAndSummarize(await fixture({ observations: validPair, rehearsalMarker: marker }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.status, 'RehearsalOnly');
  assert.equal(result.summary.data_classification, 'SyntheticRehearsal');
  assert.match(result.summary.limitations.join('\n'), /must never be reported as human participant outcomes/);
});

test('keeps empty marked rehearsal data as NoResults with classification', async () => {
  const marker = { kind: 'SyntheticRehearsal', created_at: '2026-11-07T02:00:00Z' };
  const result = await validateAndSummarize(await fixture({ participants: '', observations: '', rehearsalMarker: marker }));
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.status, 'NoResults');
  assert.equal(result.summary.data_classification, 'SyntheticRehearsal');
});

test('suppresses a participant role cell below an approved minimum', async () => {
  const result = await validateAndSummarize(
    await fixture({ observations: validPair }),
    { minimumGroupSize: 2 },
  );
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(result.summary.participants.by_role.status, 'Applied');
  assert.equal(result.summary.participants.by_role.suppressed_group_count, 1);
  assert.deepEqual(result.summary.participants.by_role.groups, {});
  assert.equal(Object.hasOwn(result.summary.participants.by_role, 'parishioner'), false);
});

test('rejects a rehearsal marker whose creation time is not explicit UTC Z', async () => {
  const marker = { kind: 'SyntheticRehearsal', created_at: '2026-11-07T10:00:00+08:00' };
  const result = await validateAndSummarize(await fixture({ observations: validPair, rehearsalMarker: marker }));
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /created_at must be an explicit UTC Z timestamp/);
});

test('does not report success after the approved task duration', async () => {
  const observations = 'PT-A001,P02_BOOK,M01,Manual,1,false,2026-11-07T01:00:00Z,2026-11-07T01:05:00Z,300,0,300,,Completed,false,0,0,0,0,0,0,,OB01,';
  const result = await validateAndSummarize(await fixture({ observations })); assert.equal(result.valid, false); assert.match(result.errors.join('\n'), /reached the task limit/);
});
test('rejects duplicate or unapproved-version feedback instead of overweighting it', async () => {
  const line = 'PT-A001,P02_BOOK,App,IV1,U01,4,,2026-11-07T01:07:00Z';
  const duplicate = await validateAndSummarize(await fixture({ observations: validPair, feedback: `${line}\n${line}` })); assert.equal(duplicate.valid, false); assert.match(duplicate.errors.join('\n'), /duplicate.*feedback/);
  const version = await validateAndSummarize(await fixture({ observations: validPair, feedback: line.replace('IV1', 'IV2') })); assert.equal(version.valid, false); assert.match(version.errors.join('\n'), /instrument_version differs/);
});
test('practice cannot reuse a scored task identifier', async () => {
  const observations = validPair.replaceAll(',false,', ',true,'); const result = await validateAndSummarize(await fixture({ observations })); assert.equal(result.valid, false); assert.match(result.errors.join('\n'), /separate PR_/);
});

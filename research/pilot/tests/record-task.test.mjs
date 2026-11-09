import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, writeFile, readFile, link, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { authorize, TaskClock, makeObservation, csvRow, recordCommands, sessionFile, readSessionFile, writeSessionFile, assertReconciledJournals, canonicalDataDirectory } from '../record-task.mjs';
import { HEADERS, parseCsv } from '../validate_and_summarize.mjs';

const participant = { participant_id: 'PT-TEST', role: 'parishioner', parish_code: 'P01', age_18_plus: 'true', eligibility_confirmed: 'true', consent_status: 'Consented', consent_version: 'C1', counterbalance_group: 'AB', withdrawn: 'false', device_code: 'DEV_TEST', build_version: 'TEST_BUILD', network_profile: 'TEST_LAN', prior_experience_code: 'TEST_NOVICE' };
const task = { task_id: 'P02_BOOK', role: 'parishioner', approval_status: 'Approved', max_seconds: '600', manual_case_id: 'P02M01', app_case_id: 'P02A01', instrument_version: 'I1', title_code: 'TEST_BOOK', success_criteria_code: 'TEST_SUCCESS', rescue_rule_code: 'TEST_RESCUE' };
const approval = { status: 'Approved', approval_reference: 'TEST_APPROVAL', parish_authorization_reference: 'TEST_PARISH', institutional_ethics_or_exemption_reference: 'TEST_EXEMPTION', privacy_and_retention_reference: 'TEST_PRIVACY', coordinator_code: 'TEST_COORD', native_acceptance_reference: 'TEST_NATIVE', approved_at: '2026-01-01T00:00:00Z', valid_until: '2026-12-31T23:59:59Z', parish_codes: ['P01'], task_ids: ['P02_BOOK'], consent_version: 'C1', instrument_version: 'I1', synthetic_cases_only: true };
const args = () => ({ participant: { ...participant }, task: { ...task }, approval: structuredClone(approval), mode: 'Manual', observer: 'OBS_TEST', now: Date.parse('2026-11-07T00:00:00Z') });
const timing = { started_at: '2026-11-07T00:00:00.000Z', stopped_at: '2026-11-07T00:00:10.000Z', wall_seconds: '10.000', excluded_pause_seconds: '0.000', user_elapsed_seconds: '10.000' };
const metadata = () => ({ outcome: 'Completed', user_error_count: '0', system_error_count: '0', operator_error_count: '0', network_failure_count: '0', assistance_count: '0', document_rework_count: '0', backend_processing_ms: '', exclusion_reason: '' });

test('pending, expired, absent, unrelated and incomplete authorization cannot enable participant collection', () => {
  for (const update of [undefined, { status: 'Pending' }, { valid_until: '2026-01-02T00:00:00Z' }, { approved_at: '2027-01-01T00:00:00Z' }, { task_ids: [] }, { parish_codes: [] }, { consent_version: 'C2' }, { instrument_version: 'I2' }, { native_acceptance_reference: '' }, { synthetic_cases_only: false }]) {
    const value = args(); value.approval = update === undefined ? undefined : { ...value.approval, ...update }; assert.throws(() => authorize(value));
  }
});
test('participant collection requires active adult consent, eligible role and separate matched cases', () => {
  for (const update of [{ age_18_plus: 'false' }, { eligibility_confirmed: 'false' }, { consent_status: '' }, { withdrawn: 'true' }, { role: 'clergy' }, { participant_id: 'person@example.com' }]) {
    const value = args(); Object.assign(value.participant, update); assert.throws(() => authorize(value));
  }
  const value = args(); value.task.app_case_id = task.manual_case_id; assert.throws(() => authorize(value));
});
test('counterbalance determines mode sequence and rehearsal never establishes approval', () => {
  const value = args(); assert.equal(authorize(value).sequence_order, '1'); value.mode = 'App'; assert.equal(authorize(value).sequence_order, '2');
  value.participant.counterbalance_group = 'BA'; assert.equal(authorize(value).sequence_order, '1');
  value.rehearsal = true; value.approval = undefined; assert.equal(authorize(value).case_id, 'P02A01');
  value.rehearsal = false; assert.throws(() => authorize(value));
});
test('monotonic stopwatch preserves wall time and explicit pause deductions', () => {
  let tick = 0; const clock = new TaskClock(() => tick, () => new Date(Date.parse(timing.started_at) + tick).toISOString());
  clock.start(); tick = 3000; clock.pause('TEST_EXCLUSION'); tick = 7000; assert.equal(clock.elapsed(), 3); clock.resume(); tick = 10000;
  const result = clock.stop(); assert.equal(result.wall_seconds, '10.000'); assert.equal(result.excluded_pause_seconds, '4.000'); assert.equal(result.user_elapsed_seconds, '6.000'); assert.throws(() => clock.start()); assert.throws(() => clock.resume());
});
test('clock jump leaves an invalid observation unscored', () => {
  let tick = 0; let wall = timing.started_at; const clock = new TaskClock(() => tick, () => wall); clock.start(); tick = 10000; wall = '2026-11-07T00:20:10.000Z'; assert.throws(() => clock.stop(), /clock changed/);
});
test('outcomes cannot hide assistance, timeout or missing counts; backend latency stays separate', () => {
  const base = authorize(args());
  assert.throws(() => makeObservation(base, timing, { ...metadata(), assistance_count: '1' }, false));
  assert.throws(() => makeObservation(base, timing, { ...metadata(), user_error_count: '' }, false));
  assert.throws(() => makeObservation(base, timing, metadata(), true));
  assert.throws(() => makeObservation(base, timing, { ...metadata(), backend_processing_ms: '10' }, false));
  const row = makeObservation(base, timing, { ...metadata(), outcome: 'NotCompleted', network_failure_count: '1' }, true); assert.equal(row.timeout_reached, 'true'); assert.equal(row.network_failure_count, '1');
});
test('cancellation requires a reason and retains unknown counts as blanks', () => {
  const meta = { ...metadata(), outcome: 'Cancelled', user_error_count: '', document_rework_count: '' };
  assert.throws(() => makeObservation(authorize(args()), timing, meta, false)); meta.exclusion_reason = 'PARTICIPANT_STOP';
  const row = makeObservation(authorize(args()), timing, meta, false); assert.equal(row.user_error_count, ''); assert.equal(row.document_rework_count, '');
});
test('observation serializes exactly to the shared validator schema', () => {
  const row = makeObservation(authorize(args()), timing, metadata(), false);
  const parsed = parseCsv(`${HEADERS.observations.join(',')}\n${csvRow(row)}\n`); assert.deepEqual(parsed.headers, HEADERS.observations);
  for (const key of HEADERS.observations) assert.equal(parsed.records[0][key], row[key]);
});

test('practice uses a separate catalogue task and never becomes a scored task', () => {
  const value = args(); value.practice = true; assert.throws(() => authorize(value), /separate PR_/);
  value.task.task_id = 'PR_BOOK'; value.task.manual_case_id = 'PR_M01'; value.task.app_case_id = 'PR_A01'; value.approval.task_ids.push('PR_BOOK');
  assert.equal(authorize(value).practice, 'true'); value.practice = false; assert.throws(() => authorize(value), /cannot be scored/);
});
test('metadata cannot replace timing or identity and final elapsed enforces the timeout', () => {
  const base = authorize(args());
  assert.throws(() => makeObservation(base, timing, { ...metadata(), participant_id: 'PT-OTHER' }, false), /protected fields/);
  assert.throws(() => makeObservation(base, timing, metadata(), false, 10), /timeout/);
  assert.equal(makeObservation(base, timing, { ...metadata(), outcome: 'NotCompleted' }, true, 10).timeout_reached, 'true');
});
test('approval rejects normalized-invalid dates and identifying/formula-like case fields', () => {
  const value = args(); value.approval.approved_at = '2026-02-30T00:00:00Z'; assert.throws(() => authorize(value), /valid UTC/);
  value.approval = structuredClone(approval); value.task.app_case_id = '=HYPERLINK(1)'; assert.throws(() => authorize(value), /bounded/);
});

function commandFixture(extra = {}) {
  let tick = 0; let wallOffset = 0; let callback; let cleared = 0;
  const clock = new TaskClock(() => tick, () => new Date(Date.parse(timing.started_at) + tick + wallOffset).toISOString());
  clock.start(); const rl = new EventEmitter(); const journal = {}; const output = [];
  const promise = recordCommands({ clock, maximumSeconds: 10, rl, journal, saveJournal: async () => {}, output: text => output.push(text), interval: cb => { callback = cb; return 1; }, clear: () => { cleared++; }, ...extra });
  return { promise, rl, journal, clock, output, tick: value => { tick = value; }, jump: value => { wallOffset = value; }, interval: () => callback(), cleared: () => cleared };
}
test('stop captures the real boundary before the periodic timeout callback', async () => {
  const f = commandFixture(); f.tick(10001); f.rl.emit('line', 'stop');
  const row = await f.promise; assert.equal(row.timedOut, true); assert.equal(row.timing.user_elapsed_seconds, '10.001'); assert.equal(f.cleared(), 1); assert.equal(f.rl.listenerCount('line'), 0);
});
test('stop during a slow journal update does not lose the actual stop time', async () => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  const f = commandFixture({ saveJournal: () => pending }); f.tick(2000); f.rl.emit('line', 'status'); f.tick(3000); f.rl.emit('line', 'stop');
  f.tick(9000); release(); const row = await f.promise; assert.equal(row.timing.user_elapsed_seconds, '3.000'); assert.equal(row.timedOut, false);
});
test('timeout and cancellation preserve final measured time without a successful outcome', async () => {
  const f = commandFixture(); f.tick(10500); f.interval(); const result = await f.promise; assert.equal(result.timedOut, true); assert.equal(result.cancelled, false);
  const c = commandFixture(); c.tick(2500); c.rl.emit('line', 'cancel'); const cancel = await c.promise; assert.equal(cancel.cancelled, true); assert.equal(cancel.timedOut, false);
});
test('clock faults, journal failures and terminal closure reject rather than create a row', async () => {
  const f = commandFixture(); f.tick(1000); f.jump(60000); f.rl.emit('line', 'stop'); await assert.rejects(f.promise, /clock changed/);
  const e = commandFixture({ saveJournal: async () => { throw new Error('TEST_IO_FAILURE'); } }); e.rl.emit('line', 'status'); await assert.rejects(e.promise, /TEST_IO_FAILURE/);
  const c = commandFixture(); c.rl.emit('close'); await assert.rejects(c.promise, /interrupted/);
});
test('unapproved pauses remain timed while an approved break has an explicit deduction', async () => {
  const f = commandFixture({ pauseReasons: ['TEST_BREAK'] }); f.tick(1000); f.rl.emit('line', 'pause TEST_OTHER'); assert.equal(f.clock.pauseTick, undefined);
  f.rl.emit('line', 'pause TEST_BREAK'); await Promise.resolve(); await Promise.resolve(); f.tick(4000); f.rl.emit('line', 'resume'); await Promise.resolve(); await Promise.resolve(); f.tick(6000); f.rl.emit('line', 'stop');
  const row = await f.promise; assert.equal(row.timing.excluded_pause_seconds, '3.000'); assert.equal(row.timing.user_elapsed_seconds, '3.000');
});

const fixtureParent = fileURLToPath(new URL('../../../.validation-tmp/', import.meta.url));
async function withDirectory(run) {
  await mkdir(fixtureParent, { recursive: true }); const directory = await mkdtemp(path.join(fixtureParent, 'pilot-recorder-test-'));
  try { await run(await import('node:fs/promises').then(fs => fs.realpath(directory))); }
  finally { assert.equal(path.dirname(directory), path.resolve(fixtureParent)); assert.ok(path.basename(directory).startsWith('pilot-recorder-test-')); await rm(directory, { recursive: true, force: true }); }
}
test('files reject traversal and oversized data; atomic write retains valid content', async () => withDirectory(async directory => {
  await assert.rejects(sessionFile(directory, '../outside.csv'), /direct children/);
  await writeSessionFile(directory, 'test.csv', 'header\n'); assert.equal(await readSessionFile(directory, 'test.csv'), 'header\n');
  await writeSessionFile(directory, 'test.csv', 'header\nvalue\n'); assert.equal(await readFile(path.join(directory, 'test.csv'), 'utf8'), 'header\nvalue\n');
  await writeFile(path.join(directory, 'large.csv'), 'x'.repeat(10 * 1024 * 1024 + 1)); await assert.rejects(sessionFile(directory, 'large.csv'), /bounded/);
}));
test('shared hard-link record files are rejected where the host permits their creation', async t => withDirectory(async directory => {
  await writeFile(path.join(directory, 'test.csv'), 'header\n');
  try { await link(path.join(directory, 'test.csv'), path.join(directory, 'linked.csv')); }
  catch (error) { if (['EPERM', 'ENOSYS', 'ENOTSUP'].includes(error.code)) { t.skip('Host prevents creating the hard-link fixture; rejection path is not verified here.'); return; } throw error; }
  await assert.rejects(sessionFile(directory, 'linked.csv'), /unlinked files/);
}));
test('orphan, temporary and unmatched journals cannot be erased from denominators by losing a lock', async () => withDirectory(async directory => {
  const row = makeObservation(authorize(args()), timing, metadata(), false); const name = path.join(directory, 'unfinished-test.json');
  await writeFile(name, JSON.stringify({ kind: 'ApprovedObservation', state: 'InProgress' })); await assert.rejects(assertReconciledJournals(directory, []), /reconciliation/);
  await writeFile(name, JSON.stringify({ kind: 'ApprovedObservation', state: 'Recorded', observation: row })); await assert.rejects(assertReconciledJournals(directory, []), /unmatched/);
  await assertReconciledJournals(directory, [row], 'ApprovedObservation'); await assert.rejects(assertReconciledJournals(directory, [row], 'SyntheticRehearsal'), /reconciliation/);
  await writeFile(path.join(directory, 'task_observations.csv.tmp'), 'partial'); await assert.rejects(assertReconciledJournals(directory, [row]), /temporary/);
}));
test('participant and rehearsal directories are separate and constrained', async () => withDirectory(async directory => {
  const data = path.join(directory, 'data', 'TEST_SESSION'); const rehearsal = path.join(directory, 'rehearsal', 'TEST_SESSION');
  await mkdir(data, { recursive: true }); await mkdir(rehearsal, { recursive: true });
  assert.equal(await canonicalDataDirectory(data, false, directory), await import('node:fs/promises').then(fs => fs.realpath(data)));
  await assert.rejects(canonicalDataDirectory(data, true, directory), /session subdirectory/);
  await assert.rejects(canonicalDataDirectory(directory, false, directory), /session subdirectory/);
}));

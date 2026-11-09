import { lstat, readdir, realpath, open, unlink, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { createInterface } from 'node:readline/promises';
import { HEADERS, MODES, OUTCOMES, parseCsv, validateAndSummarize } from './validate_and_summarize.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const counts = ['user_error_count', 'system_error_count', 'operator_error_count', 'network_failure_count', 'assistance_count', 'document_rework_count'];
const code = /^[A-Z][A-Z0-9_-]{1,39}$/;
const versionCode = /^[A-Za-z0-9][A-Za-z0-9_.+-]{0,63}$/;
const utc = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;
const within = (parent, child) => { const rel = path.relative(parent, child); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); };
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function isUtcInstant(value) {
  if (typeof value !== 'string' || !utc.test(value)) return false;
  const tick = Date.parse(value);
  if (!Number.isFinite(tick)) return false;
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/, (_, fraction) => '.' + (fraction ?? '').padEnd(3, '0') + 'Z');
  return new Date(tick).toISOString() === normalized;
}

/** Check every leaf as well as its parent. Do not follow links or share writable
 * record files through hard links; directory canonicalization alone is not enough. */
export async function sessionFile(directory, name, required = false) {
  if (!name || path.basename(name) !== name) throw new Error('Session files must be direct children of the protected directory.');
  const target = path.join(directory, name);
  try {
    const info = await lstat(target);
    if (info.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || info.size > MAX_FILE_BYTES
      || path.dirname(await realpath(target)) !== directory) throw new Error('Session files must be bounded, regular, unlinked files inside the protected directory.');
  } catch (error) {
    if (error.code !== 'ENOENT' || required) throw error;
  }
  return target;
}

export async function readSessionFile(directory, name, required = true) {
  const target = await sessionFile(directory, name, required);
  let handle;
  try {
    handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > MAX_FILE_BYTES
      || path.dirname(await realpath(target)) !== directory) throw new Error('Session file changed or is unsafe to read.');
    const content = await handle.readFile('utf8');
    if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('Session file exceeds the permitted size.');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT' && !required) return null;
    throw error;
  } finally { await handle?.close(); }
}

export async function writeSessionFile(directory, name, content) {
  const target = await sessionFile(directory, name);
  const temporary = await sessionFile(directory, name + '.tmp');
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
  await sessionFile(directory, name);
  await rename(temporary, target);
}

export async function assertReconciledJournals(directory, observations = [], expectedKind) {
  for (const name of await readdir(directory)) {
    if (name === 'task_observations.csv.tmp' || name === '.rehearsal.json.tmp' || /^unfinished-.*\.json\.tmp$/i.test(name)) {
      await sessionFile(directory, name, true);
      throw new Error('An unfinished temporary record exists. Reconcile it with the coordinator before recording.');
    }
    if (!/^unfinished-.*\.json$/i.test(name)) continue;
    let journal;
    try { journal = JSON.parse(await readSessionFile(directory, name)); }
    catch { throw new Error('An unreadable or unsafe recording journal requires coordinator reconciliation.'); }
    if (!['ApprovedObservation', 'SyntheticRehearsal'].includes(journal.kind)
      || (expectedKind && journal.kind !== expectedKind) || journal.state !== 'Recorded' || !journal.observation || !observations.some(row =>
      HEADERS.observations.every(key => String(row[key] ?? '') === String(journal.observation[key] ?? '')))) {
      throw new Error('An unfinished or unmatched recording journal requires coordinator reconciliation before another task.');
    }
  }
}

export function authorize({ approval, participant, task, mode, observer, practice = false, rehearsal = false, now = Date.now() }) {
  if (!participant || !task) throw new Error('Unknown participant or task code.');
  if (!/^PT-[A-Z0-9]{4,12}$/.test(participant.participant_id) || !code.test(task.task_id) || !code.test(observer ?? '')) throw new Error('Use approved pseudonymous participant, task and observer codes.');
  if (!MODES.has(mode)) throw new Error('Mode must be Manual or App.');
  if (practice !== task.task_id.startsWith('PR_')) throw new Error('Practice requires a separate PR_ task and different case content; PR_ tasks cannot be scored.');
  if (participant.role !== task.role || participant.age_18_plus !== 'true' || participant.eligibility_confirmed !== 'true' || participant.consent_status !== 'Consented' || participant.withdrawn !== 'false') throw new Error('Adult eligibility, role and active consent must be confirmed.');
  if (!['AB', 'BA'].includes(participant.counterbalance_group) || task.approval_status !== 'Approved' || !Number.isSafeInteger(Number(task.max_seconds)) || Number(task.max_seconds) <= 0) throw new Error('Task approval, timeout or counterbalance group is invalid.');
  if (task.manual_case_id === task.app_case_id || ['manual_case_id', 'app_case_id', 'success_criteria_code', 'rescue_rule_code', 'title_code'].some(key => !code.test(task[key] ?? ''))) throw new Error('Distinct matched cases and bounded success, rescue and title codes are required.');
  if (['consent_version', 'device_code', 'build_version', 'network_profile', 'prior_experience_code'].some(key => !versionCode.test(participant[key] ?? ''))
    || !versionCode.test(task.instrument_version ?? '')) throw new Error('Consent, instrument, device, build, network and experience must use bounded non-identifying codes.');
  if (!rehearsal) {
    const required = ['approval_reference', 'parish_authorization_reference', 'institutional_ethics_or_exemption_reference', 'privacy_and_retention_reference', 'coordinator_code', 'native_acceptance_reference'];
    if (approval?.status !== 'Approved' || required.some((key) => !code.test(approval[key] ?? ''))) throw new Error('Written approval, privacy, coordinator and native-acceptance reference codes are required. The template is not approval.');
    if (!isUtcInstant(approval.approved_at) || !isUtcInstant(approval.valid_until) || !(Date.parse(approval.approved_at) <= now && now <= Date.parse(approval.valid_until))) throw new Error('Approval must be current with valid UTC dates.');
    if (approval.synthetic_cases_only !== true || !Array.isArray(approval.parish_codes) || !Array.isArray(approval.task_ids)
      || !approval.parish_codes.every(value => /^(P0[1-8]|VIC)$/.test(value))
      || !approval.task_ids.every(value => code.test(value))
      || !approval.parish_codes.includes(participant.parish_code) || !approval.task_ids.includes(task.task_id)) throw new Error('Approval does not cover these synthetic cases, parish or task.');
    if (!approval.consent_version || approval.consent_version !== participant.consent_version || !approval.instrument_version || approval.instrument_version !== task.instrument_version) throw new Error('Consent and instrument versions must match the approved versions.');
    for (const key of ['pause_reason_codes', 'exclusion_reason_codes']) {
      if (approval[key] !== undefined && (!Array.isArray(approval[key]) || approval[key].some(value => !code.test(value)))) throw new Error('Approved reason lists must contain bounded non-identifying codes only.');
    }
  }
  return {
    participant_id: participant.participant_id, task_id: task.task_id,
    case_id: mode === 'Manual' ? task.manual_case_id : task.app_case_id, mode,
    sequence_order: (participant.counterbalance_group === 'AB' ? mode === 'Manual' : mode === 'App') ? '1' : '2',
    practice: String(practice), observer_code: observer,
  };
}

// UTC timestamps document the observation; a monotonic clock measures duration.
export class TaskClock {
  constructor(monotonic = () => performance.now(), wall = () => new Date().toISOString()) { this.monotonic = monotonic; this.wall = wall; }
  start() {
    if (this.startTick !== undefined) throw new Error('Task already started.');
    this.started_at = this.wall(); this.startTick = this.monotonic(); this.pausedMs = 0; this.pauses = [];
  }
  pause(reason) {
    if (this.startTick === undefined || this.stopTick !== undefined || this.pauseTick !== undefined || !code.test(reason)) throw new Error('Pause requires a running task and an approved reason code.');
    this.pauseTick = this.monotonic(); this.pauses.push({ reason_code: reason, started_at: this.wall() });
  }
  resume() {
    if (this.pauseTick === undefined || this.stopTick !== undefined) throw new Error('Task is not paused.');
    this.pausedMs += this.monotonic() - this.pauseTick; this.pauseTick = undefined; this.pauses.at(-1).stopped_at = this.wall();
  }
  elapsed() {
    if (this.startTick === undefined) return 0;
    const tick = this.stopTick ?? this.monotonic();
    return Math.max(0, (tick - this.startTick - this.pausedMs - (this.pauseTick === undefined ? 0 : tick - this.pauseTick)) / 1000);
  }
  stop() {
    if (this.startTick === undefined || this.stopTick !== undefined) throw new Error('Task is not running.');
    if (this.pauseTick !== undefined) this.resume();
    this.stopTick = this.monotonic(); this.stopped_at = this.wall(); return this.result();
  }
  result() {
    if (this.stopTick === undefined) throw new Error('Task must stop first.');
    const wallSeconds = (this.stopTick - this.startTick) / 1000;
    if (!isUtcInstant(this.started_at) || !isUtcInstant(this.stopped_at)
      || !Number.isFinite(wallSeconds) || wallSeconds < 0 || this.pausedMs < 0 || this.pausedMs > wallSeconds * 1000
      || Math.abs((Date.parse(this.stopped_at) - Date.parse(this.started_at)) / 1000 - wallSeconds) > 2) throw new Error('System clock changed or timing is invalid. Retain the journal and resolve this observation explicitly; do not score it.');
    const fixed = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
    return { started_at: this.started_at, stopped_at: this.stopped_at, wall_seconds: fixed(wallSeconds), excluded_pause_seconds: fixed(this.pausedMs / 1000), user_elapsed_seconds: fixed(this.elapsed()) };
  }
}

export function makeObservation(base, timing, metadata, timedOut, maximumSeconds) {
  const allowed = new Set(['outcome', ...counts, 'backend_processing_ms', 'exclusion_reason']);
  if (Object.keys(metadata).some(key => !allowed.has(key))) throw new Error('Metadata cannot overwrite identity, timing or other protected fields.');
  if (maximumSeconds !== undefined && Number(timing.user_elapsed_seconds) >= Number(maximumSeconds)
    && (!timedOut || metadata.outcome !== 'NotCompleted')) throw new Error('The measured task timeout must be recorded as NotCompleted.');
  const row = { ...base, ...timing, ...metadata, timeout_reached: String(timedOut), notes_redacted: '' };
  if (!OUTCOMES.has(row.outcome) || (timedOut && row.outcome !== 'NotCompleted')) throw new Error('Invalid outcome for this task.');
  for (const key of counts) {
    if (row[key] === '' && ['Cancelled', 'Excluded'].includes(row.outcome)) continue;
    if (!/^\d+$/.test(String(row[key])) || !Number.isSafeInteger(Number(row[key]))) throw new Error(`${key} requires an observed nonnegative integer, not a default.`);
    row[key] = String(row[key]);
  }
  if (row.outcome === 'Completed' && Number(row.assistance_count) !== 0) throw new Error('Use CompletedWithAssistance when help was given.');
  if (row.outcome === 'CompletedWithAssistance' && Number(row.assistance_count) < 1) throw new Error('Assisted completion requires assistance_count.');
  if (['Cancelled', 'Excluded'].includes(row.outcome) && !code.test(row.exclusion_reason ?? '')) throw new Error('Cancellation/exclusion requires an approved reason code.');
  if (base.mode === 'Manual' && row.backend_processing_ms !== '') throw new Error('Manual time cannot be recorded as backend latency.');
  if (row.backend_processing_ms !== '' && (!/^\d+(?:\.\d+)?$/.test(String(row.backend_processing_ms)) || !Number.isFinite(Number(row.backend_processing_ms)))) throw new Error('Backend latency must be measured separately or blank.');
  return Object.fromEntries(HEADERS.observations.map((key) => [key, row[key] ?? '']));
}

export function csvRow(row) {
  return HEADERS.observations.map((key) => { const value = String(row[key] ?? ''); return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }).join(',');
}

export async function canonicalDataDirectory(directory, rehearsal, pilotRoot = here) {
  const parent = path.join(pilotRoot, rehearsal ? 'rehearsal' : 'data');
  const resolved = path.resolve(directory);
  if (!within(parent, resolved)) throw new Error(`--data must be a session subdirectory inside research/pilot/${rehearsal ? 'rehearsal' : 'data'}.`);
  // Inputs must already exist. Resolve junctions/symlinks before writing records.
  const info = await lstat(parent);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('The protected data parent cannot be a symbolic link or junction.');
  const [parentReal, dataReal] = await Promise.all([realpath(parent), realpath(resolved)]);
  if (!within(parentReal, dataReal)) throw new Error('Data directory escapes its protected parent.');
  return dataReal;
}

/** Capture stop time immediately, even while a prior journal write is pending.
 * Any clock or I/O failure ends this loop and leaves reconciliation evidence. */
export function recordCommands({ clock, maximumSeconds, rl, journal, saveJournal, output = console.log,
  interval = setInterval, clear = clearInterval, pauseReasons }) {
  return new Promise((resolve, reject) => {
    let settled = false, working = false, writing = Promise.resolve();
    let timer;
    const cleanup = () => { clear(timer); rl.off('line', onLine); rl.off('close', onClose); };
    const fail = (error) => {
      if (settled) return;
      settled = true; cleanup();
      writing.then(() => reject(error), () => reject(error));
    };
    const finish = (cancelled = false) => {
      if (settled) return;
      try {
        const timing = clock.stop();
        const timedOut = Number(timing.user_elapsed_seconds) >= Number(maximumSeconds);
        settled = true; cleanup();
        writing.then(() => resolve({ timing, timedOut, cancelled }), reject);
      } catch (error) { fail(error); }
    };
    const onClose = () => fail(new Error('Recording interrupted. Retain the unfinished journal and reconcile the dropout before another session.'));
    const onLine = async (line) => {
      if (settled) return;
      const [command, reason, extra] = line.trim().split(/\s+/);
      if ((command === 'stop' || command === 'cancel') && !reason) { finish(command === 'cancel'); return; }
      if (working) { output('Journal update in progress. Stop or cancel remains available.'); return; }
      if (!['pause', 'resume', 'status'].includes(command) || extra || (command !== 'pause' && reason)) {
        output('Use status, pause REASON_CODE, resume, stop or cancel.'); return;
      }
      try {
        if (command === 'pause') {
          if (pauseReasons && !pauseReasons.includes(reason)) { output('That pause reason is not authorized for this session.'); return; }
          clock.pause(reason);
        } else if (command === 'resume') clock.resume();
      } catch (error) { output(error.message); return; }
      working = true;
      try {
        journal.elapsed_seconds = clock.elapsed();
        writing = saveJournal();
        await writing;
        if (!settled) output(`Elapsed ${clock.elapsed().toFixed(3)}s; ${clock.pauseTick === undefined ? 'running' : 'paused'}.`);
      } catch (error) { fail(error); } finally { working = false; }
    };
    rl.on('line', onLine); rl.once('close', onClose);
    timer = interval(() => {
      if (settled) return;
      try {
        if (clock.elapsed() >= Number(maximumSeconds)) {
          output('Approved timeout reached. Task stopped as NotCompleted.'); finish();
        }
      } catch (error) { fail(error); }
    }, 100);
  });
}

async function main() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const key = process.argv[i];
    if (Object.hasOwn(args, key.slice(2))) throw new Error('Duplicate coordinator arguments are not allowed.');
    if (['--rehearsal', '--practice', '--help'].includes(key)) args[key.slice(2)] = true;
    else if (['--data', '--participant', '--task', '--mode', '--observer'].includes(key) && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) args[key.slice(2)] = process.argv[++i];
    else throw new Error('Unknown or incomplete coordinator argument.');
  }
  if (args.help) {
    console.log('Usage: node record-task.mjs --data research/pilot/data/<session> --participant PT-XXXX --task TASK_CODE --mode Manual|App --observer OBS_CODE [--practice]\nFor synthetic rehearsal ONLY: use --rehearsal and research/pilot/rehearsal/<session>. Approval is read from approval.json in participant mode. No participant identities in any file.'); return;
  }
  if (!args.data || !process.stdin.isTTY || !process.stdout.isTTY) throw new Error('A --data directory and interactive coordinator terminal are required.');
  const directory = await canonicalDataDirectory(args.data, Boolean(args.rehearsal));
  let lock;
  const lockPath = path.join(directory, '.recording.lock');
  try { lock = await open(lockPath, 'wx', 0o600); } catch { throw new Error('Recording lock exists or cannot be created. Resolve any unfinished journal with the coordinator; do not erase an observation or run concurrent recorders.'); }
  let journalPath;
  let finished = false;
  let rl;
  let interrupted = false;
  const interrupt = () => { interrupted = true; rl?.close(); };
  process.on('SIGINT', interrupt);
  try {
    await lock.writeFile(JSON.stringify({ kind: 'CoordinatorRecorderLock', created_at: new Date().toISOString() }) + '\n');
    await lock.sync();
    for (const name of ['participants.csv', 'task_catalog.csv', 'task_observations.csv', 'feedback.csv', 'native_acceptance.csv', 'approval.json', '.rehearsal.json']) {
      await sessionFile(directory, name, ['participants.csv', 'task_catalog.csv', 'task_observations.csv'].includes(name) || (name === 'approval.json' && !args.rehearsal));
    }
    const observationsPath = path.join(directory, 'task_observations.csv');
    const existingText = await readSessionFile(directory, 'task_observations.csv');
    const existing = parseCsv(existingText).records;
    await assertReconciledJournals(directory, existing, args.rehearsal ? 'SyntheticRehearsal' : 'ApprovedObservation');
    const markerText = await readSessionFile(directory, '.rehearsal.json', false);
    if (args.rehearsal) {
      if (markerText === null) await writeSessionFile(directory, '.rehearsal.json', JSON.stringify({ kind: 'SyntheticRehearsal', created_at: new Date().toISOString() }));
      else {
        const marker = JSON.parse(markerText);
        if (marker.kind !== 'SyntheticRehearsal' || !isUtcInstant(marker.created_at)) throw new Error('The rehearsal marker is invalid. Reconcile this directory before proceeding.');
      }
      console.log('SYNTHETIC REHEARSAL ONLY. No participant approval or stakeholder results are established.');
    } else if (markerText !== null) throw new Error('Rehearsal data cannot be scored as stakeholder observations.');
    const result = await validateAndSummarize(directory);
    if (!result.valid) throw new Error(`Correct input data before starting:\n${result.errors.join('\n')}`);
    const participants = parseCsv(await readSessionFile(directory, 'participants.csv')).records;
    const tasks = parseCsv(await readSessionFile(directory, 'task_catalog.csv')).records;
    const participant = participants.find((row) => row.participant_id === args.participant);
    const task = tasks.find((row) => row.task_id === args.task);
    const approval = args.rehearsal ? null : JSON.parse(await readSessionFile(directory, 'approval.json'));
    const base = authorize({ approval, participant, task, mode: args.mode, observer: args.observer, practice: Boolean(args.practice), rehearsal: Boolean(args.rehearsal) });
    if (base.practice === 'false' && existing.some((row) => row.practice === 'false' && row.participant_id === base.participant_id && row.task_id === base.task_id && row.mode === base.mode)) throw new Error('This scored participant/task/mode already exists. Do not overwrite, retry, or discard a failed/cancelled observation.');
    if (base.practice === 'false' && base.sequence_order === '2' && !existing.some((row) => row.practice === 'false' && row.participant_id === base.participant_id && row.task_id === base.task_id && row.sequence_order === '1')) throw new Error('Run the approved first mode before the second mode.');
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', interrupt);
    console.log(`Case ${base.case_id}; approved success criteria ${task.success_criteria_code}; rescue rule ${task.rescue_rule_code}; maximum ${task.max_seconds}s. Practice=${base.practice}.`);
    if (await rl.question('Brief the participant using the approved script. Type START only when the task begins: ') !== 'START') return;
    const clock = new TaskClock(); clock.start();
    journalPath = path.join(directory, `unfinished-${base.participant_id}-${base.task_id}-${base.mode}-${Date.now()}-${randomUUID().slice(0, 8)}.json`);
    const journal = { kind: args.rehearsal ? 'SyntheticRehearsal' : 'ApprovedObservation', state: 'InProgress', ...base, started_at: clock.started_at, pauses: clock.pauses,
      approval_reference: approval?.approval_reference ?? null, consent_version: participant.consent_version, instrument_version: task.instrument_version,
      device_code: participant.device_code, build_version: participant.build_version, network_profile: participant.network_profile };
    let journalWrites = Promise.resolve();
    const saveJournal = () => {
      const snapshot = JSON.stringify(journal, null, 2) + '\n';
      journalWrites = journalWrites.then(() => writeSessionFile(directory, path.basename(journalPath), snapshot));
      return journalWrites;
    };
    await saveJournal();
    if (interrupted) throw new Error('Recording interrupted. Retain the unfinished journal.');
    console.log('Commands: status | pause REASON_CODE | resume | stop | cancel. Pause only for approved exclusions; normal app/network waiting remains timed.');
    const { timing, timedOut, cancelled } = await recordCommands({ clock, maximumSeconds: Number(task.max_seconds), rl, journal, saveJournal,
      pauseReasons: args.rehearsal ? undefined : approval.pause_reason_codes ?? [] });
    Object.assign(journal, { state: 'StoppedAwaitingMetadata', timing, timedOut }); await saveJournal();
    const metadata = { outcome: timedOut ? 'NotCompleted' : cancelled ? 'Cancelled' : '' };
    const question = async (prompt) => { if (interrupted) throw new Error('Interrupted; retain the journal.'); return (await rl.question(prompt)).trim(); };
    const askField = async (key, prompt, valid, message) => {
      while (true) {
        const answer = await question(prompt);
        if (!valid(answer)) { console.log(message); continue; }
        metadata[key] = answer; journal.metadata = { ...metadata }; await saveJournal(); return;
      }
    };
    const askOutcome = () => askField('outcome', 'Observed outcome (Completed, CompletedWithAssistance, NotCompleted, Cancelled, Excluded): ',
      value => OUTCOMES.has(value), 'Choose an outcome from the displayed list.');
    const askCount = (key) => askField(key, `${key} (observed count; blank only if unknown for Cancelled/Excluded): `,
      value => (value === '' && ['Cancelled', 'Excluded'].includes(metadata.outcome)) || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value))),
      'Enter an observed nonnegative whole count. Blank is allowed only for unknown cancelled/excluded counts.');
    if (!metadata.outcome) await askOutcome();
    for (const key of counts) await askCount(key);
    while ((metadata.outcome === 'Completed' && Number(metadata.assistance_count) !== 0)
      || (metadata.outcome === 'CompletedWithAssistance' && Number(metadata.assistance_count) < 1)) {
      console.log('Outcome and assistance count disagree. Recheck both observed values.');
      await askOutcome(); await askCount('assistance_count');
    }
    metadata.backend_processing_ms = '';
    if (base.mode !== 'Manual') await askField('backend_processing_ms', 'Separately measured backend processing ms (blank if not measured): ',
      value => value === '' || (/^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value))), 'Enter measured nonnegative milliseconds or leave blank.');
    metadata.exclusion_reason = '';
    if (['Cancelled', 'Excluded'].includes(metadata.outcome)) await askField('exclusion_reason', 'Approved cancellation/exclusion REASON_CODE: ',
      value => code.test(value) && (!approval?.exclusion_reason_codes || approval.exclusion_reason_codes.includes(value)),
      'Enter an approved non-identifying cancellation/exclusion reason code.');
    const row = makeObservation(base, timing, metadata, timedOut, Number(task.max_seconds));
    // Atomic replacement under the session lock; journal remains if anything fails.
    if (await readSessionFile(directory, 'task_observations.csv') !== existingText) throw new Error('Observation data changed during recording. Retain the journal and reconcile without overwriting it.');
    await writeSessionFile(directory, path.basename(observationsPath), `${existingText.trimEnd()}\n${csvRow(row)}\n`);
    Object.assign(journal, { state: 'Recorded', observation: row }); await saveJournal();
    finished = true;
    console.log('Observation saved locally. No data sent. Enter approved feedback separately and validate the session before analysis.');
  } finally {
    rl?.close(); process.off('SIGINT', interrupt);
    await lock.close();
    // A started, unfinished observation deliberately blocks further recording.
    if (!journalPath || finished) { await sessionFile(directory, '.recording.lock', true); await unlink(lockPath); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HEADERS = {
  participants: ['participant_id', 'role', 'parish_code', 'prior_experience_code', 'age_18_plus', 'eligibility_confirmed', 'consent_status', 'consent_version', 'counterbalance_group', 'device_code', 'build_version', 'network_profile', 'withdrawn'],
  taskCatalog: ['task_id', 'role', 'title_code', 'manual_case_id', 'app_case_id', 'success_criteria_code', 'max_seconds', 'rescue_rule_code', 'instrument_version', 'approval_status'],
  observations: ['participant_id', 'task_id', 'case_id', 'mode', 'sequence_order', 'practice', 'started_at', 'stopped_at', 'wall_seconds', 'excluded_pause_seconds', 'user_elapsed_seconds', 'backend_processing_ms', 'outcome', 'timeout_reached', 'user_error_count', 'system_error_count', 'operator_error_count', 'network_failure_count', 'assistance_count', 'document_rework_count', 'exclusion_reason', 'observer_code', 'notes_redacted'],
  feedback: ['participant_id', 'task_id', 'mode', 'instrument_version', 'item_id', 'rating_1_to_4', 'comment_redacted', 'submitted_at'],
  native: ['test_id', 'platform', 'device_code', 'os_version', 'build_version', 'api_environment', 'network_profile', 'account_role', 'evidence_status', 'evidence_reference', 'executed_at', 'executor_code', 'defect_id', 'notes_redacted'],
};

const FILES = {
  participants: 'participants.csv',
  taskCatalog: 'task_catalog.csv',
  observations: 'task_observations.csv',
  feedback: 'feedback.csv',
  native: 'native_acceptance.csv',
};

const ROLES = new Set(['parishioner', 'parish_staff', 'clergy', 'system_admin']);
export const MODES = new Set(['Manual', 'App']);
export const OUTCOMES = new Set(['Completed', 'CompletedWithAssistance', 'NotCompleted', 'Cancelled', 'Excluded']);
const EVIDENCE_STATUSES = new Set(['NotRun', 'Pass', 'Fail', 'Blocked', 'NotApplicable']);
const BOOLEAN = new Set(['true', 'false']);
const FORBIDDEN_HEADERS = /(^|_)(name|email|phone|address|birthdate|document_number|sacramental_record|token|password|secret)($|_)/i;
const EMAIL_LIKE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (quoted) throw new Error('CSV ends inside a quoted field');
  if (field !== '' || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((value, index) => (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim());
  const records = rows.slice(1).map((values, index) => {
    const record = { __row: index + 2 };
    headers.forEach((header, column) => { record[header] = (values[column] ?? '').trim(); });
    record.__extra = values.slice(headers.length);
    return record;
  });
  return { headers, records };
}

export function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sameHeaders(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function numberValue(value) {
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function integerValue(value) {
  const parsed = numberValue(value);
  return Number.isInteger(parsed) ? parsed : NaN;
}

function isIsoInstant(value) {
  return Boolean(value)
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function addCount(target, key, amount = 1) {
  target[key] = (target[key] ?? 0) + amount;
}

async function readDataset(inputDirectory, key, required, errors, warnings) {
  const file = path.join(inputDirectory, FILES[key]);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      (required ? errors : warnings).push(`${FILES[key]} is ${required ? 'required' : 'absent'}`);
      return { headers: [], records: [] };
    }
    errors.push(`${FILES[key]} could not be read: ${error.message}`);
    return { headers: [], records: [] };
  }
  let parsed;
  try {
    parsed = parseCsv(text);
  } catch (error) {
    errors.push(`${FILES[key]}: ${error.message}`);
    return { headers: [], records: [] };
  }
  if (!sameHeaders(parsed.headers, HEADERS[key])) {
    errors.push(`${FILES[key]} headers must exactly match the approved template`);
  }
  for (const header of parsed.headers) {
    if (FORBIDDEN_HEADERS.test(header)) errors.push(`${FILES[key]} contains forbidden direct-identifier header: ${header}`);
  }
  for (const record of parsed.records) {
    if (record.__extra.some((value) => value !== '')) errors.push(`${FILES[key]} row ${record.__row} has extra columns`);
    for (const [header, value] of Object.entries(record)) {
      if (!header.startsWith('__') && value && EMAIL_LIKE.test(value)) {
        errors.push(`${FILES[key]} row ${record.__row} appears to contain an email address; use codes only`);
      }
    }
  }
  return parsed;
}

function validateParticipants(records, errors) {
  const map = new Map();
  for (const row of records) {
    const prefix = `participants.csv row ${row.__row}`;
    if (!/^PT-[A-Z0-9]{4,12}$/.test(row.participant_id)) errors.push(`${prefix}: invalid pseudonymous participant_id`);
    if (map.has(row.participant_id)) errors.push(`${prefix}: duplicate participant_id`);
    if (!ROLES.has(row.role)) errors.push(`${prefix}: invalid role`);
    if (!/^(P0[1-8]|VIC)$/.test(row.parish_code)) errors.push(`${prefix}: invalid parish_code`);
    if (!/^[A-Z][A-Z0-9_]{1,20}$/.test(row.prior_experience_code)) errors.push(`${prefix}: prior_experience_code must be an approved broad code`);
    if (!BOOLEAN.has(row.age_18_plus) || row.age_18_plus !== 'true') errors.push(`${prefix}: adult eligibility must be true`);
    if (!BOOLEAN.has(row.eligibility_confirmed) || row.eligibility_confirmed !== 'true') errors.push(`${prefix}: eligibility_confirmed must be true`);
    if (row.consent_status !== 'Consented') errors.push(`${prefix}: consent_status must be Consented before data collection`);
    if (!row.consent_version) errors.push(`${prefix}: consent_version is required`);
    if (!new Set(['AB', 'BA']).has(row.counterbalance_group)) errors.push(`${prefix}: counterbalance_group must be AB or BA`);
    if (!row.device_code || !row.build_version || !row.network_profile) errors.push(`${prefix}: device/build/network codes are required`);
    if (!BOOLEAN.has(row.withdrawn)) errors.push(`${prefix}: withdrawn must be true or false`);
    map.set(row.participant_id, row);
  }
  return map;
}

function validateTaskCatalog(records, errors) {
  const map = new Map();
  const caseIds = new Set();
  for (const row of records) {
    const prefix = `task_catalog.csv row ${row.__row}`;
    if (!/^[A-Z][A-Z0-9_]{2,30}$/.test(row.task_id)) errors.push(`${prefix}: invalid task_id`);
    if (map.has(row.task_id)) errors.push(`${prefix}: duplicate task_id`);
    if (!ROLES.has(row.role)) errors.push(`${prefix}: invalid role`);
    if (!row.manual_case_id || !row.app_case_id || row.manual_case_id === row.app_case_id) errors.push(`${prefix}: distinct manual/app case IDs are required`);
    for (const id of [row.manual_case_id, row.app_case_id]) {
      if (caseIds.has(id)) errors.push(`${prefix}: case IDs cannot be reused across practice or scored tasks`);
      caseIds.add(id);
    }
    if (!row.success_criteria_code || !row.rescue_rule_code || !row.instrument_version) errors.push(`${prefix}: success/rescue/instrument codes are required`);
    const maximum = integerValue(row.max_seconds);
    if (!Number.isInteger(maximum) || maximum <= 0) errors.push(`${prefix}: max_seconds must be a positive integer`);
    if (row.approval_status !== 'Approved') errors.push(`${prefix}: task must be Approved before use`);
    map.set(row.task_id, row);
  }
  return map;
}

function validateObservations(records, participants, tasks, errors) {
  const normalized = [];
  const scoredModeKeys = new Set();
  for (const row of records) {
    const prefix = `task_observations.csv row ${row.__row}`;
    const participant = participants.get(row.participant_id);
    const task = tasks.get(row.task_id);
    if (!participant) errors.push(`${prefix}: unknown participant_id`);
    if (!task) errors.push(`${prefix}: unknown task_id`);
    if (participant && task && participant.role !== task.role) errors.push(`${prefix}: participant role does not match task role`);
    if (!MODES.has(row.mode)) errors.push(`${prefix}: mode must be Manual or App`);
    if (!new Set(['1', '2']).has(row.sequence_order)) errors.push(`${prefix}: sequence_order must be 1 or 2`);
    if (participant && row.practice === 'false') {
      const expectedSequence = participant.counterbalance_group === 'AB'
        ? (row.mode === 'Manual' ? '1' : '2')
        : (row.mode === 'App' ? '1' : '2');
      if (MODES.has(row.mode) && row.sequence_order !== expectedSequence) errors.push(`${prefix}: sequence_order conflicts with counterbalance group`);
    }
    if (!BOOLEAN.has(row.practice)) errors.push(`${prefix}: practice must be true or false`);
    if (task && (row.practice === 'true') !== task.task_id.startsWith('PR_')) errors.push(`${prefix}: practice must use a separate PR_ task and cannot be scored`);
    if (
      row.practice === 'false'
      && !new Set(['Cancelled', 'Excluded']).has(row.outcome)
      && row.participant_id
      && row.task_id
      && MODES.has(row.mode)
    ) {
      const scoredModeKey = `${row.participant_id}|${row.task_id}|${row.mode}`;
      if (scoredModeKeys.has(scoredModeKey)) errors.push(`${prefix}: duplicate scored participant/task/mode row`);
      scoredModeKeys.add(scoredModeKey);
    }
    if (!isIsoInstant(row.started_at) || !isIsoInstant(row.stopped_at)) errors.push(`${prefix}: UTC ISO start/stop timestamps are required`);
    const started = Date.parse(row.started_at);
    const stopped = Date.parse(row.stopped_at);
    const wall = numberValue(row.wall_seconds);
    const pause = numberValue(row.excluded_pause_seconds);
    const elapsed = numberValue(row.user_elapsed_seconds);
    const backend = numberValue(row.backend_processing_ms);
    if (!(Number.isFinite(wall) && wall >= 0)) errors.push(`${prefix}: wall_seconds must be non-negative`);
    if (!(Number.isFinite(pause) && pause >= 0 && (!Number.isFinite(wall) || pause <= wall))) errors.push(`${prefix}: excluded_pause_seconds is invalid`);
    if (!(Number.isFinite(elapsed) && elapsed >= 0)) errors.push(`${prefix}: user_elapsed_seconds must be non-negative`);
    if (Number.isFinite(started) && Number.isFinite(stopped)) {
      if (stopped < started) errors.push(`${prefix}: stopped_at precedes started_at`);
      const actualWall = (stopped - started) / 1000;
      if (Number.isFinite(wall) && Math.abs(actualWall - wall) > 2) errors.push(`${prefix}: wall_seconds does not match timestamps`);
    }
    if (Number.isFinite(wall) && Number.isFinite(pause) && Number.isFinite(elapsed) && Math.abs((wall - pause) - elapsed) > 1) {
      errors.push(`${prefix}: user_elapsed_seconds must equal wall_seconds minus excluded pause`);
    }
    if (row.mode === 'Manual' && row.backend_processing_ms !== '') errors.push(`${prefix}: manual mode must leave backend_processing_ms blank`);
    if (row.backend_processing_ms !== '' && !(Number.isFinite(backend) && backend >= 0)) errors.push(`${prefix}: backend_processing_ms is invalid`);
    if (!OUTCOMES.has(row.outcome)) errors.push(`${prefix}: invalid outcome`);
    if (!BOOLEAN.has(row.timeout_reached)) errors.push(`${prefix}: timeout_reached must be true or false`);
    if (row.timeout_reached === 'true' && row.outcome !== 'NotCompleted') errors.push(`${prefix}: a reached task timeout must use NotCompleted`);
    if (task && Number.isFinite(elapsed) && elapsed >= Number(task.max_seconds) && (row.timeout_reached !== 'true' || row.outcome !== 'NotCompleted')) errors.push(`${prefix}: elapsed duration reached the task limit and must be recorded as a timeout / NotCompleted`);
    const countFields = ['user_error_count', 'system_error_count', 'operator_error_count', 'network_failure_count', 'assistance_count', 'document_rework_count'];
    const counts = {};
    for (const field of countFields) {
      if (row[field] === '' && new Set(['Cancelled', 'Excluded']).has(row.outcome)) {
        counts[field] = null;
      } else {
        counts[field] = integerValue(row[field]);
        if (!Number.isInteger(counts[field]) || counts[field] < 0) errors.push(`${prefix}: ${field} must be a non-negative integer, or blank only for cancelled/excluded work`);
      }
    }
    if (row.outcome === 'Completed' && (counts.assistance_count ?? 0) > 0) errors.push(`${prefix}: assisted success must use CompletedWithAssistance`);
    if (row.outcome === 'CompletedWithAssistance' && (counts.assistance_count ?? 0) < 1) errors.push(`${prefix}: CompletedWithAssistance requires assistance_count`);
    if (new Set(['Cancelled', 'Excluded']).has(row.outcome) && !row.exclusion_reason) errors.push(`${prefix}: cancelled/excluded rows require exclusion_reason`);
    if (!row.observer_code) errors.push(`${prefix}: observer_code is required`);
    if (task && row.mode === 'Manual' && row.case_id !== task.manual_case_id) errors.push(`${prefix}: case_id does not match manual case`);
    if (task && row.mode === 'App' && row.case_id !== task.app_case_id) errors.push(`${prefix}: case_id does not match app case`);
    normalized.push({ ...row, wall, pause, elapsed, backend, ...counts });
  }
  return normalized;
}

function validateFeedback(records, participants, tasks, errors) {
  const normalized = [];
  const seen = new Set();
  for (const row of records) {
    const prefix = `feedback.csv row ${row.__row}`;
    if (!participants.has(row.participant_id)) errors.push(`${prefix}: unknown participant_id`);
    if (!tasks.has(row.task_id)) errors.push(`${prefix}: unknown task_id`);
    const task = tasks.get(row.task_id);
    if (task && participants.get(row.participant_id)?.role !== task.role) errors.push(`${prefix}: participant role does not match feedback task`);
    if (task && row.instrument_version !== task.instrument_version) errors.push(`${prefix}: instrument_version differs from the approved task`);
    if (row.task_id.startsWith('PR_')) errors.push(`${prefix}: practice feedback cannot enter scored feedback summaries`);
    const key = [row.participant_id, row.task_id, row.mode, row.instrument_version, row.item_id].join('|');
    if (seen.has(key)) errors.push(`${prefix}: duplicate participant/task/mode/item feedback`);
    seen.add(key);
    if (!MODES.has(row.mode)) errors.push(`${prefix}: invalid mode`);
    if (!row.instrument_version || !row.item_id) errors.push(`${prefix}: instrument_version and item_id are required`);
    const rating = integerValue(row.rating_1_to_4);
    if (![1, 2, 3, 4].includes(rating)) errors.push(`${prefix}: rating_1_to_4 must be 1-4`);
    if (!isIsoInstant(row.submitted_at)) errors.push(`${prefix}: submitted_at must be an ISO timestamp`);
    normalized.push({ ...row, rating });
  }
  return normalized;
}

function validateNative(records, errors) {
  for (const row of records) {
    const prefix = `native_acceptance.csv row ${row.__row}`;
    if (!/^NAT-[A-Z]+-\d{2}$/.test(row.test_id)) errors.push(`${prefix}: invalid test_id`);
    if (!new Set(['Android', 'iOS']).has(row.platform)) errors.push(`${prefix}: platform must be Android or iOS`);
    if (!EVIDENCE_STATUSES.has(row.evidence_status)) errors.push(`${prefix}: invalid evidence_status`);
    if (row.evidence_status === 'Pass' && (!row.evidence_reference || !isIsoInstant(row.executed_at) || !row.executor_code)) {
      errors.push(`${prefix}: Pass requires evidence_reference, executed_at, and executor_code`);
    }
    if (row.evidence_status === 'Fail' && !row.defect_id) errors.push(`${prefix}: Fail requires defect_id`);
  }
}

function summarizeMode(rows) {
  const summary = {};
  for (const mode of ['Manual', 'App']) {
    const selected = rows.filter((row) => row.mode === mode && row.practice === 'false' && !new Set(['Cancelled', 'Excluded']).has(row.outcome));
    const totalSuccess = selected.filter((row) => new Set(['Completed', 'CompletedWithAssistance']).has(row.outcome));
    summary[mode] = {
      observations: selected.length,
      completed_unassisted: selected.filter((row) => row.outcome === 'Completed').length,
      completed_total: totalSuccess.length,
      completion_rate: selected.length ? totalSuccess.length / selected.length : null,
      median_user_elapsed_seconds: median(selected.map((row) => row.elapsed)),
      observed_user_elapsed_range_seconds: selected.length ? [Math.min(...selected.map((row) => row.elapsed)), Math.max(...selected.map((row) => row.elapsed))] : null,
      median_backend_processing_ms: median(selected.map((row) => row.backend)),
      user_errors: selected.reduce((sum, row) => sum + (row.user_error_count ?? 0), 0),
      system_errors: selected.reduce((sum, row) => sum + (row.system_error_count ?? 0), 0),
      operator_errors: selected.reduce((sum, row) => sum + (row.operator_error_count ?? 0), 0),
      network_failures: selected.reduce((sum, row) => sum + (row.network_failure_count ?? 0), 0),
      assistance: selected.reduce((sum, row) => sum + (row.assistance_count ?? 0), 0),
      document_rework: selected.reduce((sum, row) => sum + (row.document_rework_count ?? 0), 0),
    };
  }
  return summary;
}

function summarizeByGroup(rows, keyForRow, minimumGroupSize) {
  const groups = {};
  for (const row of rows) {
    const key = keyForRow(row);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  if (!Number.isInteger(minimumGroupSize)) return { status: 'SuppressedPendingApprovedMinimum' };
  const visible = {};
  let suppressedGroupCount = 0;
  for (const [key, selected] of Object.entries(groups)) {
    const participantCount = new Set(selected.map((row) => row.participant_id)).size;
    if (participantCount < minimumGroupSize) suppressedGroupCount += 1;
    else visible[key] = summarizeMode(selected);
  }
  return { status: 'Applied', minimum_group_size: minimumGroupSize, suppressed_group_count: suppressedGroupCount, groups: visible };
}

function summarizeParticipantRoles(records, minimumGroupSize) {
  const counts = {};
  for (const participant of records) addCount(counts, participant.role || 'invalid');
  if (!Number.isInteger(minimumGroupSize)) return { status: 'SuppressedPendingApprovedMinimum' };
  const visible = {};
  let suppressedGroupCount = 0;
  for (const [role, count] of Object.entries(counts)) {
    if (count < minimumGroupSize) suppressedGroupCount += 1;
    else visible[role] = count;
  }
  return { status: 'Applied', minimum_group_size: minimumGroupSize, suppressed_group_count: suppressedGroupCount, groups: visible };
}

async function readRehearsalMarker(inputDirectory, errors) {
  const markerPath = path.join(inputDirectory, '.rehearsal.json');
  let text;
  try {
    text = await readFile(markerPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    errors.push(`.rehearsal.json could not be read: ${error.message}`);
    return null;
  }
  let marker;
  try {
    marker = JSON.parse(text);
  } catch {
    errors.push('.rehearsal.json must contain valid JSON');
    return null;
  }
  if (marker?.kind !== 'SyntheticRehearsal') errors.push('.rehearsal.json kind must be SyntheticRehearsal');
  if (!isIsoInstant(marker?.created_at)) errors.push('.rehearsal.json created_at must be an explicit UTC Z timestamp');
  return marker;
}

function summarizePairs(rows, warnings) {
  const groups = new Map();
  const eligible = rows.filter((row) => row.practice === 'false' && !new Set(['Cancelled', 'Excluded']).has(row.outcome));
  for (const row of eligible) {
    const key = `${row.participant_id}|${row.task_id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const deltas = [];
  let validPairs = 0;
  let missingPairs = 0;
  let duplicatePairs = 0;
  for (const [key, group] of groups) {
    const manual = group.filter((row) => row.mode === 'Manual');
    const app = group.filter((row) => row.mode === 'App');
    if (manual.length !== 1 || app.length !== 1) {
      missingPairs += 1;
      if (manual.length > 1 || app.length > 1) duplicatePairs += 1;
      warnings.push(`Unpaired or duplicate scored observations for ${key}`);
      continue;
    }
    validPairs += 1;
    const bothSuccessful = [manual[0], app[0]].every((row) => new Set(['Completed', 'CompletedWithAssistance']).has(row.outcome));
    if (bothSuccessful) deltas.push(app[0].elapsed - manual[0].elapsed);
  }
  return {
    valid_pairs: validPairs,
    pairs_with_successful_timing_delta: deltas.length,
    missing_or_duplicate_pairs: missingPairs,
    duplicate_pair_groups: duplicatePairs,
    median_app_minus_manual_seconds: median(deltas),
    app_faster_pairs: deltas.filter((value) => value < 0).length,
    tied_pairs: deltas.filter((value) => value === 0).length,
    app_slower_pairs: deltas.filter((value) => value > 0).length,
  };
}

function summarizeFeedbackItems(rows, minimumGroupSize) {
  if (!Number.isInteger(minimumGroupSize) || minimumGroupSize < 2) return { status: 'SuppressedPendingApprovedMinimum', groups: {} };
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.instrument_version}|${row.item_id}|${row.mode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let suppressed = 0;
  const visible = {};
  for (const [key, selected] of groups) {
    const count = new Set(selected.map(row => row.participant_id)).size;
    if (count < minimumGroupSize) { suppressed++; continue; }
    // A participant may encounter an item on several tasks. Summarize per
    // participant first so repeated tasks do not overweight that person.
    const participantRatings = new Map();
    for (const row of selected) {
      if (!participantRatings.has(row.participant_id)) participantRatings.set(row.participant_id, []);
      participantRatings.get(row.participant_id).push(row.rating);
    }
    visible[key] = { respondents: count, response_rows: selected.length, median_participant_rating: median([...participantRatings.values()].map(median)) };
  }
  return { status: 'Applied', minimum_group_size: minimumGroupSize, suppressed_group_count: suppressed, groups: visible };
}

export async function validateAndSummarize(inputDirectory, options = {}) {
  const errors = [];
  const warnings = [];
  const rehearsalMarker = await readRehearsalMarker(inputDirectory, errors);
  const datasets = {};
  datasets.participants = await readDataset(inputDirectory, 'participants', true, errors, warnings);
  datasets.taskCatalog = await readDataset(inputDirectory, 'taskCatalog', true, errors, warnings);
  datasets.observations = await readDataset(inputDirectory, 'observations', true, errors, warnings);
  datasets.feedback = await readDataset(inputDirectory, 'feedback', false, errors, warnings);
  datasets.native = await readDataset(inputDirectory, 'native', false, errors, warnings);

  const participants = validateParticipants(datasets.participants.records, errors);
  const tasks = validateTaskCatalog(datasets.taskCatalog.records, errors);
  const observations = validateObservations(datasets.observations.records, participants, tasks, errors);
  const feedback = validateFeedback(datasets.feedback.records, participants, tasks, errors);
  validateNative(datasets.native.records, errors);

  if (datasets.participants.records.length === 0) warnings.push('No participant rows found; pilot result is NoResults');
  if (datasets.observations.records.length === 0) warnings.push('No observation rows found; pilot result is NoResults');

  const nativeStatuses = {};
  for (const row of datasets.native.records) addCount(nativeStatuses, row.evidence_status || 'invalid');
  const outcomes = {};
  for (const row of observations) addCount(outcomes, row.outcome || 'invalid');

  const hasResults = observations.length > 0;
  const observationSummary = hasResults ? {
      status: 'DescriptiveResults',
      total: observations.length,
      practice: observations.filter((row) => row.practice === 'true').length,
      cancelled: observations.filter((row) => row.outcome === 'Cancelled').length,
      excluded: observations.filter((row) => row.outcome === 'Excluded').length,
      outcomes,
      by_mode: summarizeMode(observations),
      by_role: summarizeByGroup(observations, (row) => participants.get(row.participant_id)?.role ?? 'unknown', options.minimumGroupSize),
      by_task: summarizeByGroup(observations, (row) => row.task_id, options.minimumGroupSize),
      paired: summarizePairs(observations, warnings),
    } : { status: 'NoResults', total: 0 };

  const dataClassification = rehearsalMarker ? 'SyntheticRehearsal' : 'UnmarkedPilotData';
  const resultStatus = hasResults ? (rehearsalMarker ? 'RehearsalOnly' : 'DescriptiveResults') : 'NoResults';
  const limitations = [
    'Descriptive pilot summary only; no causal, representative, population-precision, or significance claim.',
    'Backend processing time is separate from participant elapsed time.',
    'Cancelled, excluded, practice, missing, and unpaired observations remain visible.',
  ];
  if (rehearsalMarker) limitations.push('Synthetic rehearsal data must never be reported as human participant outcomes or pilot results.');
  else limitations.push('Absence of a rehearsal marker does not prove authorization, consent, or human-pilot status.');

  const summary = {
    generated_at: new Date().toISOString(),
    status: resultStatus,
    data_classification: dataClassification,
    limitations,
    participants: {
      total: datasets.participants.records.length,
      withdrawn: datasets.participants.records.filter((row) => row.withdrawn === 'true').length,
      by_role: summarizeParticipantRoles(datasets.participants.records, options.minimumGroupSize),
    },
    observations: observationSummary,
    feedback: feedback.length ? {
      status: 'DescriptiveResults',
      rows: feedback.length,
      by_item_and_mode: summarizeFeedbackItems(feedback, options.minimumGroupSize),
      interpretation: 'Item-level descriptive ratings only; no pooled ISO or validated quality score.',
    } : { status: 'NoResults', rows: 0 },
    native_acceptance: datasets.native.records.length
      ? { status: 'EvidenceRowsPresent', rows: datasets.native.records.length, by_status: nativeStatuses }
      : { status: 'NoResults', rows: 0 },
  };

  return { valid: errors.length === 0, errors, warnings, summary };
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--input') options.input = argv[++index];
    else if (argv[index] === '--out') options.out = argv[++index];
    else if (argv[index] === '--min-group-size') options.minimumGroupSize = Number(argv[++index]);
    else if (argv[index] === '--help') options.help = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (options.help || !options.input) {
    console.log('Usage: node validate_and_summarize.mjs --input <protected-data-directory> [--out <summary.json>] [--min-group-size <approved-number>]');
    process.exitCode = options.help ? 0 : 2;
    return;
  }
  if (options.minimumGroupSize !== undefined && (!Number.isInteger(options.minimumGroupSize) || options.minimumGroupSize < 2)) {
    console.error('--min-group-size must be an approved integer of at least 2');
    process.exitCode = 2;
    return;
  }
  const result = await validateAndSummarize(path.resolve(options.input), { minimumGroupSize: options.minimumGroupSize });
  const rendered = `${JSON.stringify(result, null, 2)}\n`;
  if (!result.valid) {
    console.error(rendered);
    process.exitCode = 1;
    return;
  }
  if (options.out) await writeFile(path.resolve(options.out), rendered, { encoding: 'utf8', flag: 'wx' });
  console.log(rendered.trimEnd());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}

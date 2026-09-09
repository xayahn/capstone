'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AdminMutation,
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
  DashboardState,
} from '@/shared/domain';
import { humanizeStatus } from '@/shared/domain';
import { allowedAppointmentTransitions } from '@/shared/workflow';

type ModuleId = 'overview' | 'appointments' | 'documents' | 'clergy' | 'records' | 'queue' | 'announcements' | 'reports';

const NAV_ITEMS: { id: ModuleId; label: string; number: string }[] = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'appointments', label: 'Appointments', number: '02' },
  { id: 'documents', label: 'Document review', number: '03' },
  { id: 'clergy', label: 'Clergy schedule', number: '04' },
  { id: 'records', label: 'Parish records', number: '05' },
  { id: 'queue', label: 'Walk-in queue', number: '06' },
  { id: 'announcements', label: 'Announcements', number: '07' },
  { id: 'reports', label: 'Reports', number: '08' },
];

const TRANSITION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  documents_pending: 'Await documents',
  under_review: 'Start review',
  needs_changes: 'Request changes',
  ready_to_approve: 'Mark ready',
  approved: 'Approve schedule',
  rejected: 'Reject request',
  completed: 'Mark completed',
  cancelled: 'Cancel request',
  no_show: 'Mark no-show',
};

const REASON_REQUIRED = new Set<AppointmentStatus>(['needs_changes', 'rejected', 'cancelled']);
const QUEUE_PURPOSES = [
  'Baptism inquiry',
  'Wedding inquiry',
  'Document submission',
  'Certificate request',
  'General inquiry',
] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value));
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function tone(status: string): string {
  if (['approved', 'completed', 'verified', 'ready_to_approve', 'serving', 'verified_against_archive'].includes(status)) return 'ready';
  if (['rejected', 'cancelled', 'needs_changes', 'needs_replacement', 'no_show'].includes(status)) return 'danger';
  if (['under_review', 'submitted'].includes(status)) return 'review';
  return 'pending';
}

function roleLabel(role: DashboardState['actor']['role']): string {
  return role === 'system_admin' ? 'System administrator' : humanizeStatus(role);
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="state-panel" role="alert">
      <span className="state-icon">!</span>
      <h1>We could not open the portal</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={onRetry}>Try again</button>
    </section>
  );
}

function StatusPill({ value }: { value: string }) {
  return <span className={`status ${tone(value)}`}>{humanizeStatus(value)}</span>;
}

export function AdminPortal({ signedInName, signOutPath }: { signedInName: string; signOutPath: string }) {
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentStatus, setAppointmentStatus] = useState('all');
  const [appointmentReason, setAppointmentReason] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [queueParishId, setQueueParishId] = useState('');
  const [counter, setCounter] = useState('Window 1');
  const [queueVisitorName, setQueueVisitorName] = useState('');
  const [queueService, setQueueService] = useState<(typeof QUEUE_PURPOSES)[number]>('General inquiry');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState<'all' | 'parish'>('parish');
  const [announcementParishId, setAnnouncementParishId] = useState('');
  const [recordParishId, setRecordParishId] = useState('');
  const [recordType, setRecordType] = useState('Baptismal');
  const [recordSubject, setRecordSubject] = useState('');
  const [recordEventDate, setRecordEventDate] = useState('');
  const [recordReference, setRecordReference] = useState('');
  const [assignmentParishId, setAssignmentParishId] = useState('');
  const [assignmentClergyId, setAssignmentClergyId] = useState('');
  const [assignmentVenueId, setAssignmentVenueId] = useState('');
  const [assignmentService, setAssignmentService] = useState('');
  const [assignmentStartsAt, setAssignmentStartsAt] = useState('');
  const [assignmentEndsAt, setAssignmentEndsAt] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<'parish_staff' | 'clergy'>('parish_staff');
  const [newUserParishId, setNewUserParishId] = useState('');
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueCapacity, setNewVenueCapacity] = useState('');
  const [newVenueParishId, setNewVenueParishId] = useState('');

  const loadState = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/state', { cache: 'no-store', headers: { Accept: 'application/json' } });
      const payload = await response.json() as DashboardState | { error?: string };
      if (!response.ok || !('actor' in payload)) throw new Error('error' in payload ? payload.error : 'The portal did not return valid data.');
      setData(payload);
      setSelectedAppointmentId((current) => current && payload.appointments.some((item) => item.id === current) ? current : payload.appointments[0]?.id ?? null);
      setQueueParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setAnnouncementParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setRecordParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setAssignmentParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setNewUserParishId((current) => current || payload.parishes[0]?.id || '');
      setNewVenueParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The portal could not load.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadState(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadState]);

  const runMutation = useCallback(async (mutation: AdminMutation, successMessage: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch('/api/admin/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(mutation),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The action could not be completed.');
      setNotice(successMessage);
      await loadState(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The action could not be completed.');
    } finally {
      setBusy(false);
    }
  }, [loadState]);

  const selectedAppointment = data?.appointments.find((item) => item.id === selectedAppointmentId) ?? null;
  const filteredAppointments = useMemo(() => {
    if (!data) return [];
    const query = appointmentSearch.trim().toLowerCase();
    return data.appointments.filter((item) => {
      const statusMatch = appointmentStatus === 'all' || item.status === appointmentStatus;
      const textMatch = !query || `${item.reference} ${item.parishioner} ${item.service} ${item.parish} ${item.clergy}`.toLowerCase().includes(query);
      return statusMatch && textMatch;
    });
  }, [data, appointmentSearch, appointmentStatus]);

  const filteredDocuments = useMemo(() => {
    if (!data) return [];
    const query = documentSearch.trim().toLowerCase();
    return data.documents.filter((item) => !query || `${item.reference} ${item.parishioner} ${item.service} ${item.requirement} ${item.status}`.toLowerCase().includes(query));
  }, [data, documentSearch]);

  async function uploadDocument(document: AppointmentDocument, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('appointmentId', document.appointmentId);
      form.set('requirementId', document.requirementId);
      const response = await fetch('/api/admin/documents/upload', { method: 'POST', body: form });
      const payload = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? 'The file could not be uploaded.');
      setNotice(payload.message ?? 'The document was submitted for review.');
      await loadState(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The file could not be uploaded.');
    } finally {
      setBusy(false);
    }
  }

  function openModule(module: ModuleId) {
    setActiveModule(module);
    setNotice(null);
    document.getElementById('main-content')?.focus();
  }

  if (loading) {
    return <main className="loading-shell"><div className="loading-mark" aria-hidden="true">PL</div><p>Preparing your parish workspace…</p></main>;
  }
  if (error && !data) return <ErrorPanel message={error} onRetry={() => void loadState()} />;
  if (!data) return null;

  const pendingAppointments = data.appointments.filter((item) => !['approved', 'completed', 'cancelled', 'rejected', 'no_show'].includes(item.status));
  const reviewDocuments = data.documents.filter((item) => ['submitted', 'under_review'].includes(item.status));
  const conflicts = data.appointments.filter((item) => item.conflict && !['cancelled', 'rejected', 'completed'].includes(item.status));
  const waitingQueue = data.queue.filter((item) => item.status === 'waiting');
  const servingQueue = data.queue.filter((item) => item.status === 'serving');
  const permittedTransitions = selectedAppointment ? allowedAppointmentTransitions(selectedAppointment.status, data.actor.role) : [];
  const today = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const assignmentClergyOptions = data.clergyOptions.filter((item) => !item.parishId || item.parishId === assignmentParishId);
  const assignmentVenueOptions = data.venueOptions.filter((item) => item.parishId === assignmentParishId);
  const effectiveClergyId = assignmentClergyOptions.some((item) => item.id === assignmentClergyId) ? assignmentClergyId : assignmentClergyOptions[0]?.id ?? '';
  const effectiveVenueId = assignmentVenueOptions.some((item) => item.id === assignmentVenueId) ? assignmentVenueId : assignmentVenueOptions[0]?.id ?? '';

  function appointmentTable(items: Appointment[], compact = false) {
    if (!items.length) return <div className="empty-state"><strong>No matching appointments</strong><span>Adjust the filters or wait for a new request.</span></div>;
    return (
      <div className="table-wrap" tabIndex={0} aria-label="Scrollable appointment table">
        <table>
          <caption className="sr-only">Sacramental appointment requests</caption>
          <thead><tr><th scope="col">Parishioner</th><th scope="col">Service</th><th scope="col">Schedule</th><th scope="col">Documents</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{items.map((item) => (
            <tr key={item.id} className={selectedAppointmentId === item.id ? 'selected-row' : undefined}>
              <td><strong>{item.parishioner}</strong><small>{item.reference} · {item.parish}</small></td>
              <td>{item.service}<small>{item.clergy}</small></td>
              <td>{formatDateTime(item.startsAt)}<small>{item.venue}</small></td>
              <td>{item.verifiedDocuments} of {item.requiredDocuments} verified</td>
              <td><StatusPill value={item.status} />{item.conflict && <small className="conflict-text">Schedule conflict</small>}</td>
              <td><button className="row-action" onClick={() => { setSelectedAppointmentId(item.id); if (compact) openModule('appointments'); }}>Review</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  let moduleContent;
  if (activeModule === 'overview') {
    moduleContent = <>
      <section className="welcome-card" aria-labelledby="overview-title">
        <div><span className="eyebrow light">{data.actor.parishName}</span><h2 id="overview-title">Today’s parish operations, at a glance.</h2><p>Review documentary requirements, resolve schedule conflicts, and assist walk-in parishioners from one accountable workspace.</p></div>
        <button className="primary-button" onClick={() => openModule('appointments')}>Review pending requests <span aria-hidden="true">→</span></button>
      </section>
      <section className="kpi-grid" aria-label="Current operational metrics">
        <article className="kpi-card"><span>Open appointment requests</span><strong>{pendingAppointments.length}</strong><small>{data.appointments.length} visible in your scope</small></article>
        <article className="kpi-card"><span>Documents to verify</span><strong>{reviewDocuments.length}</strong><small>Human review required</small></article>
        <article className="kpi-card"><span>Schedule conflicts</span><strong className={conflicts.length ? 'warning-value' : undefined}>{conflicts.length}</strong><small>{conflicts.length ? 'Approval is blocked' : 'No current overlaps'}</small></article>
        <article className="kpi-card"><span>Walk-ins waiting</span><strong>{waitingQueue.length}</strong><small>{servingQueue.length} currently serving</small></article>
      </section>
      <section className="content-grid">
        <article className="panel appointments-panel"><div className="panel-heading"><div><span className="eyebrow">Action required</span><h2>Upcoming appointments</h2></div><button className="text-button" onClick={() => openModule('appointments')}>View all <span aria-hidden="true">→</span></button></div>{appointmentTable(pendingAppointments.slice(0, 5), true)}</article>
        <aside className="panel queue-panel"><div className="panel-heading"><div><span className="eyebrow">Front desk</span><h2>Live queue</h2></div><span className="queue-count">{waitingQueue.length} waiting</span></div>{servingQueue[0] ? <div className="now-serving"><span>Now serving</span><strong>{servingQueue[0].number}</strong><small>{servingQueue[0].service} · {servingQueue[0].counter}</small></div> : <div className="empty-mini">No active counter</div>}<ol className="queue-list">{waitingQueue.slice(0, 3).map((ticket, index) => <li key={ticket.id}><strong>{ticket.number}</strong><span>{ticket.service}</span><small>#{index + 1}</small></li>)}</ol><button className="secondary-button" onClick={() => openModule('queue')}>Open queue console</button></aside>
      </section>
    </>;
  } else if (activeModule === 'appointments') {
    moduleContent = <section className="module-layout">
      <article className="panel module-primary">
        <div className="panel-heading"><div><span className="eyebrow">Sacramental services</span><h2>Appointment coordination</h2></div><span className="result-count">{filteredAppointments.length} requests</span></div>
        <div className="filter-bar"><label><span>Search</span><input value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Reference, name, service, parish…" /></label><label><span>Status</span><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value)}><option value="all">All statuses</option>{['submitted','documents_pending','under_review','needs_changes','ready_to_approve','approved','completed','cancelled','rejected','no_show'].map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}</select></label></div>
        {appointmentTable(filteredAppointments)}
      </article>
      <aside className="panel detail-panel" aria-label="Selected appointment details">
        {selectedAppointment ? <>
          <div className="panel-heading"><div><span className="eyebrow">{selectedAppointment.reference}</span><h2>{selectedAppointment.parishioner}</h2></div><StatusPill value={selectedAppointment.status} /></div>
          <dl className="detail-list"><div><dt>Service</dt><dd>{selectedAppointment.service}</dd></div><div><dt>Parish</dt><dd>{selectedAppointment.parish}</dd></div><div><dt>Participant(s)</dt><dd>{selectedAppointment.participants}</dd></div><div><dt>Schedule</dt><dd>{formatDateTime(selectedAppointment.startsAt)}</dd></div><div><dt>Clergy & venue</dt><dd>{selectedAppointment.clergy}<br />{selectedAppointment.venue}</dd></div><div><dt>Documents</dt><dd>{selectedAppointment.verifiedDocuments} of {selectedAppointment.requiredDocuments} human-verified</dd></div></dl>
          {selectedAppointment.conflict && <div className="alert danger"><strong>Approval blocked</strong><span>This interval overlaps another clergy or venue assignment.</span></div>}
          {selectedAppointment.reviewNote && <div className="note-box"><strong>Review note</strong><p>{selectedAppointment.reviewNote}</p></div>}
          {permittedTransitions.length ? <div className="decision-area"><label><span>Decision note</span><textarea value={appointmentReason} onChange={(event) => setAppointmentReason(event.target.value)} placeholder="Required for changes, rejection, or cancellation" /></label><div className="decision-buttons">{permittedTransitions.map((status) => <button key={status} disabled={busy || (REASON_REQUIRED.has(status) && appointmentReason.trim().length < 4)} className={status === 'approved' ? 'primary-button compact' : status === 'rejected' || status === 'cancelled' ? 'danger-button' : 'secondary-button compact'} onClick={() => void runMutation({ action: 'appointment.transition', appointmentId: selectedAppointment.id, status, expectedVersion: selectedAppointment.version, reason: appointmentReason }, `Appointment moved to ${humanizeStatus(status)}.`)}>{TRANSITION_LABELS[status] ?? humanizeStatus(status)}</button>)}</div></div> : <div className="empty-mini">No further actions are available for this status.</div>}
        </> : <div className="empty-state"><strong>Select an appointment</strong><span>Its review details will appear here.</span></div>}
      </aside>
    </section>;
  } else if (activeModule === 'documents') {
    moduleContent = <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Human verification</span><h2>Document review</h2></div><span className="result-count">{reviewDocuments.length} awaiting review</span></div>
      <div className="filter-bar single"><label><span>Search requirements</span><input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Reference, parishioner, service, requirement…" /></label></div>
      <div className="document-grid">{filteredDocuments.map((document) => <article className="document-card" key={`${document.appointmentId}-${document.requirementId}`}><div className="document-top"><div><span className="eyebrow">{document.reference} · {document.service}</span><h3>{document.requirement}</h3><p>{document.parishioner}</p></div><StatusPill value={document.status} /></div><div className="file-row"><span>{document.fileName ?? 'No file submitted'}</span>{document.fileName && !document.id.startsWith('missing:') && <a className="text-link" href={`/api/admin/documents/${encodeURIComponent(document.id)}`}>Download</a>}</div><label className="upload-button"><span>Upload {document.fileName ? 'replacement' : 'file'}</span><input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => void uploadDocument(document, event)} disabled={busy} /></label>{document.fileName && !document.id.startsWith('missing:') && <><label className="note-input"><span>Reviewer note</span><input value={documentNotes[document.id] ?? ''} onChange={(event) => setDocumentNotes((notes) => ({ ...notes, [document.id]: event.target.value }))} placeholder="Reason required when requesting replacement" /></label><div className="document-actions"><button className="approve-button" disabled={busy} onClick={() => void runMutation({ action: 'document.review', documentId: document.id, status: 'verified', note: documentNotes[document.id] }, 'Document marked human-verified.')}>Verify document</button><button className="danger-button" disabled={busy || (documentNotes[document.id]?.trim().length ?? 0) < 4} onClick={() => void runMutation({ action: 'document.review', documentId: document.id, status: 'needs_replacement', note: documentNotes[document.id] }, 'Replacement requested from the parishioner.')}>Request replacement</button></div></>}</article>)}</div>
    </section>;
  } else if (activeModule === 'clergy') {
    moduleContent = <section className="module-layout"><article className="panel module-primary"><div className="panel-heading"><div><span className="eyebrow">Conflict-aware calendar</span><h2>Clergy schedule</h2></div><span className="result-count">{data.clergyAssignments.length} assignments</span></div><div className="timeline">{data.clergyAssignments.length ? data.clergyAssignments.map((assignment) => <article key={assignment.id}><time>{formatDateTime(assignment.startsAt)}</time><div><h3>{assignment.service}</h3><p>{assignment.clergy} · {assignment.venue}</p><small>{assignment.parish} · ends {formatDateTime(assignment.endsAt)}</small></div>{data.actor.role !== 'clergy' && <button className="danger-button" disabled={busy} onClick={() => void runMutation({ action: 'clergy.assignment.cancel', assignmentId: assignment.id }, 'Clergy assignment cancelled.')}>Cancel</button>}</article>) : <div className="empty-state"><strong>No assignments in this scope</strong><span>Confirmed clergy assignments will appear here.</span></div>}</div><div className="alert info"><strong>Scheduling safeguard</strong><span>New assignments are rejected when any part of the priest, venue, appointment, or blocked-time interval overlaps.</span></div></article><aside className="panel detail-panel"><span className="eyebrow">New assignment</span><h2>Reserve clergy and venue</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Schedule changes are assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'clergy.assignment.create', parishId: assignmentParishId, clergyId: effectiveClergyId, venueId: effectiveVenueId, service: assignmentService, startsAt: new Date(assignmentStartsAt).toISOString(), endsAt: new Date(assignmentEndsAt).toISOString() }, 'Clergy assignment created.'); }}><label><span>Parish</span><select value={assignmentParishId} onChange={(event) => { setAssignmentParishId(event.target.value); setAssignmentClergyId(''); setAssignmentVenueId(''); }}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Priest</span><select value={effectiveClergyId} onChange={(event) => setAssignmentClergyId(event.target.value)}>{assignmentClergyOptions.map((clergy) => <option value={clergy.id} key={clergy.id}>{clergy.name}</option>)}</select></label><label><span>Venue</span><select value={effectiveVenueId} onChange={(event) => setAssignmentVenueId(event.target.value)}>{assignmentVenueOptions.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label><label><span>Service or duty</span><input value={assignmentService} maxLength={100} onChange={(event) => setAssignmentService(event.target.value)} placeholder="e.g. Daily Mass" /></label><label><span>Starts</span><input type="datetime-local" value={assignmentStartsAt} onChange={(event) => setAssignmentStartsAt(event.target.value)} /></label><label><span>Ends</span><input type="datetime-local" value={assignmentEndsAt} onChange={(event) => setAssignmentEndsAt(event.target.value)} /></label><button className="primary-button" disabled={busy || !effectiveClergyId || !effectiveVenueId || assignmentService.trim().length < 3 || !assignmentStartsAt || !assignmentEndsAt}>Create assignment</button><small>The server performs a second conflict check before saving.</small></form>}</aside></section>;
  } else if (activeModule === 'records') {
    moduleContent = <section className="module-layout"><article className="panel module-primary"><div className="panel-heading"><div><span className="eyebrow">Indexed working records</span><h2>Parish records</h2></div><span className="result-count">{data.records.length} records</span></div><div className="alert info"><strong>Archive boundary</strong><span>ParishLink stores indexed working records. Verification means an authorized person checked the entry against the parish archive; it does not replace that archive or canonical authority.</span></div><div className="record-grid">{data.records.length ? data.records.map((record) => <article key={record.id}><div className="record-seal" aria-hidden="true">✦</div><div><span className="eyebrow">{record.type}</span><h3>{record.subject}</h3><p>{record.parish}</p><small>{formatDate(record.eventDate)} · {record.reference}</small></div><div className="record-actions"><StatusPill value={record.status} />{record.status === 'working_copy' && data.actor.role !== 'clergy' && <button className="approve-button" disabled={busy} onClick={() => void runMutation({ action: 'record.verify', recordId: record.id }, 'Record verified against the authorized archive.')}>Verify</button>}</div></article>) : <div className="empty-state"><strong>No records in this scope</strong><span>Create an indexed working record to begin.</span></div>}</div></article><aside className="panel detail-panel"><span className="eyebrow">New working record</span><h2>Index an archive entry</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Record changes are assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'record.create', parishId: recordParishId, recordType, subjectName: recordSubject, eventDate: recordEventDate, reference: recordReference }, 'Working record created.'); setRecordSubject(''); setRecordEventDate(''); setRecordReference(''); }}><label><span>Parish</span><select value={recordParishId} onChange={(event) => setRecordParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Record type</span><select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option>Baptismal</option><option>Marriage</option><option>Confirmation</option><option>First Communion</option><option>Funeral Mass</option></select></label><label><span>Subject name</span><input value={recordSubject} maxLength={160} onChange={(event) => setRecordSubject(event.target.value)} /></label><label><span>Event date</span><input type="date" value={recordEventDate} onChange={(event) => setRecordEventDate(event.target.value)} /></label><label><span>Archive reference</span><input value={recordReference} maxLength={50} onChange={(event) => setRecordReference(event.target.value.toUpperCase())} placeholder="BAP-SGP-2026-0001" /></label><button className="primary-button" disabled={busy || recordSubject.trim().length < 3 || !recordEventDate || recordReference.trim().length < 6}>Create working record</button><small>Creation and later archive verification are recorded separately in the audit trail.</small></form>}</aside></section>;
  } else if (activeModule === 'queue') {
    const parishQueue = data.queue.filter((ticket) => ticket.parishId === queueParishId);
    const active = parishQueue.find((ticket) => ticket.status === 'serving');
    const waiting = parishQueue.filter((ticket) => ticket.status === 'waiting');
    moduleContent = <section className="module-layout queue-console">
      <article className="panel module-primary">
        <div className="panel-heading"><div><span className="eyebrow">Inclusive front desk</span><h2>Walk-in queue</h2></div><span className="result-count">{waiting.length} waiting</span></div>
        <div className="filter-bar"><label><span>Parish</span><select value={queueParishId} onChange={(event) => setQueueParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Counter or window</span><input value={counter} onChange={(event) => setCounter(event.target.value)} /></label></div>
        <div className="queue-board"><div className="now-serving large"><span>Now serving</span><strong>{active?.number ?? '—'}</strong><small>{active ? `${active.parishioner} · ${active.service} · ${active.counter}` : 'No ticket is currently active'}</small></div><div className="queue-controls">{active ? <button className="approve-button" disabled={busy} onClick={() => void runMutation({ action: 'queue.complete', ticketId: active.id }, `${active.number} marked served.`)}>Complete {active.number}</button> : <button className="primary-button" disabled={busy || !waiting.length || counter.trim().length < 2} onClick={() => void runMutation({ action: 'queue.call_next', parishId: queueParishId, counter }, 'The next walk-in has been called.')}>Call next ticket</button>}</div></div>
        <ol className="waiting-list">{waiting.map((ticket, index) => <li key={ticket.id}><span className="queue-position">{index + 1}</span><strong>{ticket.number}</strong><div><span>{ticket.parishioner}</span><small>{ticket.service} · issued {formatDateTime(ticket.issuedAt)}</small></div>{ticket.priority > 0 && <span className="status pending">Priority {ticket.priority}</span>}</li>)}</ol>
      </article>
      <aside className="panel detail-panel">
        <span className="eyebrow">Front-desk ticket</span><h2>Include visitors without a device</h2>
        <p className="body-copy">Mobile self-ticketing is a convenience, never an access requirement. Staff can issue the same queue ticket at the parish office.</p>
        {data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Ticket issuance is assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void runMutation({ action: 'queue.issue', parishId: queueParishId, parishionerName: queueVisitorName, service: queueService }, 'Front-desk ticket issued.');
          setQueueVisitorName('');
        }}>
          <label><span>Visitor name</span><input value={queueVisitorName} maxLength={120} onChange={(event) => setQueueVisitorName(event.target.value)} autoComplete="off" /></label>
          <label><span>Purpose</span><select value={queueService} onChange={(event) => setQueueService(event.target.value as (typeof QUEUE_PURPOSES)[number])}>{QUEUE_PURPOSES.map((purpose) => <option value={purpose} key={purpose}>{purpose}</option>)}</select></label>
          <button className="primary-button" disabled={busy || queueVisitorName.trim().length < 2}>Issue walk-in ticket</button>
        </form>}
        <div className="note-box"><strong>Priority handling</strong><p>Any priority exception must follow the parish-approved policy and remain auditable. Default ordering is FIFO within the parish.</p></div>
      </aside>
    </section>;
  } else if (activeModule === 'announcements') {
    moduleContent = <section className="module-layout"><article className="panel module-primary"><div className="panel-heading"><div><span className="eyebrow">Plain-text publishing</span><h2>Announcements</h2></div><span className="result-count">{data.announcements.length} published</span></div><div className="announcement-list">{data.announcements.map((announcement) => <article key={announcement.id}><div><span className="eyebrow">{announcement.parish}</span><h3>{announcement.title}</h3><p>{announcement.body}</p><small>Published {formatDateTime(announcement.publishedAt)} by {announcement.author}</small></div></article>)}</div></article><aside className="panel detail-panel"><span className="eyebrow">New notice</span><h2>Publish an announcement</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Publishing is assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'announcement.publish', title: announcementTitle, body: announcementBody, audience: announcementAudience, parishId: announcementParishId }, 'Announcement published.'); setAnnouncementTitle(''); setAnnouncementBody(''); }}><label><span>Audience</span><select value={announcementAudience} onChange={(event) => setAnnouncementAudience(event.target.value as 'all' | 'parish')}><option value="parish">One parish</option>{data.actor.role === 'system_admin' && <option value="all">All eight parishes</option>}</select></label>{announcementAudience === 'parish' && <label><span>Parish</span><select value={announcementParishId} onChange={(event) => setAnnouncementParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label>}<label><span>Title</span><input value={announcementTitle} maxLength={120} onChange={(event) => setAnnouncementTitle(event.target.value)} /></label><label><span>Message</span><textarea value={announcementBody} maxLength={2000} onChange={(event) => setAnnouncementBody(event.target.value)} /></label><button className="primary-button" disabled={busy || announcementTitle.trim().length < 4 || announcementBody.trim().length < 10}>Publish notice</button><small>Content is stored and rendered as plain text to protect readers from injected markup.</small></form>}</aside></section>;
  } else {
    const statusCounts = data.appointments.reduce<Record<string, number>>((counts, appointment) => ({ ...counts, [appointment.status]: (counts[appointment.status] ?? 0) + 1 }), {});
    moduleContent = <><section className="report-grid"><article className="panel"><span className="eyebrow">Operational snapshot</span><h2>Appointment status distribution</h2><div className="metric-list">{Object.entries(statusCounts).map(([status, count]) => <div key={status}><span>{humanizeStatus(status)}</span><strong>{count}</strong></div>)}</div></article><article className="panel"><span className="eyebrow">ISO/IEC 25010</span><h2>Evaluation evidence</h2><div className="empty-state aligned"><strong>No validated evaluation results displayed</strong><span>Scores will appear only after the approved questionnaire, respondent plan, consent process, and completed responses are available. The prototype’s illustrative values are intentionally excluded.</span></div></article><article className="panel wide"><span className="eyebrow">Data quality</span><h2>Current release indicators</h2><div className="quality-grid"><div><strong>{data.records.filter((record) => record.status === 'verified_against_archive').length}</strong><span>records checked against archive</span></div><div><strong>{data.documents.filter((document) => document.status === 'verified').length}</strong><span>human-verified submissions</span></div><div><strong>{conflicts.length}</strong><span>unresolved schedule conflicts</span></div><div><strong>{data.announcements.length}</strong><span>published notices in scope</span></div></div></article></section><section className="configuration-grid"><article className="panel"><span className="eyebrow">Scheduling resources</span><h2>Add a parish venue</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Venue setup is assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'venue.create', parishId: newVenueParishId, name: newVenueName, ...(newVenueCapacity ? { capacity: Number(newVenueCapacity) } : {}) }, 'Parish venue created.'); setNewVenueName(''); setNewVenueCapacity(''); }}><label><span>Parish</span><select value={newVenueParishId} onChange={(event) => setNewVenueParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Venue name</span><input value={newVenueName} maxLength={100} onChange={(event) => setNewVenueName(event.target.value)} placeholder="e.g. Main church" /></label><label><span>Capacity (optional)</span><input type="number" min="1" max="10000" value={newVenueCapacity} onChange={(event) => setNewVenueCapacity(event.target.value)} /></label><button className="primary-button" disabled={busy || newVenueName.trim().length < 3}>Add venue</button></form>}</article>{data.actor.role === 'system_admin' && <article className="panel"><span className="eyebrow">Role-based access</span><h2>Provision internal access</h2><form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'user.provision', fullName: newUserName, email: newUserEmail, role: newUserRole, parishId: newUserParishId }, 'Internal access provisioned.'); setNewUserName(''); setNewUserEmail(''); }}><label><span>Complete name</span><input value={newUserName} maxLength={120} onChange={(event) => setNewUserName(event.target.value)} /></label><label><span>Email address</span><input type="email" value={newUserEmail} maxLength={254} onChange={(event) => setNewUserEmail(event.target.value)} /></label><label><span>Role</span><select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as 'parish_staff' | 'clergy')}><option value="parish_staff">Parish staff</option><option value="clergy">Clergy / priest</option></select></label><label><span>Parish</span><select value={newUserParishId} onChange={(event) => setNewUserParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><button className="primary-button" disabled={busy || newUserName.trim().length < 3 || !newUserEmail.includes('@')}>Provision access</button><small>The person signs in through the protected admin identity provider using this exact email. No staff password is stored by ParishLink.</small></form></article>}{data.actor.role === 'system_admin' && <article className="panel configuration-wide"><div className="panel-heading"><div><span className="eyebrow">Authorized personnel</span><h2>Internal access register</h2></div><span className="result-count">{data.accessUsers.length} accounts</span></div><div className="access-list">{data.accessUsers.map((user) => <div key={user.id}><div><strong>{user.name}</strong><span>{user.email} · {humanizeStatus(user.role)} · {user.parish}</span></div><button className={user.isActive ? 'danger-button' : 'approve-button'} disabled={busy || user.id === data.actor.id} onClick={() => void runMutation({ action: 'user.set_active', userId: user.id, isActive: !user.isActive }, `${user.name} access ${user.isActive ? 'deactivated' : 'activated'}.`)}>{user.isActive ? 'Deactivate' : 'Activate'}</button></div>)}</div></article>}</section></>;
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-seal" aria-hidden="true">PL</div><div><strong>ParishLink</strong><span>Internal administration</span></div></div>
        <div className="parish-context"><span className="eyebrow">Access scope</span><strong>{data.actor.parishName}</strong><span>{roleLabel(data.actor.role)}</span></div>
        <nav aria-label="Primary navigation">{NAV_ITEMS.map((item) => <button key={item.id} className={activeModule === item.id ? 'nav-link active' : 'nav-link'} aria-current={activeModule === item.id ? 'page' : undefined} onClick={() => openModule(item.id)}><span aria-hidden="true">{item.number}</span>{item.label}</button>)}</nav>
        <div className="sidebar-foot"><span className="live-dot" aria-hidden="true" />Data refreshed {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(data.generatedAt))}</div>
      </aside>
      <main className="admin-main" id="main-content" tabIndex={-1}>
        <header className="topbar"><div><span className="eyebrow">{today}</span><h1>{NAV_ITEMS.find((item) => item.id === activeModule)?.label}</h1></div><div className="topbar-actions"><div className="profile-button" aria-label={`${data.actor.name}, ${roleLabel(data.actor.role)}`}><span className="avatar">{initials(data.actor.name || signedInName)}</span><span><strong>{data.actor.name}</strong><small>{roleLabel(data.actor.role)}</small></span></div><a className="signout-link" href={signOutPath}>Sign out</a></div></header>
        {data.source === 'demo' && <div className="demo-banner"><strong>Demonstration workspace</strong><span>This local preview uses fictional records. It is not evidence of deployment, UAT, or parish approval.</span></div>}
        {(notice || error) && <div className={`toast ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><span>{error ?? notice}</span><button aria-label="Dismiss message" onClick={() => { setError(null); setNotice(null); }}>×</button></div>}
        {moduleContent}
        <div className="sr-only" aria-live="polite">{busy ? 'Working on your request.' : 'Ready.'}</div>
      </main>
    </div>
  );
}

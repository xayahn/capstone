'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  AdminMutation,
  Appointment,
  AppointmentDocument,
  AppointmentStatus,
  ChangeRequest,
  DashboardState,
} from '@/shared/domain';
import { AssignmentBrowser } from '@/frontend/components/assignment-browser';
import { RecordBrowser } from '@/frontend/components/record-browser';
import { adminRequest, adminMutationKey, AdminAccessError } from '@/frontend/lib/admin-request';
import { RequestEpoch } from '@/frontend/lib/request-epoch';
import { CHANGE_PASSWORD_URL, issueTemporaryPassword, signOutStaff } from '@/frontend/lib/staff-session';
import { utcTimestamp } from '@/shared/validation';
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
  }).format(new Date(utcTimestamp(value)));
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

function ErrorPanel({ message, onRetry, signOutPath }: { message: string; onRetry: () => void; signOutPath: string }) {
  return (
    <section className="state-panel" role="alert">
      <span className="state-icon">!</span>
      <h1>We could not open the portal</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={onRetry}>Try again</button>
      <button type="button" className="text-link" onClick={() => void signOutStaff(signOutPath)}>Sign in again</button>
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
  const busyRef = useRef(false);
  const readEpoch = useRef(new RequestEpoch());
  const actorScope = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [appointmentView, setAppointmentView] = useState<'list' | 'changes'>('list');
  const [selectedChangeRequestId, setSelectedChangeRequestId] = useState<string | null>(null);
  const [changeRequestSearch, setChangeRequestSearch] = useState('');
  const [changeRequestStatus, setChangeRequestStatus] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn'>('all');
  const [changeDecisionNote, setChangeDecisionNote] = useState('');
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

  const resetPrivateDrafts = useCallback(() => {
    setSelectedAppointmentId(null); setAppointmentSearch(''); setAppointmentReason('');
    setAppointmentView('list'); setSelectedChangeRequestId(null); setChangeRequestSearch(''); setChangeRequestStatus('all'); setChangeDecisionNote('');
    setDocumentSearch(''); setDocumentNotes({}); setQueueVisitorName('');
    setAnnouncementTitle(''); setAnnouncementBody(''); setRecordSubject(''); setRecordReference(''); setRecordEventDate('');
    setAssignmentService(''); setAssignmentStartsAt(''); setAssignmentEndsAt('');
    setNewUserName(''); setNewUserEmail(''); setNewVenueName(''); setNewVenueCapacity('');
    setQueueParishId(''); setAnnouncementParishId(''); setRecordParishId(''); setAssignmentParishId('');
    setAssignmentClergyId(''); setAssignmentVenueId(''); setNewUserParishId(''); setNewVenueParishId('');
    setNotice(null);
  }, []);

  const clearPrivateState = useCallback(() => {
    readEpoch.current.invalidate(); actorScope.current = null;
    setData(null); setLoading(false); resetPrivateDrafts();
  }, [resetPrivateDrafts]);

  const handleAccessLost = useCallback((caught: AdminAccessError) => {
    clearPrivateState();
    setError(caught.message);
  }, [clearPrivateState]);

  const loadState = useCallback(async (showSpinner = true) => {
    const ticket = readEpoch.current.begin();
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const { response, payload } = await adminRequest<DashboardState | { error?: string }>('/api/admin/state', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!readEpoch.current.isCurrent(ticket)) return false;
      if (!response.ok || !('actor' in payload)) throw new Error('error' in payload ? payload.error : 'The portal did not return valid data.');
      const scope = JSON.stringify([payload.actor.id, payload.actor.role, payload.actor.parishId, payload.actor.clergyProfileId]);
      if (actorScope.current !== null && actorScope.current !== scope) resetPrivateDrafts();
      actorScope.current = scope;
      setData(payload);
      setSelectedAppointmentId((current) => current && payload.appointments.some((item) => item.id === current) ? current : payload.appointments[0]?.id ?? null);
      setSelectedChangeRequestId((current) => current && payload.changeRequests.some((item) => item.id === current) ? current : payload.changeRequests[0]?.id ?? null);
      setQueueParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setAnnouncementParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setRecordParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setAssignmentParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      setNewUserParishId((current) => current || payload.parishes[0]?.id || '');
      setNewVenueParishId((current) => current || payload.actor.parishId || payload.parishes[0]?.id || '');
      return true;
    } catch (caught) {
      if (caught instanceof AdminAccessError) clearPrivateState();
      else if (!readEpoch.current.isCurrent(ticket)) return false;
      setError(caught instanceof Error ? caught.message : 'The portal could not load.');
      return false;
    } finally {
      if (readEpoch.current.isCurrent(ticket)) setLoading(false);
    }
  }, [clearPrivateState, resetPrivateDrafts]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadState(); }, 0);
    const refreshTimer = window.setInterval(() => { if (!busyRef.current && document.visibilityState === 'visible') void loadState(false); }, 30_000);
    const epoch = readEpoch.current;
    return () => { window.clearTimeout(initialLoad); window.clearInterval(refreshTimer); epoch.invalidate(); };
  }, [loadState]);

  const runMutation = useCallback(async (mutation: AdminMutation, successMessage: string) => {
    if (busyRef.current || !data) return false;
    readEpoch.current.invalidate();
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body = JSON.stringify(mutation);
      const retry = await adminMutationKey(data.actor.id, body);
      const { response, payload } = await adminRequest<{ error?: string }>('/api/admin/state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Idempotency-Key': retry.key,
        },
        body,
      });
      if (!response.ok) throw new Error(payload.error ?? 'The action could not be completed.');
      // The write succeeded even if the follow-up read is unavailable.
      try { sessionStorage.removeItem(retry.storageKey); } catch { /* Keeping the key is safer than losing a confirmed result. */ }
      setNotice(successMessage);
      const refreshed = await loadState(false);
      if (!refreshed) setError(successMessage + ' The latest view could not load. Refresh instead of submitting again.');
      return true;
    } catch (caught) {
      if (caught instanceof AdminAccessError) clearPrivateState();
      setError(caught instanceof Error ? caught.message : 'The action could not be completed.');
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [loadState, data, clearPrivateState]);

  /** System administrators issue a one-time password; it is shown once and never stored in plain text. */
  const issueTemporary = useCallback(async (userId: string, name: string) => {
    if (busyRef.current) return;
    if (!window.confirm(`Issue a new temporary password for ${name}? Their current password and sessions will stop working.`)) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await issueTemporaryPassword(userId);
      setNotice(`Temporary password for ${result.email}: ${result.temporaryPassword} (shown once; share it privately. They must change it at first sign-in.)`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The temporary password could not be issued.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

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

  const filteredChangeRequests = useMemo(() => {
    if (!data) return [];
    const query = changeRequestSearch.trim().toLowerCase();
    return data.changeRequests.filter((item) => {
      const statusMatch = changeRequestStatus === 'all' || item.status === changeRequestStatus;
      const textMatch = !query || `${item.reference} ${item.parishioner} ${item.service} ${item.parish} ${item.clergy} ${item.kind}`.toLowerCase().includes(query);
      return statusMatch && textMatch;
    });
  }, [data, changeRequestSearch, changeRequestStatus]);

  const selectedChangeRequest: ChangeRequest | null = filteredChangeRequests.find((item) => item.id === selectedChangeRequestId) ?? filteredChangeRequests[0] ?? null;

  const filteredDocuments = useMemo(() => {
    if (!data) return [];
    const query = documentSearch.trim().toLowerCase();
    return data.documents.filter((item) => !query || `${item.reference} ${item.parishioner} ${item.service} ${item.requirement} ${item.status}`.toLowerCase().includes(query));
  }, [data, documentSearch]);

  async function uploadDocument(document: AppointmentDocument, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    readEpoch.current.invalidate();
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('appointmentId', document.appointmentId);
      form.set('requirementId', document.requirementId);
      const { response, payload } = await adminRequest<{ error?: string; message?: string }>('/api/admin/documents/upload', { method: 'POST', body: form }, 60_000);
      if (!response.ok) throw new Error(payload.error ?? 'The file could not be uploaded.');
      setNotice(payload.message ?? 'The document was submitted for review.');
      await loadState(false);
    } catch (caught) {
      if (caught instanceof AdminAccessError) clearPrivateState();
      setError(caught instanceof Error ? caught.message : 'The file could not be uploaded.');
    } finally {
      busyRef.current = false;
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
  if (error && !data) return <ErrorPanel message={error} onRetry={() => void loadState()} signOutPath={signOutPath} />;
  if (!data) return null;

  const pendingAppointments = data.appointments.filter((item) => !['approved', 'completed', 'cancelled', 'rejected', 'no_show'].includes(item.status));
  const pendingChangeCount = data.changeRequests.filter((item) => item.status === 'pending').length;
  const selectedAppointmentPendingChange = selectedAppointment
    ? data.changeRequests.find((item) => item.appointmentId === selectedAppointment.id && item.status === 'pending') ?? null
    : null;
  const appointmentTotal = Object.values(data.metrics.appointmentStatuses).reduce((sum, count) => sum + (count ?? 0), 0);
  const pendingTotal = Object.entries(data.metrics.appointmentStatuses).reduce((sum, [status, count]) => sum + (['approved', 'completed', 'cancelled', 'rejected', 'no_show'].includes(status) ? 0 : count ?? 0), 0);
  const conflicts = data.appointments.filter((item) => item.conflict && !['cancelled', 'rejected', 'completed', 'no_show'].includes(item.status));
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
              <td><button className="row-action" onClick={() => { setSelectedAppointmentId(item.id); setAppointmentView('list'); if (compact) openModule('appointments'); }}>Review</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    );
  }

  function changeRequestTable(items: ChangeRequest[]) {
    if (!items.length) return <div className="empty-state"><strong>No matching change requests</strong><span>Parishioner reschedule and cancellation requests will appear here.</span></div>;
    return (
      <div className="table-wrap" tabIndex={0} aria-label="Scrollable change requests table">
        <table>
          <caption className="sr-only">Parishioner reschedule and cancellation requests</caption>
          <thead><tr><th scope="col">Parishioner</th><th scope="col">Request</th><th scope="col">Current → Proposed</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>{items.map((item) => (
            <tr key={item.id} className={selectedChangeRequest?.id === item.id ? 'selected-row' : undefined}>
              <td><strong>{item.parishioner}</strong><small>{item.reference} · {item.parish}</small></td>
              <td>{item.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'}<small>{item.service} · {item.clergy}</small></td>
              <td>{formatDateTime(item.currentStartsAt)}<small>{item.kind === 'reschedule' && item.proposedStartsAt ? `→ ${formatDateTime(item.proposedStartsAt)}` : 'Cancel scheduled slot'}</small></td>
              <td>
                <StatusPill value={item.status} />
                {item.status === 'pending' && item.kind === 'reschedule' && item.proposedSlotAvailable !== null && (
                  <small className={item.proposedSlotAvailable ? 'slot-status ready' : 'slot-status danger'}>
                    {item.proposedSlotAvailable ? 'Slot open' : 'Slot conflict'}
                  </small>
                )}
              </td>
              <td><button className="row-action" onClick={() => { setSelectedChangeRequestId(item.id); setChangeDecisionNote(''); }}>Review</button></td>
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
        <article className="kpi-card"><span>Open appointment requests</span><strong>{pendingTotal}</strong><small>{appointmentTotal} total in your scope</small></article>
        <article className="kpi-card"><span>Documents to verify</span><strong>{data.metrics.awaitingDocumentReview ?? '—'}</strong><small>{data.metrics.awaitingDocumentReview === null ? 'Parish staff access required' : 'Human review required'}</small></article>
        <article className="kpi-card"><span>Schedule conflicts</span><strong className={conflicts.length ? 'warning-value' : undefined}>{conflicts.length}</strong><small>{conflicts.length ? 'Approval is blocked' : 'No current overlaps'}</small></article>
        <article className="kpi-card"><span>Walk-ins waiting</span><strong>{data.metrics.waitingQueue ?? '—'}</strong><small>{data.metrics.servingQueue === null ? 'Front-desk access required' : `${data.metrics.servingQueue} currently serving`}</small></article>
      </section>
      <section className="content-grid">
        <article className="panel appointments-panel"><div className="panel-heading"><div><span className="eyebrow">Action required</span><h2>Upcoming appointments</h2></div><button className="text-button" onClick={() => openModule('appointments')}>View all <span aria-hidden="true">→</span></button></div>{appointmentTable(pendingAppointments.slice(0, 5), true)}</article>
        <aside className="panel queue-panel"><div className="panel-heading"><div><span className="eyebrow">Front desk</span><h2>Live queue</h2></div><span className="queue-count">{waitingQueue.length} waiting</span></div>{servingQueue[0] ? <div className="now-serving"><span>Now serving</span><strong>{servingQueue[0].number}</strong><small>{servingQueue[0].service} · {servingQueue[0].counter}</small></div> : <div className="empty-mini">No active counter</div>}<ol className="queue-list">{waitingQueue.slice(0, 3).map((ticket, index) => <li key={ticket.id}><strong>{ticket.number}</strong><span>{ticket.service}</span><small>#{index + 1}</small></li>)}</ol><button className="secondary-button" onClick={() => openModule('queue')}>Open queue console</button></aside>
      </section>
    </>;
  } else if (activeModule === 'appointments') {
    moduleContent = <section className="module-layout">
      <article className="panel module-primary">
        <div className="panel-heading">
          <div><span className="eyebrow">Sacramental services</span><h2>{appointmentView === 'changes' ? 'Schedule change requests' : 'Appointment coordination'}</h2></div>
          <span className="result-count">{appointmentView === 'changes' ? `${filteredChangeRequests.length} requests` : `${filteredAppointments.length} requests`}</span>
        </div>
        <div className="subnav-tabs" role="tablist" aria-label="Appointment views">
          <button type="button" role="tab" aria-selected={appointmentView === 'list'} className={appointmentView === 'list' ? 'subnav-tab active' : 'subnav-tab'} onClick={() => setAppointmentView('list')}>All appointments<strong className="subnav-count">{data.appointments.length}</strong></button>
          <button type="button" role="tab" aria-selected={appointmentView === 'changes'} className={appointmentView === 'changes' ? 'subnav-tab active' : 'subnav-tab'} onClick={() => setAppointmentView('changes')}>Change requests<strong className="subnav-count">{pendingChangeCount} pending</strong></button>
        </div>
        {appointmentView === 'list' ? <>
          <div className="filter-bar"><label><span>Search</span><input value={appointmentSearch} onChange={(event) => setAppointmentSearch(event.target.value)} placeholder="Reference, name, service, parish…" /></label><label><span>Status</span><select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value)}><option value="all">All statuses</option>{['submitted','documents_pending','under_review','needs_changes','ready_to_approve','approved','completed','cancelled','rejected','no_show'].map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}</select></label></div>
          {appointmentTable(filteredAppointments)}
        </> : <>
          <div className="filter-bar"><label><span>Search</span><input value={changeRequestSearch} onChange={(event) => setChangeRequestSearch(event.target.value)} placeholder="Reference, name, service, parish…" /></label><label><span>Request status</span><select value={changeRequestStatus} onChange={(event) => setChangeRequestStatus(event.target.value as 'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn')}><option value="all">All requests</option>{(['pending', 'approved', 'rejected', 'withdrawn'] as const).map((status) => <option key={status} value={status}>{humanizeStatus(status)}</option>)}</select></label></div>
          {changeRequestTable(filteredChangeRequests)}
        </>}
      </article>
      <aside className="panel detail-panel" aria-label={appointmentView === 'changes' ? 'Selected change request details' : 'Selected appointment details'}>
        {appointmentView === 'list' ? (selectedAppointment ? <>
          <div className="panel-heading"><div><span className="eyebrow">{selectedAppointment.reference}</span><h2>{selectedAppointment.parishioner}</h2></div><StatusPill value={selectedAppointment.status} /></div>
          <dl className="detail-list"><div><dt>Service</dt><dd>{selectedAppointment.service}</dd></div><div><dt>Parish</dt><dd>{selectedAppointment.parish}</dd></div><div><dt>Participant(s)</dt><dd>{selectedAppointment.participants}</dd></div><div><dt>Schedule</dt><dd>{formatDateTime(selectedAppointment.startsAt)}</dd></div><div><dt>Clergy & venue</dt><dd>{selectedAppointment.clergy}<br />{selectedAppointment.venue}</dd></div><div><dt>Documents</dt><dd>{selectedAppointment.verifiedDocuments} of {selectedAppointment.requiredDocuments} human-verified</dd></div></dl>
          {selectedAppointmentPendingChange && <div className="alert warning"><strong>Pending {selectedAppointmentPendingChange.kind === 'reschedule' ? 'reschedule' : 'cancellation'} request</strong><span>{selectedAppointmentPendingChange.kind === 'reschedule' && selectedAppointmentPendingChange.proposedStartsAt ? `Parishioner requested ${formatDateTime(selectedAppointmentPendingChange.proposedStartsAt)}.` : 'Parishioner asked the parish office to cancel this approved appointment.'}</span><div className="detail-actions"><button type="button" className="row-action" onClick={() => { setAppointmentView('changes'); setSelectedChangeRequestId(selectedAppointmentPendingChange.id); setChangeDecisionNote(''); }}>Review change request</button></div></div>}
          {selectedAppointment.conflict && <div className="alert danger"><strong>Approval blocked</strong><span>This interval overlaps another clergy or venue assignment.</span></div>}
          {selectedAppointment.reviewNote && <div className="note-box"><strong>Review note</strong><p>{selectedAppointment.reviewNote}</p></div>}
          {permittedTransitions.length ? <div className="decision-area"><label><span>Decision note</span><textarea value={appointmentReason} onChange={(event) => setAppointmentReason(event.target.value)} placeholder="Required for changes, rejection, or cancellation" /></label><div className="decision-buttons">{permittedTransitions.map((status) => <button key={status} disabled={busy || (REASON_REQUIRED.has(status) && appointmentReason.trim().length < 4)} className={status === 'approved' ? 'primary-button compact' : status === 'rejected' || status === 'cancelled' ? 'danger-button' : 'secondary-button compact'} onClick={() => void runMutation({ action: 'appointment.transition', appointmentId: selectedAppointment.id, status, expectedVersion: selectedAppointment.version, reason: appointmentReason }, `Appointment moved to ${humanizeStatus(status)}.`)}>{TRANSITION_LABELS[status] ?? humanizeStatus(status)}</button>)}</div></div> : <div className="empty-mini">No further actions are available for this status.</div>}
        </> : <div className="empty-state"><strong>Select an appointment</strong><span>Its review details will appear here.</span></div>) : (selectedChangeRequest ? <>
          <div className="panel-heading"><div><span className="eyebrow">{selectedChangeRequest.reference}</span><h2>{selectedChangeRequest.parishioner}</h2></div><StatusPill value={selectedChangeRequest.status} /></div>
          <dl className="detail-list">
            <div><dt>Request type</dt><dd>{selectedChangeRequest.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'}</dd></div>
            <div><dt>Service</dt><dd>{selectedChangeRequest.service}</dd></div>
            <div><dt>Parish</dt><dd>{selectedChangeRequest.parish}</dd></div>
            <div><dt>Appointment status</dt><dd>{humanizeStatus(selectedChangeRequest.appointmentStatus)}</dd></div>
            <div><dt>Current schedule</dt><dd>{formatDateTime(selectedChangeRequest.currentStartsAt)}</dd></div>
            {selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.proposedStartsAt && <div><dt>Proposed schedule</dt><dd>{formatDateTime(selectedChangeRequest.proposedStartsAt)}</dd></div>}
            <div><dt>Clergy & venue</dt><dd>{selectedChangeRequest.clergy}<br />{selectedChangeRequest.venue}</dd></div>
            <div><dt>Submitted</dt><dd>{formatDateTime(selectedChangeRequest.createdAt)}</dd></div>
          </dl>
          <div className="note-box"><strong>Parishioner reason</strong><p>{selectedChangeRequest.reason}</p></div>
          {selectedChangeRequest.status === 'pending' && selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.proposedSlotAvailable === false && (
            <div className="alert danger"><strong>Proposed slot unavailable</strong><span>Another booking or clergy assignment now occupies this priest or venue interval. Decline with a note so the parishioner can choose an open slot.</span></div>
          )}
          {selectedChangeRequest.status === 'pending' && selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.proposedSlotAvailable === true && (
            <div className="alert info"><strong>Proposed slot open</strong><span>The priest and venue are conflict-free for the requested interval, including preparation buffers.</span></div>
          )}
          {selectedChangeRequest.status === 'pending' && selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.appointmentStatus === 'approved' && (
            <div className="alert warning"><strong>Priest re-confirmation required</strong><span>Approving this reschedule returns the appointment to Ready to Approve so the assigned priest confirms the new schedule.</span></div>
          )}
          {selectedChangeRequest.status === 'pending' && selectedChangeRequest.canDecide ? (
            <div className="decision-area">
              <label><span>Decision note</span><textarea value={changeDecisionNote} onChange={(event) => setChangeDecisionNote(event.target.value)} placeholder="Optional when approving; required (at least 4 characters) when declining" /></label>
              <div className="decision-buttons">
                <button className="approve-button" disabled={busy || (selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.proposedSlotAvailable === false)} onClick={() => void runMutation({ action: 'change_request.decide', requestId: selectedChangeRequest.id, decision: 'approve', ...(changeDecisionNote.trim() ? { note: changeDecisionNote.trim() } : {}) }, selectedChangeRequest.kind === 'reschedule' ? 'Reschedule request approved.' : 'Cancellation request confirmed.').then((saved) => { if (saved) setChangeDecisionNote(''); })}>{selectedChangeRequest.kind === 'reschedule' ? 'Approve reschedule' : 'Confirm cancellation'}</button>
                <button className="danger-button" disabled={busy || changeDecisionNote.trim().length < 4} onClick={() => void runMutation({ action: 'change_request.decide', requestId: selectedChangeRequest.id, decision: 'reject', note: changeDecisionNote.trim() }, 'Change request declined.').then((saved) => { if (saved) setChangeDecisionNote(''); })}>Decline request</button>
              </div>
            </div>
          ) : selectedChangeRequest.status === 'pending' ? (
            <div className="alert info"><strong>Read-only access</strong><span>{data.actor.role === 'system_admin' ? 'Technical administration cannot decide scheduling requests. Parish staff or the assigned priest decide change requests.' : 'Only parish staff of this parish or the assigned priest can decide this request.'}</span></div>
          ) : (
            <div className="note-box"><strong>Decision recorded ({humanizeStatus(selectedChangeRequest.status)})</strong><p>{selectedChangeRequest.decisionNote ?? 'No decision note recorded.'}</p>{selectedChangeRequest.decidedAt && <small>{selectedChangeRequest.decidedBy ? `${selectedChangeRequest.decidedBy} · ` : ''}{formatDateTime(selectedChangeRequest.decidedAt)}</small>}</div>
          )}
          {data.appointments.some((item) => item.id === selectedChangeRequest.appointmentId) && (
            <div className="detail-actions"><button type="button" className="secondary-button" onClick={() => { setSelectedAppointmentId(selectedChangeRequest.appointmentId); setAppointmentView('list'); }}>Open appointment</button></div>
          )}
        </> : <div className="empty-state"><strong>Select a change request</strong><span>Its schedule and decision details will appear here.</span></div>)}
      </aside>
    </section>;
  } else if (activeModule === 'documents') {
    moduleContent = <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">Human verification</span><h2>Document review</h2></div><span className="result-count">{data.metrics.awaitingDocumentReview === null ? 'Parish staff access required' : `${data.metrics.awaitingDocumentReview} awaiting review`}</span></div>
      <div className="filter-bar single"><label><span>Search requirements</span><input value={documentSearch} onChange={(event) => setDocumentSearch(event.target.value)} placeholder="Reference, parishioner, service, requirement…" /></label></div>
      <div className="document-grid">{filteredDocuments.map((document) => <article className="document-card" key={`${document.appointmentId}-${document.requirementId}`}><div className="document-top"><div><span className="eyebrow">{document.reference} · {document.service}</span><h3>{document.requirement}</h3><p>{document.parishioner}</p></div><StatusPill value={document.status} /></div><div className="file-row"><span>{document.fileName ?? 'No file submitted'}</span>{document.fileName && document.sha256 && !document.id.startsWith('missing:') && <a className="text-link" href={`/api/admin/documents/${encodeURIComponent(document.id)}`}>Download</a>}</div><label className="upload-button"><span>Upload {document.fileName ? 'replacement' : 'file'}</span><input className="sr-only" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => void uploadDocument(document, event)} disabled={busy} /></label>{document.fileName && document.sha256 && !document.id.startsWith('missing:') && <><label className="note-input"><span>Reviewer note</span><input value={documentNotes[document.id] ?? ''} onChange={(event) => setDocumentNotes((notes) => ({ ...notes, [document.id]: event.target.value }))} placeholder="Reason required when requesting replacement" /></label><div className="document-actions"><button className="approve-button" disabled={busy} onClick={() => void runMutation({ action: 'document.review', documentId: document.id, expectedSha256: document.sha256 ?? '', status: 'verified', note: documentNotes[document.id] }, 'Document marked human-verified.')}>Verify document</button><button className="danger-button" disabled={busy || (documentNotes[document.id]?.trim().length ?? 0) < 4} onClick={() => void runMutation({ action: 'document.review', documentId: document.id, expectedSha256: document.sha256 ?? '', status: 'needs_replacement', note: documentNotes[document.id] }, 'Replacement requested from the parishioner.')}>Request replacement</button></div></>}</article>)}</div>
    </section>;
  } else if (activeModule === 'clergy') {
    moduleContent = <section className="module-layout"><AssignmentBrowser key={`${data.actor.id}:${data.actor.role}:${data.actor.parishId}:${data.actor.clergyProfileId}`} actor={data.actor} refreshKey={data.generatedAt} busy={busy} total={data.metrics.confirmedAssignments} onAccessLost={handleAccessLost} onCancel={id => runMutation({ action: 'clergy.assignment.cancel', assignmentId: id }, 'Clergy assignment cancelled.')} /><aside className="panel detail-panel"><span className="eyebrow">New assignment</span><h2>Reserve clergy and venue</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Schedule changes are assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'clergy.assignment.create', parishId: assignmentParishId, clergyId: effectiveClergyId, venueId: effectiveVenueId, service: assignmentService, startsAt: new Date(assignmentStartsAt).toISOString(), endsAt: new Date(assignmentEndsAt).toISOString() }, 'Clergy assignment created.'); }}><label><span>Parish</span><select value={assignmentParishId} onChange={(event) => { setAssignmentParishId(event.target.value); setAssignmentClergyId(''); setAssignmentVenueId(''); }}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Priest</span><select value={effectiveClergyId} onChange={(event) => setAssignmentClergyId(event.target.value)}>{assignmentClergyOptions.map((clergy) => <option value={clergy.id} key={clergy.id}>{clergy.name}</option>)}</select></label><label><span>Venue</span><select value={effectiveVenueId} onChange={(event) => setAssignmentVenueId(event.target.value)}>{assignmentVenueOptions.map((venue) => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label><label><span>Service or duty</span><input value={assignmentService} maxLength={100} onChange={(event) => setAssignmentService(event.target.value)} placeholder="e.g. Daily Mass" /></label><label><span>Starts</span><input type="datetime-local" value={assignmentStartsAt} onChange={(event) => setAssignmentStartsAt(event.target.value)} /></label><label><span>Ends</span><input type="datetime-local" value={assignmentEndsAt} onChange={(event) => setAssignmentEndsAt(event.target.value)} /></label><button className="primary-button" disabled={busy || !effectiveClergyId || !effectiveVenueId || assignmentService.trim().length < 3 || !assignmentStartsAt || !assignmentEndsAt}>Create assignment</button><small>The server performs a second conflict check before saving.</small></form>}</aside></section>;
  } else if (activeModule === 'records') {
    moduleContent = <section className="module-layout"><RecordBrowser key={JSON.stringify([data.actor.id, data.actor.role, data.actor.parishId])} actor={data.actor} refreshKey={data.generatedAt} busy={busy} onAccessLost={handleAccessLost} onVerify={id => runMutation({ action: 'record.verify', recordId: id }, 'Record verified against the authorized archive.')} /><aside className="panel detail-panel"><span className="eyebrow">New working record</span><h2>Index an archive entry</h2>{data.actor.role !== 'parish_staff' ? <div className="alert info"><strong>Read-only access</strong><span>Restricted archive records require assigned parish staff access.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'record.create', parishId: recordParishId, recordType, subjectName: recordSubject, eventDate: recordEventDate, reference: recordReference }, 'Working record created.').then(saved => { if (saved) { setRecordSubject(''); setRecordEventDate(''); setRecordReference(''); } }); }}><label><span>Parish</span><select value={recordParishId} onChange={(event) => setRecordParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Record type</span><select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option>Baptismal</option><option>Marriage</option><option>Confirmation</option><option>First Communion</option><option>Funeral Mass</option></select></label><label><span>Subject name</span><input value={recordSubject} maxLength={160} onChange={(event) => setRecordSubject(event.target.value)} /></label><label><span>Event date</span><input type="date" value={recordEventDate} onChange={(event) => setRecordEventDate(event.target.value)} /></label><label><span>Archive reference</span><input value={recordReference} maxLength={50} onChange={(event) => setRecordReference(event.target.value.toUpperCase())} placeholder="BAP-SGP-2026-0001" /></label><button className="primary-button" disabled={busy || recordSubject.trim().length < 3 || !recordEventDate || recordReference.trim().length < 6}>Create working record</button><small>Creation and later archive verification are recorded separately in the audit trail.</small></form>}</aside></section>;
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
          void runMutation({ action: 'queue.issue', parishId: queueParishId, parishionerName: queueVisitorName, service: queueService }, 'Front-desk ticket issued.').then(saved => { if (saved) setQueueVisitorName(''); });
        }}>
          <label><span>Visitor name</span><input value={queueVisitorName} maxLength={120} onChange={(event) => setQueueVisitorName(event.target.value)} autoComplete="off" /></label>
          <label><span>Purpose</span><select value={queueService} onChange={(event) => setQueueService(event.target.value as (typeof QUEUE_PURPOSES)[number])}>{QUEUE_PURPOSES.map((purpose) => <option value={purpose} key={purpose}>{purpose}</option>)}</select></label>
          <button className="primary-button" disabled={busy || queueVisitorName.trim().length < 2}>Issue walk-in ticket</button>
        </form>}
        <div className="note-box"><strong>Priority handling</strong><p>Any priority exception must follow the parish-approved policy and remain auditable. Default ordering is FIFO within the parish.</p></div>
      </aside>
    </section>;
  } else if (activeModule === 'announcements') {
    moduleContent = <section className="module-layout"><article className="panel module-primary"><div className="panel-heading"><div><span className="eyebrow">Plain-text publishing</span><h2>Announcements</h2></div><span className="result-count">{data.announcements.length} recent · {data.metrics.publishedAnnouncements} total</span></div><div className="announcement-list">{data.announcements.map((announcement) => <article key={announcement.id}><div><span className="eyebrow">{announcement.parish}</span><h3>{announcement.title}</h3><p>{announcement.body}</p><small>Published {formatDateTime(announcement.publishedAt)} by {announcement.author}</small></div></article>)}</div></article><aside className="panel detail-panel"><span className="eyebrow">New notice</span><h2>Publish an announcement</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Publishing is assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'announcement.publish', title: announcementTitle, body: announcementBody, audience: announcementAudience, parishId: announcementParishId }, 'Announcement published.').then(saved => { if (saved) { setAnnouncementTitle(''); setAnnouncementBody(''); } }); }}><label><span>Audience</span><select value={announcementAudience} onChange={(event) => setAnnouncementAudience(event.target.value as 'all' | 'parish')}><option value="parish">One parish</option>{data.actor.role === 'system_admin' && <option value="all">All eight parishes</option>}</select></label>{announcementAudience === 'parish' && <label><span>Parish</span><select value={announcementParishId} onChange={(event) => setAnnouncementParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label>}<label><span>Title</span><input value={announcementTitle} maxLength={120} onChange={(event) => setAnnouncementTitle(event.target.value)} /></label><label><span>Message</span><textarea value={announcementBody} maxLength={2000} onChange={(event) => setAnnouncementBody(event.target.value)} /></label><button className="primary-button" disabled={busy || announcementTitle.trim().length < 4 || announcementBody.trim().length < 10}>Publish notice</button><small>Content is stored and rendered as plain text to protect readers from injected markup.</small></form>}</aside></section>;
  } else {
    const statusCounts = data.metrics.appointmentStatuses;
    moduleContent = <><section className="report-grid"><article className="panel"><span className="eyebrow">Operational snapshot</span><h2>Appointment status distribution</h2><div className="metric-list">{Object.entries(statusCounts).map(([status, count]) => <div key={status}><span>{humanizeStatus(status)}</span><strong>{count}</strong></div>)}</div></article><article className="panel"><span className="eyebrow">ISO/IEC 25010</span><h2>Evaluation evidence</h2><div className="empty-state aligned"><strong>No validated evaluation results displayed</strong><span>Scores will appear only after the approved questionnaire, respondent plan, consent process, and completed responses are available. The prototype’s illustrative values are intentionally excluded.</span></div></article><article className="panel wide"><span className="eyebrow">Data quality</span><h2>Current release indicators</h2><div className="quality-grid"><div><strong>{data.metrics.verifiedRecords ?? '—'}</strong><span>{data.metrics.verifiedRecords === null ? 'archive count restricted to parish staff' : 'records checked against archive'}</span></div><div><strong>{data.metrics.verifiedDocuments ?? '—'}</strong><span>{data.metrics.verifiedDocuments === null ? 'document count restricted to parish staff' : 'human-verified submissions'}</span></div><div><strong>{conflicts.length}</strong><span>unresolved schedule conflicts</span></div><div><strong>{data.metrics.publishedAnnouncements}</strong><span>published notices in scope</span></div></div></article></section><section className="configuration-grid"><article className="panel"><span className="eyebrow">Scheduling resources</span><h2>Add a parish venue</h2>{data.actor.role === 'clergy' ? <div className="alert info"><strong>Read-only access</strong><span>Venue setup is assigned to parish staff and system administrators.</span></div> : <form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'venue.create', parishId: newVenueParishId, name: newVenueName, ...(newVenueCapacity ? { capacity: Number(newVenueCapacity) } : {}) }, 'Parish venue created.').then(saved => { if (saved) { setNewVenueName(''); setNewVenueCapacity(''); } }); }}><label><span>Parish</span><select value={newVenueParishId} onChange={(event) => setNewVenueParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><label><span>Venue name</span><input value={newVenueName} maxLength={100} onChange={(event) => setNewVenueName(event.target.value)} placeholder="e.g. Main church" /></label><label><span>Capacity (optional)</span><input type="number" min="1" max="10000" value={newVenueCapacity} onChange={(event) => setNewVenueCapacity(event.target.value)} /></label><button className="primary-button" disabled={busy || newVenueName.trim().length < 3}>Add venue</button></form>}</article>{data.actor.role === 'system_admin' && <article className="panel"><span className="eyebrow">Role-based access</span><h2>Provision internal access</h2><form className="stack-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void runMutation({ action: 'user.provision', fullName: newUserName, email: newUserEmail, role: newUserRole, parishId: newUserParishId }, 'Internal access provisioned.').then(saved => { if (saved) { setNewUserName(''); setNewUserEmail(''); } }); }}><label><span>Complete name</span><input value={newUserName} maxLength={120} onChange={(event) => setNewUserName(event.target.value)} /></label><label><span>Email address</span><input type="email" value={newUserEmail} maxLength={254} onChange={(event) => setNewUserEmail(event.target.value)} /></label><label><span>Role</span><select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value as 'parish_staff' | 'clergy')}><option value="parish_staff">Parish staff</option><option value="clergy">Clergy / priest</option></select></label><label><span>Parish</span><select value={newUserParishId} onChange={(event) => setNewUserParishId(event.target.value)}>{data.parishes.map((parish) => <option value={parish.id} key={parish.id}>{parish.name}</option>)}</select></label><button className="primary-button" disabled={busy || newUserName.trim().length < 3 || !newUserEmail.includes('@')}>Provision access</button><small>After provisioning, use “Temporary password” in the access register below and share it privately. The person must choose a new password at first sign-in.</small></form></article>}{data.actor.role === 'system_admin' && <article className="panel configuration-wide"><div className="panel-heading"><div><span className="eyebrow">Authorized personnel</span><h2>Internal access register</h2></div><span className="result-count">{data.accessUsers.length} accounts</span></div><div className="access-list">{data.accessUsers.map((user) => <div key={user.id}><div><strong>{user.name}</strong><span>{user.email} · {humanizeStatus(user.role)} · {user.parish}</span></div><div className="access-actions"><button className="secondary-button" disabled={busy || user.id === data.actor.id || !user.isActive} onClick={() => void issueTemporary(user.id, user.name)}>Temporary password</button><button className={user.isActive ? 'danger-button' : 'approve-button'} disabled={busy || user.id === data.actor.id} onClick={() => void runMutation({ action: 'user.set_active', userId: user.id, isActive: !user.isActive }, `${user.name} access ${user.isActive ? 'deactivated' : 'activated'}.`)}>{user.isActive ? 'Deactivate' : 'Activate'}</button></div></div>)}</div></article>}</section></>;
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <div className="brand-lockup"><div className="brand-seal" aria-hidden="true">PL</div><div><strong>ParishLink</strong><span>Internal administration</span></div></div>
        <div className="parish-context"><span className="eyebrow">Access scope</span><strong>{data.actor.parishName}</strong><span>{roleLabel(data.actor.role)}</span></div>
        <nav aria-label="Primary navigation">{NAV_ITEMS.map((item) => <button key={item.id} className={activeModule === item.id ? 'nav-link active' : 'nav-link'} aria-current={activeModule === item.id ? 'page' : undefined} onClick={() => openModule(item.id)}><span aria-hidden="true">{item.number}</span>{item.label}{item.id === 'appointments' && pendingChangeCount > 0 && <strong className="nav-badge" aria-label={`${pendingChangeCount} pending change requests`}>{pendingChangeCount}</strong>}</button>)}</nav>
        <div className="sidebar-foot"><span className="live-dot" aria-hidden="true" />Data refreshed {new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(data.generatedAt))}</div>
      </aside>
      <main className="admin-main" id="main-content" tabIndex={-1}>
        <header className="topbar"><div><span className="eyebrow">{today}</span><h1>{NAV_ITEMS.find((item) => item.id === activeModule)?.label}</h1></div><div className="topbar-actions"><div className="profile-button" aria-label={`${data.actor.name}, ${roleLabel(data.actor.role)}`}><span className="avatar">{initials(data.actor.name || signedInName)}</span><span><strong>{data.actor.name}</strong><small>{roleLabel(data.actor.role)}</small></span></div><a className="signout-link" href={CHANGE_PASSWORD_URL}>Change password</a><button type="button" className="signout-link" onClick={() => void signOutStaff(signOutPath)}>Sign out</button></div></header>
        {data.source === 'demo' && <div className="demo-banner"><strong>Demonstration workspace</strong><span>This local preview uses fictional records. It is not evidence of deployment, UAT, or parish approval.</span></div>}
        {(notice || error) && <div className={`toast ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}><span>{error ?? notice}</span><button aria-label="Dismiss message" onClick={() => { setError(null); setNotice(null); }}>×</button></div>}
        {moduleContent}
        <div className="sr-only" aria-live="polite">{busy ? 'Working on your request.' : 'Ready.'}</div>
      </main>
    </div>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Actor, AssignmentCursor, AssignmentPage } from '@/shared/domain';
import { adminRequest, AdminAccessError } from '@/frontend/lib/admin-request';
import { privatePageState, type PrivatePageResult } from '@/frontend/lib/private-page-state';

type Props = { actor: Actor; refreshKey: string; busy: boolean; total: number; onCancel: (id: string) => Promise<boolean>; onAccessLost: (error: AdminAccessError) => void };
const formatDateTime = (value: string) => new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
}).format(new Date(value));

export function AssignmentBrowser({ actor, refreshKey, busy, total, onCancel, onAccessLost }: Props) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState('upcoming');
  const [cursor, setCursor] = useState<AssignmentCursor | null>(null);
  const [history, setHistory] = useState<(AssignmentCursor | null)[]>([]);
  const [retry, setRetry] = useState(0);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<PrivatePageResult<AssignmentPage>>();
  const pageKey = JSON.stringify([actor.id, actor.role, actor.parishId, actor.clergyProfileId, query, period, cursor]);
  const requestKey = JSON.stringify([pageKey, refreshKey, retry]);
  const { page, error, loading, refreshing, pending } = privatePageState(loaded, pageKey, requestKey);

  useEffect(() => {
    let active = true;
    void adminRequest<AssignmentPage | { error?: string }>('/api/admin/assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, period, cursor }),
    }).then(({ response, payload }) => {
      if (!response.ok || !('assignments' in payload)) throw new Error(('error' in payload && payload.error) || 'The server returned an invalid schedule.');
      if (active) setLoaded({ pageKey, requestKey, page: payload });
    }).catch(cause => {
      if (cause instanceof AdminAccessError) { onAccessLost(cause); return; }
      if (active) setLoaded({ pageKey, requestKey, error: cause instanceof Error ? cause.message : 'The schedule could not load.' });
    });
    return () => { active = false; };
  }, [query, period, cursor, pageKey, requestKey, onAccessLost]);

  function search(event: FormEvent) {
    event.preventDefault(); setQuery(draft.trim()); setCursor(null); setHistory([]);
    setConfirmCancelId(null); setRetry(value => value + 1);
  }

  return <article className="panel module-primary">
    <div className="panel-heading"><div><span className="eyebrow">Conflict-aware calendar</span><h2>Clergy schedule</h2></div><span className="result-count">{total} confirmed in your scope</span></div>
    <form className="schedule-search" onSubmit={search}>
      <label><span>Search assignments</span><input value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} placeholder="Priest, service, venue, or parish" /></label>
      <label><span>Show</span><select value={period} onChange={event => { setPeriod(event.target.value); setCursor(null); setHistory([]); setConfirmCancelId(null); }}><option value="upcoming">Upcoming and in progress</option><option value="past">Past assignments</option><option value="all">All dates</option></select></label>
      <button className="primary-button compact" disabled={busy}>Search</button>
    </form>
    <p className="records-help">Times are shown in Philippine time. Browse 25 assignments per page, including schedules beyond the former 100-item limit.</p>
    {loading && <div className="empty-state" role="status">Loading clergy schedule…</div>}
    {refreshing && <p className="records-help" role="status">Refreshing schedule… Actions will resume when the latest details arrive.</p>}
    {error && <div className="alert danger" role="alert"><span>{error}</span><button className="secondary-button compact" onClick={() => setRetry(value => value + 1)}>Retry schedule</button></div>}
    {page && <>
      <div className="timeline">{page.assignments.length ? page.assignments.map(assignment => <article key={assignment.id}>
        <time dateTime={assignment.startsAt}>{formatDateTime(assignment.startsAt)}</time>
        <div><h3>{assignment.service}</h3><p>{assignment.clergy} · {assignment.venue}</p><small>{assignment.parish} · ends {formatDateTime(assignment.endsAt)}</small></div>
        {actor.role !== 'clergy' && <div className="assignment-actions">{confirmCancelId === assignment.id ? <>
          <p>Cancel this {assignment.service} assignment?</p>
          <button className="secondary-button compact" disabled={busy} onClick={() => setConfirmCancelId(null)}>Keep assignment</button>
          <button className="danger-button" disabled={busy || pending} onClick={() => { void onCancel(assignment.id).then(saved => { if (saved) { setConfirmCancelId(null); setRetry(value => value + 1); } }); }}>Confirm cancellation</button>
        </> : <button className="danger-button" disabled={busy || pending} onClick={() => setConfirmCancelId(assignment.id)}>Cancel assignment</button>}</div>}
      </article>) : <div className="empty-state"><strong>No matching assignments</strong><span>Try another search or choose a different date range.</span></div>}</div>
      <nav className="record-pagination" aria-label="Schedule pages">
        <button className="secondary-button compact" disabled={busy || pending || !history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(previous => previous.slice(0, -1)); setConfirmCancelId(null); }}>Previous</button>
        <span role="status">Page {history.length + 1} · {page.assignments.length} assignments</span>
        <button className="secondary-button compact" disabled={busy || pending || !page.nextCursor} onClick={() => { setHistory(previous => [...previous, cursor]); setCursor(page.nextCursor); setConfirmCancelId(null); }}>Next</button>
      </nav>
    </>}
    <div className="alert info"><strong>Scheduling safeguard</strong><span>New assignments are rejected when any part of the priest, venue, appointment, or blocked-time interval overlaps.</span></div>
  </article>;
}

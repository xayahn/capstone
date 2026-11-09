'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Actor, ParishRecordCursor, ParishRecordPage } from '@/shared/domain';
import { humanizeStatus } from '@/shared/domain';
import { adminRequest, AdminAccessError } from '@/frontend/lib/admin-request';
import { privatePageState, type PrivatePageResult } from '@/frontend/lib/private-page-state';

type Props = {
  actor: Actor;
  refreshKey: string;
  busy: boolean;
  onVerify: (id: string) => Promise<boolean>;
  onAccessLost: (error: AdminAccessError) => void;
};

function formatRecordDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' })
    .format(new Date(value + 'T12:00:00+08:00'));
}

export function RecordBrowser({ actor, refreshKey, busy, onVerify, onAccessLost }: Props) {
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState<ParishRecordCursor | null>(null);
  const [history, setHistory] = useState<(ParishRecordCursor | null)[]>([]);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<PrivatePageResult<ParishRecordPage>>();
  const pageKey = JSON.stringify([actor.id, actor.role, actor.parishId, query, cursor]);
  const requestKey = JSON.stringify([pageKey, refreshKey, retry]);
  const permitted = actor.role === 'parish_staff' && Boolean(actor.parishId);
  const { page, error, loading, refreshing, pending } = privatePageState(loaded, pageKey, requestKey);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    void adminRequest<ParishRecordPage | { error?: string }>('/api/admin/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, cursor }),
    }).then(({ response, payload }) => {
      if (!response.ok || !('records' in payload)) throw new Error(('error' in payload && payload.error) || 'The server returned invalid records.');
      if (active) setLoaded({ pageKey, requestKey, page: payload });
    }).catch(cause => {
      if (cause instanceof AdminAccessError) { onAccessLost(cause); return; }
      if (active) setLoaded({ pageKey, requestKey, error: cause instanceof Error ? cause.message : 'Records could not load.' });
    });
    return () => { active = false; };
  }, [permitted, query, cursor, pageKey, requestKey, onAccessLost]);

  function search(event: FormEvent) {
    event.preventDefault();
    setQuery(draft.trim());
    setCursor(null);
    setHistory([]);
    setRetry(value => value + 1);
  }

  return <article className="panel module-primary">
    <div className="panel-heading">
      <div><span className="eyebrow">Indexed working records</span><h2>Parish records</h2></div>
      {page && <span className="result-count">{page.records.length} on this page</span>}
    </div>
    <div className="alert info"><strong>Archive boundary</strong><span>These are indexed working records, not official certificates. Verification requires checking the authorized parish archive.</span></div>
    {!permitted ? <div className="empty-state"><strong>Restricted archive access</strong><span>Assigned parish staff access is required to search these records.</span></div> : <>
      <form className="record-search" onSubmit={search}>
        <label><span>Search all records in your parish</span><input value={draft} maxLength={120} onChange={event => setDraft(event.target.value)} placeholder="Name, archive reference, or record type" /></label>
        <button className="primary-button compact" disabled={busy}>Search</button>
      </form>
      <p className="records-help">Search includes older records beyond the dashboard summary. Search text is not added to the page address.</p>
      {loading && <div className="empty-state" role="status">Loading parish records…</div>}
      {refreshing && <p className="records-help" role="status">Refreshing records… Actions will resume when the latest details arrive.</p>}
      {error && <div className="alert danger" role="alert"><span>{error}</span><button className="secondary-button compact" onClick={() => setRetry(value => value + 1)}>Retry records</button></div>}
      {page && <>
        <div className="record-grid">
          {page.records.length ? page.records.map(record => <article key={record.id}>
            <div className="record-seal" aria-hidden="true">✦</div>
            <div><span className="eyebrow">{record.type}</span><h3>{record.subject}</h3><p>{record.parish}</p><small>{formatRecordDate(record.eventDate)} · {record.reference}</small></div>
            <div className="record-actions">
              <span className={'status ' + (record.status === 'working_copy' ? 'pending' : 'ready')}>{humanizeStatus(record.status)}</span>
              {record.status === 'working_copy' && <button className="approve-button" disabled={busy || pending} onClick={() => { void onVerify(record.id).then(saved => { if (saved) setRetry(value => value + 1); }); }}>Verify</button>}
            </div>
          </article>) : <div className="empty-state"><strong>No matching records</strong><span>Try another name or reference, or clear the search to browse all records in your parish.</span></div>}
        </div>
        <nav className="record-pagination" aria-label="Record pages">
          <button className="secondary-button compact" disabled={busy || pending || !history.length} onClick={() => { setCursor(history.at(-1) ?? null); setHistory(previous => previous.slice(0, -1)); }}>Previous</button>
          <span role="status">Page {history.length + 1}</span>
          <button className="secondary-button compact" disabled={busy || pending || !page.nextCursor} onClick={() => { setHistory(previous => [...previous, cursor]); setCursor(page.nextCursor); }}>Next</button>
        </nav>
      </>}
    </>}
  </article>;
}

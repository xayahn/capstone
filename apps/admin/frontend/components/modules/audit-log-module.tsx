'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  humanizeStatus,
  type AuditLogCursor,
  type AuditLogPage,
  type DashboardState,
} from '@/shared/domain';
import { adminRequest, AdminAccessError } from '@/frontend/lib/admin-request';
import { privatePageState, type PrivatePageResult } from '@/frontend/lib/private-page-state';
import { formatDateTime, StatusPill } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  onAccessLost: (error: AdminAccessError) => void;
};

type AuditFilters = {
  query: string;
  parishId: string;
  action: string;
  outcome: 'all' | 'success' | 'denied';
  from: string;
  to: string;
};

const INITIAL_FILTERS: AuditFilters = {
  query: '',
  parishId: 'all',
  action: 'all',
  outcome: 'all',
  from: '',
  to: '',
};

const ACTION_CATEGORIES: { value: string; label: string }[] = [
  { value: 'all', label: 'All actions' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'change_request', label: 'Change requests' },
  { value: 'document', label: 'Document reviews' },
  { value: 'queue', label: 'Walk-in queue' },
  { value: 'record', label: 'Parish records' },
  { value: 'clergy', label: 'Clergy schedule' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'parish', label: 'Parish profile' },
  { value: 'service', label: 'Sacrament rules' },
  { value: 'requirement', label: 'Requirements' },
  { value: 'venue', label: 'Venues' },
  { value: 'user', label: 'Internal access' },
  { value: 'staff', label: 'Staff sign-in & passwords' },
];

export function AuditLogModule({ data, busy, onAccessLost }: Props) {
  const [draft, setDraft] = useState<AuditFilters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(INITIAL_FILTERS);
  const [cursor, setCursor] = useState<AuditLogCursor | null>(null);
  const [history, setHistory] = useState<(AuditLogCursor | null)[]>([]);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<PrivatePageResult<AuditLogPage>>();

  const permitted =
    data.actor.role === 'system_admin' ||
    (data.actor.role === 'parish_staff' && Boolean(data.actor.parishId));

  const pageKey = JSON.stringify([
    data.actor.id,
    data.actor.role,
    data.actor.parishId,
    applied,
    cursor,
  ]);
  const requestKey = JSON.stringify([pageKey, data.generatedAt, retry]);
  const { page, error, loading, refreshing, pending } = privatePageState(loaded, pageKey, requestKey);

  useEffect(() => {
    if (!permitted) return;
    let active = true;
    void adminRequest<AuditLogPage | { error?: string }>('/api/admin/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: applied.query,
        ...(data.actor.role === 'system_admin' && applied.parishId !== 'all'
          ? { parishId: applied.parishId }
          : {}),
        ...(applied.action !== 'all' ? { action: applied.action } : {}),
        outcome: applied.outcome,
        ...(applied.from ? { from: applied.from } : {}),
        ...(applied.to ? { to: applied.to } : {}),
        cursor,
      }),
    })
      .then(({ response, payload }) => {
        if (!response.ok || !('entries' in payload)) {
          throw new Error(
            ('error' in payload && payload.error) || 'The server returned an invalid audit trail.',
          );
        }
        if (active) setLoaded({ pageKey, requestKey, page: payload });
      })
      .catch((cause) => {
        if (cause instanceof AdminAccessError) {
          onAccessLost(cause);
          return;
        }
        if (active) {
          setLoaded({
            pageKey,
            requestKey,
            error: cause instanceof Error ? cause.message : 'Audit logs could not load.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [applied, cursor, data.actor.role, onAccessLost, pageKey, permitted, requestKey]);

  function applySearch(event: FormEvent) {
    event.preventDefault();
    setApplied({ ...draft, query: draft.query.trim() });
    setCursor(null);
    setHistory([]);
    setRetry((value) => value + 1);
  }

  function resetSearch() {
    setDraft(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setCursor(null);
    setHistory([]);
    setRetry((value) => value + 1);
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Accountability & non-repudiation</span>
          <h2>Audit log</h2>
        </div>
        {page && <span className="result-count">{page.entries.length} events on page</span>}
      </div>
      <div className="alert info">
        <strong>Tamper-evident operational log</strong>
        <span>
          Administrative decisions, document verifications, settings updates, and access changes are recorded in
          append-only audit history.
        </span>
      </div>

      {!permitted ? (
        <div className="empty-state" style={{ marginTop: 16 }}>
          <strong>Restricted audit access</strong>
          <span>Audit logs are limited to assigned parish staff and system administrators.</span>
        </div>
      ) : (
        <>
          <form className="report-filter-grid audit-filter-grid" onSubmit={applySearch}>
            <label>
              <span>Search audit trail</span>
              <input
                value={draft.query}
                maxLength={120}
                onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
                placeholder="Action, actor, entity, or detail…"
              />
            </label>
            {data.actor.role === 'system_admin' && (
              <label>
                <span>Parish scope</span>
                <select
                  value={draft.parishId}
                  onChange={(event) => setDraft((current) => ({ ...current, parishId: event.target.value }))}
                >
                  <option value="all">All scopes</option>
                  <option value="vicariate">Vicariate-wide / system</option>
                  {data.parishes.map((parish) => (
                    <option key={parish.id} value={parish.id}>
                      {parish.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Category</span>
              <select
                value={draft.action}
                onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
              >
                {ACTION_CATEGORIES.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Outcome</span>
              <select
                value={draft.outcome}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    outcome: event.target.value as 'all' | 'success' | 'denied',
                  }))
                }
              >
                <option value="all">All outcomes</option>
                <option value="success">Success</option>
                <option value="denied">Denied</option>
              </select>
            </label>
            <label>
              <span>From date</span>
              <input
                type="date"
                value={draft.from}
                onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              />
            </label>
            <label>
              <span>To date</span>
              <input
                type="date"
                value={draft.to}
                onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              />
            </label>
            <div className="filter-submit-group">
              <button type="submit" className="primary-button compact" disabled={busy}>
                Search logs
              </button>
              <button type="button" className="secondary-button compact" disabled={busy} onClick={resetSearch}>
                Reset
              </button>
            </div>
          </form>

          <p className="records-help">
            Timestamps are displayed in Philippine time (Asia/Manila). Browse 25 audit events per page.
          </p>
          {loading && (
            <div className="empty-state" role="status">
              Loading audit trail…
            </div>
          )}
          {refreshing && (
            <p className="records-help" role="status">
              Refreshing audit trail…
            </p>
          )}
          {error && (
            <div className="alert danger" role="alert">
              <span>{error}</span>
              <button className="secondary-button compact" onClick={() => setRetry((value) => value + 1)}>
                Retry audit log
              </button>
            </div>
          )}
          {page && (
            <>
              {page.entries.length ? (
                <div className="table-wrap" tabIndex={0} aria-label="Audit trail table">
                  <table>
                    <caption className="sr-only">Administrative and operational audit log</caption>
                    <thead>
                      <tr>
                        <th scope="col">Timestamp</th>
                        <th scope="col">Actor</th>
                        <th scope="col">Action</th>
                        <th scope="col">Parish</th>
                        <th scope="col">Outcome</th>
                        <th scope="col">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <strong>{formatDateTime(entry.createdAt)}</strong>
                          </td>
                          <td>
                            <strong>{entry.actorName}</strong>
                            <small>{entry.actorRole ? humanizeStatus(entry.actorRole) : 'System'}</small>
                          </td>
                          <td>
                            <code>{entry.action}</code>
                            <small>{humanizeStatus(entry.entityType)}</small>
                          </td>
                          <td>{entry.parish}</td>
                          <td>
                            <StatusPill value={entry.outcome} />
                          </td>
                          <td className="audit-detail-cell">{entry.detail ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No matching audit events</strong>
                  <span>Adjust the search filters or date range to inspect earlier activity.</span>
                </div>
              )}
              <nav className="record-pagination" aria-label="Audit log pages">
                <button
                  className="secondary-button compact"
                  disabled={busy || pending || !history.length}
                  onClick={() => {
                    setCursor(history.at(-1) ?? null);
                    setHistory((previous) => previous.slice(0, -1));
                  }}
                >
                  Previous
                </button>
                <span role="status">
                  Page {history.length + 1} · {page.entries.length} events
                </span>
                <button
                  className="secondary-button compact"
                  disabled={busy || pending || !page.nextCursor}
                  onClick={() => {
                    setHistory((previous) => [...previous, cursor]);
                    setCursor(page.nextCursor);
                  }}
                >
                  Next
                </button>
              </nav>
            </>
          )}
        </>
      )}
    </section>
  );
}

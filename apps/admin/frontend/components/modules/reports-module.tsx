'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  APPOINTMENT_STATUSES,
  humanizeStatus,
  type AdminReport,
  type AppointmentStatus,
  type DashboardState,
} from '@/shared/domain';
import { formatReportCsv } from '@/shared/report-csv';
import { adminRequest, AdminAccessError } from '@/frontend/lib/admin-request';
import { privatePageState, type PrivatePageResult } from '@/frontend/lib/private-page-state';
import { formatDateTime, StatusPill } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  onAccessLost: (error: AdminAccessError) => void;
};

type AppliedFilters = {
  parishId: string;
  serviceTypeId: string;
  status: AppointmentStatus | 'all';
  from: string;
  to: string;
};

const INITIAL_FILTERS: AppliedFilters = {
  parishId: 'all',
  serviceTypeId: 'all',
  status: 'all',
  from: '',
  to: '',
};

export function ReportsModule({ data, busy, onAccessLost }: Props) {
  const [draft, setDraft] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [applied, setApplied] = useState<AppliedFilters>(INITIAL_FILTERS);
  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<PrivatePageResult<AdminReport>>();

  const pageKey = JSON.stringify([
    data.actor.id,
    data.actor.role,
    data.actor.parishId,
    data.actor.clergyProfileId,
    applied,
  ]);
  const requestKey = JSON.stringify([pageKey, data.generatedAt, retry]);
  const { page: report, error, loading, refreshing } = privatePageState(loaded, pageKey, requestKey);

  useEffect(() => {
    let active = true;
    void adminRequest<AdminReport | { error?: string }>('/api/admin/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        ...(data.actor.role === 'system_admin' && applied.parishId !== 'all'
          ? { parishId: applied.parishId }
          : {}),
        ...(applied.serviceTypeId !== 'all' ? { serviceTypeId: applied.serviceTypeId } : {}),
        status: applied.status,
        ...(applied.from ? { from: applied.from } : {}),
        ...(applied.to ? { to: applied.to } : {}),
      }),
    })
      .then(({ response, payload }) => {
        if (!response.ok || !('totals' in payload)) {
          throw new Error(
            ('error' in payload && payload.error) || 'The server returned an invalid operational report.',
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
            error: cause instanceof Error ? cause.message : 'The operational report could not load.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, [
    applied,
    data.actor.role,
    onAccessLost,
    pageKey,
    requestKey,
  ]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    setApplied({ ...draft });
    setRetry((value) => value + 1);
  }

  function resetFilters() {
    setDraft(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setRetry((value) => value + 1);
  }

  function exportCsv() {
    if (!report) return;
    const csv = '\uFEFF' + formatReportCsv(report);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const stamp = report.generatedAt.slice(0, 10);
    link.download = `parishlink-report-${stamp}.csv`;
    document.body?.appendChild(link);
    link.click();
    link.remove?.();
    URL.revokeObjectURL(url);
  }

  const conflicts = data.appointments.filter(
    (item) => item.conflict && !['cancelled', 'rejected', 'completed', 'no_show'].includes(item.status),
  );

  return (
    <div className="reports-workspace">
      {report && (
        <header className="print-report-header">
          <strong>ParishLink Operational Report</strong>
          <p>
            Scope: {report.scopeLabel} · Generated {formatDateTime(report.generatedAt)}
          </p>
          <small>
            Date range: {report.filters.from ?? 'All dates'} to {report.filters.to ?? 'All dates'} · Status:{' '}
            {report.filters.status === 'all' ? 'All statuses' : humanizeStatus(report.filters.status)}
          </small>
        </header>
      )}

      <section className="panel no-print">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Scoped analytics & export</span>
            <h2>Report filters</h2>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="secondary-button compact"
              disabled={!report || busy}
              onClick={exportCsv}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="secondary-button compact"
              disabled={!report || busy}
              onClick={() => window.print?.()}
            >
              Print report
            </button>
          </div>
        </div>
        <form className="report-filter-grid" onSubmit={applyFilters}>
          {data.actor.role === 'system_admin' ? (
            <label>
              <span>Parish</span>
              <select
                value={draft.parishId}
                onChange={(event) => setDraft((current) => ({ ...current, parishId: event.target.value }))}
              >
                <option value="all">All eight parishes</option>
                {data.parishes.map((parish) => (
                  <option key={parish.id} value={parish.id}>
                    {parish.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span>Assigned scope</span>
              <input value={data.actor.parishName} readOnly aria-readonly="true" />
            </label>
          )}
          <label>
            <span>Sacrament</span>
            <select
              value={draft.serviceTypeId}
              onChange={(event) => setDraft((current) => ({ ...current, serviceTypeId: event.target.value }))}
            >
              <option value="all">All sacraments</option>
              {data.serviceSettings.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Status</span>
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  status: event.target.value as AppointmentStatus | 'all',
                }))
              }
            >
              <option value="all">All statuses</option>
              {APPOINTMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humanizeStatus(status)}
                </option>
              ))}
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
              Apply filters
            </button>
            <button type="button" className="secondary-button compact" disabled={busy} onClick={resetFilters}>
              Reset
            </button>
          </div>
        </form>
        {refreshing && (
          <p className="records-help" role="status">
            Refreshing operational totals…
          </p>
        )}
      </section>

      {loading && (
        <div className="panel empty-state" role="status">
          Generating operational report…
        </div>
      )}
      {error && (
        <div className="alert danger" role="alert">
          <span>{error}</span>
          <button className="secondary-button compact no-print" onClick={() => setRetry((value) => value + 1)}>
            Retry report
          </button>
        </div>
      )}

      {report && (
        <>
          <section className="kpi-grid" aria-label="Filtered report summary">
            <article className="kpi-card">
              <span>Matching appointments</span>
              <strong>{report.totals.appointments}</strong>
              <small>
                {report.totals.approved} approved · {report.totals.completed} completed
              </small>
            </article>
            <article className="kpi-card">
              <span>Open / in review</span>
              <strong>{report.totals.pending}</strong>
              <small>
                {report.totals.cancelledOrRejected} cancelled/rejected · {report.totals.noShow} no-show
              </small>
            </article>
            <article className="kpi-card">
              <span>Human-verified documents</span>
              <strong>{report.totals.verifiedDocuments ?? '—'}</strong>
              <small>
                {report.totals.verifiedDocuments === null
                  ? 'Parish staff access required'
                  : report.totals.avgDocumentReviewHours !== null
                    ? `Avg review ${report.totals.avgDocumentReviewHours} hrs`
                    : `${report.totals.awaitingDocumentReview ?? 0} awaiting review`}
              </small>
            </article>
            <article className="kpi-card">
              <span>Walk-ins served</span>
              <strong>{report.totals.queueServed ?? '—'}</strong>
              <small>
                {report.totals.queueServed === null
                  ? 'Front-desk access required'
                  : report.totals.avgQueueWaitMinutes !== null
                    ? `Avg wait ${report.totals.avgQueueWaitMinutes} mins`
                    : 'No called tickets in window'}
              </small>
            </article>
          </section>

          <section className="report-grid">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Operational snapshot</span>
                  <h2>Appointment status distribution</h2>
                </div>
                <span className="result-count">{report.scopeLabel}</span>
              </div>
              {report.byStatus.length ? (
                <div className="metric-list">
                  {report.byStatus.map((row) => (
                    <div key={row.status}>
                      <span>{humanizeStatus(row.status)}</span>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-mini">No appointments match the selected filters.</div>
              )}
            </article>

            <article className="panel">
              <span className="eyebrow">ISO/IEC 25010</span>
              <h2>Evaluation evidence</h2>
              <div className="empty-state aligned">
                <strong>No validated evaluation results displayed</strong>
                <span>
                  Scores will appear only after the approved questionnaire, respondent plan, consent process, and
                  completed responses are available. The prototype’s illustrative values are intentionally excluded.
                </span>
              </div>
            </article>

            <article className="panel">
              <span className="eyebrow">Sacrament demand</span>
              <h2>Volume by sacramental service</h2>
              {report.byService.length ? (
                <div className="table-wrap" tabIndex={0} aria-label="Volume by sacramental service">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Sacrament</th>
                        <th scope="col">Total</th>
                        <th scope="col">Approved / Done</th>
                        <th scope="col">Open</th>
                        <th scope="col">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byService.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <strong>{row.label}</strong>
                          </td>
                          <td>{row.total}</td>
                          <td>{row.approvedOrCompleted}</td>
                          <td>{row.pending}</td>
                          <td>{row.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-mini">No sacramental requests in this range.</div>
              )}
            </article>

            <article className="panel">
              <span className="eyebrow">Monthly cadence</span>
              <h2>Schedule trend (Asia/Manila)</h2>
              {report.byMonth.length ? (
                <div className="table-wrap" tabIndex={0} aria-label="Monthly appointment volume">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Month</th>
                        <th scope="col">Total</th>
                        <th scope="col">Approved</th>
                        <th scope="col">Completed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byMonth.map((row) => (
                        <tr key={row.month}>
                          <td>
                            <strong>{row.month}</strong>
                          </td>
                          <td>{row.total}</td>
                          <td>{row.approved}</td>
                          <td>{row.completed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-mini">No monthly schedules in this range.</div>
              )}
            </article>

            {report.byParish.length > 1 && (
              <article className="panel wide">
                <span className="eyebrow">Vicariate breakdown</span>
                <h2>Volume by parish</h2>
                <div className="table-wrap" tabIndex={0} aria-label="Volume by parish">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Parish</th>
                        <th scope="col">Total</th>
                        <th scope="col">Approved / Done</th>
                        <th scope="col">Open</th>
                        <th scope="col">Closed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.byParish.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <strong>{row.label}</strong>
                          </td>
                          <td>{row.total}</td>
                          <td>{row.approvedOrCompleted}</td>
                          <td>{row.pending}</td>
                          <td>{row.closed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            )}

            <article className="panel wide">
              <span className="eyebrow">Data quality</span>
              <h2>Current release indicators</h2>
              <div className="quality-grid">
                <div>
                  <strong>{report.totals.verifiedRecords ?? '—'}</strong>
                  <span>
                    {report.totals.verifiedRecords === null
                      ? 'archive count restricted to parish staff'
                      : 'records checked against archive'}
                  </span>
                </div>
                <div>
                  <strong>{report.totals.verifiedDocuments ?? '—'}</strong>
                  <span>
                    {report.totals.verifiedDocuments === null
                      ? 'document count restricted to parish staff'
                      : 'human-verified submissions in filter'}
                  </span>
                </div>
                <div>
                  <strong>{conflicts.length}</strong>
                  <span>unresolved schedule conflicts</span>
                </div>
                <div>
                  <strong>{data.metrics.publishedAnnouncements}</strong>
                  <span>published notices in scope</span>
                </div>
              </div>
            </article>

            <article className="panel wide">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Detailed register</span>
                  <h2>Matching appointment log</h2>
                </div>
                <span className="result-count">
                  {report.appointments.length}
                  {report.appointmentsTruncated ? ' of 200+ rows' : ' rows'}
                </span>
              </div>
              {report.appointments.length ? (
                <div className="table-wrap" tabIndex={0} aria-label="Matching appointment report rows">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">Reference</th>
                        <th scope="col">Parishioner</th>
                        <th scope="col">Sacrament</th>
                        <th scope="col">Schedule</th>
                        <th scope="col">Docs</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.appointments.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.reference}</strong>
                            <small>{item.parish}</small>
                          </td>
                          <td>{item.parishioner}</td>
                          <td>
                            {item.service}
                            <small>{item.clergy}</small>
                          </td>
                          <td>
                            {formatDateTime(item.startsAt)}
                            <small>{item.venue}</small>
                          </td>
                          <td>
                            {item.verifiedDocuments}/{item.requiredDocuments}
                          </td>
                          <td>
                            <StatusPill value={item.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No matching appointments</strong>
                  <span>Widen the date range or clear status and sacrament filters.</span>
                </div>
              )}
            </article>
          </section>
        </>
      )}
    </div>
  );
}

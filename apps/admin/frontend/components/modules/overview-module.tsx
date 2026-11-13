'use client';

import type { DashboardState } from '@/shared/domain';
import { utcTimestamp } from '@/shared/validation';
import { AppointmentTable, type ModuleId } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  selectedAppointmentId: string | null;
  onOpenModule: (module: ModuleId) => void;
  onReviewAppointment: (appointmentId: string) => void;
};

export function OverviewModule({
  data,
  selectedAppointmentId,
  onOpenModule,
  onReviewAppointment,
}: Props) {
  const pendingAppointments = data.appointments.filter(
    (item) => !['approved', 'completed', 'cancelled', 'rejected', 'no_show'].includes(item.status),
  );
  const parsedGeneratedAt = Date.parse(data.generatedAt);
  const referenceTime = Number.isFinite(parsedGeneratedAt) ? parsedGeneratedAt : 0;
  const upcomingAppointments = pendingAppointments.filter(
    (item) => new Date(utcTimestamp(item.startsAt)).getTime() >= referenceTime,
  );
  const appointmentTotal = Object.values(data.metrics.appointmentStatuses).reduce(
    (sum, count) => sum + (count ?? 0),
    0,
  );
  const pendingTotal = Object.entries(data.metrics.appointmentStatuses).reduce(
    (sum, [status, count]) =>
      sum + (['approved', 'completed', 'cancelled', 'rejected', 'no_show'].includes(status) ? 0 : count ?? 0),
    0,
  );
  const conflicts = data.appointments.filter(
    (item) => item.conflict && !['cancelled', 'rejected', 'completed', 'no_show'].includes(item.status),
  );
  const waitingQueue = data.queue.filter((item) => item.status === 'waiting');
  const servingQueue = data.queue.filter((item) => item.status === 'serving');

  return (
    <>
      <section className="welcome-card" aria-labelledby="overview-title">
        <div>
          <span className="eyebrow light">{data.actor.parishName}</span>
          <h2 id="overview-title">Today’s parish operations, at a glance.</h2>
          <p>
            Review documentary requirements, resolve schedule conflicts, and assist walk-in parishioners from one
            accountable workspace.
          </p>
        </div>
        <button className="primary-button" onClick={() => onOpenModule('appointments')}>
          Review pending requests <span aria-hidden="true">→</span>
        </button>
      </section>
      <section className="kpi-grid" aria-label="Current operational metrics">
        <article className="kpi-card">
          <span>Open appointment requests</span>
          <strong>{pendingTotal}</strong>
          <small>{appointmentTotal} total in your scope</small>
        </article>
        <article className="kpi-card">
          <span>Documents to verify</span>
          <strong>{data.metrics.awaitingDocumentReview ?? '—'}</strong>
          <small>
            {data.metrics.awaitingDocumentReview === null
              ? 'Parish staff access required'
              : 'Human review required'}
          </small>
        </article>
        <article className="kpi-card">
          <span>Schedule conflicts</span>
          <strong className={conflicts.length ? 'warning-value' : undefined}>{conflicts.length}</strong>
          <small>{conflicts.length ? 'Approval is blocked' : 'No current overlaps'}</small>
        </article>
        <article className="kpi-card">
          <span>Walk-ins waiting</span>
          <strong>{data.metrics.waitingQueue ?? '—'}</strong>
          <small>
            {data.metrics.servingQueue === null
              ? 'Front-desk access required'
              : `${data.metrics.servingQueue} currently serving`}
          </small>
        </article>
      </section>
      <section className="content-grid">
        <article className="panel appointments-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Action required</span>
              <h2>Upcoming appointments</h2>
            </div>
            <button className="text-button" onClick={() => onOpenModule('appointments')}>
              View all <span aria-hidden="true">→</span>
            </button>
          </div>
          <AppointmentTable
            items={upcomingAppointments.slice(0, 5)}
            selectedId={selectedAppointmentId}
            onReview={onReviewAppointment}
          />
        </article>
        <aside className="panel queue-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">Front desk</span>
              <h2>Live queue</h2>
            </div>
            <span className="queue-count">{waitingQueue.length} waiting</span>
          </div>
          {servingQueue[0] ? (
            <div className="now-serving">
              <span>Now serving</span>
              <strong>{servingQueue[0].number}</strong>
              <small>
                {servingQueue[0].service} · {servingQueue[0].counter}
              </small>
            </div>
          ) : (
            <div className="empty-mini">No active counter</div>
          )}
          <ol className="queue-list">
            {waitingQueue.slice(0, 3).map((ticket, index) => (
              <li key={ticket.id}>
                <strong>{ticket.number}</strong>
                <span>{ticket.service}</span>
                <small>#{index + 1}</small>
              </li>
            ))}
          </ol>
          <button className="secondary-button" onClick={() => onOpenModule('queue')}>
            Open queue console
          </button>
        </aside>
      </section>
    </>
  );
}

'use client';

import { useState, type FormEvent } from 'react';
import type { AdminMutation, DashboardState } from '@/shared/domain';
import { formatDateTime, QUEUE_PURPOSES } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

export function QueueModule({ data, busy, runMutation }: Props) {
  const [queueParishId, setQueueParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );
  const [counter, setCounter] = useState('Window 1');
  const [queueVisitorName, setQueueVisitorName] = useState('');
  const [queueService, setQueueService] = useState<(typeof QUEUE_PURPOSES)[number]>('General inquiry');

  const parishQueue = data.queue.filter((ticket) => ticket.parishId === queueParishId);
  const active = parishQueue.find((ticket) => ticket.status === 'serving');
  const waiting = parishQueue.filter((ticket) => ticket.status === 'waiting');

  return (
    <section className="module-layout queue-console">
      <article className="panel module-primary">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Inclusive front desk</span>
            <h2>Walk-in queue</h2>
          </div>
          <span className="result-count">{waiting.length} waiting</span>
        </div>
        <div className="filter-bar">
          <label>
            <span>Parish</span>
            <select value={queueParishId} onChange={(event) => setQueueParishId(event.target.value)}>
              {data.parishes.map((parish) => (
                <option value={parish.id} key={parish.id}>
                  {parish.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Counter or window</span>
            <input value={counter} onChange={(event) => setCounter(event.target.value)} />
          </label>
        </div>
        <div className="queue-board">
          <div className="now-serving large">
            <span>Now serving</span>
            <strong>{active?.number ?? '—'}</strong>
            <small>
              {active
                ? `${active.parishioner} · ${active.service} · ${active.counter}`
                : 'No ticket is currently active'}
            </small>
          </div>
          <div className="queue-controls">
            {active ? (
              <button
                className="approve-button"
                disabled={busy}
                onClick={() =>
                  void runMutation(
                    { action: 'queue.complete', ticketId: active.id },
                    `${active.number} marked served.`,
                  )
                }
              >
                Complete {active.number}
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={busy || !waiting.length || counter.trim().length < 2}
                onClick={() =>
                  void runMutation(
                    { action: 'queue.call_next', parishId: queueParishId, counter },
                    'The next walk-in has been called.',
                  )
                }
              >
                Call next ticket
              </button>
            )}
          </div>
        </div>
        <ol className="waiting-list">
          {waiting.map((ticket, index) => (
            <li key={ticket.id}>
              <span className="queue-position">{index + 1}</span>
              <strong>{ticket.number}</strong>
              <div>
                <span>{ticket.parishioner}</span>
                <small>
                  {ticket.service} · issued {formatDateTime(ticket.issuedAt)}
                </small>
              </div>
              {ticket.priority > 0 && <span className="status pending">Priority {ticket.priority}</span>}
            </li>
          ))}
        </ol>
      </article>
      <aside className="panel detail-panel">
        <span className="eyebrow">Front-desk ticket</span>
        <h2>Include visitors without a device</h2>
        <p className="body-copy">
          Mobile self-ticketing is a convenience, never an access requirement. Staff can issue the same queue
          ticket at the parish office.
        </p>
        {data.actor.role === 'clergy' ? (
          <div className="alert info">
            <strong>Read-only access</strong>
            <span>Ticket issuance is assigned to parish staff and system administrators.</span>
          </div>
        ) : (
          <form
            className="stack-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runMutation(
                {
                  action: 'queue.issue',
                  parishId: queueParishId,
                  parishionerName: queueVisitorName,
                  service: queueService,
                },
                'Front-desk ticket issued.',
              ).then((saved) => {
                if (saved) setQueueVisitorName('');
              });
            }}
          >
            <label>
              <span>Visitor name</span>
              <input
                value={queueVisitorName}
                maxLength={120}
                onChange={(event) => setQueueVisitorName(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label>
              <span>Purpose</span>
              <select
                value={queueService}
                onChange={(event) => setQueueService(event.target.value as (typeof QUEUE_PURPOSES)[number])}
              >
                {QUEUE_PURPOSES.map((purpose) => (
                  <option value={purpose} key={purpose}>
                    {purpose}
                  </option>
                ))}
              </select>
            </label>
            <button className="primary-button" disabled={busy || queueVisitorName.trim().length < 2}>
              Issue walk-in ticket
            </button>
          </form>
        )}
        <div className="note-box">
          <strong>Priority handling</strong>
          <p>
            Any priority exception must follow the parish-approved policy and remain auditable. Default ordering is
            FIFO within the parish.
          </p>
        </div>
      </aside>
    </section>
  );
}

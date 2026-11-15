'use client';

import { useState, type FormEvent } from 'react';
import { humanizeStatus, type AdminMutation, type DashboardState, type QueueTicket } from '@/shared/domain';
import { formatDateTime, parseManilaLocalDateTime, QUEUE_PURPOSES } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

function serviceIdFromQueuePurpose(purpose: string, fallbackId: string): string {
  if (/baptism/i.test(purpose)) return 'baptism';
  if (/wedding|marriage/i.test(purpose)) return 'wedding';
  if (/confirmation/i.test(purpose)) return 'confirmation';
  if (/communion/i.test(purpose)) return 'first-communion';
  if (/funeral/i.test(purpose)) return 'funeral-mass';
  return fallbackId;
}

export function QueueModule({ data, busy, runMutation }: Props) {
  const [queueParishId, setQueueParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );
  const [counter, setCounter] = useState('Window 1');
  const [queueVisitorName, setQueueVisitorName] = useState('');
  const [queueService, setQueueService] = useState<(typeof QUEUE_PURPOSES)[number]>('General inquiry');
  const [printingTicket, setPrintingTicket] = useState<QueueTicket | null>(null);

  const activeServices = data.serviceSettings.filter((service) => service.isActive);
  const defaultServiceId = activeServices[0]?.id ?? 'baptism';
  const parishClergy = data.clergyOptions.filter(
    (clergy) => !clergy.parishId || clergy.parishId === queueParishId,
  );
  const parishVenues = data.venueOptions.filter((venue) => venue.parishId === queueParishId);

  const [walkInTicketId, setWalkInTicketId] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');
  const [walkInParticipant, setWalkInParticipant] = useState('');
  const [walkInServiceId, setWalkInServiceId] = useState(defaultServiceId);
  const [walkInClergyId, setWalkInClergyId] = useState(() => parishClergy[0]?.id ?? '');
  const [walkInVenueId, setWalkInVenueId] = useState(() => parishVenues[0]?.id ?? '');
  const [walkInStartsAt, setWalkInStartsAt] = useState('');

  const parishQueue = data.queue.filter((ticket) => ticket.parishId === queueParishId);
  const normalizedCounter = counter.trim().toLowerCase();
  const active =
    parishQueue.find(
      (ticket) =>
        ticket.status === 'serving' &&
        (ticket.counter ?? '').trim().toLowerCase() === normalizedCounter,
    ) ?? null;
  const otherServing = parishQueue.filter(
    (ticket) => ticket.status === 'serving' && ticket.id !== active?.id,
  );
  const waiting = parishQueue.filter((ticket) => ticket.status === 'waiting');
  const linkableTickets = parishQueue.filter(
    (ticket) => ticket.status === 'waiting' || ticket.status === 'serving',
  );
  const slipTicket = printingTicket ?? active ?? otherServing[0] ?? waiting[0] ?? null;

  const printTicketSlip = (ticket: QueueTicket) => {
    setPrintingTicket(ticket);
    setTimeout(() => {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      document.body?.classList?.add('printing-queue-slip');
      let cleaned = false;
      function cleanup() {
        if (cleaned) return;
        cleaned = true;
        window.clearTimeout(fallbackTimer);
        document.body?.classList?.remove('printing-queue-slip');
        window.removeEventListener?.('afterprint', cleanup);
      }
      window.addEventListener?.('afterprint', cleanup);
      const fallbackTimer = window.setTimeout(cleanup, 1500);
      window.print();
    }, 0);
  };

  const prefillWalkInFromTicket = (ticket: QueueTicket) => {
    setWalkInTicketId(ticket.id);
    setWalkInName(ticket.parishioner);
    const matchedService = serviceIdFromQueuePurpose(ticket.service, defaultServiceId);
    if (activeServices.some((service) => service.id === matchedService)) {
      setWalkInServiceId(matchedService);
    }
    if (!walkInClergyId && parishClergy[0]?.id) setWalkInClergyId(parishClergy[0].id);
    if (!walkInVenueId && parishVenues[0]?.id) setWalkInVenueId(parishVenues[0].id);
  };

  return (
    <>
      {slipTicket ? (
        <div className="print-queue-slip" aria-hidden="true">
          <span>ParishLink Walk-In Queue Slip</span>
          <p>{slipTicket.parish}</p>
          <strong>{slipTicket.number}</strong>
          <p>
            Visitor: {slipTicket.parishioner}
            <br />
            Purpose: {slipTicket.service}
            {slipTicket.counter ? (
              <>
                <br />
                Counter: {slipTicket.counter}
              </>
            ) : null}
          </p>
          <small>Issued {formatDateTime(slipTicket.issuedAt)}</small>
        </div>
      ) : null}
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
              <select
                value={queueParishId}
                onChange={(event) => {
                  const nextParish = event.target.value;
                  setQueueParishId(nextParish);
                  const nextClergy = data.clergyOptions.find(
                    (clergy) => !clergy.parishId || clergy.parishId === nextParish,
                  );
                  const nextVenue = data.venueOptions.find((venue) => venue.parishId === nextParish);
                  setWalkInClergyId(nextClergy?.id ?? '');
                  setWalkInVenueId(nextVenue?.id ?? '');
                  setWalkInTicketId('');
                  setWalkInName('');
                  setWalkInPhone('');
                  setWalkInParticipant('');
                  setWalkInStartsAt('');
                }}
              >
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
              <span>Now serving at {counter.trim() || 'counter'}</span>
              <strong>{active?.number ?? '—'}</strong>
              <small>
                {active
                  ? `${active.parishioner} · ${active.service} · ${active.counter}`
                  : 'No ticket is currently active at this counter'}
              </small>
            </div>
            <div className="queue-controls">
              {active ? (
                <>
                  {data.actor.role !== 'clergy' && (
                    <button
                      type="button"
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
                  )}
                  <button
                    type="button"
                    className="row-action"
                    disabled={busy}
                    onClick={() => printTicketSlip(active)}
                  >
                    Print slip
                  </button>
                  {data.actor.role === 'parish_staff' && (
                    <button
                      type="button"
                      className="row-action"
                      disabled={busy}
                      onClick={() => prefillWalkInFromTicket(active)}
                    >
                      Book schedule
                    </button>
                  )}
                  {data.actor.role !== 'clergy' && (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={busy}
                      onClick={() =>
                        void runMutation(
                          { action: 'queue.cancel', ticketId: active.id, status: 'no_show' },
                          `${active.number} marked no-show.`,
                        )
                      }
                    >
                      Mark no-show
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  disabled={busy || data.actor.role === 'clergy' || !waiting.length || counter.trim().length < 2}
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

          {otherServing.length > 0 && (
            <div className="other-counters">
              <span className="eyebrow">Active at other counters</span>
              <ul className="waiting-list">
                {otherServing.map((ticket) => (
                  <li key={ticket.id}>
                    <span className="queue-position" aria-hidden="true">●</span>
                    <strong>{ticket.number}</strong>
                    <div>
                      <span>{ticket.parishioner}</span>
                      <small>
                        {ticket.counter ?? 'Counter'} · {ticket.service}
                      </small>
                    </div>
                    <div className="waiting-actions">
                      {data.actor.role !== 'clergy' && (
                        <button
                          type="button"
                          className="approve-button"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(
                              { action: 'queue.complete', ticketId: ticket.id },
                              `${ticket.number} marked served.`,
                            )
                          }
                        >
                          Complete {ticket.number}
                        </button>
                      )}
                      <button
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() => printTicketSlip(ticket)}
                      >
                        Print slip
                      </button>
                      {data.actor.role === 'parish_staff' && (
                        <button
                          type="button"
                          className="row-action"
                          disabled={busy}
                          onClick={() => prefillWalkInFromTicket(ticket)}
                        >
                          Book schedule
                        </button>
                      )}
                      {data.actor.role !== 'clergy' && (
                        <button
                          type="button"
                          className="danger-button"
                          disabled={busy}
                          onClick={() =>
                            void runMutation(
                              { action: 'queue.cancel', ticketId: ticket.id, status: 'no_show' },
                              `${ticket.number} marked no-show.`,
                            )
                          }
                        >
                          Mark no-show
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {waiting.length ? (
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
                  <div className="waiting-actions">
                    {ticket.priority > 0 && <span className="status pending">Priority {ticket.priority}</span>}
                    <button
                      type="button"
                      className="row-action"
                      disabled={busy}
                      onClick={() => printTicketSlip(ticket)}
                    >
                      Print slip
                    </button>
                    {data.actor.role === 'parish_staff' && (
                      <button
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() => prefillWalkInFromTicket(ticket)}
                      >
                        Book schedule
                      </button>
                    )}
                    {data.actor.role !== 'clergy' && (
                      <button
                        type="button"
                        className="row-action"
                        disabled={busy}
                        onClick={() =>
                          void runMutation(
                            { action: 'queue.cancel', ticketId: ticket.id, status: 'cancelled' },
                            `${ticket.number} cancelled.`,
                          )
                        }
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty-mini">No visitors are currently waiting in line for this parish.</div>
          )}
        </article>
        <aside className="panel detail-panel">
          <span className="eyebrow">Front-desk ticket</span>
          <h2>Include visitors without a device</h2>
          <p className="body-copy">
            Mobile self-ticketing is a convenience, never an access requirement. Staff can issue a sequential daily
            queue slip at the parish office.
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
                  placeholder="Visitor full name"
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

          {data.actor.role === 'parish_staff' && (
            <>
              <hr className="settings-divider" />
              <span className="eyebrow">Assisted scheduling</span>
              <h2>Book appointment for visitor</h2>
              <p className="body-copy">
                Record a conflict-checked sacramental request directly from the front desk for visitors without the
                mobile app.
              </p>
              <form
                className="stack-form"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  const parsed = parseManilaLocalDateTime(walkInStartsAt);
                  if (!parsed) return;
                  void runMutation(
                    {
                      action: 'walkin.appointment.create',
                      parishId: queueParishId,
                      ticketId: walkInTicketId || null,
                      parishionerName: walkInName,
                      contactPhone: walkInPhone.trim() || null,
                      participantName: walkInParticipant.trim() || null,
                      serviceTypeId: walkInServiceId,
                      clergyId: walkInClergyId,
                      venueId: walkInVenueId,
                      startsAt: parsed.toISOString(),
                    },
                    'Walk-in appointment recorded for parish review.',
                  ).then((saved) => {
                    if (saved) {
                      setWalkInTicketId('');
                      setWalkInName('');
                      setWalkInPhone('');
                      setWalkInParticipant('');
                      setWalkInStartsAt('');
                    }
                  });
                }}
              >
                <label>
                  <span>Linked queue ticket (optional)</span>
                  <select
                    value={walkInTicketId}
                    onChange={(event) => {
                      const nextTicketId = event.target.value;
                      setWalkInTicketId(nextTicketId);
                      const matchedTicket = linkableTickets.find((item) => item.id === nextTicketId);
                      if (matchedTicket) {
                        setWalkInName(matchedTicket.parishioner);
                        const matchedService = serviceIdFromQueuePurpose(
                          matchedTicket.service,
                          defaultServiceId,
                        );
                        if (activeServices.some((service) => service.id === matchedService)) {
                          setWalkInServiceId(matchedService);
                        }
                      }
                    }}
                  >
                    <option value="">No queue ticket linked</option>
                    {linkableTickets.map((ticket) => (
                      <option value={ticket.id} key={ticket.id}>
                        {ticket.number} · {ticket.parishioner} ({humanizeStatus(ticket.status)})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Visitor full name</span>
                  <input
                    value={walkInName}
                    maxLength={120}
                    onChange={(event) => setWalkInName(event.target.value)}
                    placeholder="Complete name of requester"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Contact phone (optional)</span>
                  <input
                    value={walkInPhone}
                    maxLength={30}
                    onChange={(event) => setWalkInPhone(event.target.value)}
                    placeholder="+63 9XX XXX XXXX"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Sacrament</span>
                  <select
                    value={walkInServiceId}
                    onChange={(event) => setWalkInServiceId(event.target.value)}
                  >
                    {activeServices.map((service) => (
                      <option value={service.id} key={service.id}>
                        {service.name} ({service.durationMinutes} min)
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Assigned priest</span>
                  <select
                    value={walkInClergyId}
                    onChange={(event) => setWalkInClergyId(event.target.value)}
                  >
                    {parishClergy.map((clergy) => (
                      <option value={clergy.id} key={clergy.id}>
                        {clergy.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Venue</span>
                  <select
                    value={walkInVenueId}
                    onChange={(event) => setWalkInVenueId(event.target.value)}
                  >
                    {parishVenues.map((venue) => (
                      <option value={venue.id} key={venue.id}>
                        {venue.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Sacramental participant (optional)</span>
                  <input
                    value={walkInParticipant}
                    maxLength={160}
                    onChange={(event) => setWalkInParticipant(event.target.value)}
                    placeholder="Child, candidate, or deceased name if different"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Appointment date and time (Philippine time)</span>
                  <input
                    type="datetime-local"
                    value={walkInStartsAt}
                    onChange={(event) => setWalkInStartsAt(event.target.value)}
                  />
                </label>
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    walkInName.trim().length < 3 ||
                    !walkInServiceId ||
                    !walkInClergyId ||
                    !walkInVenueId ||
                    !walkInStartsAt
                  }
                >
                  Book walk-in appointment
                </button>
              </form>
            </>
          )}

          {data.actor.role === 'system_admin' && (
            <>
              <hr className="settings-divider" />
              <span className="eyebrow">Assisted scheduling</span>
              <h2>Book appointment for visitor</h2>
              <div className="alert info">
                <strong>Assigned parish staff workflow</strong>
                <span>
                  Walk-in sacramental booking is performed by parish front-desk staff so documentary checklists stay
                  scoped to the receiving parish.
                </span>
              </div>
            </>
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
    </>
  );
}

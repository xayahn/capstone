'use client';

import { useMemo, useState } from 'react';
import {
  APPOINTMENT_STATUSES,
  humanizeStatus,
  type AdminMutation,
  type ChangeRequest,
  type DashboardState,
} from '@/shared/domain';
import { allowedAppointmentTransitions } from '@/shared/workflow';
import {
  AppointmentTable,
  formatDateTime,
  REASON_REQUIRED,
  StatusPill,
  TRANSITION_LABELS,
} from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  selectedAppointmentId: string | null;
  onSelectAppointment: (id: string | null) => void;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

export function AppointmentsModule({
  data,
  busy,
  selectedAppointmentId,
  onSelectAppointment,
  runMutation,
}: Props) {
  const [appointmentView, setAppointmentView] = useState<'list' | 'changes'>('list');
  const [selectedChangeRequestId, setSelectedChangeRequestId] = useState<string | null>(
    () => data.changeRequests[0]?.id ?? null,
  );
  const [changeRequestSearch, setChangeRequestSearch] = useState('');
  const [changeRequestStatus, setChangeRequestStatus] = useState<
    'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn'
  >('all');
  const [changeDecisionNote, setChangeDecisionNote] = useState('');
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentStatus, setAppointmentStatus] = useState('all');
  const [appointmentReason, setAppointmentReason] = useState('');

  const filteredAppointments = useMemo(() => {
    const query = appointmentSearch.trim().toLowerCase();
    return data.appointments.filter((item) => {
      const statusMatch = appointmentStatus === 'all' || item.status === appointmentStatus;
      const textMatch =
        !query ||
        `${item.reference} ${item.parishioner} ${item.service} ${item.parish} ${item.clergy}`
          .toLowerCase()
          .includes(query);
      return statusMatch && textMatch;
    });
  }, [data.appointments, appointmentSearch, appointmentStatus]);

  const filteredChangeRequests = useMemo(() => {
    const query = changeRequestSearch.trim().toLowerCase();
    return data.changeRequests.filter((item) => {
      const statusMatch = changeRequestStatus === 'all' || item.status === changeRequestStatus;
      const textMatch =
        !query ||
        `${item.reference} ${item.parishioner} ${item.service} ${item.parish} ${item.clergy} ${item.kind}`
          .toLowerCase()
          .includes(query);
      return statusMatch && textMatch;
    });
  }, [data.changeRequests, changeRequestSearch, changeRequestStatus]);

  const selectedAppointment =
    data.appointments.find((item) => item.id === selectedAppointmentId) ?? data.appointments[0] ?? null;
  const selectedChangeRequest: ChangeRequest | null =
    filteredChangeRequests.find((item) => item.id === selectedChangeRequestId) ?? filteredChangeRequests[0] ?? null;

  const pendingChangeCount = data.changeRequests.filter((item) => item.status === 'pending').length;
  const selectedAppointmentPendingChange = selectedAppointment
    ? data.changeRequests.find(
        (item) => item.appointmentId === selectedAppointment.id && item.status === 'pending',
      ) ?? null
    : null;
  const permittedTransitions = selectedAppointment
    ? allowedAppointmentTransitions(selectedAppointment.status, data.actor.role)
    : [];

  function changeRequestTable(items: ChangeRequest[]) {
    if (!items.length) {
      return (
        <div className="empty-state">
          <strong>No matching change requests</strong>
          <span>Parishioner reschedule and cancellation requests will appear here.</span>
        </div>
      );
    }
    return (
      <div className="table-wrap" tabIndex={0} aria-label="Scrollable change requests table">
        <table>
          <caption className="sr-only">Parishioner reschedule and cancellation requests</caption>
          <thead>
            <tr>
              <th scope="col">Parishioner</th>
              <th scope="col">Request</th>
              <th scope="col">Current → Proposed</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={selectedChangeRequest?.id === item.id ? 'selected-row' : undefined}>
                <td>
                  <strong>{item.parishioner}</strong>
                  <small>
                    {item.reference} · {item.parish}
                  </small>
                </td>
                <td>
                  {item.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'}
                  <small>
                    {item.service} · {item.clergy}
                  </small>
                </td>
                <td>
                  {formatDateTime(item.currentStartsAt)}
                  <small>
                    {item.kind === 'reschedule' && item.proposedStartsAt
                      ? `→ ${formatDateTime(item.proposedStartsAt)}`
                      : 'Cancel scheduled slot'}
                  </small>
                </td>
                <td>
                  <StatusPill value={item.status} />
                  {item.status === 'pending' && item.kind === 'reschedule' && item.proposedSlotAvailable !== null && (
                    <small className={item.proposedSlotAvailable ? 'slot-status ready' : 'slot-status danger'}>
                      {item.proposedSlotAvailable ? 'Slot open' : 'Slot conflict'}
                    </small>
                  )}
                </td>
                <td>
                  <button
                    className="row-action"
                    onClick={() => {
                      setSelectedChangeRequestId(item.id);
                      setChangeDecisionNote('');
                    }}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="module-layout">
      <article className="panel module-primary">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Sacramental services</span>
            <h2>{appointmentView === 'changes' ? 'Schedule change requests' : 'Appointment coordination'}</h2>
          </div>
          <span className="result-count">
            {appointmentView === 'changes'
              ? `${filteredChangeRequests.length} requests`
              : `${filteredAppointments.length} requests`}
          </span>
        </div>
        <div className="subnav-tabs" role="tablist" aria-label="Appointment views">
          <button
            type="button"
            role="tab"
            aria-selected={appointmentView === 'list'}
            className={appointmentView === 'list' ? 'subnav-tab active' : 'subnav-tab'}
            onClick={() => setAppointmentView('list')}
          >
            All appointments<strong className="subnav-count">{data.appointments.length}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={appointmentView === 'changes'}
            className={appointmentView === 'changes' ? 'subnav-tab active' : 'subnav-tab'}
            onClick={() => setAppointmentView('changes')}
          >
            Change requests<strong className="subnav-count">{pendingChangeCount} pending</strong>
          </button>
        </div>
        {appointmentView === 'list' ? (
          <>
            <div className="filter-bar">
              <label>
                <span>Search</span>
                <input
                  value={appointmentSearch}
                  onChange={(event) => setAppointmentSearch(event.target.value)}
                  placeholder="Reference, name, service, parish…"
                />
              </label>
              <label>
                <span>Status</span>
                <select value={appointmentStatus} onChange={(event) => setAppointmentStatus(event.target.value)}>
                  <option value="all">All statuses</option>
                  {APPOINTMENT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {humanizeStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <AppointmentTable
              items={filteredAppointments}
              selectedId={selectedAppointment?.id ?? null}
              onReview={(id) => {
                onSelectAppointment(id);
                setAppointmentView('list');
              }}
            />
          </>
        ) : (
          <>
            <div className="filter-bar">
              <label>
                <span>Search</span>
                <input
                  value={changeRequestSearch}
                  onChange={(event) => setChangeRequestSearch(event.target.value)}
                  placeholder="Reference, name, service, parish…"
                />
              </label>
              <label>
                <span>Request status</span>
                <select
                  value={changeRequestStatus}
                  onChange={(event) =>
                    setChangeRequestStatus(
                      event.target.value as 'all' | 'pending' | 'approved' | 'rejected' | 'withdrawn',
                    )
                  }
                >
                  <option value="all">All requests</option>
                  {(['pending', 'approved', 'rejected', 'withdrawn'] as const).map((status) => (
                    <option key={status} value={status}>
                      {humanizeStatus(status)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {changeRequestTable(filteredChangeRequests)}
          </>
        )}
      </article>

      <aside
        className="panel detail-panel"
        aria-label={
          appointmentView === 'changes' ? 'Selected change request details' : 'Selected appointment details'
        }
      >
        {appointmentView === 'list' ? (
          selectedAppointment ? (
            <>
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">{selectedAppointment.reference}</span>
                  <h2>{selectedAppointment.parishioner}</h2>
                </div>
                <StatusPill value={selectedAppointment.status} />
              </div>
              <dl className="detail-list">
                <div>
                  <dt>Service</dt>
                  <dd>{selectedAppointment.service}</dd>
                </div>
                <div>
                  <dt>Parish</dt>
                  <dd>{selectedAppointment.parish}</dd>
                </div>
                <div>
                  <dt>Participant(s)</dt>
                  <dd>{selectedAppointment.participants}</dd>
                </div>
                <div>
                  <dt>Schedule</dt>
                  <dd>{formatDateTime(selectedAppointment.startsAt)}</dd>
                </div>
                <div>
                  <dt>Clergy & venue</dt>
                  <dd>
                    {selectedAppointment.clergy}
                    <br />
                    {selectedAppointment.venue}
                  </dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>
                    {selectedAppointment.verifiedDocuments} of {selectedAppointment.requiredDocuments} human-verified
                  </dd>
                </div>
              </dl>
              {selectedAppointmentPendingChange && (
                <div className="alert warning">
                  <strong>
                    Pending{' '}
                    {selectedAppointmentPendingChange.kind === 'reschedule' ? 'reschedule' : 'cancellation'} request
                  </strong>
                  <span>
                    {selectedAppointmentPendingChange.kind === 'reschedule' &&
                    selectedAppointmentPendingChange.proposedStartsAt
                      ? `Parishioner requested ${formatDateTime(selectedAppointmentPendingChange.proposedStartsAt)}.`
                      : 'Parishioner asked the parish office to cancel this approved appointment.'}
                  </span>
                  <div className="detail-actions">
                    <button
                      type="button"
                      className="row-action"
                      onClick={() => {
                        setAppointmentView('changes');
                        setSelectedChangeRequestId(selectedAppointmentPendingChange.id);
                        setChangeDecisionNote('');
                      }}
                    >
                      Review change request
                    </button>
                  </div>
                </div>
              )}
              {selectedAppointment.conflict && (
                <div className="alert danger">
                  <strong>Approval blocked</strong>
                  <span>This interval overlaps another clergy or venue assignment.</span>
                </div>
              )}
              {selectedAppointment.reviewNote && (
                <div className="note-box">
                  <strong>Review note</strong>
                  <p>{selectedAppointment.reviewNote}</p>
                </div>
              )}
              {permittedTransitions.length ? (
                <div className="decision-area">
                  <label>
                    <span>Decision note</span>
                    <textarea
                      value={appointmentReason}
                      onChange={(event) => setAppointmentReason(event.target.value)}
                      placeholder="Required for changes, rejection, or cancellation"
                    />
                  </label>
                  <div className="decision-buttons">
                    {permittedTransitions.map((status) => (
                      <button
                        key={status}
                        disabled={busy || (REASON_REQUIRED.has(status) && appointmentReason.trim().length < 4)}
                        className={
                          status === 'approved'
                            ? 'primary-button compact'
                            : status === 'rejected' || status === 'cancelled'
                              ? 'danger-button'
                              : 'secondary-button compact'
                        }
                        onClick={() =>
                          void runMutation(
                            {
                              action: 'appointment.transition',
                              appointmentId: selectedAppointment.id,
                              status,
                              expectedVersion: selectedAppointment.version,
                              reason: appointmentReason,
                            },
                            `Appointment moved to ${humanizeStatus(status)}.`,
                          )
                        }
                      >
                        {TRANSITION_LABELS[status] ?? humanizeStatus(status)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="empty-mini">No further actions are available for this status.</div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <strong>Select an appointment</strong>
              <span>Its review details will appear here.</span>
            </div>
          )
        ) : selectedChangeRequest ? (
          <>
            <div className="panel-heading">
              <div>
                <span className="eyebrow">{selectedChangeRequest.reference}</span>
                <h2>{selectedChangeRequest.parishioner}</h2>
              </div>
              <StatusPill value={selectedChangeRequest.status} />
            </div>
            <dl className="detail-list">
              <div>
                <dt>Request type</dt>
                <dd>{selectedChangeRequest.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{selectedChangeRequest.service}</dd>
              </div>
              <div>
                <dt>Parish</dt>
                <dd>{selectedChangeRequest.parish}</dd>
              </div>
              <div>
                <dt>Appointment status</dt>
                <dd>{humanizeStatus(selectedChangeRequest.appointmentStatus)}</dd>
              </div>
              <div>
                <dt>Current schedule</dt>
                <dd>{formatDateTime(selectedChangeRequest.currentStartsAt)}</dd>
              </div>
              {selectedChangeRequest.kind === 'reschedule' && selectedChangeRequest.proposedStartsAt && (
                <div>
                  <dt>Proposed schedule</dt>
                  <dd>{formatDateTime(selectedChangeRequest.proposedStartsAt)}</dd>
                </div>
              )}
              <div>
                <dt>Clergy & venue</dt>
                <dd>
                  {selectedChangeRequest.clergy}
                  <br />
                  {selectedChangeRequest.venue}
                </dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDateTime(selectedChangeRequest.createdAt)}</dd>
              </div>
            </dl>
            <div className="note-box">
              <strong>Parishioner reason</strong>
              <p>{selectedChangeRequest.reason}</p>
            </div>
            {selectedChangeRequest.status === 'pending' &&
              selectedChangeRequest.kind === 'reschedule' &&
              selectedChangeRequest.proposedSlotAvailable === false && (
                <div className="alert danger">
                  <strong>Proposed slot unavailable</strong>
                  <span>
                    Another booking or clergy assignment now occupies this priest or venue interval. Decline with a
                    note so the parishioner can choose an open slot.
                  </span>
                </div>
              )}
            {selectedChangeRequest.status === 'pending' &&
              selectedChangeRequest.kind === 'reschedule' &&
              selectedChangeRequest.proposedSlotAvailable === true && (
                <div className="alert info">
                  <strong>Proposed slot open</strong>
                  <span>The priest and venue are conflict-free for the requested interval, including preparation buffers.</span>
                </div>
              )}
            {selectedChangeRequest.status === 'pending' &&
              selectedChangeRequest.kind === 'reschedule' &&
              selectedChangeRequest.appointmentStatus === 'approved' && (
                <div className="alert warning">
                  <strong>Priest re-confirmation required</strong>
                  <span>
                    Approving this reschedule returns the appointment to Ready to Approve so the assigned priest
                    confirms the new schedule.
                  </span>
                </div>
              )}
            {selectedChangeRequest.status === 'pending' && selectedChangeRequest.canDecide ? (
              <div className="decision-area">
                <label>
                  <span>Decision note</span>
                  <textarea
                    value={changeDecisionNote}
                    onChange={(event) => setChangeDecisionNote(event.target.value)}
                    placeholder="Optional when approving; required (at least 4 characters) when declining"
                  />
                </label>
                <div className="decision-buttons">
                  <button
                    className="approve-button"
                    disabled={
                      busy ||
                      (selectedChangeRequest.kind === 'reschedule' &&
                        selectedChangeRequest.proposedSlotAvailable === false)
                    }
                    onClick={() =>
                      void runMutation(
                        {
                          action: 'change_request.decide',
                          requestId: selectedChangeRequest.id,
                          decision: 'approve',
                          ...(changeDecisionNote.trim() ? { note: changeDecisionNote.trim() } : {}),
                        },
                        selectedChangeRequest.kind === 'reschedule'
                          ? 'Reschedule request approved.'
                          : 'Cancellation request confirmed.',
                      ).then((saved) => {
                        if (saved) setChangeDecisionNote('');
                      })
                    }
                  >
                    {selectedChangeRequest.kind === 'reschedule' ? 'Approve reschedule' : 'Confirm cancellation'}
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy || changeDecisionNote.trim().length < 4}
                    onClick={() =>
                      void runMutation(
                        {
                          action: 'change_request.decide',
                          requestId: selectedChangeRequest.id,
                          decision: 'reject',
                          note: changeDecisionNote.trim(),
                        },
                        'Change request declined.',
                      ).then((saved) => {
                        if (saved) setChangeDecisionNote('');
                      })
                    }
                  >
                    Decline request
                  </button>
                </div>
              </div>
            ) : selectedChangeRequest.status === 'pending' ? (
              <div className="alert info">
                <strong>Read-only access</strong>
                <span>
                  {data.actor.role === 'system_admin'
                    ? 'Technical administration cannot decide scheduling requests. Parish staff or the assigned priest decide change requests.'
                    : 'Only parish staff of this parish or the assigned priest can decide this request.'}
                </span>
              </div>
            ) : (
              <div className="note-box">
                <strong>Decision recorded ({humanizeStatus(selectedChangeRequest.status)})</strong>
                <p>{selectedChangeRequest.decisionNote ?? 'No decision note recorded.'}</p>
                {selectedChangeRequest.decidedAt && (
                  <small>
                    {selectedChangeRequest.decidedBy ? `${selectedChangeRequest.decidedBy} · ` : ''}
                    {formatDateTime(selectedChangeRequest.decidedAt)}
                  </small>
                )}
              </div>
            )}
            {data.appointments.some((item) => item.id === selectedChangeRequest.appointmentId) && (
              <div className="detail-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    onSelectAppointment(selectedChangeRequest.appointmentId);
                    setAppointmentView('list');
                  }}
                >
                  Open appointment
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <strong>Select a change request</strong>
            <span>Its schedule and decision details will appear here.</span>
          </div>
        )}
      </aside>
    </section>
  );
}

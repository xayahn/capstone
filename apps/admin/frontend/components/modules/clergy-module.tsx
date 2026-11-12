'use client';

import { useState, type FormEvent } from 'react';
import type { AdminMutation, DashboardState } from '@/shared/domain';
import { AssignmentBrowser } from '@/frontend/components/assignment-browser';
import type { AdminAccessError } from '@/frontend/lib/admin-request';

type Props = {
  data: DashboardState;
  busy: boolean;
  onAccessLost: (error: AdminAccessError) => void;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

export function ClergyModule({ data, busy, onAccessLost, runMutation }: Props) {
  const [assignmentParishId, setAssignmentParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );
  const [assignmentClergyId, setAssignmentClergyId] = useState('');
  const [assignmentVenueId, setAssignmentVenueId] = useState('');
  const [assignmentService, setAssignmentService] = useState('');
  const [assignmentStartsAt, setAssignmentStartsAt] = useState('');
  const [assignmentEndsAt, setAssignmentEndsAt] = useState('');

  const assignmentClergyOptions = data.clergyOptions.filter(
    (item) => !item.parishId || item.parishId === assignmentParishId,
  );
  const assignmentVenueOptions = data.venueOptions.filter((item) => item.parishId === assignmentParishId);
  const effectiveClergyId = assignmentClergyOptions.some((item) => item.id === assignmentClergyId)
    ? assignmentClergyId
    : assignmentClergyOptions[0]?.id ?? '';
  const effectiveVenueId = assignmentVenueOptions.some((item) => item.id === assignmentVenueId)
    ? assignmentVenueId
    : assignmentVenueOptions[0]?.id ?? '';

  return (
    <section className="module-layout">
      <AssignmentBrowser
        key={`${data.actor.id}:${data.actor.role}:${data.actor.parishId}:${data.actor.clergyProfileId}`}
        actor={data.actor}
        refreshKey={data.generatedAt}
        busy={busy}
        total={data.metrics.confirmedAssignments}
        onAccessLost={onAccessLost}
        onCancel={(id) =>
          runMutation({ action: 'clergy.assignment.cancel', assignmentId: id }, 'Clergy assignment cancelled.')
        }
      />
      <aside className="panel detail-panel">
        <span className="eyebrow">New assignment</span>
        <h2>Reserve clergy and venue</h2>
        {data.actor.role === 'clergy' ? (
          <div className="alert info">
            <strong>Read-only access</strong>
            <span>Schedule changes are assigned to parish staff and system administrators.</span>
          </div>
        ) : (
          <form
            className="stack-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runMutation(
                {
                  action: 'clergy.assignment.create',
                  parishId: assignmentParishId,
                  clergyId: effectiveClergyId,
                  venueId: effectiveVenueId,
                  service: assignmentService,
                  startsAt: new Date(assignmentStartsAt).toISOString(),
                  endsAt: new Date(assignmentEndsAt).toISOString(),
                },
                'Clergy assignment created.',
              );
            }}
          >
            <label>
              <span>Parish</span>
              <select
                value={assignmentParishId}
                onChange={(event) => {
                  setAssignmentParishId(event.target.value);
                  setAssignmentClergyId('');
                  setAssignmentVenueId('');
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
              <span>Priest</span>
              <select
                value={effectiveClergyId}
                onChange={(event) => setAssignmentClergyId(event.target.value)}
              >
                {assignmentClergyOptions.map((clergy) => (
                  <option value={clergy.id} key={clergy.id}>
                    {clergy.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Venue</span>
              <select value={effectiveVenueId} onChange={(event) => setAssignmentVenueId(event.target.value)}>
                {assignmentVenueOptions.map((venue) => (
                  <option value={venue.id} key={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Service or duty</span>
              <input
                value={assignmentService}
                maxLength={100}
                onChange={(event) => setAssignmentService(event.target.value)}
                placeholder="e.g. Daily Mass"
              />
            </label>
            <label>
              <span>Starts</span>
              <input
                type="datetime-local"
                value={assignmentStartsAt}
                onChange={(event) => setAssignmentStartsAt(event.target.value)}
              />
            </label>
            <label>
              <span>Ends</span>
              <input
                type="datetime-local"
                value={assignmentEndsAt}
                onChange={(event) => setAssignmentEndsAt(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={
                busy ||
                !effectiveClergyId ||
                !effectiveVenueId ||
                assignmentService.trim().length < 3 ||
                !assignmentStartsAt ||
                !assignmentEndsAt
              }
            >
              Create assignment
            </button>
            <small>The server performs a second conflict check before saving.</small>
          </form>
        )}
      </aside>
    </section>
  );
}

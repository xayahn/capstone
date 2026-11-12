'use client';

import { useState, type FormEvent } from 'react';
import type { AdminMutation, DashboardState } from '@/shared/domain';
import { RecordBrowser } from '@/frontend/components/record-browser';
import type { AdminAccessError } from '@/frontend/lib/admin-request';

type Props = {
  data: DashboardState;
  busy: boolean;
  onAccessLost: (error: AdminAccessError) => void;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

export function RecordsModule({ data, busy, onAccessLost, runMutation }: Props) {
  const [recordParishId, setRecordParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );
  const [recordType, setRecordType] = useState('Baptismal');
  const [recordSubject, setRecordSubject] = useState('');
  const [recordEventDate, setRecordEventDate] = useState('');
  const [recordReference, setRecordReference] = useState('');

  return (
    <section className="module-layout">
      <RecordBrowser
        key={JSON.stringify([data.actor.id, data.actor.role, data.actor.parishId])}
        actor={data.actor}
        refreshKey={data.generatedAt}
        busy={busy}
        onAccessLost={onAccessLost}
        onVerify={(id) =>
          runMutation(
            { action: 'record.verify', recordId: id },
            'Record verified against the authorized archive.',
          )
        }
      />
      <aside className="panel detail-panel">
        <span className="eyebrow">New working record</span>
        <h2>Index an archive entry</h2>
        {data.actor.role !== 'parish_staff' ? (
          <div className="alert info">
            <strong>Read-only access</strong>
            <span>Restricted archive records require assigned parish staff access.</span>
          </div>
        ) : (
          <form
            className="stack-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runMutation(
                {
                  action: 'record.create',
                  parishId: recordParishId,
                  recordType,
                  subjectName: recordSubject,
                  eventDate: recordEventDate,
                  reference: recordReference,
                },
                'Working record created.',
              ).then((saved) => {
                if (saved) {
                  setRecordSubject('');
                  setRecordEventDate('');
                  setRecordReference('');
                }
              });
            }}
          >
            <label>
              <span>Parish</span>
              <select value={recordParishId} onChange={(event) => setRecordParishId(event.target.value)}>
                {data.parishes.map((parish) => (
                  <option value={parish.id} key={parish.id}>
                    {parish.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Record type</span>
              <select value={recordType} onChange={(event) => setRecordType(event.target.value)}>
                <option>Baptismal</option>
                <option>Marriage</option>
                <option>Confirmation</option>
                <option>First Communion</option>
                <option>Funeral Mass</option>
              </select>
            </label>
            <label>
              <span>Subject name</span>
              <input
                value={recordSubject}
                maxLength={160}
                onChange={(event) => setRecordSubject(event.target.value)}
              />
            </label>
            <label>
              <span>Event date</span>
              <input
                type="date"
                value={recordEventDate}
                onChange={(event) => setRecordEventDate(event.target.value)}
              />
            </label>
            <label>
              <span>Archive reference</span>
              <input
                value={recordReference}
                maxLength={50}
                onChange={(event) => setRecordReference(event.target.value.toUpperCase())}
                placeholder="BAP-SGP-2026-0001"
              />
            </label>
            <button
              className="primary-button"
              disabled={
                busy ||
                recordSubject.trim().length < 3 ||
                !recordEventDate ||
                recordReference.trim().length < 6
              }
            >
              Create working record
            </button>
            <small>Creation and later archive verification are recorded separately in the audit trail.</small>
          </form>
        )}
      </aside>
    </section>
  );
}

'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import type { AdminMutation, AppointmentDocument, DashboardState } from '@/shared/domain';
import { StatusPill } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  onUploadDocument: (document: AppointmentDocument, event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

type DocumentStatusFilter = 'awaiting_review' | 'needs_replacement' | 'not_submitted' | 'verified' | 'all';

type DocumentAppointmentGroup = {
  appointmentId: string;
  reference: string;
  parishioner: string;
  service: string;
  items: AppointmentDocument[];
};

export function DocumentsModule({ data, busy, onUploadDocument, runMutation }: Props) {
  const [documentSearch, setDocumentSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatusFilter>(() =>
    data.documents.some((item) => item.status === 'submitted' || item.status === 'under_review')
      ? 'awaiting_review'
      : 'all',
  );
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    return data.documents.filter((item) => {
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'awaiting_review'
            ? item.status === 'submitted' || item.status === 'under_review'
            : item.status === statusFilter;
      if (!matchesStatus) return false;
      return (
        !query ||
        `${item.reference} ${item.parishioner} ${item.service} ${item.requirement} ${item.status}`
          .toLowerCase()
          .includes(query)
      );
    });
  }, [data.documents, documentSearch, statusFilter]);

  const documentGroups = useMemo<DocumentAppointmentGroup[]>(() => {
    const groups = new Map<string, DocumentAppointmentGroup>();
    for (const item of filteredDocuments) {
      const existing = groups.get(item.appointmentId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.appointmentId, {
          appointmentId: item.appointmentId,
          reference: item.reference,
          parishioner: item.parishioner,
          service: item.service,
          items: [item],
        });
      }
    }
    return Array.from(groups.values());
  }, [filteredDocuments]);

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Human verification</span>
          <h2>Document review</h2>
        </div>
        <span className="result-count">
          {data.metrics.awaitingDocumentReview === null
            ? 'Parish staff access required'
            : `${data.metrics.awaitingDocumentReview} awaiting review`}
        </span>
      </div>
      <div className="filter-bar">
        <label>
          <span>Review status</span>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as DocumentStatusFilter)}
          >
            <option value="awaiting_review">Awaiting review (submitted / under review)</option>
            <option value="needs_replacement">Needs replacement</option>
            <option value="not_submitted">Not submitted</option>
            <option value="verified">Human-verified</option>
            <option value="all">All requirements</option>
          </select>
        </label>
        <label>
          <span>Search requirements</span>
          <input
            value={documentSearch}
            onChange={(event) => setDocumentSearch(event.target.value)}
            placeholder="Reference, parishioner, service, requirement…"
          />
        </label>
      </div>
      {documentGroups.length === 0 ? (
        <div className="empty-state">
          <strong>No document requirements match this filter</strong>
          <span>Adjust the status filter or search query to inspect other appointment checklists.</span>
          {(statusFilter !== 'all' || documentSearch.trim() !== '') && (
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => {
                setStatusFilter('all');
                setDocumentSearch('');
              }}
            >
              Show all requirements
            </button>
          )}
        </div>
      ) : (
        <div className="document-groups">
          {documentGroups.map((group) => (
            <section className="document-group" key={group.appointmentId} aria-label={`Checklist for ${group.reference}`}>
              <div className="document-group-header">
                <div>
                  <span className="eyebrow">
                    {group.reference} · {group.service}
                  </span>
                  <h3>{group.parishioner}</h3>
                </div>
                <span className="result-count">
                  {group.items.length} {group.items.length === 1 ? 'requirement' : 'requirements'}
                </span>
              </div>
              <div className="document-grid">
                {group.items.map((document) => (
                  <article className="document-card" key={`${document.appointmentId}-${document.requirementId}`}>
                    <div className="document-top">
                      <div>
                        <span className="eyebrow">
                          {document.reference} · {document.service}
                        </span>
                        <h3>{document.requirement}</h3>
                        <p>{document.parishioner}</p>
                      </div>
                      <StatusPill value={document.status} />
                    </div>
                    <div className="file-row">
                      <span>{document.fileName ?? 'No file submitted'}</span>
                      {document.fileName && document.sha256 && !document.id.startsWith('missing:') && (
                        <a className="text-link" href={`/api/admin/documents/${encodeURIComponent(document.id)}`}>
                          Download
                        </a>
                      )}
                    </div>
                    <label className="upload-button">
                      <span>Upload {document.fileName ? 'replacement' : 'file'}</span>
                      <input
                        className="sr-only"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={(event) => void onUploadDocument(document, event)}
                        disabled={busy}
                      />
                    </label>
                    {document.fileName && document.sha256 && !document.id.startsWith('missing:') && (
                      <>
                        <label className="note-input">
                          <span>Reviewer note</span>
                          <input
                            value={documentNotes[document.id] ?? ''}
                            onChange={(event) =>
                              setDocumentNotes((notes) => ({ ...notes, [document.id]: event.target.value }))
                            }
                            placeholder="Reason required when requesting replacement"
                          />
                        </label>
                        <div className="document-actions">
                          <button
                            className="approve-button"
                            disabled={busy}
                            onClick={() =>
                              void runMutation(
                                {
                                  action: 'document.review',
                                  documentId: document.id,
                                  expectedSha256: document.sha256 ?? '',
                                  status: 'verified',
                                  note: documentNotes[document.id],
                                },
                                'Document marked human-verified.',
                              )
                            }
                          >
                            Verify document
                          </button>
                          <button
                            className="danger-button"
                            disabled={busy || (documentNotes[document.id]?.trim().length ?? 0) < 4}
                            onClick={() =>
                              void runMutation(
                                {
                                  action: 'document.review',
                                  documentId: document.id,
                                  expectedSha256: document.sha256 ?? '',
                                  status: 'needs_replacement',
                                  note: documentNotes[document.id],
                                },
                                'Replacement requested from the parishioner.',
                              )
                            }
                          >
                            Request replacement
                          </button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

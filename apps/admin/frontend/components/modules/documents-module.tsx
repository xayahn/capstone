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

export function DocumentsModule({ data, busy, onUploadDocument, runMutation }: Props) {
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLowerCase();
    return data.documents.filter(
      (item) =>
        !query ||
        `${item.reference} ${item.parishioner} ${item.service} ${item.requirement} ${item.status}`
          .toLowerCase()
          .includes(query),
    );
  }, [data.documents, documentSearch]);

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
      <div className="filter-bar single">
        <label>
          <span>Search requirements</span>
          <input
            value={documentSearch}
            onChange={(event) => setDocumentSearch(event.target.value)}
            placeholder="Reference, parishioner, service, requirement…"
          />
        </label>
      </div>
      <div className="document-grid">
        {filteredDocuments.map((document) => (
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
  );
}

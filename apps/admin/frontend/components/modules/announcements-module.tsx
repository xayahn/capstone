'use client';

import { useState, type FormEvent } from 'react';
import type { AdminMutation, DashboardState } from '@/shared/domain';
import { formatDateTime } from '@/frontend/components/modules/portal-shared';

type Props = {
  data: DashboardState;
  busy: boolean;
  runMutation: (mutation: AdminMutation, successMessage: string) => Promise<boolean>;
};

export function AnnouncementsModule({ data, busy, runMutation }: Props) {
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState<'all' | 'parish'>('parish');
  const [announcementParishId, setAnnouncementParishId] = useState(
    () => data.actor.parishId || data.parishes[0]?.id || '',
  );

  return (
    <section className="module-layout">
      <article className="panel module-primary">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Plain-text publishing</span>
            <h2>Announcements</h2>
          </div>
          <span className="result-count">
            {data.announcements.length} recent · {data.metrics.publishedAnnouncements} total
          </span>
        </div>
        <div className="announcement-list">
          {data.announcements.map((announcement) => (
            <article key={announcement.id}>
              <div>
                <span className="eyebrow">{announcement.parish}</span>
                <h3>{announcement.title}</h3>
                <p>{announcement.body}</p>
                <small>
                  Published {formatDateTime(announcement.publishedAt)} by {announcement.author}
                </small>
              </div>
            </article>
          ))}
        </div>
      </article>
      <aside className="panel detail-panel">
        <span className="eyebrow">New notice</span>
        <h2>Publish an announcement</h2>
        {data.actor.role === 'clergy' ? (
          <div className="alert info">
            <strong>Read-only access</strong>
            <span>Publishing is assigned to parish staff and system administrators.</span>
          </div>
        ) : (
          <form
            className="stack-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void runMutation(
                {
                  action: 'announcement.publish',
                  title: announcementTitle,
                  body: announcementBody,
                  audience: announcementAudience,
                  parishId: announcementParishId,
                },
                'Announcement published.',
              ).then((saved) => {
                if (saved) {
                  setAnnouncementTitle('');
                  setAnnouncementBody('');
                }
              });
            }}
          >
            <label>
              <span>Audience</span>
              <select
                value={announcementAudience}
                onChange={(event) => setAnnouncementAudience(event.target.value as 'all' | 'parish')}
              >
                <option value="parish">One parish</option>
                {data.actor.role === 'system_admin' && <option value="all">All eight parishes</option>}
              </select>
            </label>
            {announcementAudience === 'parish' && (
              <label>
                <span>Parish</span>
                <select
                  value={announcementParishId}
                  onChange={(event) => setAnnouncementParishId(event.target.value)}
                >
                  {data.parishes.map((parish) => (
                    <option value={parish.id} key={parish.id}>
                      {parish.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>Title</span>
              <input
                value={announcementTitle}
                maxLength={120}
                onChange={(event) => setAnnouncementTitle(event.target.value)}
              />
            </label>
            <label>
              <span>Message</span>
              <textarea
                value={announcementBody}
                maxLength={2000}
                onChange={(event) => setAnnouncementBody(event.target.value)}
              />
            </label>
            <button
              className="primary-button"
              disabled={busy || announcementTitle.trim().length < 4 || announcementBody.trim().length < 10}
            >
              Publish notice
            </button>
            <small>Content is stored and rendered as plain text to protect readers from injected markup.</small>
          </form>
        )}
      </aside>
    </section>
  );
}

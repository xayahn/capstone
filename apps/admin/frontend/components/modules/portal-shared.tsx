'use client';

import { humanizeStatus, type Appointment, type AppointmentStatus, type DashboardState } from '@/shared/domain';
import { utcTimestamp } from '@/shared/validation';

export type ModuleId =
  | 'overview'
  | 'appointments'
  | 'documents'
  | 'clergy'
  | 'records'
  | 'queue'
  | 'announcements'
  | 'reports'
  | 'audit'
  | 'settings';

export const NAV_ITEMS: { id: ModuleId; label: string; number: string }[] = [
  { id: 'overview', label: 'Overview', number: '01' },
  { id: 'appointments', label: 'Appointments', number: '02' },
  { id: 'documents', label: 'Document review', number: '03' },
  { id: 'clergy', label: 'Clergy schedule', number: '04' },
  { id: 'records', label: 'Parish records', number: '05' },
  { id: 'queue', label: 'Walk-in queue', number: '06' },
  { id: 'announcements', label: 'Announcements', number: '07' },
  { id: 'reports', label: 'Reports', number: '08' },
  { id: 'audit', label: 'Audit log', number: '09' },
  { id: 'settings', label: 'Settings', number: '10' },
];

export const TRANSITION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  documents_pending: 'Await documents',
  under_review: 'Start review',
  needs_changes: 'Request changes',
  ready_to_approve: 'Mark ready',
  approved: 'Approve schedule',
  rejected: 'Reject request',
  completed: 'Mark completed',
  cancelled: 'Cancel request',
  no_show: 'Mark no-show',
};

export const REASON_REQUIRED = new Set<AppointmentStatus>(['needs_changes', 'rejected', 'cancelled']);

export const QUEUE_PURPOSES = [
  'Baptism inquiry',
  'Wedding inquiry',
  'Document submission',
  'Certificate request',
  'General inquiry',
] as const;

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(utcTimestamp(value)));
}

export function tone(status: string): string {
  if (
    [
      'approved',
      'completed',
      'verified',
      'ready_to_approve',
      'serving',
      'verified_against_archive',
      'success',
      'active',
    ].includes(status)
  ) {
    return 'ready';
  }
  if (
    [
      'rejected',
      'cancelled',
      'needs_changes',
      'needs_replacement',
      'no_show',
      'denied',
      'inactive',
      'paused',
    ].includes(status)
  ) {
    return 'danger';
  }
  if (['under_review', 'submitted'].includes(status)) return 'review';
  return 'pending';
}

export function roleLabel(role: DashboardState['actor']['role']): string {
  return role === 'system_admin' ? 'System administrator' : humanizeStatus(role);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function StatusPill({ value }: { value: string }) {
  return <span className={`status ${tone(value)}`}>{humanizeStatus(value)}</span>;
}

export function AppointmentTable({
  items,
  selectedId,
  onReview,
}: {
  items: Appointment[];
  selectedId: string | null;
  onReview: (appointmentId: string) => void;
}) {
  if (!items.length) {
    return (
      <div className="empty-state">
        <strong>No matching appointments</strong>
        <span>Adjust the filters or wait for a new request.</span>
      </div>
    );
  }
  return (
    <div className="table-wrap" tabIndex={0} aria-label="Scrollable appointment table">
      <table>
        <caption className="sr-only">Sacramental appointment requests</caption>
        <thead>
          <tr>
            <th scope="col">Parishioner</th>
            <th scope="col">Service</th>
            <th scope="col">Schedule</th>
            <th scope="col">Documents</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className={selectedId === item.id ? 'selected-row' : undefined}>
              <td>
                <strong>{item.parishioner}</strong>
                <small>
                  {item.reference} · {item.parish}
                </small>
              </td>
              <td>
                {item.service}
                <small>{item.clergy}</small>
              </td>
              <td>
                {formatDateTime(item.startsAt)}
                <small>{item.venue}</small>
              </td>
              <td>
                {item.verifiedDocuments} of {item.requiredDocuments} verified
              </td>
              <td>
                <StatusPill value={item.status} />
                {item.conflict && <small className="conflict-text">Schedule conflict</small>}
              </td>
              <td>
                <button className="row-action" onClick={() => onReview(item.id)}>
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

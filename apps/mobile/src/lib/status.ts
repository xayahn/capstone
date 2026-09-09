import type {
  Appointment,
  AppointmentStatus,
  DocumentStatus,
} from '../types/domain';

export type StatusTone = 'neutral' | 'warning' | 'positive' | 'critical' | 'info';

export const appointmentStatusLabel: Record<AppointmentStatus, string> = {
  submitted: 'Submitted',
  pending_verification: 'Pending verification',
  needs_action: 'Needs action',
  approved: 'Approved',
  scheduled: 'Scheduled',
  completed: 'Completed',
  rejected: 'Not approved',
  cancelled: 'Cancelled',
};

export const appointmentStatusTone: Record<AppointmentStatus, StatusTone> = {
  submitted: 'info',
  pending_verification: 'warning',
  needs_action: 'critical',
  approved: 'positive',
  scheduled: 'positive',
  completed: 'neutral',
  rejected: 'critical',
  cancelled: 'neutral',
};

export const documentStatusLabel: Record<DocumentStatus, string> = {
  missing: 'Not uploaded',
  selected: 'Selected on this device',
  submitted: 'Submitted for staff review',
  under_review: 'Under staff review',
  verified: 'Verified by parish staff',
  needs_action: 'Needs a new file',
  not_required: 'Not required',
};

export const documentStatusTone: Record<DocumentStatus, StatusTone> = {
  missing: 'neutral',
  selected: 'info',
  submitted: 'warning',
  under_review: 'warning',
  verified: 'positive',
  needs_action: 'critical',
  not_required: 'neutral',
};

export interface TimelineItem {
  key: string;
  label: string;
  description: string;
  state: 'complete' | 'current' | 'upcoming' | 'stopped';
}

const NORMAL_FLOW: Array<{
  status: AppointmentStatus;
  label: string;
  description: string;
}> = [
  {
    status: 'submitted',
    label: 'Request submitted',
    description: 'ParishLink safely recorded your appointment request.',
  },
  {
    status: 'pending_verification',
    label: 'Staff verification',
    description: 'Parish staff review the schedule and documentary requirements.',
  },
  {
    status: 'approved',
    label: 'Parish approval',
    description: 'Authorized parish personnel confirm the request.',
  },
  {
    status: 'scheduled',
    label: 'Ready for your visit',
    description: 'Your confirmed service date is on the parish calendar.',
  },
  {
    status: 'completed',
    label: 'Completed',
    description: 'The scheduled parish service has been completed.',
  },
];

const flowIndex = (status: AppointmentStatus) => {
  if (status === 'needs_action') return 1;
  return NORMAL_FLOW.findIndex((item) => item.status === status);
};

export const getAppointmentTimeline = (
  status: AppointmentStatus,
): TimelineItem[] => {
  if (status === 'rejected' || status === 'cancelled') {
    return [
      { ...NORMAL_FLOW[0]!, key: 'submitted', state: 'complete' },
      {
        key: status,
        label: status === 'rejected' ? 'Request not approved' : 'Request cancelled',
        description:
          status === 'rejected'
            ? 'Contact the parish office if you need clarification or want to submit a new request.'
            : 'This request is no longer holding a parish schedule.',
        state: 'stopped',
      },
    ];
  }

  const currentIndex = Math.max(0, flowIndex(status));
  return NORMAL_FLOW.map((item, index) => ({
    key: item.status,
    label: item.label,
    description:
      status === 'needs_action' && index === 1
        ? 'Parish staff need an updated document or additional information.'
        : item.description,
    state:
      index < currentIndex
        ? 'complete'
        : index === currentIndex
          ? 'current'
          : 'upcoming',
  }));
};

export const summarizeDocuments = (documents: Appointment['documents']) => {
  const submittedStatuses = new Set<DocumentStatus>([
    'submitted',
    'under_review',
    'verified',
  ]);
  const submitted = documents.filter((document) =>
    submittedStatuses.has(document.status),
  ).length;
  const verified = documents.filter(
    (document) => document.status === 'verified',
  ).length;

  const required = documents.filter((document) => document.required);
  const requiredReady = required.filter((document) =>
    submittedStatuses.has(document.status),
  ).length;

  return {
    submitted,
    verified,
    total: documents.length,
    requiredReady,
    requiredTotal: required.length,
  };
};

export const statusAfterUserFileSelection = (
  hasBeenSubmitted: boolean,
): DocumentStatus => (hasBeenSubmitted ? 'submitted' : 'selected');

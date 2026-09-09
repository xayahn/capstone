import { SACRAMENT_SERVICES, getParish, getService } from '../data/catalog';
import type { AssistantAction, AssistantMessage, RepositorySnapshot, SacramentId } from '../types/domain';

export const ASSISTANT_DISCLAIMER =
  'ParishLink provides general parish guidance only. Parish staff make all official decisions and sacramental determinations.';

const escalationPatterns = [
  /emergency|danger|suicid|self[- ]?harm|abuse/i,
  /legal advice|court|lawsuit/i,
  /financial advice|loan|investment/i,
  /confession|absolution|spiritual crisis/i,
];

const decisionPatterns = [
  /approve|approved|guarantee|eligible|valid marriage|annulment/i,
  /can i receive|am i allowed|canonical decision/i,
];

const terminalAppointmentStatuses = new Set(['completed', 'cancelled', 'rejected']);
const terminalQueueStatuses = new Set(['completed', 'cancelled']);

export interface GuidanceReply {
  text: string;
  escalation: boolean;
  title?: string;
  bullets?: string[];
  sources?: NonNullable<AssistantMessage['sources']>;
  actions?: AssistantAction[];
  followUpPrompts?: string[];
  clarification?: NonNullable<AssistantMessage['clarification']>;
}

const SERVICE_TERMS: Record<SacramentId, RegExp> = {
  baptism: /baptis|binyag/i,
  wedding: /wedding|marriage|kasal/i,
  confirmation: /confirmation|kumpil/i,
  first_communion: /first communion|communion|komunyon/i,
  funeral: /funeral|burial|libing/i,
};

const detectService = (prompt: string): SacramentId | undefined => (
  (Object.entries(SERVICE_TERMS) as Array<[SacramentId, RegExp]>)
    .find(([, pattern]) => pattern.test(prompt))?.[0]
);

const serviceActions = (serviceId: SacramentId): AssistantAction[] => [
  { id: `view-${serviceId}`, label: 'View service details', kind: 'service', serviceId },
  { id: `book-${serviceId}`, label: 'Start a request', kind: 'service', serviceId },
];

export const getDemoGuidance = (prompt: string, snapshot?: RepositorySnapshot): GuidanceReply => {
  const question = prompt.trim();
  if (!question) {
    return {
      text: 'Please enter a question about requirements, appointments, parish schedules, or the walk-in queue.',
      escalation: false,
    };
  }

  if (escalationPatterns.some((pattern) => pattern.test(question))) {
    return {
      text: 'This needs personal help beyond an automated guide. Please contact your parish office or an appropriate local professional. If anyone is in immediate danger, contact local emergency services now.',
      escalation: true,
    };
  }

  if (decisionPatterns.some((pattern) => pattern.test(question))) {
    return {
      text: 'Only authorized parish personnel can make that determination. You can submit the available information in ParishLink, then contact the selected parish office for an official answer.',
      escalation: true,
    };
  }

  const serviceId = detectService(question);
  const service = serviceId ? getService(serviceId) : undefined;

  if (/status|pending|track|next step|my appointment|my request/i.test(question)) {
    const appointment = snapshot?.appointments.find((item) => (
      item.parishionerId === snapshot.profile.id
      && !terminalAppointmentStatuses.has(item.status)
      && (!serviceId || item.serviceId === serviceId)
    ));
    if (!appointment) {
      return {
        title: service ? `No active ${service.name} request found` : 'No active request found',
        text: service
          ? `You do not currently have an active ${service.name} request. You can review the service details or begin a new request.`
          : 'You do not currently have an active appointment request. Choose a service when you are ready to begin.',
        escalation: false,
        actions: service ? serviceActions(service.id) : [{ id: 'browse-services', label: 'Explore services', kind: 'service' }],
        followUpPrompts: ['What documents are needed for Baptism?', 'How do I start a request?'],
      };
    }
    const activeService = getService(appointment.serviceId);
    const needsAction = appointment.documents.filter((item) => item.status === 'missing' || item.status === 'needs_action');
    return {
      title: `${activeService?.name ?? 'Appointment'} · ${appointment.reference}`,
      text: needsAction.length
        ? `Your request needs attention before parish staff can complete their review.`
        : 'Your request is recorded and waiting for the next parish review step.',
      escalation: false,
      bullets: needsAction.length
        ? needsAction.map((item) => `${item.label}: ${item.note ?? 'Action required'}`)
        : [`Current status: ${appointment.status.replaceAll('_', ' ')}`, `Scheduled request: ${appointment.date} at ${appointment.time}`],
      sources: [{ label: `Your appointment ${appointment.reference}`, kind: 'appointment', updatedAt: appointment.updatedAt }],
      actions: [{ id: 'open-appointment', label: 'View appointment', kind: 'appointment', appointmentId: appointment.id }],
      followUpPrompts: [`Why is my ${activeService?.name ?? 'appointment'} still pending?`, 'How does document verification work?'],
    };
  }

  if (/queue|walk.?in|ticket|wait/i.test(question)) {
    const ticket = snapshot?.activeQueueTicket;
    if (ticket && !terminalQueueStatuses.has(ticket.status)) {
      const statusText = ticket.status === 'called'
        ? 'Parish staff have called your ticket. Please follow the office instructions and proceed to the assigned counter.'
        : ticket.status === 'serving'
          ? 'Parish staff are currently serving your ticket.'
          : `Your ticket is active at ${getParish(ticket.parishId)?.name ?? 'your selected parish'}. Wait estimates can change as staff serve visitors.`;
      const queueDetails = ticket.status === 'waiting'
        ? [`${ticket.ahead} people ahead`, `About ${ticket.estimatedWaitMinutes} minutes estimated`]
        : [`Current status: ${ticket.status}`];
      return {
        title: `Queue ticket ${ticket.number}`,
        text: statusText,
        escalation: false,
        bullets: [...queueDetails, `Purpose: ${ticket.service}`],
        sources: [{ label: 'Your current walk-in ticket', kind: 'queue', updatedAt: ticket.lastUpdatedAt }],
        actions: [{ id: 'open-queue', label: 'Open queue ticket', kind: 'queue' }],
        followUpPrompts: ['What should I bring to the parish office?', 'Can I leave the queue?'],
      };
    }
    return {
      title: 'Walk-in queue',
      text: 'Choose a parish office and purpose, then request one active ticket. The estimate updates as parish staff serve visitors.',
      escalation: false,
      actions: [{ id: 'open-queue', label: 'Open walk-in queue', kind: 'queue' }],
      followUpPrompts: ['How is the wait estimated?', 'What can I ask at the parish office?'],
    };
  }

  if (/document|requirement|certificate|upload|need to bring/i.test(question) && service) {
    return {
      title: `${service.name} document checklist`,
      text: `Here is the current ParishLink checklist for ${service.name}. Requirements can vary by parish, and authorized parish staff must verify every submission.`,
      bullets: service.requirements,
      escalation: false,
      sources: [{ label: `Current ${service.name} requirements`, kind: 'service_requirements' }],
      actions: serviceActions(service.id),
      followUpPrompts: [`How do I book ${service.name}?`, 'How does document verification work?'],
    };
  }

  if (/document|requirement|certificate|upload|need to bring/i.test(question)) {
    return {
      title: 'Choose a sacramental service',
      text: 'Document requirements are different for each service. Select one below and I will show its current checklist.',
      escalation: false,
      clarification: {
        question: 'Which service are you preparing for?',
        options: SACRAMENT_SERVICES.map((item) => ({
          id: item.id,
          label: item.name,
          prompt: `What documents do I need for ${item.name}?`,
          serviceId: item.id,
        })),
      },
    };
  }

  if (/schedule|appointment|book|available|time/i.test(question)) {
    return {
      title: service ? `Request ${service.name}` : 'Request an appointment',
      text: 'Choose a service, parish, clergy member, venue, date, and available time. ParishLink checks the full service interval plus preparation buffers, but parish staff still confirm the request.',
      escalation: false,
      actions: service ? serviceActions(service.id) : [{ id: 'browse-services', label: 'Explore services', kind: 'service' }],
      followUpPrompts: ['Why can a time become unavailable?', 'What happens after I submit?'],
    };
  }

  if (service) {
    return {
      title: service.name,
      text: service.shortDescription,
      escalation: false,
      bullets: service.requirements.slice(0, 3),
      sources: [{ label: `Current ${service.name} information`, kind: 'service_requirements' }],
      actions: serviceActions(service.id),
      followUpPrompts: [`What documents do I need for ${service.name}?`, `How do I book ${service.name}?`],
    };
  }

  return {
    title: 'What would you like to prepare?',
    text: 'I can use current ParishLink information to explain service requirements, booking, your request status, and the walk-in queue. Choose a topic or ask a more specific question.',
    escalation: false,
    followUpPrompts: ['What documents do I need?', 'What is my next appointment step?', 'How does the walk-in queue work?'],
  };
};

export const newAssistantMessage = (
  from: AssistantMessage['from'],
  text: string,
  escalation = false,
): AssistantMessage => ({
  id: `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  from,
  text,
  createdAt: new Date().toISOString(),
  ...(escalation ? { escalation } : {}),
});

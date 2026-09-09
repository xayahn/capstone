import { describe, expect, it } from 'vitest';
import { getDemoGuidance } from '../src/lib/assistant';
import type { Appointment, RepositorySnapshot } from '../src/types/domain';

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: 'appointment-own',
  reference: 'PL-OWN-1001',
  parishionerId: 'actor-1',
  serviceId: 'baptism',
  parishId: 'metropolitan-cathedral',
  clergyId: 'clergy-1',
  venueId: 'venue-1',
  date: '2026-09-10',
  time: '9:30 AM',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  status: 'pending_verification',
  documents: [],
  submittedAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  ...overrides,
});

const snapshot = (overrides: Partial<RepositorySnapshot> = {}): RepositorySnapshot => ({
  source: 'demo',
  profile: {
    id: 'actor-1',
    displayName: 'Maria Santos',
    email: 'maria@example.test',
    mobileNumber: '+63 917 555 0100',
    homeParishId: 'metropolitan-cathedral',
    notificationsEnabled: true,
  },
  appointments: [],
  notifications: [],
  ...overrides,
});

describe('bounded parish guidance', () => {
  it('asks which service before giving a generic document checklist', () => {
    const reply = getDemoGuidance('What document should I upload?');
    expect(reply.text).toContain('different for each service');
    expect(reply.clarification?.options).toHaveLength(5);
    expect(reply.escalation).toBe(false);
  });

  it('returns the current service checklist with traceable actions', () => {
    const reply = getDemoGuidance('What documents do I need for Baptism?');
    expect(reply.title).toBe('Baptism document checklist');
    expect(reply.bullets?.length).toBeGreaterThan(2);
    expect(reply.sources?.[0]?.kind).toBe('service_requirements');
    expect(reply.actions?.some((action) => action.id === 'book-baptism')).toBe(true);
    expect(reply.text).toContain('parish staff must verify');
  });

  it('uses only the signed-in actor appointment from an over-broad snapshot', () => {
    const reply = getDemoGuidance('What is my request status?', snapshot({
      appointments: [
        appointment({ id: 'foreign', reference: 'PL-FOREIGN-9999', parishionerId: 'someone-else' }),
        appointment(),
      ],
    }));

    expect(reply.title).toContain('PL-OWN-1001');
    expect(reply.title).not.toContain('PL-FOREIGN-9999');
    expect(reply.actions?.[0]).toMatchObject({ kind: 'appointment', appointmentId: 'appointment-own' });
  });

  it('uses the active actor queue ticket and ignores a terminal ticket', () => {
    const active = getDemoGuidance('How long is my queue wait?', snapshot({
      activeQueueTicket: {
        id: 'ticket-1',
        number: 'A-014',
        parishId: 'metropolitan-cathedral',
        service: 'Document submission',
        status: 'waiting',
        ahead: 2,
        estimatedWaitMinutes: 16,
        issuedAt: '2026-08-21T00:00:00.000Z',
        lastUpdatedAt: '2026-08-21T00:05:00.000Z',
      },
    }));
    expect(active.title).toBe('Queue ticket A-014');
    expect(active.bullets).toContain('2 people ahead');
    expect(active.sources?.[0]).toMatchObject({ kind: 'queue', updatedAt: '2026-08-21T00:05:00.000Z' });

    const terminal = getDemoGuidance('Show my queue ticket', snapshot({
      activeQueueTicket: {
        id: 'ticket-old',
        number: 'A-001',
        parishId: 'metropolitan-cathedral',
        service: 'General inquiry',
        status: 'completed',
        ahead: 0,
        estimatedWaitMinutes: 0,
        issuedAt: '2026-08-20T00:00:00.000Z',
        lastUpdatedAt: '2026-08-20T00:10:00.000Z',
      },
    }));
    expect(terminal.title).toBe('Walk-in queue');
  });

  it('hands official determinations to authorized parish personnel', () => {
    const reply = getDemoGuidance('Can you guarantee that my wedding is approved?');
    expect(reply.text).toContain('Only authorized parish personnel');
    expect(reply.escalation).toBe(true);
  });

  it('escalates emergencies instead of attempting pastoral counseling', () => {
    const reply = getDemoGuidance('I am in immediate danger');
    expect(reply.text).toContain('emergency services');
    expect(reply.escalation).toBe(true);
  });
});

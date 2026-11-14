import { describe, expect, it } from 'vitest';
import {
  getAppointmentTimeline,
  isQueueTicketAtCounter,
  queueStatusLabel,
  queueStatusTone,
  statusAfterUserFileSelection,
  summarizeDocuments,
} from '../src/lib/status';

describe('appointment status helpers', () => {
  it('shows an approved request after completed verification stages', () => {
    const timeline = getAppointmentTimeline('approved');
    expect(timeline.map((item) => item.state)).toEqual([
      'complete',
      'complete',
      'current',
      'upcoming',
      'upcoming',
    ]);
  });

  it('stops the normal flow for rejected requests', () => {
    const timeline = getAppointmentTimeline('rejected');
    expect(timeline).toHaveLength(2);
    expect(timeline[1]?.state).toBe('stopped');
  });

  it('never marks a parishioner-selected file as verified', () => {
    expect(statusAfterUserFileSelection(false)).toBe('selected');
    expect(statusAfterUserFileSelection(true)).toBe('submitted');
  });

  it('reports submitted and staff-verified document counts separately', () => {
    const summary = summarizeDocuments([
      { id: '1', label: 'One', required: true, status: 'submitted' },
      { id: '2', label: 'Two', required: true, status: 'verified' },
      { id: '3', label: 'Three', required: true, status: 'missing' },
    ]);
    expect(summary).toEqual({
      submitted: 2,
      verified: 1,
      total: 3,
      requiredReady: 2,
      requiredTotal: 3,
    });
  });

  it('maps walk-in queue ticket statuses to clear counter labels and positive tones', () => {
    expect(isQueueTicketAtCounter('waiting')).toBe(false);
    expect(queueStatusTone.waiting).toBe('warning');
    expect(queueStatusLabel.waiting).toBe('Waiting in line');

    expect(isQueueTicketAtCounter('called')).toBe(true);
    expect(queueStatusTone.called).toBe('positive');
    expect(queueStatusLabel.called).toContain('Window');

    expect(isQueueTicketAtCounter('serving')).toBe(true);
    expect(queueStatusTone.serving).toBe('positive');
    expect(queueStatusLabel.serving).toContain('Counter');
  });
});

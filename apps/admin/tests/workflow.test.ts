import { describe, expect, it } from 'vitest';
import {
  allowedAppointmentTransitions,
  intervalsOverlap,
  isBlockingAppointmentStatus,
} from '../shared/workflow';

describe('appointment workflow authorization', () => {
  it('keeps final approval with clergy, not technical administrators', () => {
    expect(allowedAppointmentTransitions('ready_to_approve', 'parish_staff')).not.toContain('approved');
    expect(allowedAppointmentTransitions('ready_to_approve', 'clergy')).toContain('approved');
    expect(allowedAppointmentTransitions('ready_to_approve', 'system_admin')).not.toContain('approved');
  });

  it('does not allow transitions from terminal states', () => {
    expect(allowedAppointmentTransitions('completed', 'system_admin')).toEqual([]);
    expect(isBlockingAppointmentStatus('completed')).toBe(false);
    expect(isBlockingAppointmentStatus('under_review')).toBe(true);
  });
});

describe('schedule conflict boundaries', () => {
  const start = '2026-09-18T09:30:00+08:00';
  const end = '2026-09-18T10:30:00+08:00';

  it('detects a real overlap', () => {
    expect(intervalsOverlap(start, end, '2026-09-18T10:00:00+08:00', '2026-09-18T11:00:00+08:00')).toBe(true);
  });

  it('allows adjacent appointments and rejects invalid timestamps', () => {
    expect(intervalsOverlap(start, end, end, '2026-09-18T11:30:00+08:00')).toBe(false);
    expect(intervalsOverlap('invalid', end, start, end)).toBe(false);
  });
});

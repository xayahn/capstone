import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPortal } from '../frontend/components/admin-portal';
import { DEMO_STATE } from '../backend/demo/demo-state';
import type { ChangeRequest, DashboardState } from '../shared/domain';

let renderer: ReactTestRenderer | undefined;
let state: DashboardState;
let postedMutations: Record<string, unknown>[];

const json = (value: unknown, status = 200) => Response.json(value, { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal('document', { visibilityState: 'visible', getElementById: () => ({ focus() {} }) });
  const retryStore = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => retryStore.get(key) ?? null,
    setItem: (key: string, value: string) => { retryStore.set(key, value); },
    removeItem: (key: string) => { retryStore.delete(key); },
  });

  postedMutations = [];
  state = structuredClone(DEMO_STATE);
  state.actor = {
    id: 'user-staff-sanguillermo',
    name: 'Jose Bautista',
    email: 'staff.sanguillermo@parishlink.test',
    role: 'parish_staff',
    parishId: 'san-guillermo',
    parishName: 'San Guillermo Parish',
    clergyProfileId: null,
  };
  const rescheduleRequest: ChangeRequest = {
    id: 'chg-reschedule-1',
    appointmentId: 'appt-1002',
    reference: 'PL-2026-1002',
    parishioner: 'Ronald Dizon',
    service: 'Baptism',
    parishId: 'san-guillermo',
    parish: 'San Guillermo Parish',
    clergy: 'Fr. A. Manalo',
    venue: 'Baptistry',
    kind: 'reschedule',
    status: 'pending',
    appointmentStatus: 'approved',
    currentStartsAt: '2026-09-21T08:00:00+08:00',
    proposedStartsAt: '2026-09-28T09:30:00+08:00',
    proposedEndsAt: '2026-09-28T10:30:00+08:00',
    reason: 'Sponsor arriving from abroad on the following week.',
    decisionNote: null,
    decidedBy: null,
    createdAt: '2026-08-26T11:20:00+08:00',
    decidedAt: null,
    canDecide: true,
    proposedSlotAvailable: true,
  };
  const cancelRequest: ChangeRequest = {
    id: 'chg-cancel-2',
    appointmentId: 'appt-1003',
    reference: 'PL-2026-1003',
    parishioner: 'Angela Reyes',
    service: 'Confirmation',
    parishId: 'sta-lucia',
    parish: 'Sta. Lucia Parish',
    clergy: 'Fr. M. Pineda',
    venue: 'Main church',
    kind: 'cancel',
    status: 'pending',
    appointmentStatus: 'approved',
    currentStartsAt: '2026-09-24T13:30:00+08:00',
    proposedStartsAt: null,
    proposedEndsAt: null,
    reason: 'Family moved confirmation to home diocese.',
    decisionNote: null,
    decidedBy: null,
    createdAt: '2026-08-26T10:00:00+08:00',
    decidedAt: null,
    canDecide: false,
    proposedSlotAvailable: null,
  };
  state.changeRequests = [rescheduleRequest, cancelRequest];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/admin/state' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        postedMutations.push(body);
        if (body.action === 'change_request.decide') {
          state.changeRequests = state.changeRequests.map((item) =>
            item.id === body.requestId
              ? {
                  ...item,
                  status: body.decision === 'approve' ? 'approved' : 'rejected',
                  decisionNote: typeof body.note === 'string' ? body.note : null,
                  decidedBy: state.actor.name,
                  decidedAt: '2026-08-26T14:30:00+08:00',
                  canDecide: false,
                }
              : item,
          );
        }
        return json({ ok: true });
      }
      if (path === '/api/admin/state') return json(state);
      throw new Error(`Unexpected test request: ${path}`);
    }),
  );
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const view = () => JSON.stringify(renderer?.toJSON());

async function mount() {
  await act(async () => {
    renderer = create(createElement(AdminPortal, { signedInName: 'Jose Bautista', signOutPath: '/signout' }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function click(text: string) {
  const button = renderer!.root.findAllByType('button').find((node) => node.children.includes(text));
  expect(button, `Missing button: ${text}`).toBeDefined();
  await act(async () => {
    button!.props.onClick();
  });
}

describe('AdminPortal change-requests queue', () => {
  it('displays pending badge on Appointments nav, priest re-confirmation notice, and dispatches approve mutation', async () => {
    await mount();
    const badge = renderer!.root.findByProps({ className: 'nav-badge' });
    expect(badge.children).toEqual(['2']);

    await click('Appointments');
    await click('Change requests');
    expect(view()).toContain('Sponsor arriving from abroad on the following week.');
    expect(view()).toContain('Priest re-confirmation required');
    expect(view()).toContain('Slot open');

    await click('Approve reschedule');
    expect(postedMutations).toEqual([
      {
        action: 'change_request.decide',
        requestId: 'chg-reschedule-1',
        decision: 'approve',
      },
    ]);
    expect(view()).toContain('Reschedule request approved.');
  });

  it('requires a >=4-char decision note before declining and enforces read-only when canDecide is false', async () => {
    await mount();
    await click('Appointments');
    await click('Change requests');

    const declineBtn = () => renderer!.root.findAllByType('button').find((node) => node.children.includes('Decline request'))!;
    expect(declineBtn().props.disabled).toBe(true);

    const noteBox = renderer!.root.findByType('textarea');
    await act(async () => {
      noteBox.props.onChange({ target: { value: 'Baptistry renovation on Sept 28.' } });
    });
    expect(declineBtn().props.disabled).toBe(false);

    await click('Decline request');
    expect(postedMutations).toEqual([
      {
        action: 'change_request.decide',
        requestId: 'chg-reschedule-1',
        decision: 'reject',
        note: 'Baptistry renovation on Sept 28.',
      },
    ]);

    // Select the second pending request (canDecide: false)
    const reviewButtons = renderer!.root.findAllByType('button').filter((node) => node.children.includes('Review'));
    await act(async () => {
      reviewButtons[1]!.props.onClick();
    });
    expect(view()).toContain('Read-only access');
    expect(renderer!.root.findAllByType('button').some((node) => node.children.includes('Confirm cancellation'))).toBe(false);
  });

  it('disables Approve reschedule when proposedSlotAvailable is false', async () => {
    state.changeRequests[0]!.proposedSlotAvailable = false;
    await mount();
    await click('Appointments');
    await click('Change requests');

    expect(view()).toContain('Proposed slot unavailable');
    expect(view()).toContain('Slot conflict');
    const approveBtn = renderer!.root.findAllByType('button').find((node) => node.children.includes('Approve reschedule'))!;
    expect(approveBtn.props.disabled).toBe(true);
  });
});

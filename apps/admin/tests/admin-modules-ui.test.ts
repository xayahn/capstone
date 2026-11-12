import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPortal } from '../frontend/components/admin-portal';
import { DEMO_STATE } from '../backend/demo/demo-state';
import type { AdminReport, AuditLogPage, DashboardState } from '../shared/domain';

let renderer: ReactTestRenderer | undefined;
let state: DashboardState;
let postedMutations: Record<string, unknown>[];
let reportPayload: AdminReport;
let auditPayload: AuditLogPage;
let customResponder: ((path: string, init?: RequestInit) => Response | null) | null;

const json = (value: unknown, status = 200) => Response.json(value, { status });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    print: vi.fn(),
    confirm: vi.fn(() => true),
  });
  vi.stubGlobal('document', {
    visibilityState: 'visible',
    getElementById: () => ({ focus() {} }),
  });
  const retryStore = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => retryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      retryStore.set(key, value);
    },
    removeItem: (key: string) => {
      retryStore.delete(key);
    },
  });

  postedMutations = [];
  customResponder = null;
  state = structuredClone(DEMO_STATE);
  reportPayload = {
    filters: { parishId: null, serviceTypeId: null, status: 'all', from: null, to: null },
    scopeLabel: 'Vicariate-wide (all eight parishes)',
    generatedAt: '2026-08-26T14:10:00.000Z',
    totals: {
      appointments: 4,
      approved: 1,
      completed: 1,
      pending: 2,
      cancelledOrRejected: 0,
      noShow: 0,
      awaitingDocumentReview: null,
      verifiedDocuments: null,
      avgDocumentReviewHours: null,
      verifiedRecords: null,
      queueServed: 3,
      avgQueueWaitMinutes: 14.5,
    },
    byStatus: [
      { status: 'approved', count: 1 },
      { status: 'completed', count: 1 },
      { status: 'under_review', count: 2 },
    ],
    byService: [{ key: 'baptism', label: 'Baptism', total: 4, approvedOrCompleted: 2, pending: 2, closed: 0 }],
    byParish: [
      {
        key: 'san-guillermo',
        label: 'San Guillermo Parish',
        total: 4,
        approvedOrCompleted: 2,
        pending: 2,
        closed: 0,
      },
    ],
    byMonth: [{ month: '2026-09', total: 4, completed: 1, approved: 1 }],
    appointments: [],
    appointmentsTruncated: false,
  };
  auditPayload = {
    entries: [
      {
        id: 'audit-1',
        action: 'parish.profile.update',
        entityType: 'parish',
        entityId: 'san-guillermo',
        parishId: 'san-guillermo',
        parish: 'San Guillermo Parish',
        actorName: 'Ana Fernandez',
        actorRole: 'system_admin',
        outcome: 'success',
        detail: 'San Guillermo Parish public directory updated',
        createdAt: '2026-08-26T14:05:00.000Z',
      },
    ],
    nextCursor: null,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init?: RequestInit) => {
      if (customResponder) {
        const override = customResponder(path, init);
        if (override) return override;
      }
      if (path === '/api/admin/state' && init?.method === 'POST') {
        postedMutations.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return json({ ok: true });
      }
      if (path === '/api/admin/state') return json(state);
      if (path === '/api/admin/reports') return json(reportPayload);
      if (path === '/api/admin/audit') return json(auditPayload);
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
    renderer = create(createElement(AdminPortal, { signedInName: 'Ana Fernandez', signOutPath: '/signout' }));
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

describe('AdminPortal 10-module navigation, Reports, Audit log, and Settings', () => {
  it('renders all 10 navigation items and opens Reports, Audit log, and Settings', async () => {
    await mount();
    const navLabels = [
      'Overview',
      'Appointments',
      'Document review',
      'Clergy schedule',
      'Parish records',
      'Walk-in queue',
      'Announcements',
      'Reports',
      'Audit log',
      'Settings',
    ];
    for (const label of navLabels) {
      expect(renderer!.root.findAllByType('button').some((node) => node.children.includes(label))).toBe(true);
    }

    await click('Reports');
    expect(view()).toContain('No validated evaluation results displayed');
    expect(view()).toContain('Avg wait 14.5 mins');

    await click('Audit log');
    expect(view()).toContain('parish.profile.update');
    expect(view()).toContain('San Guillermo Parish public directory updated');

    await click('Settings');
    expect(view()).toContain('Public parish directory');
    await click('Sacraments & requirements');
    expect(view()).toContain('Requirements for Baptism');
    await click('Parish venues');
    expect(view()).toContain('Active parish venues');
    await click('Internal access');
    expect(view()).toContain('Internal access register');
  });

  it('submits Settings mutations for system_admin and shows read-only gating for clergy', async () => {
    await mount();
    await click('Settings');
    const saveProfileForm = renderer!.root.findByType('form');
    await act(async () => {
      saveProfileForm.props.onSubmit({ preventDefault() {} });
    });
    expect(postedMutations[0]).toMatchObject({
      action: 'parish.profile.update',
      parishId: 'metropolitan-cathedral',
    });

    await click('Sacraments & requirements');
    const forms = renderer!.root.findAllByType('form');
    await act(async () => {
      forms[0]!.props.onSubmit({ preventDefault() {} });
    });
    expect(postedMutations[1]).toMatchObject({
      action: 'service.update',
      serviceTypeId: 'baptism',
      durationMinutes: 60,
    });

    // Switch actor to clergy and verify Audit log and Settings read-only boundaries
    state.actor = {
      id: 'user-clergy-dizon',
      name: 'Msgr. R. Dizon',
      email: 'dizon@example.test',
      role: 'clergy',
      parishId: 'metropolitan-cathedral',
      parishName: 'Metropolitan Cathedral of San Fernando',
      clergyProfileId: 'clergy-dizon',
    };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    await click('Audit log');
    expect(view()).toContain('Restricted audit access');

    await click('Settings');
    expect(view()).toContain('Read-only access');
    await click('Internal access');
    expect(view()).toContain('System administrator access required');
  });

  it.each([
    ['Reports', '/api/admin/reports', 401],
    ['Audit log', '/api/admin/audit', 403],
  ] as const)('clears private workspace when %s endpoint returns %s', async (moduleName, endpoint, status) => {
    await mount();
    customResponder = (path) => (path === endpoint ? new Response('Denied', { status }) : null);
    await click(moduleName);
    expect(view()).toContain('We could not open the portal');
    expect(view()).not.toContain('Ana Fernandez');
  });
});

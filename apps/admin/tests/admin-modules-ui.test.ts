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
        parishId: 'metropolitan-cathedral',
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

  it('filters past appointments out of Overview upcoming table, groups Document review, and operates Walk-in queue controls', async () => {
    state.actor = {
      id: 'user-staff-sanguillermo',
      name: 'San Guillermo Clerk',
      email: 'staff.sanguillermo@parishlink.test',
      role: 'parish_staff',
      parishId: 'san-guillermo',
      parishName: 'San Guillermo Parish',
      clergyProfileId: null,
    };
    state.appointments.push({
      ...state.appointments[0]!,
      id: 'appt-past',
      reference: 'PL-2026-PAST01',
      parishioner: 'Past Visitor',
      startsAt: '2026-08-01T09:00:00+08:00',
      endsAt: '2026-08-01T10:00:00+08:00',
      status: 'submitted',
    });
    await mount();
    expect(view()).toContain('Upcoming appointments');
    expect(view()).not.toContain('PL-2026-PAST01');

    await click('Document review');
    expect(view()).toContain('Review status');
    expect(view()).toContain('Checklist for');

    await click('Walk-in queue');
    expect(view()).toContain('Print slip');
    expect(view()).toContain('Book appointment for visitor');

    await click('Mark no-show');
    expect(postedMutations.at(-1)).toMatchObject({
      action: 'queue.cancel',
      status: 'no_show',
    });
  });
});

describe('Reports CSV export', () => {
  const row = (index: number) => ({
    id: `appt-${index}`,
    reference: `PL-2026-EXP${String(index).padStart(3, '0')}`,
    parishioner: 'Restricted parishioner',
    service: 'Baptism',
    parish: 'San Guillermo Parish',
    clergy: 'Fr. A. Manalo',
    venue: 'Main church',
    startsAt: '2026-09-10T01:30:00.000Z',
    status: 'submitted' as const,
    verifiedDocuments: 0,
    requiredDocuments: 2,
  });
  let reportBodies: Record<string, unknown>[];
  let saved: Blob[];

  beforeEach(() => {
    reportBodies = [];
    saved = [];
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      getElementById: () => ({ focus() {} }),
      createElement: () => ({ click: vi.fn(), remove: vi.fn(), href: '', download: '' }),
      body: { appendChild: vi.fn() },
    });
    vi.stubGlobal('URL', class extends URL {
      static override createObjectURL = vi.fn((blob: Blob) => { saved.push(blob); return 'blob:report'; });
      static override revokeObjectURL = vi.fn();
    });
    // The screen shows only the first rows; the full export must be requested separately.
    reportPayload = { ...reportPayload, totals: { ...reportPayload.totals, appointments: 3 }, appointments: [row(1)], appointmentsTruncated: true };
  });

  async function settle() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it('downloads every matching appointment from a separate full export, not the on-screen preview', async () => {
    customResponder = (path, init) => {
      if (path !== '/api/admin/reports') return null;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      reportBodies.push(body);
      return body.export === true
        ? json({ ...reportPayload, appointments: [row(1), row(2), row(3)], appointmentsTruncated: false })
        : json(reportPayload);
    };
    await mount();
    await click('Reports');
    expect(view()).toContain('First 1 of 3 rows');

    await click('Export CSV');
    await settle();
    expect(reportBodies.at(-1)).toEqual({ status: 'all', export: true });
    expect(saved).toHaveLength(1);
    const csv = await saved[0]!.text();
    expect(csv.match(/^PL-2026-EXP/gm)).toHaveLength(3);
    expect(csv).toContain('Appointments Matching Filters,3');
    expect(csv).toContain('Appointment Rows in This File,3');
  });

  it('shows the server message and saves nothing when the export is refused', async () => {
    customResponder = (path, init) => {
      if (path !== '/api/admin/reports') return null;
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return body.export === true
        ? json({ error: 'More than 5,000 appointments match these filters. Narrow the dates or filters, then export again.' }, 413)
        : json(reportPayload);
    };
    await mount();
    await click('Reports');
    await click('Export CSV');
    await settle();
    expect(view()).toContain('Narrow the dates or filters, then export again.');
    expect(saved).toHaveLength(0);
  });

  it('refuses to save a truncated export even if the server returned one', async () => {
    customResponder = (path) => (path === '/api/admin/reports' ? json(reportPayload) : null);
    await mount();
    await click('Reports');
    await click('Export CSV');
    await settle();
    expect(view()).toContain('only part of the matching appointments');
    expect(saved).toHaveLength(0);
  });
});

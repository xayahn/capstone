import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPortal } from '../frontend/components/admin-portal';
import { DEMO_STATE } from '../backend/demo/demo-state';
import type { DashboardState } from '../shared/domain';

let renderer: ReactTestRenderer | undefined;
let state: DashboardState;
let respond: (path: string) => Response | Promise<Response>;
const json = (value: unknown) => Response.json(value);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval, clearInterval });
  vi.stubGlobal('document', { visibilityState: 'visible', getElementById: () => ({ focus() {} }) });
  state = structuredClone(DEMO_STATE);
  state.actor = { ...state.actor, role: 'parish_staff', parishId: 'san-guillermo', name: 'PRIVATE ACTOR' };
  respond = path => {
    if (path === '/api/admin/state') return json(state);
    if (path === '/api/admin/records') return json({ records: state.records, nextCursor: null });
    if (path === '/api/admin/assignments') return json({ assignments: state.clergyAssignments, nextCursor: null });
    throw new Error('Unexpected test request');
  };
  vi.stubGlobal('fetch', vi.fn((path: string) => Promise.resolve(respond(path))));
});

afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => { renderer = create(createElement(AdminPortal, { signedInName: 'Test staff', signOutPath: '/signout' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(view()).toContain('PRIVATE ACTOR');
}

const view = () => JSON.stringify(renderer?.toJSON());
async function click(text: string) {
  const button = renderer!.root.findAllByType('button').find(node => node.children.includes(text));
  expect(button, 'Missing button: ' + text).toBeDefined();
  await act(async () => { button!.props.onClick(); });
}
async function privateDraft() {
  await click('Announcements');
  await act(async () => { renderer!.root.findByType('textarea').props.onChange({ target: { value: 'PRIVATE DRAFT' } }); });
}

describe('admin private-screen session boundaries', () => {
  it.each([
    ['Parish records', '/api/admin/records', 401],
    ['Parish records', '/api/admin/records', 403],
    ['Clergy schedule', '/api/admin/assignments', 401],
    ['Clergy schedule', '/api/admin/assignments', 403],
  ] as const)('clears the workspace and drafts after %s returns %s denial %s', async (module, endpoint, status) => {
    await mount();
    await privateDraft();
    const healthy = respond;
    respond = path => path === endpoint ? new Response('Access denied', { status, headers: { 'Content-Type': 'text/html' } }) : healthy(path);
    await click(module);
    expect(view()).toContain('We could not open the portal');
    expect(view()).not.toContain('PRIVATE ACTOR');
    expect(renderer!.root.findAllByType('nav')).toHaveLength(0);
    expect(renderer!.root.findByProps({ href: '/signout' }).children).toContain('Sign in again');
    respond = healthy;
    await click('Try again');
    await click('Announcements');
    expect(renderer!.root.findByType('textarea').props.value).toBe('');
  });

  it('cannot restore private data when an older dashboard refresh completes after list access is denied', async () => {
    await mount();
    let complete!: (response: Response) => void;
    const delayed = new Promise<Response>(resolve => { complete = resolve; });
    respond = path => path === '/api/admin/state' ? delayed : new Response(null, { status: 401 });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await click('Parish records');
    expect(view()).not.toContain('PRIVATE ACTOR');
    await act(async () => { complete(json(state)); });
    expect(view()).toContain('We could not open the portal');
    expect(view()).not.toContain('PRIVATE ACTOR');
  });

  it('preserves a draft during an ordinary server failure but clears it when scope changes', async () => {
    await mount();
    await privateDraft();
    respond = () => Response.json({ error: 'Temporarily unavailable' }, { status: 503 });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(renderer!.root.findByType('textarea').props.value).toBe('PRIVATE DRAFT');
    state.actor.parishId = 'sta-lucia';
    respond = () => json(state);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(renderer!.root.findByType('textarea').props.value).toBe('');
  });

  it('resets private record search drafts on a same-account parish change', async () => {
    await mount();
    await click('Parish records');
    const search = () => renderer!.root.findByProps({ placeholder: 'Name, archive reference, or record type' });
    await act(async () => { search().props.onChange({ target: { value: 'PRIVATE SEARCH' } }); });
    state.actor.parishId = 'sta-lucia';
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(search().props.value).toBe('');
  });
});

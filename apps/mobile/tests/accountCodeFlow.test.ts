import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileApiError } from '../src/api/mobileApiClient';
import { useAccountCodeFlow } from '../src/hooks/useAccountCodeFlow';
import { normalizeAccountCode, passwordResetInput, validAccountCode } from '../src/lib/accountCodes';

const password = 'SyntheticNewPassword7';
let renderer: ReactTestRenderer | undefined, flow: ReturnType<typeof useAccountCodeFlow>;
const operations = { request: vi.fn<(email: string, signal: AbortSignal) => Promise<void>>(),
  confirm: vi.fn<(input: Parameters<typeof passwordResetInput>[0], signal: AbortSignal) => Promise<void>>() };
function Harness({ kind = 'reset', email = 'user@example.test' }: { kind?: 'reset' | 'verification'; email?: string }) {
  flow = useAccountCodeFlow(kind, email, operations); return null;
}
async function mount(kind: 'reset' | 'verification' = 'reset', email = 'user@example.test') {
  await act(async () => { renderer = create(React.createElement(Harness, { kind, email })); });
}
async function enterCode() {
  await act(async () => {
    flow.setField('code', ' abcd-efgh-jk23 ');
    flow.setField('newPassword', password); flow.setField('confirmPassword', password);
  });
}
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  operations.request.mockReset().mockResolvedValue(undefined); operations.confirm.mockReset().mockResolvedValue(undefined);
});
afterEach(async () => {
  if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; vi.useRealTimers();
});
describe('account code input boundaries', () => {
  it('accepts formatted unambiguous codes and canonicalizes only account fields', () => {
    expect(normalizeAccountCode(' abcd-efgh-jk23 ')).toBe('ABCDEFGHJK23');
    expect(validAccountCode('abcd efgh jk23')).toBe(true);
    expect(passwordResetInput({ email: ' USER@EXAMPLE.TEST ', code: 'abcd-efgh-jk23', newPassword: password, confirmPassword: password, phase: 'confirm' } as Parameters<typeof passwordResetInput>[0]))
      .toEqual({ email: 'user@example.test', code: 'ABCDEFGHJK23', newPassword: password, confirmPassword: password });
  });
  it.each(['ABCDEFGHJK2', 'ABCDEFGHJK234', 'ABCD-EFGH-I023', 'ABCD-EFGH-O123', '<script>'])('rejects invalid or ambiguous code %s', code => {
    expect(validAccountCode(code)).toBe(false);
  });
});
describe('account email/code lifecycle', () => {
  it('does not request delivery for an invalid email', async () => {
    await mount('reset', 'invalid');
    await act(async () => { await flow.request(); });
    expect(operations.request).not.toHaveBeenCalled();
    expect(flow.state.phase).toBe('request'); expect(flow.state.error).toContain('valid email');
  });
  it('moves only to code entry after an accepted request, not to reset success', async () => {
    await mount('reset', ' USER@EXAMPLE.TEST ');
    await act(async () => { await flow.request(); });
    expect(operations.request).toHaveBeenCalledExactlyOnceWith('user@example.test', expect.any(AbortSignal));
    expect(flow.state.phase).toBe('confirm'); expect(operations.confirm).not.toHaveBeenCalled();
  });
  it('does not pretend a code was sent when delivery is unavailable', async () => {
    await mount(); operations.request.mockRejectedValueOnce(new MobileApiError('not configured', 503));
    await act(async () => { await flow.request(); });
    expect(flow.state.phase).toBe('request'); expect(flow.state.error).toContain('Email delivery is not configured');
    expect(flow.state.busy).toBe(false);
  });
  it('preserves the request step on offline failure without retrying silently', async () => {
    await mount(); operations.request.mockRejectedValueOnce(new TypeError('offline'));
    await act(async () => { await flow.request(); });
    expect(operations.request).toHaveBeenCalledTimes(1);
    expect(flow.state.phase).toBe('request'); expect(flow.state.error).toContain('No code delivery has been confirmed');
  });
  it('rejects an invalid code and mismatched passwords before sending', async () => {
    await mount(); await act(async () => { await flow.request(); });
    await act(async () => { flow.setField('code', 'invalid'); });
    await act(async () => { await flow.confirm(); });
    expect(operations.confirm).not.toHaveBeenCalled();
    await enterCode();
    await act(async () => { flow.setField('confirmPassword', 'DifferentPassword7'); });
    await act(async () => { await flow.confirm(); });
    expect(operations.confirm).not.toHaveBeenCalled();
    expect(flow.state.error).toContain('do not match');
  });
  it('confirms reset once, clears all credentials and does not call any signin operation', async () => {
    await mount(); await act(async () => { await flow.request(); }); await enterCode();
    await act(async () => { await flow.confirm(); });
    expect(operations.confirm).toHaveBeenCalledExactlyOnceWith({ email: 'user@example.test', code: 'ABCDEFGHJK23', newPassword: password, confirmPassword: password }, expect.any(AbortSignal));
    expect(flow.state).toMatchObject({ phase: 'success', email: '', code: '', newPassword: '', confirmPassword: '', busy: false });
  });
  it('aborts a slow request on close and ignores its late success', async () => {
    let release!: () => void;
    operations.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await mount();
    let pending!: Promise<void>;
    await act(async () => { pending = flow.request(); });
    const signal = operations.request.mock.calls[0]![1];
    await act(async () => { flow.reset(); });
    expect(signal.aborted).toBe(true);
    expect(flow.state).toMatchObject({ phase: 'request', email: '', code: '', newPassword: '', confirmPassword: '' });
    await act(async () => { release(); await pending; });
    expect(flow.state.phase).toBe('request');
  });
  it('does not submit twice when the request button is activated twice before render', async () => {
    let release!: () => void;
    operations.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    await mount(); let pending!: Promise<void>;
    await act(async () => { pending = flow.request(); void flow.request(); });
    expect(operations.request).toHaveBeenCalledOnce();
    await act(async () => { release(); await pending; });
  });
  it('invalidates a confirmation when the account email changes', async () => {
    let release!: () => void;
    await mount('verification'); await act(async () => { await flow.request(); }); await enterCode();
    operations.confirm.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    let pending!: Promise<void>;
    await act(async () => { pending = flow.confirm(); });
    await act(async () => renderer?.update(React.createElement(Harness, { kind: 'verification', email: 'other@example.test' })));
    await act(async () => { release(); await pending; });
    expect(flow.state).toMatchObject({ phase: 'request', email: 'other@example.test', code: '', newPassword: '' });
  });
  it('reports an uncertain reset result on a timeout and never automatically resubmits', async () => {
    vi.useFakeTimers();
    await mount(); await act(async () => { await flow.request(); }); await enterCode();
    operations.confirm.mockImplementationOnce(() => new Promise(() => undefined));
    let pending!: Promise<void>;
    await act(async () => { pending = flow.confirm(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(25_001); await pending; });
    expect(operations.confirm).toHaveBeenCalledOnce();
    expect(operations.confirm.mock.calls[0]![1].aborted).toBe(true);
    expect(flow.state.phase).toBe('confirm');
    expect(flow.state.error).toContain('Try signing in with your new password');
    expect(flow.state.newPassword).toBe(''); expect(flow.state.code).toBe('');
  });
});

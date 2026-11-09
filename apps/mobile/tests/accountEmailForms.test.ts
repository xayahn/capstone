import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileApiError } from '../src/api/mobileApiClient';
vi.mock('react-native', () => ({
  View: 'View', Text: 'Text', TextInput: 'TextInput',
  StyleSheet: { create: <T,>(styles: T) => styles },
  Platform: { select: (values: Record<string, unknown>) => values.default },
}));
vi.mock('../src/components/ui', async () => {
  const react = await import('react');
  return {
    AppButton: (props: Record<string, unknown>) => react.createElement('button', props, props.label as React.ReactNode),
    Card: (props: Record<string, unknown>) => react.createElement('card', props, props.children as React.ReactNode),
    Eyebrow: (props: Record<string, unknown>) => react.createElement('eyebrow', props, props.children as React.ReactNode),
    Notice: (props: Record<string, unknown>) => react.createElement('notice', props, props.body as React.ReactNode),
    StatusBadge: (props: Record<string, unknown>) => react.createElement('badge', props, props.label as React.ReactNode),
  };
});
import { EmailVerificationCard, PasswordRecoveryForm } from '../src/components/AccountEmailForms';

let renderer: ReactTestRenderer | undefined;
const button = (label: string) => renderer!.root.findAll(node => typeof node.type === 'string' && node.props.label === label)[0]!;
const input = (label: string) => renderer!.root.findByProps({ accessibilityLabel: label });
const hasBadge = (label: string) => renderer!.root.findAll(node => String(node.type) === 'badge' && node.props.label === label).length > 0;
const actions = { request: vi.fn(), confirm: vi.fn() }, close = vi.fn();
beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  actions.request.mockReset().mockResolvedValue(undefined); actions.confirm.mockReset().mockResolvedValue(undefined); close.mockReset();
});
afterEach(async () => { if (renderer) await act(async () => renderer?.unmount()); renderer = undefined; });
async function recovery() {
  await act(async () => { renderer = create(React.createElement(PasswordRecoveryForm, { initialEmail: 'user@example.test', actions, onClose: close })); });
}
async function press(label: string) { await act(async () => { button(label).props.onPress(); }); }

describe('account email forms', () => {
  it('returns to signin only after a confirmed reset and a deliberate return action', async () => {
    await recovery(); await press('Request reset code');
    await act(async () => {
      input('Password reset code').props.onChangeText('abcd-efgh-jk23');
      input('New recovery password').props.onChangeText('SyntheticPassword7');
      input('Confirm recovery password').props.onChangeText('SyntheticPassword7');
    });
    await press('Reset password');
    expect(actions.confirm).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(renderer!.root.findAll(node => typeof node.type === 'string' && node.props.title === 'Reset confirmed')).toHaveLength(1);
    expect(renderer!.root.findAll(node => typeof node.type === 'string' && node.props.secureTextEntry)).toHaveLength(0);
    await press('Return to sign in');
    expect(close).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('cancels a pending request and wipes the visible email before closing', async () => {
    let release!: () => void;
    actions.request.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    await recovery(); await press('Request reset code');
    const signal = actions.request.mock.calls[0]![1] as AbortSignal;
    await press('Cancel and return to sign in');
    expect(signal.aborted).toBe(true);
    expect(close).toHaveBeenCalledExactlyOnceWith(false);
    expect(input('Recovery email address').props.value).toBe('');
    await act(async () => release());
    expect(renderer!.root.findAll(node => typeof node.type === 'string' && node.props.title === 'Reset confirmed')).toHaveLength(0);
  });
  it('keeps the request form visible when mail delivery is unconfigured', async () => {
    actions.request.mockRejectedValueOnce(new MobileApiError('not configured', 503));
    await recovery(); await press('Request reset code');
    expect(input('Recovery email address')).toBeDefined();
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Password reset code' })).toHaveLength(0);
    expect(close).not.toHaveBeenCalled(); expect(actions.confirm).not.toHaveBeenCalled();
  });
  it('never displays a demo account as verified or offers a fake delivery action', async () => {
    await act(async () => { renderer = create(React.createElement(EmailVerificationCard, {
      email: 'demo@example.test', emailVerified: true, mode: 'demo', request: actions.request, confirm: actions.confirm,
    })); });
    expect(hasBadge('Verified')).toBe(false); expect(hasBadge('Not verified')).toBe(true);
    expect(renderer!.root.findAll(node => node.type === 'button')).toHaveLength(0);
    expect(actions.request).not.toHaveBeenCalled();
  });
  it('uses only the server-backed profile flag for the verified badge', async () => {
    const props = { email: 'user@example.test', emailVerified: false, mode: 'api' as const, request: actions.request, confirm: actions.confirm };
    await act(async () => { renderer = create(React.createElement(EmailVerificationCard, props)); });
    await press('Send verification code');
    await act(async () => input('Email verification code').props.onChangeText('ABCDEFGHJK23'));
    await press('Confirm email address');
    expect(hasBadge('Verified')).toBe(false);
    await act(async () => renderer!.update(React.createElement(EmailVerificationCard, { ...props, emailVerified: true })));
    expect(hasBadge('Verified')).toBe(true);
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Email verification code' })).toHaveLength(0);
  });
});

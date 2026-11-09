import { useCallback, useEffect, useRef, useState } from 'react';
import { MobileApiError, MobileApiTimeoutError } from '../api/mobileApiClient';
import { accountCode, accountEmail, passwordResetInput } from '../lib/accountCodes';
import type { PasswordResetInput } from '../types/domain';

type Fields = PasswordResetInput;
type Phase = 'request' | 'confirm' | 'success';
type FlowState = Fields & { phase: Phase; busy: boolean; error: string };
type Operations = {
  request: (email: string, signal: AbortSignal) => Promise<void>;
  confirm: (input: Fields, signal: AbortSignal) => Promise<void>;
};
const blank = (email = ''): FlowState => ({ email, code: '', newPassword: '', confirmPassword: '', phase: 'request', busy: false, error: '' });

function failureMessage(cause: unknown, confirming: boolean, kind: 'reset' | 'verification'): string {
  if (cause instanceof MobileApiError) {
    if (cause.status === 503) return 'Email delivery is not configured or is temporarily unavailable. Please try later or contact parish support.';
    if (cause.status === 429) return 'Too many attempts. Please wait before trying again.';
    if (cause.status >= 400 && cause.status < 500) return cause.message;
  }
  if (confirming) return kind === 'reset'
    ? 'The result could not be confirmed. Try signing in with your new password before requesting another code. No request will be retried automatically.'
    : 'Verification could not be confirmed. Refresh your profile after reconnecting before trying the code again.';
  if (cause instanceof MobileApiTimeoutError) return 'The request took too long. Check your connection and request a new code when you are ready.';
  return 'The request could not be completed. Check your connection and try again. No code delivery has been confirmed.';
}

/** No credentials are persisted. Closing, account changes and unmounting abort
 * the current request and invalidate delayed success/error callbacks. */
export function useAccountCodeFlow(kind: 'reset' | 'verification', initialEmail: string, operations: Operations) {
  const [state, setState] = useState<FlowState>(() => blank(initialEmail));
  const generation = useRef(0);
  const pending = useRef<AbortController | undefined>(undefined);
  const operationsRef = useRef(operations);
  operationsRef.current = operations;

  const reset = useCallback((email = '') => {
    generation.current += 1;
    pending.current?.abort();
    pending.current = undefined;
    setState(blank(email));
  }, []);
  useEffect(() => {
    reset(initialEmail);
    return () => { generation.current += 1; pending.current?.abort(); pending.current = undefined; };
  }, [initialEmail, reset]);

  const execute = async (confirming: boolean, operation: (signal: AbortSignal) => Promise<void>, next: Phase, email: string) => {
    if (pending.current) return;
    const controller = new AbortController(), currentGeneration = generation.current;
    pending.current = controller;
    const current = () => generation.current === currentGeneration && pending.current === controller;
    setState(value => ({ ...value, busy: true, error: '' }));
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([operation(controller.signal), new Promise<never>((_, reject) => {
        deadline = setTimeout(() => { controller.abort(); reject(new MobileApiTimeoutError()); }, 25_000);
      })]);
      if (!current()) return;
      setState(next === 'success' ? { ...blank(), phase: 'success' } : { ...blank(email), phase: next });
    } catch (cause) {
      if (!current()) return;
      setState(value => ({
        ...value, busy: false, code: '', newPassword: '', confirmPassword: '',
        error: failureMessage(cause, confirming, kind),
      }));
    } finally {
      if (deadline) clearTimeout(deadline);
      if (current()) { pending.current = undefined; setState(value => ({ ...value, busy: false })); }
    }
  };

  const request = async () => {
    if (pending.current) return;
    let email: string;
    try { email = accountEmail(state.email); }
    catch (cause) { setState(value => ({ ...value, error: (cause as Error).message })); return; }
    setState(value => ({ ...value, code: '', newPassword: '', confirmPassword: '' }));
    await execute(false, signal => operationsRef.current.request(email, signal), 'confirm', email);
  };
  const confirm = async () => {
    if (pending.current) return;
    let input: Fields;
    try {
      input = kind === 'reset' ? passwordResetInput(state) : { ...state, email: accountEmail(state.email), code: accountCode(state.code) };
    } catch (cause) { setState(value => ({ ...value, error: (cause as Error).message })); return; }
    await execute(true, signal => operationsRef.current.confirm(input, signal), 'success', input.email);
  };
  return {
    state, request, confirm, reset,
    setField: (field: keyof Fields, value: string) => setState(current => ({ ...current, [field]: value, error: '' })),
  };
}

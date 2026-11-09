/** Browser-side helpers for the internal portal's email/password session. */

export const STAFF_SIGN_OUT_PATH = '/api/admin/auth/sign-out';
/**
 * Authentication screens use full document loads (plain links, not client-side
 * routing) so the server always re-reads the session cookie.
 */
export const CHANGE_PASSWORD_URL = '/?change-password=1';
export const PORTAL_HOME_URL = '/';

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'The request could not be completed. Please try again.');
  return payload;
}

export function signInStaff(email: string, password: string) {
  return postJson<{ ok: true; mustChangePassword: boolean }>('/api/admin/auth/sign-in', { email, password });
}

export function changeStaffPassword(currentPassword: string, newPassword: string, confirmPassword: string) {
  return postJson<{ ok: true }>('/api/admin/auth/change-password', { currentPassword, newPassword, confirmPassword });
}

export function issueTemporaryPassword(userId: string) {
  return postJson<{ ok: true; email: string; temporaryPassword: string }>('/api/admin/auth/temporary-password', { userId });
}

/**
 * Reload the portal root with a full document request. A full reload (rather
 * than client-side routing) is intentional after sign-in, password change and
 * sign-out: the server must re-read the new session cookie, and no private data
 * from the previous session may remain in browser memory.
 */
export function reloadPortal(): void {
  window.location.replace(`${window.location.origin}/`);
}

/** End the server session, then return to the sign-in page even if the network call fails. */
export async function signOutStaff(path = STAFF_SIGN_OUT_PATH): Promise<void> {
  try {
    await postJson(path);
  } catch {
    // The cookie expires on its own; still leave the private screen.
  } finally {
    reloadPortal();
  }
}

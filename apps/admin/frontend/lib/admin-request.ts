export class AdminAccessError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? 'Your session expired. Sign in again.' : 'Your access could not be verified. Sign in again or contact your parish administrator.');
    this.name = 'AdminAccessError';
  }
}

/** Includes response body parsing in the deadline, even when fetch ignores abort. */
export async function adminRequest<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<{ response: Response; payload: T }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('The server took too long to respond. Your details are preserved. Retry the same action to recover its result.'));
    }, timeoutMs);
  });
  const operation = async () => {
    const response = await fetch(path, { ...init, redirect: 'manual', signal: controller.signal });
    // Upstream identity systems may return HTML or a stalled body on denial.
    // Preserve the status before parsing so callers can clear private state.
    if (response.status === 401 || response.status === 403) {
      void response.body?.cancel().catch(() => undefined);
      throw new AdminAccessError(response.status);
    }
    // These same-origin API routes do not redirect; an upstream login redirect
    // must not leave an old authenticated screen visible behind an HTML error.
    if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      void response.body?.cancel().catch(() => undefined);
      throw new AdminAccessError(401);
    }
    if (!response.headers.get('Content-Type')?.includes('application/json')) {
      throw new Error(response.status === 401 ? 'Your session expired. Sign in again.' : 'The server returned an unexpected response. Please retry.');
    }
    return { response, payload: await response.json() as T };
  };
  try { return await Promise.race([operation(), deadline]); }
  finally { if (timer) clearTimeout(timer); }
}

/** Store only an opaque retry key, timestamp and payload digest in this browser session. */
export async function adminMutationKey(actorId: string, body: string): Promise<{ storageKey: string; key: string }> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(actorId + ':' + body));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  const storageKey = 'parishlink:admin-retry:' + fingerprint;
  const stored = sessionStorage.getItem(storageKey);
  if (stored) {
    const value = JSON.parse(stored) as { key?: string; createdAt?: number };
    if (!value?.key || !/^[a-f0-9-]{36}$/i.test(value.key) || !Number.isFinite(value.createdAt)) throw new Error('Check the saved result before retrying this action.');
    if (Date.now() - Number(value.createdAt) > 6 * 86_400_000) throw new Error('This action is too old to retry safely. Check its result before making another change.');
    return { storageKey, key: value.key };
  }
  const key = crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ key, createdAt: Date.now() }));
  return { storageKey, key };
}

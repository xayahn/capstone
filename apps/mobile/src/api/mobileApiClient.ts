import { normalizeApiBaseUrl } from '../config/environment';
import { apiFetch } from './apiFetch';

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_SERVER_MESSAGE_LENGTH = 500;

type AccessTokenProvider = () => string;

export class MobileApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'MobileApiError';
    this.status = status;
  }
}

export class MobileApiTimeoutError extends Error {
  constructor() {
    super('The ParishLink server took too long to respond. Check your connection and try again.');
    this.name = 'MobileApiTimeoutError';
  }
}

const safeServerMessage = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const message = value
    .trim()
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ');
  return message && message.length <= MAX_SERVER_MESSAGE_LENGTH ? message : undefined;
};

const errorMessageFrom = async (response: Response): Promise<string | undefined> => {
  const text = await response.text();
  if (!text) return undefined;
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
    const error = (body as Record<string, unknown>).error;
    if (typeof error === 'string') return safeServerMessage(error);
    if (error && typeof error === 'object' && !Array.isArray(error)) {
      return safeServerMessage((error as Record<string, unknown>).message);
    }
    return undefined;
  } catch {
    return response.headers.get('content-type')?.toLowerCase().startsWith('text/plain')
      ? safeServerMessage(text)
      : undefined;
  }
};

/**
 * Low-level HTTP boundary for the parishioner app. Repositories remain
 * responsible for domain operations; this client consistently applies JSON
 * headers, bearer authentication, timeouts, and safe server-error parsing.
 */
export class MobileApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly accessToken: AccessTokenProvider,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new RangeError('Mobile API timeout must be a positive number.');
    }
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }

  async request<T>(path: string, init: RequestInit = {}, timeoutMs = this.timeoutMs): Promise<T> {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError('Mobile API timeout must be a positive number.');
    if (init.signal?.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
    const routePath = path.split(/[?#]/, 1)[0] ?? '';
    let decodedRoutePath: string;
    try {
      decodedRoutePath = decodeURIComponent(routePath);
    } catch {
      throw new TypeError('Mobile API request path is malformed.');
    }
    if (
      !routePath.startsWith('/mobile/')
      || /[\\\u0000-\u001F\u007F]/.test(path)
      || decodedRoutePath.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
      throw new TypeError('Mobile API requests must use a safe /mobile/ path.');
    }
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (typeof init.body === 'string' && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    // Authentication is owned by the repository-backed token provider. Do not
    // allow a request initializer to smuggle or retain a different credential.
    headers.delete('Authorization');
    const token = this.accessToken().trim();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const controller = new AbortController();
    const callerSignal = init.signal;
    let rejectCancellation!: (error: Error) => void;
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject; });
    const abortFromCaller = () => {
      controller.abort();
      rejectCancellation(new DOMException('The request was cancelled.', 'AbortError'));
    };
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new MobileApiTimeoutError());
      }, timeoutMs);
    });

    const operation = async (): Promise<T> => {
      const response = await apiFetch(`${this.baseUrl}${path}`, {
        ...init,
        redirect: 'manual',
        credentials: 'omit',
        headers,
        signal: controller.signal,
      });
      if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        void response.body?.cancel().catch(() => undefined);
        throw new MobileApiError('The ParishLink API returned an unexpected redirect. Sign in again or contact support.', 401);
      }
      // An HTML, interrupted or stalled denial body must not hide the auth status.
      if (response.status === 401 || response.status === 403) {
        void response.body?.cancel().catch(() => undefined);
        const message = response.status === 403 ? 'You do not have permission to perform this action.'
          : routePath === '/mobile/auth/sign-in' ? 'The email or password is incorrect, or this account is temporarily locked.'
          : 'Sign in to continue.';
        throw new MobileApiError(message, response.status);
      }
      if (!response.ok) {
        const message = await errorMessageFrom(response);
        throw new MobileApiError(message ?? `ParishLink API returned ${response.status}.`, response.status);
      }
      if (response.status === 204) return undefined as T;

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
      if (!contentType.includes('application/json') && !contentType.includes('+json')) {
        throw new MobileApiError('The ParishLink server returned an unexpected response format.', response.status);
      }
      try {
        return (await response.json()) as T;
      } catch {
        throw new MobileApiError('The ParishLink server returned an unreadable response.', response.status);
      }
    };

    try {
      return await Promise.race([operation(), timeoutPromise, cancellation]);
    } catch (error) {
      // Some React Native fetch implementations surface a generic network error
      // after abort. The flag keeps timeout reporting deterministic while leaving
      // an explicit caller cancellation untouched.
      if (timedOut && !(error instanceof MobileApiTimeoutError)) {
        throw new MobileApiTimeoutError();
      }
      throw error;
    } finally {
      if (timeout) clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', abortFromCaller);
    }
  }
}

import { normalizeApiBaseUrl } from '../config/environment';

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

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
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
    const abortFromCaller = () => controller.abort();
    if (callerSignal?.aborted) abortFromCaller();
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true });

    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new MobileApiTimeoutError());
      }, this.timeoutMs);
    });

    const operation = async (): Promise<T> => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
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
      return await Promise.race([operation(), timeoutPromise]);
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

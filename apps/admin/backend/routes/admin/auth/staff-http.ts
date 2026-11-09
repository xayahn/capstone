import { ensureRuntimeDatabase } from '@/db/runtime';
import { StaffAuthError } from '@/backend/auth/staff-auth';
import { MobileServiceError } from '@/backend/auth/mobile-auth';
import { AdminServiceError } from '@/backend/services/admin-service';
import { readSmallJson, RequestBodyError } from '@/backend/http/small-json';
import { recordServerFailure } from '@/backend/observability/server-log';

/** Shared JSON response and same-origin guard for the internal sign-in endpoints. */
export function staffJson(body: unknown, status = 200, setCookie?: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  });
  if (setCookie) headers.append('Set-Cookie', setCookie);
  return Response.json(body, { status, headers });
}

export async function staffRoute(
  request: Request,
  operation: string,
  work: (body: Record<string, unknown>) => Promise<Response>,
  options: { readBody?: boolean } = {},
): Promise<Response> {
  try {
    // Cookie-authenticated writes must come from this same site (CSRF protection).
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      throw new StaffAuthError('The request origin could not be verified.', 403);
    }
    const body = options.readBody === false ? {} : await readSmallJson(request, 4_000);
    await ensureRuntimeDatabase();
    return await work(body);
  } catch (error) {
    if (error instanceof StaffAuthError || error instanceof AdminServiceError
      || error instanceof RequestBodyError || error instanceof MobileServiceError) {
      return staffJson({ error: error.message }, error.status);
    }
    return staffJson({ error: 'The request could not be completed. Please try again.', requestId: recordServerFailure(operation, error) }, 500);
  }
}

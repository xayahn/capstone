import { getStaffUser } from '@/backend/auth/staff-session';
import { AdminServiceError, resolveActor } from '@/backend/services/admin-service';
import { searchClergyAssignments } from '@/backend/services/assignment-search-service';
import { readSmallJson, RequestBodyError } from '@/backend/http/small-json';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
});

/** Read-only POST avoids putting private search text in URLs/history. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new AdminServiceError('The request origin could not be verified.', 403);
    const identity = await getStaffUser();
    if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
    return json(await searchClergyAssignments(await resolveActor(identity), await readSmallJson(request)));
  } catch (error) {
    if (error instanceof AdminServiceError || error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: 'The schedule could not load. Please retry.', requestId: recordServerFailure('assignment-search', error) }, 500);
  }
}

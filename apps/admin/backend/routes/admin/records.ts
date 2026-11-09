import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AdminServiceError, resolveActor } from '@/backend/services/admin-service';
import { searchParishRecords } from '@/backend/services/record-search-service';
import { readSmallJson, RequestBodyError } from '@/backend/http/small-json';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' },
});

/** Read-only POST keeps private search terms out of URLs and browser history. */
export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new AdminServiceError('The request origin could not be verified.', 403);
    const identity = await getChatGPTUser();
    if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
    const actor = await resolveActor(identity);
    if (actor.role !== 'parish_staff' || !actor.parishId) throw new AdminServiceError('Records require assigned parish staff access.', 403);
    return json(await searchParishRecords(actor, await readSmallJson(request)));
  } catch (error) {
    if (error instanceof AdminServiceError || error instanceof RequestBodyError) return json({ error: error.message }, error.status);
    return json({ error: 'Records could not load. Please retry.', requestId: recordServerFailure('record-search', error) }, 500);
  }
}

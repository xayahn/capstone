import { issueTemporaryStaffPassword, readStaffSession, StaffAuthError } from '@/backend/auth/staff-auth';
import { resolveActor } from '@/backend/services/admin-service';
import { staffJson, staffRoute } from '@/backend/routes/admin/auth/staff-http';

export const dynamic = 'force-dynamic';

/** System administrators issue a one-time temporary password for an internal account. */
export async function POST(request: Request): Promise<Response> {
  return staffRoute(request, 'staff-temporary-password', async (body) => {
    const identity = await readStaffSession(request.headers.get('cookie'));
    if (!identity) throw new StaffAuthError('Sign in to continue.', 401);
    const actor = await resolveActor(identity);
    const result = await issueTemporaryStaffPassword(actor, typeof body.userId === 'string' ? body.userId : '');
    return staffJson({ ok: true, email: result.email, temporaryPassword: result.temporaryPassword });
  });
}

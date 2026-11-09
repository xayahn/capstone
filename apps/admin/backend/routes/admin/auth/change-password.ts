import { changeStaffPassword, readStaffSession, StaffAuthError } from '@/backend/auth/staff-auth';
import { staffJson, staffRoute } from '@/backend/routes/admin/auth/staff-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return staffRoute(request, 'staff-change-password', async (body) => {
    const identity = await readStaffSession(request.headers.get('cookie'));
    if (!identity) throw new StaffAuthError('Sign in to continue.', 401);
    await changeStaffPassword(identity, body);
    return staffJson({ ok: true });
  });
}

import { clearStaffSessionCookie, signOutStaff } from '@/backend/auth/staff-auth';
import { staffJson, staffRoute } from '@/backend/routes/admin/auth/staff-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return staffRoute(request, 'staff-sign-out', async () => {
    await signOutStaff(request.headers.get('cookie'));
    return staffJson({ ok: true }, 200, clearStaffSessionCookie());
  }, { readBody: false });
}

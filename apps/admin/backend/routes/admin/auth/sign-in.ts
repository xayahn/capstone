import { signInStaff, staffSessionCookie } from '@/backend/auth/staff-auth';
import { enforceMobileIpRateLimit } from '@/backend/security/mobile-rate-limit';
import { staffJson, staffRoute } from '@/backend/routes/admin/auth/staff-http';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  return staffRoute(request, 'staff-sign-in', async (body) => {
    await enforceMobileIpRateLimit(request, 'staff-sign-in', 30, 15 * 60);
    const result = await signInStaff(body, request.headers.get('user-agent'));
    return staffJson({ ok: true, mustChangePassword: result.mustChangePassword }, 200, staffSessionCookie(result.token));
  });
}

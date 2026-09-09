import { signUpMobile } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { enforceMobileIpRateLimit } from '@/backend/security/mobile-rate-limit';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    await enforceMobileIpRateLimit(request, 'auth-sign-up', 8, 60 * 60);
    return mobileJson(await signUpMobile(
      await readMobileJson(request),
      request.headers.get('user-agent'),
    ), 201);
  });
}

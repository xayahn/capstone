import { changeMobilePassword, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileEmpty, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'auth-password-change', 5, 15 * 60);
    await changeMobilePassword(request, await readMobileJson(request, 2_000));
    return mobileEmpty();
  });
}

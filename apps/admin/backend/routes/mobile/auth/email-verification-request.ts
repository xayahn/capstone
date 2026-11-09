import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { requestMobileEmailVerification } from '@/backend/auth/account-recovery';
import { mobileJson, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;
export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => mobileJson(await requestMobileEmailVerification(request, await requireMobileActor(request)), 202));
}

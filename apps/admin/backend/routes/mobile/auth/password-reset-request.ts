import { requestMobilePasswordReset } from '@/backend/auth/account-recovery';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;
export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => mobileJson(await requestMobilePasswordReset(request, await readMobileJson(request, 2_000)), 202));
}

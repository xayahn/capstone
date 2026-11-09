import { confirmMobilePasswordReset } from '@/backend/auth/account-recovery';
import { mobileEmpty, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;
export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => { await confirmMobilePasswordReset(request, await readMobileJson(request, 2_000)); return mobileEmpty(); });
}

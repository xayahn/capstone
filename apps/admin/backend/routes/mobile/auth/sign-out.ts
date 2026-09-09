import { signOutMobile } from '@/backend/auth/mobile-auth';
import { mobileEmpty, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    await signOutMobile(request);
    return mobileEmpty();
  });
}

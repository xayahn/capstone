import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileEmpty, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
import { leaveMobileQueue } from '@/backend/services/mobile-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function DELETE(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    await leaveMobileQueue(await requireMobileActor(request));
    return mobileEmpty();
  });
}

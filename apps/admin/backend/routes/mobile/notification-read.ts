import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileEmpty, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
import { markMobileNotificationRead } from '@/backend/services/mobile-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    const { id } = await context.params;
    await markMobileNotificationRead(actor, id);
    return mobileEmpty();
  });
}

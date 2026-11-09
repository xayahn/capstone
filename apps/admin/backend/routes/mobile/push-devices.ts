import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileEmpty, mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';
import { registerPushDevice, unregisterPushDevice } from '@/backend/notifications/push-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'push-register', 30, 900);
    return mobileJson(await registerPushDevice(actor, await readMobileJson(request, 2_000)));
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'push-unregister', 30, 900);
    await unregisterPushDevice(actor, await readMobileJson(request, 500));
    return mobileEmpty();
  });
}

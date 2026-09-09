import { MobileServiceError, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { joinMobileQueue } from '@/backend/services/mobile-service';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';
import { validIdempotencyKey } from '@/backend/security/idempotency';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'queue-join', 20, 60 * 60);
    const idempotencyKey = validIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotencyKey) throw new MobileServiceError('A valid Idempotency-Key header is required for queue tickets.');
    return mobileJson(await joinMobileQueue(
      actor,
      await readMobileJson(request),
      idempotencyKey,
    ), 201);
  });
}

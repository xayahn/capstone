import { MobileServiceError, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { createMobileAppointment } from '@/backend/services/mobile-service';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';
import { validIdempotencyKey } from '@/backend/security/idempotency';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'appointment-create', 12, 60 * 60);
    const idempotencyKey = validIdempotencyKey(request.headers.get('idempotency-key'));
    if (!idempotencyKey) {
      throw new MobileServiceError('A valid Idempotency-Key header is required for appointment requests.');
    }
    return mobileJson(await createMobileAppointment(
      actor,
      await readMobileJson(request),
      idempotencyKey,
    ), 201);
  });
}

import { MobileServiceError, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { cancelMobileAppointment, requestMobileReschedule, withdrawMobileChangeRequest } from '@/backend/services/appointment-changes';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

type Context = { params: Promise<{ id: string }> };

async function appointmentId(context: Context): Promise<string> {
  const { id } = await context.params;
  if (!id || id.length > 100) throw new MobileServiceError('Invalid appointment reference.');
  return id;
}

/** POST /api/mobile/appointments/:id/cancel { reason } */
export async function cancel(request: Request, context: Context): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'appointment-change', 20, 60 * 60);
    return mobileJson(await cancelMobileAppointment(actor, await appointmentId(context), await readMobileJson(request, 4_000)));
  });
}

/** POST /api/mobile/appointments/:id/reschedule { date, time, reason } */
export async function reschedule(request: Request, context: Context): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'appointment-change', 20, 60 * 60);
    return mobileJson(await requestMobileReschedule(actor, await appointmentId(context), await readMobileJson(request, 4_000)));
  });
}

/** POST /api/mobile/appointments/:id/change-request/withdraw */
export async function withdraw(request: Request, context: Context): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    return mobileJson(await withdrawMobileChangeRequest(actor, await appointmentId(context)));
  });
}

import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { updateMobileProfile } from '@/backend/services/mobile-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function PUT(request: Request): Promise<Response> {
  return mobileRoute(request, async () => mobileJson(await updateMobileProfile(
    await requireMobileActor(request),
    await readMobileJson(request),
  )));
}

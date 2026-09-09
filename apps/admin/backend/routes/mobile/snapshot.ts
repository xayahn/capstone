import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
import { loadMobileSnapshot } from '@/backend/services/mobile-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function GET(request: Request): Promise<Response> {
  return mobileRoute(request, async () => mobileJson(await loadMobileSnapshot(await requireMobileActor(request))));
}

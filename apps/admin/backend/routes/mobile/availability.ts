import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { searchMobileAvailability } from '@/backend/services/mobile-service';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'availability-search', 120, 60 * 60);
    return mobileJson(await searchMobileAvailability(await readMobileJson(request)));
  });
}

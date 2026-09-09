import { requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute, readMobileJson } from '@/backend/http/mobile-http';
import { askMobileAssistant } from '@/backend/services/mobile-service';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

export async function POST(request: Request): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    await enforceMobileRateLimit(actor.id, 'assistant', 30, 10 * 60);
    return mobileJson(await askMobileAssistant(
      actor,
      await readMobileJson(request, 4_000),
    ));
  });
}

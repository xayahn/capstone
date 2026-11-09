import * as workers from 'cloudflare:workers';
import { dispatchPushNotifications } from '@/backend/notifications/push-service';
import { recordServerFailure } from '@/backend/observability/server-log';

/** Business events commit first. Provider work never delays or rolls them back. */
export function schedulePushDispatch(): void {
  if (workers.env.PUSH_NOTIFICATIONS_ENABLED !== 'true') return;
  try {
    // The scheduled dispatcher is still required for retries/receipts/reminders
    // when no user is interacting with the app.
    workers.waitUntil(Promise.resolve().then(() => dispatchPushNotifications()).catch((error: unknown) => {
      recordServerFailure('push-background', error);
    }));
  } catch (error) {
    // No execution context (e.g. a local unit test) must not make a successful
    // business mutation look like a failure. The durable queue is retained.
    recordServerFailure('push-background-context', error);
  }
}

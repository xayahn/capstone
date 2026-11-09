/** Standalone scheduled Worker adapter. This file is not deployed by app builds.
 * Configure a one-minute Cron Trigger and runtime secrets when the owner deploys.
 */
interface SchedulerEnv {
  PUSH_DISPATCH_URL: string;
  PUSH_DISPATCH_SECRET: string;
  SITES_SERVICE_ACCESS_TOKEN?: string;
}

export async function requestPushDispatch(configuration: SchedulerEnv, fetcher: typeof fetch = fetch): Promise<void> {
  const target = new URL(configuration.PUSH_DISPATCH_URL);
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash
    || target.pathname !== '/api/internal/notifications/dispatch') {
    throw new Error('Configure the approved HTTPS notification dispatch URL.');
  }
  if (!configuration.PUSH_DISPATCH_SECRET || configuration.PUSH_DISPATCH_SECRET.length < 32
    || /[\s\u0000-\u001f]/.test(configuration.PUSH_DISPATCH_SECRET)) throw new Error('Configure a strong notification dispatch secret.');
  const response = await fetcher(target.href, {
    method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(25_000),
    headers: {
      Authorization: `Bearer ${configuration.PUSH_DISPATCH_SECRET}`,
      ...(configuration.SITES_SERVICE_ACCESS_TOKEN ? { 'OAI-Sites-Authorization': `Bearer ${configuration.SITES_SERVICE_ACCESS_TOKEN}` } : {}),
    },
  });
  // Never log response bodies, configuration values, device IDs or secrets.
  void response.body?.cancel().catch(() => undefined);
  if (response.redirected || response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
    throw new Error('The scheduled notification dispatch returned an unexpected redirect.');
  }
  if (!response.ok) throw new Error('The scheduled notification dispatch was unsuccessful.');
}

const pushScheduler = {
  scheduled(_controller: ScheduledController, configuration: SchedulerEnv, context: ExecutionContext) {
    context.waitUntil(requestPushDispatch(configuration));
  },
};

export default pushScheduler;

import { ensurePublicRuntimeDatabase, getRawDb } from '@/db/runtime';
import { MobileServiceError } from '@/backend/auth/mobile-auth';

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function requestSubject(request: Request): string {
  return request.headers.get('cf-connecting-ip')?.slice(0, 64)
    || request.headers.get('x-real-ip')?.slice(0, 64)
    || 'local-or-unknown';
}

export async function enforceMobileRateLimit(
  subject: string,
  scope: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  await ensurePublicRuntimeDatabase();
  const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  const subjectHash = await sha256(`parishlink:${scope}:${subject}`);
  const row = await getRawDb().prepare(`INSERT INTO mobile_rate_limits
      (id, scope, subject_hash, window_start, request_count)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(scope, subject_hash, window_start)
      DO UPDATE SET request_count = request_count + 1
      RETURNING request_count AS requestCount`)
    .bind(crypto.randomUUID(), scope, subjectHash, windowStart)
    .first<{ requestCount: number }>();
  if (!row || Number(row.requestCount) > maximum) {
    throw new MobileServiceError('Too many requests. Wait a few minutes and try again.', 429);
  }
  if (Math.random() < 0.02) {
    await getRawDb().prepare("DELETE FROM mobile_rate_limits WHERE datetime(created_at) < datetime('now', '-2 days')")
      .run()
      .catch(() => undefined);
  }
}

export async function enforceMobileIpRateLimit(
  request: Request,
  scope: string,
  maximum: number,
  windowSeconds: number,
): Promise<void> {
  return enforceMobileRateLimit(requestSubject(request), scope, maximum, windowSeconds);
}

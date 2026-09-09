const SAFE_LABEL = /^[a-zA-Z0-9_.:-]{1,80}$/;

/**
 * Records a support correlation without serializing an exception, request,
 * headers, SQL, storage key, or user-supplied payload into application logs.
 */
export function recordServerFailure(area: string, error: unknown): string {
  const eventId = crypto.randomUUID();
  const safeArea = SAFE_LABEL.test(area) ? area : 'unknown';
  const candidateType = error instanceof Error ? error.name : typeof error;
  const errorType = SAFE_LABEL.test(candidateType) ? candidateType : 'UnknownError';
  console.error('ParishLink server failure', { eventId, area: safeArea, errorType });
  return eventId;
}

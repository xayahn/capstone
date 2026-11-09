export class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'RequestBodyError'; }
}

/** Bound bytes while receiving, including bodies without Content-Length. */
export async function readSmallJson(request: Request, maxBytes = 4096): Promise<Record<string, unknown>> {
  if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') throw new RequestBodyError('Send this request as JSON.', 415);
  if (!request.body) throw new RequestBodyError('The request body is missing.', 400);
  if (Number(request.headers.get('content-length')) > maxBytes) throw new RequestBodyError('The request is too large.', 413);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let count = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RequestBodyError('The request took too long.', 408));
      void reader.cancel().catch(() => undefined);
    }, 15_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      count += value.byteLength;
      if (count > maxBytes) { void reader.cancel().catch(() => undefined); throw new RequestBodyError('The request is too large.', 413); }
      chunks.push(value);
    }
  } finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new RequestBodyError('The request body is not valid JSON.', 400); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestBodyError('The request body must be an object.', 400);
  return value as Record<string, unknown>;
}

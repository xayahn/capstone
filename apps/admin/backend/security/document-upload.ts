import { env } from 'cloudflare:workers';
import { getRawDb } from '@/db/runtime';
import { MobileServiceError } from '@/backend/auth/mobile-auth';
import { enforceMobileRateLimit } from '@/backend/security/mobile-rate-limit';

export const WRITABLE_DOCUMENT_STATES = ['submitted', 'documents_pending', 'under_review', 'needs_changes'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 128_000;

/** Bound all multipart bytes, including extra fields, before parsing them. */
export async function readDocumentForm(request: Request): Promise<FormData> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) throw new MobileServiceError('Send document uploads as form data.', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES || !request.body) throw new MobileServiceError('The upload is too large or empty.', 413);
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let total = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new MobileServiceError('The upload took too long. Try again on a stable connection.', 408));
      void reader.cancel().catch(() => undefined);
    }, 30_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel(); throw new MobileServiceError('The upload is too large.', 413); }
      chunks.push(value);
    }
  } finally { if (timer) clearTimeout(timer); reader.releaseLock(); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const form = await new Response(body, { headers: { 'Content-Type': request.headers.get('content-type')! } }).formData();
    if (form.getAll('file').length !== 1 || [...form.values()].filter(value => value instanceof File).length !== 1) throw new MobileServiceError('Choose exactly one document.');
    return form;
  } catch (error) {
    if (error instanceof MobileServiceError) throw error;
    throw new MobileServiceError('The upload form is invalid.');
  }
}

export function validDocumentSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'application/pdf') {
    const text = new TextDecoder('latin1').decode(bytes);
    // Structural prefilter only: production additionally requires the safety scanner.
    return /^%PDF-1\.[0-7]/.test(text) && /\d+\s+\d+\s+obj\b/.test(text)
      && /\/Type\s*\/Catalog\b/.test(text) && /startxref\s+\d+\s+%%EOF\s*$/.test(text)
      && !/\/(?:JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b/.test(text);
  }
  if (mime === 'image/jpeg') return bytes.length > 32 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  if (mime === 'image/png') return bytes.length > 44 && [137,80,78,71,13,10,26,10].every((x,i) => bytes[i] === x)
    && new TextDecoder().decode(bytes.slice(12,16)) === 'IHDR'
    && [0,0,0,0,73,69,78,68,174,66,96,130].every((x,i) => bytes[bytes.length-12+i] === x);
  return false;
}

type UploadScope = { actorId: string; appointmentId: string; documentId: string; ownerId?: string; parishId?: string };
/** Both clients use the same authorization, state, and race checks. */
export async function saveDocument(scope: UploadScope, file: File): Promise<void> {
  await enforceMobileRateLimit(scope.actorId, 'document-upload', 20, 3600);
  if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new MobileServiceError('Files must be between 1 byte and 10 MB.');
  if (!env.FILES) throw new MobileServiceError('Private document storage is unavailable.', 503);
  const db = getRawDb();
  const row = await db.prepare(`SELECT ds.id, ds.storage_key AS oldKey, ds.sha256 AS oldHash,
      a.parish_id AS parishId, a.status, a.version
    FROM document_submissions ds JOIN appointments a ON a.id = ds.appointment_id
    WHERE ds.id = ? AND a.id = ? AND (? IS NULL OR a.parishioner_user_id = ?)
      AND (? IS NULL OR a.parish_id = ?)`)
    .bind(scope.documentId, scope.appointmentId, scope.ownerId ?? null, scope.ownerId ?? null, scope.parishId ?? null, scope.parishId ?? null)
    .first<{ id: string; oldKey: string | null; oldHash: string | null; parishId: string; status: string; version: number }>();
  if (!row) throw new MobileServiceError('Document requirement not found.', 404);
  if (!WRITABLE_DOCUMENT_STATES.includes(row.status)) throw new MobileServiceError('This request no longer accepts document changes. Contact parish staff.', 409);
  const buffer = await file.arrayBuffer();
  if (!validDocumentSignature(new Uint8Array(buffer), file.type)) throw new MobileServiceError('Choose a valid PDF, JPEG, or PNG without active content.');
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2,'0')).join('');
  if (process.env.NODE_ENV === 'production' && !env.DOCUMENT_SCANNER) throw new MobileServiceError('Document safety scanning is not configured. Contact parish staff.', 503);
  if (env.DOCUMENT_SCANNER) {
    const response = await env.DOCUMENT_SCANNER.fetch(new Request('https://document-scanner/scan', {
      method: 'POST', body: buffer, signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': file.type, 'X-Document-SHA256': sha256 },
    }));
    const verdict = response.ok ? await response.json() as { status?: string; sha256?: string } : null;
    if (verdict?.status !== 'clean' || verdict.sha256 !== sha256) throw new MobileServiceError('This document could not pass the safety check.', 422);
  }
  const name = file.name.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g,'-').slice(-100) || 'document';
  const key = `private/${row.parishId}/${scope.appointmentId}/${crypto.randomUUID()}-${name}`;
  await env.FILES.put(key, buffer, { httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${name}"` } });
  let committed = false;
  try {
    const result = await db.batch([
      db.prepare(`UPDATE document_submissions SET storage_key = ?, original_file_name = ?, mime_type = ?,
        size_bytes = ?, sha256 = ?, status = 'submitted', reviewer_id = NULL, review_note = NULL,
        reviewed_at = NULL, submitted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND storage_key IS ? AND EXISTS (
          SELECT 1 FROM appointments a WHERE a.id = document_submissions.appointment_id AND a.version = ?
            AND a.status IN ('submitted','documents_pending','under_review','needs_changes'))`)
        .bind(key, name, file.type, file.size, sha256, row.id, row.oldKey, row.version),
      db.prepare(`UPDATE appointments SET status = 'documents_pending', version = version + 1,
        updated_at = datetime('now') WHERE id = ? AND EXISTS (
          SELECT 1 FROM document_submissions WHERE id = ? AND storage_key = ?)`)
        .bind(scope.appointmentId, row.id, key),
      db.prepare(`INSERT INTO audit_logs (id,actor_id,action,entity_type,entity_id,parish_id,outcome,detail)
        SELECT ?,?,'document.upload','document_submission',?,?,'success',?
        WHERE EXISTS (SELECT 1 FROM document_submissions WHERE id = ? AND storage_key = ?)`)
        .bind(crypto.randomUUID(), scope.actorId, row.id, row.parishId,
          JSON.stringify({ storageKey: key, sha256, previousStorageKey: row.oldKey, previousSha256: row.oldHash }), row.id, key),
    ]);
    committed = Number(result[0]?.meta.changes) === 1;
    if (!committed) throw new MobileServiceError('The request changed while uploading. Refresh before trying again.', 409);
    // Retain previous immutable objects; audit entries preserve their identities.
  } finally { if (!committed) await env.FILES.delete(key).catch(() => undefined); }
}

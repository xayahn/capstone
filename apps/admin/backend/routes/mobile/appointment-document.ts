import { env } from 'cloudflare:workers';
import { getRawDb } from '@/db/runtime';
import { MobileServiceError, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
import { loadMobileAppointment } from '@/backend/services/mobile-service';

export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function validSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'application/pdf') {
    const tail = String.fromCharCode(...bytes.slice(Math.max(0, bytes.length - 1024)));
    return bytes.length >= 8 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-' && tail.includes('%%EOF');
  }
  if (mime === 'image/jpeg') return bytes.length >= 5 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
  if (mime === 'image/png') {
    const header = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const trailer = [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
    return bytes.length >= 20 && header.every((value, index) => bytes[index] === value)
      && trailer.every((value, index) => bytes[bytes.length - trailer.length + index] === value);
  }
  return false;
}

function safeFileName(value: string): string {
  return value.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, '-').slice(-100) || 'document';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; documentId: string }> },
): Promise<Response> {
  return mobileRoute(request, async () => {
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_FILE_BYTES + 128_000) throw new MobileServiceError('The upload is too large.', 413);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      throw new MobileServiceError('Send document uploads as form data.', 415);
    }
    const actor = await requireMobileActor(request);
    if (!env.FILES) throw new MobileServiceError('Private document storage is unavailable.', 503);
    const { id: appointmentId, documentId } = await context.params;
    if (appointmentId.length > 100 || documentId.length > 160) throw new MobileServiceError('The document reference is invalid.');
    const db = getRawDb();
    const row = await db.prepare(`SELECT ds.id, ds.requirement_name AS requirementName,
        ds.storage_key AS oldStorageKey, a.parish_id AS parishId
      FROM document_submissions ds JOIN appointments a ON a.id = ds.appointment_id
      WHERE ds.id = ? AND a.id = ? AND a.parishioner_user_id = ? LIMIT 1`)
      .bind(documentId, appointmentId, actor.id).first<{
        id: string; requirementName: string; oldStorageKey: string | null; parishId: string;
      }>();
    if (!row) throw new MobileServiceError('Document requirement not found.', 404);

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) throw new MobileServiceError('Choose a document to upload.');
    if (!ALLOWED_TYPES.has(file.type)) throw new MobileServiceError('Upload a PDF, JPEG, or PNG file.');
    if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new MobileServiceError('Files must be between 1 byte and 10 MB.');
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!validSignature(bytes, file.type)) throw new MobileServiceError('The file contents do not match its file type.');
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    const sha256 = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const fileName = safeFileName(file.name);
    const storageKey = `private/${row.parishId}/${appointmentId}/${crypto.randomUUID()}-${fileName}`;
    await env.FILES.put(storageKey, buffer, {
      httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${fileName}"` },
      customMetadata: { appointmentId, documentId, uploadedBy: actor.id, sha256 },
    });
    try {
      await db.batch([
        db.prepare(`UPDATE document_submissions SET storage_key = ?, original_file_name = ?,
          mime_type = ?, size_bytes = ?, sha256 = ?, status = 'submitted', reviewer_id = NULL,
          review_note = NULL, reviewed_at = NULL, submitted_at = datetime('now'),
          updated_at = datetime('now') WHERE id = ?`)
          .bind(storageKey, fileName, file.type, file.size, sha256, documentId),
        db.prepare(`UPDATE appointments SET status = CASE
          WHEN status IN ('submitted','needs_changes') THEN 'documents_pending' ELSE status END,
          version = version + 1, updated_at = datetime('now') WHERE id = ?`).bind(appointmentId),
        db.prepare(`INSERT INTO audit_logs
          (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
          VALUES (?, ?, 'mobile.document.upload', 'document_submission', ?, ?, 'success', ?)`)
          .bind(crypto.randomUUID(), actor.id, documentId, row.parishId, `${row.requirementName}; ${file.type}; ${file.size} bytes; sha256=${sha256}`),
      ]);
    } catch (error) {
      await env.FILES.delete(storageKey).catch(() => undefined);
      throw error;
    }
    if (row.oldStorageKey) await env.FILES.delete(row.oldStorageKey).catch(() => undefined);
    return mobileJson(await loadMobileAppointment(actor, appointmentId));
  });
}

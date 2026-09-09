import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AdminServiceError, resolveActor } from '@/backend/services/admin-service';
import { getRawDb } from '@/db/runtime';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

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
  const compact = value.normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, '-').slice(-100);
  return compact || 'document';
}

function canAccess(actor: Awaited<ReturnType<typeof resolveActor>>, parishId: string, clergyId: string | null): boolean {
  if (actor.role === 'system_admin') return true;
  if (actor.role === 'clergy') return Boolean(actor.clergyProfileId && actor.clergyProfileId === clergyId);
  return actor.parishId === parishId;
}

export async function POST(request: Request): Promise<Response> {
  let uploadedKey: string | null = null;
  let previousKey: string | null = null;
  try {
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) throw new AdminServiceError('The request origin could not be verified.', 403);
    const identity = await getChatGPTUser();
    if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
    const actor = await resolveActor(identity);
    if (!env.FILES) throw new AdminServiceError('Private document storage is unavailable.', 503);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      throw new AdminServiceError('Send document uploads as form data.', 415);
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_FILE_BYTES + 128_000) throw new AdminServiceError('The upload is too large.', 413);

    const form = await request.formData();
    const file = form.get('file');
    const appointmentId = form.get('appointmentId');
    const requirementId = form.get('requirementId');
    if (!(file instanceof File) || typeof appointmentId !== 'string' || typeof requirementId !== 'string') {
      throw new AdminServiceError('Choose an appointment requirement and a file.');
    }
    if (!ALLOWED_TYPES.has(file.type)) throw new AdminServiceError('Upload a PDF, JPEG, or PNG file.');
    if (file.size < 1 || file.size > MAX_FILE_BYTES) throw new AdminServiceError('Files must be between 1 byte and 10 MB.');

    const db = getRawDb();
    const context = await db.prepare(`SELECT a.id AS appointmentId, a.parish_id AS parishId,
      a.clergy_id AS clergyId, dr.id AS requirementId, dr.name AS requirementName,
      (SELECT existing.storage_key FROM document_submissions existing
        WHERE existing.appointment_id = a.id AND existing.requirement_name = dr.name LIMIT 1) AS previousKey
      FROM appointments a JOIN document_requirements dr ON dr.service_type_id = a.service_type_id
      WHERE a.id = ? AND dr.id = ? AND dr.is_active = 1 LIMIT 1`)
      .bind(appointmentId, requirementId).first<{
        appointmentId: string; parishId: string; clergyId: string | null;
        requirementId: string; requirementName: string; previousKey: string | null;
      }>();
    if (!context) throw new AdminServiceError('The appointment requirement was not found.', 404);
    if (!canAccess(actor, context.parishId, context.clergyId)) throw new AdminServiceError('You cannot upload a document for this appointment.', 403);
    previousKey = context.previousKey;

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (!validSignature(bytes, file.type)) throw new AdminServiceError('The file contents do not match the selected file type.');
    const hashBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
    const sha256 = [...hashBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const fileName = safeFileName(file.name);
    uploadedKey = `private/${context.parishId}/${appointmentId}/${crypto.randomUUID()}-${fileName}`;
    await env.FILES.put(uploadedKey, buffer, {
      httpMetadata: { contentType: file.type, contentDisposition: `attachment; filename="${fileName}"` },
      customMetadata: { appointmentId, requirementId, uploadedBy: actor.id, sha256 },
    });

    const documentId = crypto.randomUUID();
    await db.batch([
      db.prepare(`INSERT INTO document_submissions
        (id, appointment_id, requirement_id, requirement_name, storage_key, original_file_name,
          mime_type, size_bytes, sha256, status, submitted_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', datetime('now'), datetime('now'))
        ON CONFLICT(appointment_id, requirement_name) DO UPDATE SET
          requirement_id = excluded.requirement_id, storage_key = excluded.storage_key,
          original_file_name = excluded.original_file_name, mime_type = excluded.mime_type,
          size_bytes = excluded.size_bytes, sha256 = excluded.sha256, status = 'submitted',
          reviewer_id = NULL, review_note = NULL, reviewed_at = NULL,
          submitted_at = datetime('now'), updated_at = datetime('now')`)
        .bind(documentId, appointmentId, requirementId, context.requirementName, uploadedKey, fileName, file.type, file.size, sha256),
      db.prepare(`INSERT INTO audit_logs
        (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
        VALUES (?, ?, 'document.upload', 'appointment', ?, ?, 'success', ?)`)
        .bind(crypto.randomUUID(), actor.id, appointmentId, context.parishId, `${context.requirementName}; ${file.type}; ${file.size} bytes; sha256=${sha256}`),
    ]);
    if (previousKey && previousKey !== uploadedKey) await env.FILES.delete(previousKey).catch(() => undefined);
    return json({ ok: true, message: 'The file was uploaded for human review.' });
  } catch (error) {
    if (uploadedKey && env.FILES) await env.FILES.delete(uploadedKey).catch(() => undefined);
    if (error instanceof AdminServiceError) return json({ error: error.message }, error.status);
    const requestId = recordServerFailure('admin-document-upload', error);
    return json({ error: 'The document could not be uploaded. Please try again.', requestId }, 500);
  }
}

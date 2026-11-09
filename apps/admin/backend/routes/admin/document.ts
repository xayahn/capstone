import { env } from 'cloudflare:workers';
import { getStaffUser } from '@/backend/auth/staff-session';
import { AdminServiceError, resolveActor } from '@/backend/services/admin-service';
import { getRawDb } from '@/db/runtime';
import { recordServerFailure } from '@/backend/observability/server-log';

export const dynamic = 'force-dynamic';

function errorResponse(message: string, status: number, requestId?: string): Response {
  return Response.json(
    { error: message, ...(requestId ? { requestId } : {}) },
    { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } },
  );
}

function safeDownloadName(value: string | null): string {
  return (value ?? 'parish-document').normalize('NFKC').replace(/[^a-zA-Z0-9._ -]/g, '').slice(-100) || 'parish-document';
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const identity = await getStaffUser();
    if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
    const actor = await resolveActor(identity);
    if (!env.FILES) throw new AdminServiceError('Private document storage is unavailable.', 503);
    const { id } = await context.params;
    const row = await getRawDb().prepare(`SELECT ds.id, ds.storage_key AS storageKey,
      ds.original_file_name AS fileName, ds.mime_type AS mimeType,
      a.parish_id AS parishId, a.clergy_id AS clergyId
      FROM document_submissions ds JOIN appointments a ON a.id = ds.appointment_id
      WHERE ds.id = ?`).bind(id).first<{
        id: string; storageKey: string | null; fileName: string | null;
        mimeType: string | null; parishId: string; clergyId: string | null;
      }>();
    if (!row) throw new AdminServiceError('Document submission not found.', 404);
    // Purpose/assignment elevation is not implemented: default deny outside staff scope.
    const authorized = actor.role === 'parish_staff' && actor.parishId === row.parishId;
    if (!authorized) throw new AdminServiceError('You cannot access this document.', 403);
    if (!row.storageKey) throw new AdminServiceError('This demonstration record has no stored file.', 404);
    const object = await env.FILES.get(row.storageKey);
    if (!object) throw new AdminServiceError('The stored file could not be found.', 404);

    await getRawDb().prepare(`INSERT INTO audit_logs
      (id, actor_id, action, entity_type, entity_id, parish_id, outcome, detail)
      VALUES (?, ?, 'document.download', 'document_submission', ?, ?, 'success', 'Authorized private download')`)
      .bind(crypto.randomUUID(), actor.id, row.id, row.parishId).run();

    return new Response(object.body, {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': object.httpMetadata?.contentType ?? row.mimeType ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeDownloadName(row.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof AdminServiceError) return errorResponse(error.message, error.status);
    const requestId = recordServerFailure('admin-document-download', error);
    return errorResponse('The document could not be downloaded.', 500, requestId);
  }
}

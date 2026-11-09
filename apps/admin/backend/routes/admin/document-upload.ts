import { getChatGPTUser } from '@/app/chatgpt-auth';
import { AdminServiceError, resolveActor } from '@/backend/services/admin-service';
import { MobileServiceError } from '@/backend/auth/mobile-auth';
import { getRawDb } from '@/db/runtime';
import { recordServerFailure } from '@/backend/observability/server-log';
import { readDocumentForm, saveDocument } from '@/backend/security/document-upload';
export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' } });
export async function POST(request: Request): Promise<Response> {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new AdminServiceError('The request origin could not be verified.', 403);
    const identity = await getChatGPTUser();
    if (!identity) throw new AdminServiceError('Sign in to continue.', 401);
    const actor = await resolveActor(identity);
    if (actor.role !== 'parish_staff' || !actor.parishId) throw new AdminServiceError('Document assistance requires assigned parish staff access.', 403);
    const form = await readDocumentForm(request);
    const file = form.get('file'), appointmentId = form.get('appointmentId'), requirementId = form.get('requirementId');
    if (!(file instanceof File) || typeof appointmentId !== 'string' || typeof requirementId !== 'string'
      || appointmentId.length > 100 || requirementId.length > 160) throw new AdminServiceError('Choose a request, requirement and file.');
    const doc = await getRawDb().prepare(`SELECT ds.id FROM document_submissions ds
      JOIN appointments a ON a.id = ds.appointment_id
      WHERE a.id = ? AND ds.requirement_id = ? AND a.parish_id = ?`)
      .bind(appointmentId, requirementId, actor.parishId).first<{ id:string }>();
    if (!doc) throw new AdminServiceError('The saved document requirement was not found.', 404);
    await saveDocument({ actorId:actor.id, parishId:actor.parishId, appointmentId, documentId:doc.id }, file);
    return json({ ok:true, message:'The file was submitted for human review.' });
  } catch (error) {
    if (error instanceof AdminServiceError || error instanceof MobileServiceError) return json({ error:error.message }, error.status);
    return json({ error:'The document could not be uploaded. Please try again.', requestId:recordServerFailure('admin-document-upload',error) },500);
  }
}

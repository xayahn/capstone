import { MobileServiceError, requireMobileActor } from '@/backend/auth/mobile-auth';
import { mobileJson, mobileOptions, mobileRoute } from '@/backend/http/mobile-http';
import { loadMobileAppointment } from '@/backend/services/mobile-service';
import { readDocumentForm, saveDocument } from '@/backend/security/document-upload';
export const dynamic = 'force-dynamic';
export const OPTIONS = mobileOptions;
export async function POST(request: Request, context: { params: Promise<{ id: string; documentId: string }> }): Promise<Response> {
  return mobileRoute(request, async () => {
    const actor = await requireMobileActor(request);
    const { id, documentId } = await context.params;
    if (id.length > 100 || documentId.length > 160) throw new MobileServiceError('Invalid document reference.');
    const form = await readDocumentForm(request);
    const file = form.get('file');
    if (!(file instanceof File)) throw new MobileServiceError('Choose a document to upload.');
    await saveDocument({ actorId: actor.id, ownerId: actor.id, appointmentId: id, documentId }, file);
    return mobileJson(await loadMobileAppointment(actor, id));
  });
}

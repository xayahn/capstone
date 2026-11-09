import type {
  Appointment,
  AppointmentDocument,
  CreateAppointmentInput,
} from '../types/domain';

type SubmissionDependencies = {
  randomUUID: () => string;
  idempotencyKey?: string;
  create: (metadata: CreateAppointmentInput, idempotencyKey: string) => Promise<Appointment>;
  upload: (
    appointment: Appointment,
    localDocument: AppointmentDocument,
    serverDocument: AppointmentDocument,
  ) => Promise<Appointment>;
};

export class AppointmentCreatedWithUploadError extends Error {
  readonly appointment: Appointment;
  readonly failedDocumentLabels: string[];

  constructor(appointment: Appointment, failedDocumentLabels: string[]) {
    const labels = failedDocumentLabels.join(', ');
    super(
      `Request ${appointment.reference} was saved, but ${failedDocumentLabels.length === 1 ? 'a document upload' : 'some document uploads'} could not finish (${labels}). Open the saved request and retry the affected files; do not submit a second appointment.`,
    );
    this.name = 'AppointmentCreatedWithUploadError';
    this.appointment = appointment;
    this.failedDocumentLabels = [...failedDocumentLabels];
  }
}

export const createAppointmentIdempotencyKey = (randomUUID: () => string): string => {
  const uuid = randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    throw new Error('Could not create a valid appointment submission key.');
  }
  const key = `appointment-${uuid}`;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new Error('Could not create a valid appointment submission key.');
  }
  return key;
};

/**
 * Creates the appointment first, then treats file transfers as retryable
 * follow-up work. A partial upload failure retains the server-created request
 * and reports exactly which requirements still need attention.
 */
export async function submitAppointmentWithDocuments(
  input: CreateAppointmentInput,
  dependencies: SubmissionDependencies,
): Promise<Appointment> {
  const fileDocuments = input.documents.filter(
    (document) => document.status === 'selected' && document.fileUri,
  );
  const metadata: CreateAppointmentInput = {
    ...input,
    documents: input.documents.map(({ fileUri: _fileUri, ...document }) => document),
  };
  const idempotencyKey = dependencies.idempotencyKey ?? createAppointmentIdempotencyKey(dependencies.randomUUID);
  let appointment = await dependencies.create(metadata, idempotencyKey);
  const failedDocumentLabels: string[] = [];

  for (const localDocument of fileDocuments) {
    const serverDocument = appointment.documents.find(
      (document) => document.label === localDocument.label,
    );
    if (!serverDocument) {
      failedDocumentLabels.push(localDocument.label);
      continue;
    }
    try {
      appointment = await dependencies.upload(appointment, localDocument, serverDocument);
    } catch {
      failedDocumentLabels.push(localDocument.label);
    }
  }

  if (failedDocumentLabels.length) {
    throw new AppointmentCreatedWithUploadError(appointment, failedDocumentLabels);
  }
  return appointment;
}

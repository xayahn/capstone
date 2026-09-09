import { describe, expect, it, vi } from 'vitest';
import {
  AppointmentCreatedWithUploadError,
  createAppointmentIdempotencyKey,
  submitAppointmentWithDocuments,
} from '../src/api/appointmentSubmission';
import type { Appointment, CreateAppointmentInput } from '../src/types/domain';

const input: CreateAppointmentInput = {
  serviceId: 'baptism',
  parishId: 'metropolitan-cathedral',
  clergyId: 'clergy-one',
  venueId: 'venue-one',
  date: '2026-09-10',
  time: '9:30 AM',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  documents: [
    {
      id: 'local-birth',
      label: 'Birth certificate',
      required: true,
      status: 'selected',
      fileUri: 'file:///birth.pdf',
      fileName: 'birth.pdf',
      mimeType: 'application/pdf',
    },
    {
      id: 'local-godparent',
      label: 'Godparent form',
      required: true,
      status: 'selected',
      fileUri: 'file:///godparent.pdf',
      fileName: 'godparent.pdf',
      mimeType: 'application/pdf',
    },
  ],
};

const appointment: Appointment = {
  id: 'appointment-one',
  reference: 'PL-2026-0001',
  parishionerId: 'parishioner-one',
  serviceId: 'baptism',
  parishId: 'metropolitan-cathedral',
  clergyId: 'clergy-one',
  venueId: 'venue-one',
  date: '2026-09-10',
  time: '9:30 AM',
  durationMinutes: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
  status: 'submitted',
  documents: [
    { id: 'server-birth', label: 'Birth certificate', required: true, status: 'missing' },
    { id: 'server-godparent', label: 'Godparent form', required: true, status: 'missing' },
  ],
  submittedAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
};

describe('appointment submission reliability', () => {
  it('creates a valid 16-128 character key from a cryptographic UUID source', () => {
    expect(createAppointmentIdempotencyKey(
      () => '123e4567-e89b-42d3-a456-426614174000',
    )).toBe('appointment-123e4567-e89b-42d3-a456-426614174000');
    expect(() => createAppointmentIdempotencyKey(() => 'short')).toThrow();
  });

  it('sends one stable key with metadata and never includes local file URIs', async () => {
    const create = vi.fn().mockResolvedValue(appointment);
    const upload = vi.fn().mockResolvedValue(appointment);

    await submitAppointmentWithDocuments(input, {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      create,
      upload,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[1]).toBe('appointment-123e4567-e89b-42d3-a456-426614174000');
    expect(create.mock.calls[0]?.[0].documents).toEqual(
      input.documents.map(({ fileUri: _fileUri, ...document }) => document),
    );
  });

  it('retains the created request, attempts remaining uploads, and reports retryable files', async () => {
    const create = vi.fn().mockResolvedValue(appointment);
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error('network detail must not be exposed'))
      .mockResolvedValueOnce(appointment);

    const result = submitAppointmentWithDocuments(input, {
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      create,
      upload,
    });

    await expect(result).rejects.toMatchObject({
      name: 'AppointmentCreatedWithUploadError',
      appointment,
      failedDocumentLabels: ['Birth certificate'],
    } satisfies Partial<AppointmentCreatedWithUploadError>);
    await expect(result).rejects.toThrow('Request PL-2026-0001 was saved');
    expect(upload).toHaveBeenCalledTimes(2);
  });
});

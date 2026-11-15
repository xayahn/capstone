import { beforeEach, describe, expect, it, vi } from 'vitest';

const { imagePicker, documentPicker } = vi.hoisted(() => ({
  imagePicker: {
    requestCameraPermissionsAsync: vi.fn(),
    requestMediaLibraryPermissionsAsync: vi.fn(),
    launchCameraAsync: vi.fn(),
    launchImageLibraryAsync: vi.fn(),
  },
  documentPicker: {
    getDocumentAsync: vi.fn(),
  },
}));

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-image-picker', () => imagePicker);
vi.mock('expo-document-picker', () => documentPicker);

import { dialablePhoneUri, mailtoUri } from '../src/lib/contactLinks';
import {
  MAX_DOCUMENT_BYTES,
  normalizeImagePickerAsset,
  pickFromCamera,
  pickFromDocumentFiles,
  pickFromPhotoLibrary,
} from '../src/lib/documentPicker';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('document attachment normalization and permissions', () => {
  it('normalizes iOS HEIC/camera captures into JPEG metadata matching native re-encoding', () => {
    const result = normalizeImagePickerAsset(
      {
        uri: 'file:///var/mobile/Containers/Data/Caches/ImagePicker/9F12.jpg',
        fileName: 'IMG_4821.HEIC',
        mimeType: 'image/heic',
        fileSize: 842_000,
      },
      'PSA Birth Certificate',
    );
    expect(result).toEqual({
      status: 'picked',
      file: {
        fileUri: 'file:///var/mobile/Containers/Data/Caches/ImagePicker/9F12.jpg',
        fileName: 'IMG_4821.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 842_000,
      },
    });
  });

  it('preserves PNG image captures and rejects files larger than 10 MB', () => {
    const png = normalizeImagePickerAsset({
      uri: 'file:///cache/scan.png',
      fileName: 'Baptismal Certificate Scan.png',
      mimeType: 'image/png',
      fileSize: 512_000,
    });
    expect(png).toEqual({
      status: 'picked',
      file: {
        fileUri: 'file:///cache/scan.png',
        fileName: 'Baptismal-Certificate-Scan.png',
        mimeType: 'image/png',
        sizeBytes: 512_000,
      },
    });

    const androidContentPng = normalizeImagePickerAsset({
      uri: 'content://media/external/images/media/4421',
      fileName: 'certificate-scan',
      mimeType: 'image/png',
      fileSize: 310_000,
    });
    expect(androidContentPng).toEqual({
      status: 'picked',
      file: {
        fileUri: 'content://media/external/images/media/4421',
        fileName: 'certificate-scan.png',
        mimeType: 'image/png',
        sizeBytes: 310_000,
      },
    });

    const tooLarge = normalizeImagePickerAsset({
      uri: 'file:///cache/huge.jpg',
      fileName: 'huge.jpg',
      mimeType: 'image/jpeg',
      fileSize: MAX_DOCUMENT_BYTES + 1,
    });
    expect(tooLarge).toEqual({
      status: 'error',
      message: 'Choose a photo or PDF no larger than 10 MB.',
    });
  });

  it('requests camera permission and strips EXIF metadata during capture', async () => {
    imagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
    const denied = await pickFromCamera('PSA Birth Certificate');
    expect(denied.status).toBe('error');
    expect(imagePicker.launchCameraAsync).not.toHaveBeenCalled();

    imagePicker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: true });
    imagePicker.launchCameraAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/camera-shot.jpg',
          fileName: null,
          mimeType: 'image/jpeg',
          fileSize: 420_000,
        },
      ],
    });
    const captured = await pickFromCamera('PSA Birth Certificate');
    expect(imagePicker.launchCameraAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    expect(captured).toEqual({
      status: 'picked',
      file: {
        fileUri: 'file:///cache/camera-shot.jpg',
        fileName: 'PSA-Birth-Certificate.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 420_000,
      },
    });
  });

  it('handles photo library permission denial and document picker size checks', async () => {
    imagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValueOnce({ granted: false });
    const denied = await pickFromPhotoLibrary();
    expect(denied.status).toBe('error');

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'file:///cache/big.pdf', name: 'big.pdf', mimeType: 'application/pdf', size: MAX_DOCUMENT_BYTES + 50 }],
    });
    const oversizedDoc = await pickFromDocumentFiles();
    expect(oversizedDoc.status).toBe('error');

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      canceled: false,
      assets: [{ uri: 'content://downloads/1234', name: 'baptismal-certificate.pdf', mimeType: 'application/octet-stream', size: 220_000 }],
    });
    const inferredPdf = await pickFromDocumentFiles();
    expect(inferredPdf).toEqual({
      status: 'picked',
      file: {
        fileUri: 'content://downloads/1234',
        fileName: 'baptismal-certificate.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 220_000,
      },
    });
  });
});

describe('parish directory contact link builders', () => {
  it('builds safe tel: and mailto: URIs and rejects missing or malformed contacts', () => {
    expect(dialablePhoneUri('(045) 961-2789')).toBe('tel:0459612789');
    expect(dialablePhoneUri('+63 917 555 0192')).toBe('tel:+639175550192');
    expect(dialablePhoneUri('123')).toBeNull();
    expect(dialablePhoneUri(null)).toBeNull();

    expect(mailtoUri(' cathedral.office@parishlink.org ')).toBe('mailto:cathedral.office@parishlink.org');
    expect(mailtoUri('office.cathedral@parishlink.test')).toBeNull();
    expect(mailtoUri('not-an-email')).toBeNull();
    expect(mailtoUri(undefined)).toBeNull();
  });
});

import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import type { UploadAppointmentDocumentInput } from '../types/domain';

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export type DocumentPickOutcome =
  | { status: 'picked'; file: UploadAppointmentDocumentInput }
  | { status: 'canceled' }
  | { status: 'error'; message: string };

const sanitizeStem = (raw: string | null | undefined, fallback: string): string => {
  const source = raw && raw.trim() ? raw : fallback;
  const withoutExt = source.replace(/\.[^./\\]+$/, '');
  const cleaned = withoutExt
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 72);
  return cleaned || 'requirement-photo';
};

export const normalizeImagePickerAsset = (
  asset: Pick<ImagePicker.ImagePickerAsset, 'uri' | 'fileName' | 'mimeType' | 'fileSize'>,
  fallbackStem = 'requirement-photo',
): DocumentPickOutcome => {
  if (!asset.uri) {
    return { status: 'error', message: 'The selected photo could not be read. Try again.' };
  }
  if ((asset.fileSize ?? 0) > MAX_DOCUMENT_BYTES) {
    return { status: 'error', message: 'Choose a photo or PDF no larger than 10 MB.' };
  }

  const cleanUri = asset.uri.split(/[?#]/, 1)[0]?.toLowerCase() ?? '';
  const cleanName = asset.fileName?.toLowerCase().trim() ?? '';
  const declaredMime = asset.mimeType?.toLowerCase().trim() ?? '';

  if (Platform.OS === 'web' && declaredMime && declaredMime !== 'image/jpeg' && declaredMime !== 'image/png') {
    return { status: 'error', message: 'Please choose a clear JPG, PNG, or PDF file.' };
  }

  const isPng = cleanUri.endsWith('.png') || cleanName.endsWith('.png') || declaredMime === 'image/png';
  const mimeType = isPng ? 'image/png' : 'image/jpeg';
  const extension = isPng ? '.png' : '.jpg';
  const stem = sanitizeStem(asset.fileName, fallbackStem);

  return {
    status: 'picked',
    file: {
      fileUri: asset.uri,
      fileName: `${stem}${extension}`,
      mimeType,
      ...(asset.fileSize === undefined ? {} : { sizeBytes: asset.fileSize }),
    },
  };
};

export const pickFromCamera = async (fallbackStem = 'certificate-photo'): Promise<DocumentPickOutcome> => {
  try {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        return {
          status: 'error',
          message:
            'Camera access is turned off. Enable Camera permission in Settings, or choose Photo library or Browse PDF.',
        };
      }
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
    });
    if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };
    return normalizeImagePickerAsset(result.assets[0], fallbackStem);
  } catch {
    return {
      status: 'error',
      message: 'The camera could not open on this device. Choose Photo library or Browse PDF instead.',
    };
  }
};

export const pickFromPhotoLibrary = async (fallbackStem = 'certificate-photo'): Promise<DocumentPickOutcome> => {
  try {
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return {
          status: 'error',
          message:
            'Photo library access is turned off. Enable Photos permission in Settings, or browse for a PDF file.',
        };
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      exif: false,
      allowsMultipleSelection: false,
    });
    if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };
    return normalizeImagePickerAsset(result.assets[0], fallbackStem);
  } catch {
    return {
      status: 'error',
      message: 'The photo library could not open. Check device permissions and try again.',
    };
  }
};

const inferDocumentMimeType = (name: string, declaredMime?: string | null): string | null => {
  const normalizedMime = declaredMime?.toLowerCase().trim() ?? '';
  if (normalizedMime === 'application/pdf' || normalizedMime === 'image/jpeg' || normalizedMime === 'image/png') {
    return normalizedMime;
  }
  if (normalizedMime === 'image/jpg') return 'image/jpeg';
  if (normalizedMime && normalizedMime !== 'application/octet-stream') {
    return null;
  }
  const lowerName = name.toLowerCase().trim();
  if (lowerName.endsWith('.pdf')) return 'application/pdf';
  if (lowerName.endsWith('.png')) return 'image/png';
  if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) return 'image/jpeg';
  return null;
};

export const pickFromDocumentFiles = async (): Promise<DocumentPickOutcome> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) return { status: 'canceled' };
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) {
      return { status: 'error', message: 'Choose a PDF, JPG, or PNG file no larger than 10 MB.' };
    }
    const resolvedMime = inferDocumentMimeType(asset.name, asset.mimeType);
    if (!resolvedMime) {
      return { status: 'error', message: 'Please choose a PDF, JPG, or PNG file.' };
    }
    return {
      status: 'picked',
      file: {
        fileUri: asset.uri,
        fileName: asset.name,
        mimeType: resolvedMime,
        ...(asset.size === undefined ? {} : { sizeBytes: asset.size }),
      },
    };
  } catch {
    return {
      status: 'error',
      message: 'The file browser could not open. Check device permissions and try again.',
    };
  }
};

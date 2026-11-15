import { useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  pickFromCamera,
  pickFromDocumentFiles,
  pickFromPhotoLibrary,
  type DocumentPickOutcome,
} from '../lib/documentPicker';
import { colors, fonts, radii, spacing } from '../theme';
import type { UploadAppointmentDocumentInput } from '../types/domain';
import { AppButton } from './ui';

export interface DocumentAttachmentControlsProps {
  triggerLabel: string;
  requirementLabel: string;
  loading?: boolean;
  disabled?: boolean;
  onPicked: (file: UploadAppointmentDocumentInput) => void | Promise<void>;
  onError: (message: string) => void;
}

type PickingSource = 'camera' | 'library' | 'file' | null;

export const DocumentAttachmentControls = ({
  triggerLabel,
  requirementLabel,
  loading = false,
  disabled = false,
  onPicked,
  onError,
}: DocumentAttachmentControlsProps) => {
  const [expanded, setExpanded] = useState(false);
  const [pickingSource, setPickingSource] = useState<PickingSource>(null);
  const busy = pickingSource !== null;

  const handlePick = async (source: Exclude<PickingSource, null>, runner: () => Promise<DocumentPickOutcome>) => {
    if (busy || disabled || loading) return;
    onError('');
    setPickingSource(source);
    try {
      const outcome = await runner();
      if (outcome.status === 'error') {
        onError(outcome.message);
        return;
      }
      if (outcome.status === 'picked') {
        setExpanded(false);
        await onPicked(outcome.file);
      }
    } finally {
      setPickingSource(null);
    }
  };

  if (!expanded) {
    return (
      <AppButton
        label={triggerLabel}
        icon="cloud-upload-outline"
        variant="secondary"
        loading={loading}
        disabled={disabled || busy}
        accessibilityLabel={`${triggerLabel} for ${requirementLabel}`}
        onPress={() => {
          onError('');
          setExpanded(true);
        }}
      />
    );
  }

  return (
    <View style={styles.sheet} accessibilityLabel={`Attachment options for ${requirementLabel}`}>
      <Text style={styles.sheetTitle}>How would you like to attach this document?</Text>
      {Platform.OS === 'web' ? (
        <AppButton
          label="Choose PDF, JPG, or PNG file"
          icon="document-attach-outline"
          variant="primary"
          loading={pickingSource === 'file'}
          disabled={disabled || loading || busy}
          onPress={() => void handlePick('file', pickFromDocumentFiles)}
        />
      ) : (
        <>
          <AppButton
            label="Take photo with camera"
            icon="camera-outline"
            variant="primary"
            loading={pickingSource === 'camera'}
            disabled={disabled || loading || busy}
            onPress={() => void handlePick('camera', () => pickFromCamera(requirementLabel))}
          />
          <AppButton
            label="Choose from photo library"
            icon="images-outline"
            variant="secondary"
            loading={pickingSource === 'library'}
            disabled={disabled || loading || busy}
            onPress={() => void handlePick('library', () => pickFromPhotoLibrary(requirementLabel))}
          />
          <AppButton
            label="Browse PDF or file"
            icon="document-attach-outline"
            variant="secondary"
            loading={pickingSource === 'file'}
            disabled={disabled || loading || busy}
            onPress={() => void handlePick('file', pickFromDocumentFiles)}
          />
        </>
      )}
      <AppButton
        label="Cancel"
        variant="ghost"
        disabled={busy || loading}
        onPress={() => setExpanded(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.paperLight,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: spacing.xs,
    marginTop: spacing.xs,
    padding: spacing.sm,
    width: '100%',
  },
  sheetTitle: {
    color: colors.ink,
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 2,
  },
});

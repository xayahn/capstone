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

export const DocumentAttachmentControls = ({
  triggerLabel,
  requirementLabel,
  loading = false,
  disabled = false,
  onPicked,
  onError,
}: DocumentAttachmentControlsProps) => {
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);

  const handlePick = async (runner: () => Promise<DocumentPickOutcome>) => {
    if (picking || disabled || loading) return;
    onError('');
    setPicking(true);
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
      setPicking(false);
    }
  };

  if (!expanded) {
    return (
      <AppButton
        label={triggerLabel}
        icon="cloud-upload-outline"
        variant="secondary"
        loading={loading}
        disabled={disabled || picking}
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
      {Platform.OS !== 'web' ? (
        <AppButton
          label="Take photo with camera"
          icon="camera-outline"
          variant="primary"
          loading={picking}
          disabled={disabled || loading}
          onPress={() => void handlePick(() => pickFromCamera(requirementLabel))}
        />
      ) : null}
      <AppButton
        label="Choose from photo library"
        icon="images-outline"
        variant="secondary"
        loading={picking}
        disabled={disabled || loading}
        onPress={() => void handlePick(() => pickFromPhotoLibrary(requirementLabel))}
      />
      <AppButton
        label="Browse PDF or file"
        icon="document-attach-outline"
        variant="secondary"
        loading={picking}
        disabled={disabled || loading}
        onPress={() => void handlePick(pickFromDocumentFiles)}
      />
      <AppButton
        label="Cancel"
        variant="ghost"
        disabled={picking || loading}
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

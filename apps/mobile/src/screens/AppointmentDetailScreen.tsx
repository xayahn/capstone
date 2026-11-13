import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppointmentChangesPanel } from '../components/AppointmentChangesPanel';
import { serviceIcons } from '../components/AppointmentCard';
import {
  AppButton,
  Card,
  Divider,
  IconTile,
  InfoRow,
  Notice,
  Screen,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import { getParish, getService } from '../data/catalog';
import { formatDate } from '../lib/scheduling';
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  documentStatusLabel,
  documentStatusTone,
  getAppointmentTimeline,
  summarizeDocuments,
} from '../lib/status';
import { colors, fonts, spacing } from '../theme';
import type {
  Appointment,
  AppointmentDocument,
  AvailabilitySearchInput,
  AvailabilitySlot,
  RescheduleInput,
  UploadAppointmentDocumentInput,
} from '../types/domain';

export interface AppointmentDetailScreenProps {
  appointment: Appointment;
  onUpload: (
    appointmentId: string,
    documentId: string,
    input: UploadAppointmentDocumentInput,
  ) => Promise<Appointment>;
  onSearchAvailability: (input: AvailabilitySearchInput) => Promise<AvailabilitySlot[]>;
  onCancel: (appointmentId: string, reason: string) => Promise<Appointment>;
  onReschedule: (appointmentId: string, input: RescheduleInput) => Promise<Appointment>;
  onWithdraw: (appointmentId: string) => Promise<Appointment>;
}

export const AppointmentDetailScreen = ({
  appointment,
  onUpload,
  onSearchAvailability,
  onCancel,
  onReschedule,
  onWithdraw,
}: AppointmentDetailScreenProps) => {
  const service = getService(appointment.serviceId)!;
  const parish = getParish(appointment.parishId)!;
  const clergy = parish.clergy.find((item) => item.id === appointment.clergyId);
  const summary = summarizeDocuments(appointment.documents);
  const timeline = getAppointmentTimeline(appointment.status);
  const [uploadingDocumentId, setUploadingDocumentId] = useState('');
  const [localError, setLocalError] = useState('');

  const retryUpload = async (document: AppointmentDocument) => {
    setLocalError('');
    let input: UploadAppointmentDocumentInput | undefined;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024) {
        setLocalError('Choose a PDF, JPG, or PNG file no larger than 10 MB.');
        return;
      }
      input = {
        fileUri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        ...(asset.size === undefined ? {} : { sizeBytes: asset.size }),
      };
    } catch {
      setLocalError('The document picker could not open. Check the device permission and try again.');
      return;
    }

    setUploadingDocumentId(document.id);
    try {
      await onUpload(appointment.id, document.id, input);
    } catch {
      // The shared repository error is displayed above the screen.
    } finally {
      setUploadingDocumentId('');
    }
  };

  return (
    <Screen>
      <Card style={styles.detailHero}>
        <View style={styles.rowBetweenTop}>
          <IconTile name={serviceIcons[appointment.serviceId]} />
          <StatusBadge
            label={appointmentStatusLabel[appointment.status]}
            tone={appointmentStatusTone[appointment.status]}
          />
        </View>
        <Text style={styles.detailTitle}>{service.name}</Text>
        <Text style={styles.reference}>{appointment.reference}</Text>
        <Divider />
        <InfoRow icon="calendar-outline" text={`${formatDate(appointment.date)} • ${appointment.time}`} />
        <InfoRow icon="location-outline" text={parish.name} />
        <InfoRow icon="person-outline" text={clergy?.name ?? 'Assigned clergy'} />
      </Card>

      <AppointmentChangesPanel
        appointment={appointment}
        onSearchAvailability={onSearchAvailability}
        onCancel={onCancel}
        onReschedule={onReschedule}
        onWithdraw={onWithdraw}
      />

      <SectionTitle>Progress</SectionTitle>
      <Card>
        {timeline.map((item, index) => (
          <View key={item.key} style={styles.timelineRow}>
            <View style={styles.timelineTrack}>
              <View
                style={[
                  styles.timelineDot,
                  item.state === 'complete' && styles.timelineDotComplete,
                  item.state === 'current' && styles.timelineDotCurrent,
                  item.state === 'stopped' && styles.timelineDotStopped,
                ]}
              >
                <Ionicons
                  name={item.state === 'complete' ? 'checkmark' : item.state === 'stopped' ? 'close' : 'ellipse'}
                  size={12}
                  color={item.state === 'upcoming' ? colors.inkSoft : colors.card}
                />
              </View>
              {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
            </View>
            <View style={styles.timelineCopy}>
              <Text style={[styles.itemTitle, item.state === 'upcoming' && styles.timelineUpcoming]}>{item.label}</Text>
              <Text style={styles.mutedText}>{item.description}</Text>
            </View>
          </View>
        ))}
      </Card>

      <SectionTitle>Documents</SectionTitle>
      <Card>
        <Notice
          title={`${summary.verified} of ${summary.total} staff verified`}
          body={`${summary.requiredReady} of ${summary.requiredTotal} required files have been submitted or reviewed.`}
          tone={summary.requiredReady === summary.requiredTotal ? 'positive' : 'warning'}
          icon="documents-outline"
        />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        {appointment.documents.map((document) => (
          <View key={document.id} style={styles.detailDocumentBlock}>
            <View style={styles.detailDocumentRow}>
              <Ionicons
                name={document.status === 'verified' ? 'checkmark-circle' : document.status === 'needs_action' ? 'alert-circle' : 'document-text-outline'}
                size={22}
                color={document.status === 'verified' ? colors.green : document.status === 'needs_action' ? colors.red : colors.gold}
              />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{document.label}</Text>
                <Text style={styles.mutedText}>{document.fileName ?? 'No file on record'}</Text>
                {document.note ? <Text style={styles.documentNote}>{document.note}</Text> : null}
              </View>
              <StatusBadge label={documentStatusLabel[document.status]} tone={documentStatusTone[document.status]} />
            </View>
            {['missing', 'needs_action'].includes(document.status) ? (
              <AppButton
                label={document.status === 'needs_action' ? 'Replace file' : 'Upload file'}
                icon="cloud-upload-outline"
                variant="secondary"
                loading={uploadingDocumentId === document.id}
                disabled={Boolean(uploadingDocumentId)}
                onPress={() => void retryUpload(document)}
              />
            ) : null}
          </View>
        ))}
      </Card>
      <Notice
        title="Need clarification?"
        body="Contact the parish office for official decisions, schedule changes, or documentary questions."
        tone="info"
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  rowBetweenTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  detailHero: { gap: spacing.xs },
  detailTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 30, marginTop: spacing.sm },
  reference: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineTrack: { alignItems: 'center', width: 24 },
  timelineDot: { alignItems: 'center', backgroundColor: colors.line, borderRadius: 12, height: 24, justifyContent: 'center', width: 24 },
  timelineDotComplete: { backgroundColor: colors.green },
  timelineDotCurrent: { backgroundColor: colors.oxblood },
  timelineDotStopped: { backgroundColor: colors.red },
  timelineLine: { backgroundColor: colors.line, flex: 1, minHeight: 36, width: 2 },
  timelineCopy: { flex: 1, paddingBottom: spacing.lg },
  timelineUpcoming: { color: colors.inkSoft },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  detailDocumentBlock: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingBottom: spacing.md },
  detailDocumentRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.md },
  documentNote: { color: colors.oxblood, fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 18 },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 20 },
});

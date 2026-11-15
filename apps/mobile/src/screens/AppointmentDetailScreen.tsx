import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppointmentChangesPanel } from '../components/AppointmentChangesPanel';
import { serviceIcons } from '../components/AppointmentCard';
import { DocumentAttachmentControls } from '../components/DocumentAttachmentControls';
import {
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
  const service = getService(appointment.serviceId);
  const parish = getParish(appointment.parishId);
  const clergy = parish?.clergy.find((item) => item.id === appointment.clergyId);
  const canUploadDocuments = ['submitted', 'pending_verification', 'needs_action'].includes(appointment.status);
  const summary = summarizeDocuments(appointment.documents);
  const timeline = getAppointmentTimeline(appointment.status);
  const [uploadingDocumentId, setUploadingDocumentId] = useState('');
  const [localError, setLocalError] = useState('');

  const namedParticipants = (appointment.participants ?? [])
    .filter((participant) => participant.type !== 'requester')
    .map((participant) => participant.fullName);

  const uploadPickedDocument = async (documentId: string, input: UploadAppointmentDocumentInput) => {
    setLocalError('');
    setUploadingDocumentId(documentId);
    try {
      await onUpload(appointment.id, documentId, input);
    } catch {
      // The shared repository error is displayed above the screen.
    } finally {
      setUploadingDocumentId('');
    }
  };

  return (
    <Screen keyboard>
      <Card style={styles.detailHero}>
        <View style={styles.rowBetweenTop}>
          <IconTile name={serviceIcons[appointment.serviceId] ?? 'calendar-outline'} />
          <StatusBadge
            label={appointmentStatusLabel[appointment.status]}
            tone={appointmentStatusTone[appointment.status]}
          />
        </View>
        <Text style={styles.detailTitle}>{service?.name ?? 'Sacramental request'}</Text>
        <Text style={styles.reference}>{appointment.reference}</Text>
        <Divider />
        <InfoRow icon="calendar-outline" text={`${formatDate(appointment.date)} • ${appointment.time}`} />
        <InfoRow icon="location-outline" text={parish?.name ?? 'Parish office'} />
        <InfoRow icon="person-outline" text={clergy?.name ?? 'Assigned clergy'} />
        {namedParticipants.length > 0 ? (
          <InfoRow icon="people-outline" text={`Participants: ${namedParticipants.join(' • ')}`} />
        ) : null}
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
            {canUploadDocuments && ['missing', 'needs_action'].includes(document.status) ? (
              <DocumentAttachmentControls
                triggerLabel={document.status === 'needs_action' ? 'Replace document' : 'Upload document'}
                requirementLabel={document.label}
                loading={uploadingDocumentId === document.id}
                disabled={Boolean(uploadingDocumentId)}
                onPicked={(file) => uploadPickedDocument(document.id, file)}
                onError={setLocalError}
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
  detailTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 32, marginTop: spacing.sm },
  reference: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.5 },
  timelineRow: { flexDirection: 'row', gap: spacing.sm },
  timelineTrack: { alignItems: 'center', width: 28 },
  timelineDot: { alignItems: 'center', backgroundColor: colors.line, borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  timelineDotComplete: { backgroundColor: colors.green },
  timelineDotCurrent: { backgroundColor: colors.oxblood },
  timelineDotStopped: { backgroundColor: colors.red },
  timelineLine: { backgroundColor: colors.line, flex: 1, minHeight: 36, width: 2 },
  timelineCopy: { flex: 1, paddingBottom: spacing.lg },
  timelineUpcoming: { color: colors.inkSoft },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  detailDocumentBlock: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.xs, paddingBottom: spacing.md },
  detailDocumentRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.md },
  documentNote: { color: colors.oxblood, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 22 },
});

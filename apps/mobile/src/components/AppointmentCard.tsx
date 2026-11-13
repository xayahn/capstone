import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Divider, IconTile, InfoRow, StatusBadge } from './ui';
import { getParish, getService } from '../data/catalog';
import { formatDate } from '../lib/scheduling';
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  summarizeDocuments,
} from '../lib/status';
import { colors, fonts, spacing } from '../theme';
import type { Appointment, SacramentId } from '../types/domain';

export const serviceIcons: Record<SacramentId, keyof typeof Ionicons.glyphMap> = {
  baptism: 'water-outline',
  wedding: 'heart-outline',
  confirmation: 'shield-checkmark-outline',
  first_communion: 'sunny-outline',
  funeral: 'flame-outline',
};

export interface AppointmentCardProps {
  appointment: Appointment;
  onPress: () => void;
}

export const AppointmentCard = ({ appointment, onPress }: AppointmentCardProps) => {
  const service = getService(appointment.serviceId);
  const parish = getParish(appointment.parishId);
  const documents = summarizeDocuments(appointment.documents);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${service?.name ?? 'service'} appointment ${appointment.reference}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.cardPressed}
    >
      <Card style={styles.appointmentCard}>
        <View style={styles.rowBetweenTop}>
          <View style={styles.serviceHeaderCompact}>
            <IconTile name={serviceIcons[appointment.serviceId]} />
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{service?.name}</Text>
              <Text style={styles.reference}>{appointment.reference}</Text>
            </View>
          </View>
          <StatusBadge
            label={appointmentStatusLabel[appointment.status]}
            tone={appointmentStatusTone[appointment.status]}
          />
        </View>
        <Divider />
        <InfoRow icon="calendar-outline" text={`${formatDate(appointment.date)} • ${appointment.time}`} />
        <InfoRow icon="location-outline" text={parish?.name ?? 'Parish'} />
        <InfoRow icon="documents-outline" text={`${documents.submitted}/${documents.total} submitted • ${documents.verified} staff verified`} />
        {appointment.pendingChange ? (
          <InfoRow
            icon="time-outline"
            text={appointment.pendingChange.kind === 'reschedule'
              ? `Reschedule requested (${appointment.pendingChange.proposedDate ? formatDate(appointment.pendingChange.proposedDate, true) : 'new date'} ${appointment.pendingChange.proposedTime ?? ''})`.trim()
              : 'Cancellation requested — awaiting parish confirmation'}
          />
        ) : null}
        <View style={styles.inlineLink}>
          <Text style={styles.inlineLinkText}>View progress</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.oxblood} />
        </View>
      </Card>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
  appointmentCard: { gap: spacing.xs, marginBottom: spacing.md },
  rowBetweenTop: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  serviceHeaderCompact: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  reference: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 13.5, letterSpacing: 0.5 },
  inlineLink: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: spacing.xxs, marginTop: spacing.xs },
  inlineLinkText: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 15 },
});

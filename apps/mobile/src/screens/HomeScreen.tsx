import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppointmentCard } from '../components/AppointmentCard';
import {
  AppButton,
  Card,
  EmptyCard,
  Eyebrow,
  IconTile,
  Notice,
  QuickAction,
  Screen,
  SectionTitle,
  StatusBadge,
} from '../components/ui';
import { getService } from '../data/catalog';
import { appointmentStart } from '../lib/changePolicy';
import { formatDate } from '../lib/scheduling';
import { colors, fonts, radii, shadow, spacing } from '../theme';
import type { RepositorySnapshot, SacramentId } from '../types/domain';

export interface HomeScreenProps {
  snapshot: RepositorySnapshot;
  onBook: (service: SacramentId) => void;
  onServices: () => void;
  onAppointment: (id: string) => void;
  onAnnouncements: () => void;
  onParishes: () => void;
  onQueue: () => void;
  onAssistant: () => void;
}

type HomeReminderItem = {
  id: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  appointmentId?: string;
};

const buildHomeReminders = (snapshot: RepositorySnapshot, now: Date = new Date()): HomeReminderItem[] => {
  const items: HomeReminderItem[] = [];
  const coveredAppointments = new Set<string>();

  for (const notice of snapshot.notifications) {
    if (notice.readAt || notice.target.kind !== 'appointment') continue;
    if (!/tomorrow|upcoming|documents|attention|reschedule|cancellation/i.test(notice.title)) continue;
    if (coveredAppointments.has(notice.target.appointmentId)) continue;
    coveredAppointments.add(notice.target.appointmentId);
    items.push({
      id: notice.id,
      title: notice.title,
      body: notice.body,
      icon: /document|attention/i.test(notice.title) ? 'documents-outline' : 'alarm-outline',
      appointmentId: notice.target.appointmentId,
    });
    if (items.length >= 2) return items;
  }

  for (const appointment of snapshot.appointments) {
    if (items.length >= 2) break;
    if (['completed', 'cancelled', 'rejected'].includes(appointment.status)) continue;
    if (coveredAppointments.has(appointment.id)) continue;
    const start = appointmentStart(appointment);
    const msUntil = start ? start.getTime() - now.getTime() : -1;
    if (msUntil <= 0) continue;
    const serviceName = getService(appointment.serviceId)?.name ?? 'Appointment';
    const missing = appointment.documents.filter((doc) => doc.required && (doc.status === 'missing' || doc.status === 'needs_action')).length;
    if (missing > 0) {
      coveredAppointments.add(appointment.id);
      items.push({
        id: `home-doc-${appointment.id}`,
        title: `${missing} required ${missing === 1 ? 'document needs' : 'documents need'} attention`,
        body: `Upload or replace the remaining requirement for ${serviceName} (${appointment.reference}) so parish staff can continue review.`,
        icon: 'documents-outline',
        appointmentId: appointment.id,
      });
    } else if (msUntil <= 72 * 3_600_000) {
      coveredAppointments.add(appointment.id);
      items.push({
        id: `home-soon-${appointment.id}`,
        title: msUntil <= 24 * 3_600_000 ? 'Appointment within 24 hours' : 'Upcoming appointment in 3 days',
        body: `${serviceName} (${appointment.reference}) is scheduled for ${formatDate(appointment.date, true)} at ${appointment.time}. Bring original certificates if requested.`,
        icon: 'alarm-outline',
        appointmentId: appointment.id,
      });
    } else if (appointment.pendingChange) {
      coveredAppointments.add(appointment.id);
      items.push({
        id: `home-change-${appointment.id}`,
        title: appointment.pendingChange.kind === 'reschedule' ? 'Reschedule request pending' : 'Cancellation request pending',
        body: `Your request for ${appointment.reference} is waiting for parish review. Your current schedule stays active until decided.`,
        icon: 'time-outline',
        appointmentId: appointment.id,
      });
    }
  }

  return items;
};

export const HomeScreen = ({
  snapshot,
  onBook,
  onServices,
  onAppointment,
  onAnnouncements,
  onParishes,
  onQueue,
  onAssistant,
}: HomeScreenProps) => {
  const nextAppointment = snapshot.appointments.find((item) => !['completed', 'cancelled', 'rejected'].includes(item.status));
  const reminders = buildHomeReminders(snapshot);
  const recentAnnouncements = (snapshot.announcements ?? []).slice(0, 2);

  return (
    <Screen>
      {snapshot.source === 'demo' ? (
        <Notice
          title="Demonstration mode"
          body="All people, records, schedules, and ticket numbers shown here are samples stored on this device."
          tone="warning"
          icon="flask-outline"
        />
      ) : null}
      <LinearGradient colors={[colors.oxblood, colors.leather]} style={styles.heroCard}>
        <Eyebrow light>Good day, {snapshot.profile.displayName.split(' ')[0]}</Eyebrow>
        <Text style={styles.heroTitle}>How may your parish help?</Text>
        <Text style={styles.heroBody}>Prepare a sacramental service request, review its progress, or plan a parish office visit.</Text>
        <AppButton label="Explore services" icon="calendar-outline" variant="secondary" onPress={onServices} />
      </LinearGradient>

      <SectionTitle>Quick actions</SectionTitle>
      <View style={styles.actionGrid}>
        <QuickAction icon="water-outline" label="Baptism" onPress={() => onBook('baptism')} />
        <QuickAction icon="heart-outline" label="Wedding" onPress={() => onBook('wedding')} />
        <QuickAction icon="people-outline" label="Walk-in queue" onPress={onQueue} />
        <QuickAction icon="sparkles-outline" label="AI Assistant" onPress={onAssistant} />
        <QuickAction icon="megaphone-outline" label="Announcements" onPress={onAnnouncements} />
        <QuickAction icon="business-outline" label="Parishes & hours" onPress={onParishes} />
      </View>

      <SectionTitle>Your next step</SectionTitle>
      {nextAppointment ? (
        <AppointmentCard appointment={nextAppointment} onPress={() => onAppointment(nextAppointment.id)} />
      ) : (
        <EmptyCard title="No active requests" body="Choose a sacramental service when you are ready to begin." />
      )}

      {snapshot.activeQueueTicket ? (
        <>
          <SectionTitle>Walk-in ticket</SectionTitle>
          <Card>
            <View style={styles.rowBetween}>
              <View>
                <Eyebrow>Now waiting</Eyebrow>
                <Text style={styles.ticketNumber}>{snapshot.activeQueueTicket.number}</Text>
              </View>
              <StatusBadge label={`${snapshot.activeQueueTicket.ahead} ahead`} tone="warning" />
            </View>
            <Text style={styles.mutedText}>
              {snapshot.activeQueueTicket.estimatedWaitMinutes === null
                ? 'A wait estimate will appear after this parish has enough recent completed tickets.'
                : `Measured wait: about ${snapshot.activeQueueTicket.estimatedWaitMinutes} minutes. This estimate can change as staff serve visitors.`}
            </Text>
            <AppButton label="View ticket" variant="secondary" onPress={onQueue} />
          </Card>
        </>
      ) : null}

      <SectionTitle>{reminders.length > 1 ? 'Parish reminders' : 'Parish reminder'}</SectionTitle>
      {reminders.length ? (
        reminders.map((reminder) => (
          <Pressable
            key={reminder.id}
            accessibilityRole={reminder.appointmentId ? 'button' : undefined}
            accessibilityLabel={reminder.title}
            disabled={!reminder.appointmentId}
            onPress={() => {
              if (reminder.appointmentId) onAppointment(reminder.appointmentId);
            }}
            style={({ pressed }) => pressed && reminder.appointmentId ? styles.cardPressed : undefined}
          >
            <Card style={styles.reminderCard}>
              <IconTile name={reminder.icon} />
              <View style={styles.flex}>
                <Text style={styles.itemTitle}>{reminder.title}</Text>
                <Text style={styles.mutedText}>{reminder.body}</Text>
              </View>
              {reminder.appointmentId ? <Ionicons name="chevron-forward" size={18} color={colors.oxblood} /> : null}
            </Card>
          </Pressable>
        ))
      ) : (
        <Card style={styles.reminderCard}>
          <IconTile name="information-circle-outline" />
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>Bring original documents when requested</Text>
            <Text style={styles.mutedText}>
              An uploaded copy helps with preparation but does not replace parish staff verification or official church records.
            </Text>
          </View>
        </Card>
      )}

      <SectionTitle
        action={(
          <Pressable accessibilityRole="button" accessibilityLabel="View all announcements" onPress={onAnnouncements} style={styles.sectionAction}>
            <Text style={styles.inlineLinkText}>View all</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.oxblood} />
          </Pressable>
        )}
      >
        Announcements
      </SectionTitle>
      {recentAnnouncements.length ? (
        recentAnnouncements.map((notice) => (
          <Pressable
            key={notice.id}
            accessibilityRole="button"
            accessibilityLabel={`Announcement: ${notice.title}`}
            onPress={onAnnouncements}
            style={({ pressed }) => pressed && styles.cardPressed}
          >
            <Card style={styles.announcementPreview}>
              <View style={styles.rowBetween}>
                <Text style={styles.reference}>{notice.parishName}</Text>
                <StatusBadge label={notice.scope === 'vicariate' ? 'Vicariate' : 'Parish'} tone={notice.scope === 'vicariate' ? 'info' : 'positive'} />
              </View>
              <Text style={styles.itemTitle}>{notice.title}</Text>
              <Text numberOfLines={3} style={styles.mutedText}>{notice.body}</Text>
            </Card>
          </Pressable>
        ))
      ) : (
        <EmptyCard title="No current notices" body="Published parish and Vicariate announcements will appear here." />
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
  heroCard: { borderColor: colors.gold, borderRadius: radii.lg, borderWidth: 1, gap: spacing.sm, padding: spacing.xl, ...shadow },
  heroTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 38 },
  heroBody: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 15, lineHeight: 23, marginBottom: spacing.sm },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  rowBetween: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  reminderCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xs },
  announcementPreview: { gap: spacing.xs, marginBottom: spacing.xs },
  sectionAction: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: spacing.xxs },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  reference: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  ticketNumber: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 32, flexShrink: 1, maxWidth: '100%' },
  inlineLinkText: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 14 },
});

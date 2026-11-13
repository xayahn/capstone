import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, EmptyCard, Screen } from '../components/ui';
import { colors, fonts, spacing } from '../theme';
import type { AppNotification } from '../types/domain';

export interface NotificationsScreenProps {
  notifications: AppNotification[];
  onOpen: (notification: AppNotification) => Promise<void>;
}

export const formatRelativeTime = (iso: string) => {
  const milliseconds = Date.now() - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

export const NotificationsScreen = ({ notifications, onOpen }: NotificationsScreenProps) => (
  <Screen>
    <Text style={styles.lead}>Open a notice to mark it read and go to the related area.</Text>
    {notifications.length ? (
      notifications.map((notification) => (
        <Pressable
          key={notification.id}
          accessibilityRole="button"
          accessibilityLabel={`${notification.readAt ? 'Read' : 'Unread'} notification: ${notification.title}`}
          onPress={() => void onOpen(notification).catch(() => undefined)}
          style={({ pressed }) => pressed && styles.cardPressed}
        >
          <Card style={[styles.notificationCard, !notification.readAt && styles.notificationUnread]}>
            <View style={[styles.notificationDot, notification.readAt && styles.notificationDotRead]} />
            <View style={styles.flex}>
              <View style={styles.notificationTitleRow}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.noticeTime}>{formatRelativeTime(notification.createdAt)}</Text>
              </View>
              <Text style={styles.mutedText}>{notification.body}</Text>
            </View>
          </Card>
        </Pressable>
      ))
    ) : (
      <EmptyCard title="No notifications" body="Appointment, document, and queue updates will appear here." />
    )}
  </Screen>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardPressed: { opacity: 0.7, transform: [{ scale: 0.995 }] },
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  notificationCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  notificationTitleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  notificationTitle: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22, minWidth: 0 },
  notificationUnread: { backgroundColor: colors.cardStrong, borderColor: colors.gold },
  notificationDot: { backgroundColor: colors.oxblood, borderRadius: 5, height: 10, marginTop: 5, width: 10 },
  notificationDotRead: { backgroundColor: colors.line },
  noticeTime: { color: colors.inkSoft, fontFamily: fonts.bodyMedium, fontSize: 12 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
});

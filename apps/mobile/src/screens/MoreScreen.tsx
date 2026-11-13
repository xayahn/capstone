import { StyleSheet, Text, View } from 'react-native';
import { Card, MoreLink, Notice, Screen, StatusBadge } from '../components/ui';
import { getParish } from '../data/catalog';
import { colors, fonts, radii, spacing } from '../theme';
import type { RepositorySnapshot } from '../types/domain';

export type RouteTarget =
  | 'home'
  | 'services'
  | 'appointments'
  | 'more'
  | 'booking'
  | 'appointment-detail'
  | 'notifications'
  | 'announcements'
  | 'parishes'
  | 'queue'
  | 'assistant'
  | 'profile';

export interface MoreScreenProps {
  snapshot: RepositorySnapshot;
  mode: 'demo' | 'api';
  onNavigate: (route: RouteTarget) => void;
}

export const initials = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

export const MoreScreen = ({ snapshot, mode, onNavigate }: MoreScreenProps) => (
  <Screen>
    <Card style={styles.profileSummary}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(snapshot.profile.displayName)}</Text>
      </View>
      <View style={styles.flex}>
        <Text style={styles.itemTitle}>{snapshot.profile.displayName}</Text>
        <Text style={styles.mutedText}>{getParish(snapshot.profile.homeParishId)?.name}</Text>
      </View>
      <StatusBadge label={mode === 'demo' ? 'Demo' : 'Connected'} tone={mode === 'demo' ? 'warning' : 'positive'} />
    </Card>
    <MoreLink
      icon="notifications-outline"
      title="Notifications"
      body={`${snapshot.notifications.filter((item) => !item.readAt).length} unread updates`}
      onPress={() => onNavigate('notifications')}
    />
    <MoreLink
      icon="megaphone-outline"
      title="Announcements"
      body={`${(snapshot.announcements ?? []).length} published parish & Vicariate notices`}
      onPress={() => onNavigate('announcements')}
    />
    <MoreLink
      icon="business-outline"
      title="Parishes & office hours"
      body="Eight parishes, clergy directory, and published contact info"
      onPress={() => onNavigate('parishes')}
    />
    <MoreLink
      icon="people-outline"
      title="Walk-in queue"
      body={snapshot.activeQueueTicket ? `Active ticket ${snapshot.activeQueueTicket.number}` : 'Request a parish office ticket'}
      onPress={() => onNavigate('queue')}
    />
    <MoreLink
      icon="sparkles-outline"
      title="AI Assistant & guide"
      body="Gemini-powered public guidance and local request help"
      onPress={() => onNavigate('assistant')}
    />
    <MoreLink
      icon="person-circle-outline"
      title="Profile & settings"
      body="Contact details, home parish, and preferences"
      onPress={() => onNavigate('profile')}
    />
    <Notice
      title="Parishioner-only mobile app"
      body="Staff, clergy, and system-administration functions belong in the protected admin website, not this mobile interface."
      tone="info"
      icon="lock-closed-outline"
    />
  </Screen>
);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  profileSummary: { alignItems: 'center', flexDirection: 'row', gap: spacing.md },
  avatar: {
    alignItems: 'center',
    backgroundColor: colors.oxblood,
    borderColor: colors.gold,
    borderRadius: 28,
    borderWidth: 2,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  avatarText: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 20 },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
});

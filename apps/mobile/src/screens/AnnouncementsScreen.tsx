import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  Card,
  ChoiceChip,
  Divider,
  Eyebrow,
  IconTile,
  Notice,
  StatusBadge,
} from '../components/ui';
import { getParish } from '../data/catalog';
import { colors, fonts, spacing, type } from '../theme';
import type { ParishAnnouncement, ParishId } from '../types/domain';

type ScopeFilter = 'all' | 'parish' | 'vicariate';

const formatPublishedDate = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Published recently';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  }).format(parsed);
};

export const AnnouncementsScreen = ({
  announcements,
  homeParishId,
}: {
  announcements: ParishAnnouncement[];
  homeParishId: ParishId;
}) => {
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState<ScopeFilter>('all');
  const homeParishName = getParish(homeParishId)?.name ?? 'My parish';

  const visible = useMemo(() => {
    if (filter === 'all') return announcements;
    return announcements.filter((item) => item.scope === filter);
  }, [announcements, filter]);

  return (
    <ScrollView
      contentContainerStyle={[styles.screenScroll, width > 720 && styles.screenScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Eyebrow>Parish & vicariate bulletin</Eyebrow>
      <Text style={type.title}>Announcements</Text>
      <Text style={styles.lead}>
        Published notices for {homeParishName} and the Vicariate of St. John Mary Vianney.
      </Text>

      <View style={styles.filterRow} accessibilityRole="radiogroup">
        <ChoiceChip label="All notices" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <ChoiceChip label="My parish" selected={filter === 'parish'} onPress={() => setFilter('parish')} />
        <ChoiceChip label="Vicariate-wide" selected={filter === 'vicariate'} onPress={() => setFilter('vicariate')} />
      </View>

      {visible.length ? (
        visible.map((announcement) => (
          <Card key={announcement.id} style={styles.card}>
            <View style={styles.headerRow}>
              <IconTile name={announcement.scope === 'vicariate' ? 'globe-outline' : 'megaphone-outline'} />
              <View style={styles.flex}>
                <Text style={styles.parishLabel}>{announcement.parishName}</Text>
                <Text style={styles.dateLabel}>{formatPublishedDate(announcement.publishedAt)}</Text>
              </View>
              <StatusBadge
                label={announcement.scope === 'vicariate' ? 'Vicariate' : 'Parish'}
                tone={announcement.scope === 'vicariate' ? 'info' : 'positive'}
              />
            </View>
            <Divider />
            <Text style={styles.announcementTitle}>{announcement.title}</Text>
            <Text style={styles.bodyText}>{announcement.body}</Text>
          </Card>
        ))
      ) : (
        <Card style={styles.emptyCard}>
          <Ionicons name="megaphone-outline" size={30} color={colors.gold} />
          <Text style={styles.emptyTitle}>No announcements in this view</Text>
          <Text style={styles.emptyBody}>
            {filter === 'all'
              ? 'Published notices from your parish office and the Vicariate will appear here.'
              : 'Switch back to All notices to see other published updates.'}
          </Text>
        </Card>
      )}

      <Notice
        title="Plain-text bulletin"
        body="Announcements are published by authorized parish staff or the system administrator. Confirm schedule-critical details directly with your parish office."
        tone="info"
        icon="shield-checkmark-outline"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screenScroll: { gap: spacing.lg, padding: spacing.md, paddingBottom: 120 },
  screenScrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  card: { gap: spacing.xs },
  headerRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  parishLabel: { color: colors.oxblood, fontFamily: fonts.bodyBold, fontSize: 13 },
  dateLabel: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  announcementTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 23, lineHeight: 28 },
  bodyText: { color: colors.ink, fontFamily: fonts.body, fontSize: 15, lineHeight: 23 },
  emptyCard: { alignItems: 'center', gap: spacing.xs },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  emptyBody: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});

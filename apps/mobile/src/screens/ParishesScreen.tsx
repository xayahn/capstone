import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import {
  AppButton,
  Card,
  Divider,
  Eyebrow,
  IconTile,
  Notice,
  StatusBadge,
} from '../components/ui';
import { PARISHES } from '../data/catalog';
import { colors, fonts, spacing, type } from '../theme';
import type { Parish, ParishId } from '../types/domain';

const ContactRow = ({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null | undefined;
}) => (
  <View style={styles.contactRow}>
    <Ionicons name={icon} size={18} color={colors.gold} style={styles.contactIcon} />
    <View style={styles.flex}>
      <Text style={styles.contactLabel}>{label}</Text>
      <Text style={value ? styles.contactValue : styles.contactMissing}>
        {value ?? 'Not yet published by the parish office'}
      </Text>
    </View>
  </View>
);

export const ParishesScreen = ({
  homeParishId,
  onExploreServices,
}: {
  homeParishId: ParishId;
  onExploreServices: () => void;
}) => {
  const { width } = useWindowDimensions();
  const orderedParishes: Parish[] = [
    ...PARISHES.filter((parish) => parish.id === homeParishId),
    ...PARISHES.filter((parish) => parish.id !== homeParishId),
  ];

  return (
    <ScrollView
      contentContainerStyle={[styles.screenScroll, width > 720 && styles.screenScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Eyebrow>Vicariate of St. John Mary Vianney</Eyebrow>
      <Text style={type.title}>Parishes & office hours</Text>
      <Text style={styles.lead}>
        Directory of the eight participating parishes in the Archdiocese of San Fernando, with published office hours, clergy, and contact details.
      </Text>

      {orderedParishes.map((parish) => {
        const isHome = parish.id === homeParishId;
        const contact = parish.contact;
        return (
          <Card key={parish.id} style={styles.card}>
            <View style={styles.headerRow}>
              <IconTile name="business-outline" />
              <View style={styles.flex}>
                <Text style={styles.parishTitle}>{parish.name}</Text>
                {contact?.description ? (
                  <Text style={styles.descriptionText}>{contact.description}</Text>
                ) : null}
              </View>
              {isHome ? <StatusBadge label="Home parish" tone="positive" /> : null}
            </View>

            <Divider />

            <ContactRow icon="location-outline" label="Address" value={contact?.address} />
            <ContactRow icon="time-outline" label="Office hours" value={contact?.officeHours} />
            <ContactRow icon="call-outline" label="Telephone" value={contact?.phone} />
            <ContactRow icon="mail-outline" label="Email" value={contact?.email} />

            <View style={styles.clergyBlock}>
              <Text style={styles.contactLabel}>Assigned clergy</Text>
              <Text style={styles.contactValue}>
                {parish.clergy.length
                  ? parish.clergy.map((member) => member.name).join(' • ')
                  : 'No active clergy currently listed in ParishLink'}
              </Text>
            </View>
          </Card>
        );
      })}

      <AppButton label="Explore sacramental services" icon="calendar-outline" onPress={onExploreServices} />

      <Notice
        title="Verified parish details"
        body="Each parish office maintains its own published address, office hours, and contact details. ParishLink never invents unpublished contact numbers."
        tone="info"
        icon="information-circle-outline"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screenScroll: { gap: spacing.lg, padding: spacing.md, paddingBottom: 120 },
  screenScrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  card: { gap: spacing.sm },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  parishTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 22, lineHeight: 27 },
  descriptionText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: 3 },
  contactRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  contactIcon: { marginTop: 2 },
  contactLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  contactValue: { color: colors.ink, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  contactMissing: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, fontStyle: 'italic', lineHeight: 21 },
  clergyBlock: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 3, marginTop: spacing.xxs, paddingTop: spacing.sm },
});

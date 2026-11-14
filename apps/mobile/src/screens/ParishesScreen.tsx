import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  AppButton,
  Card,
  Divider,
  Eyebrow,
  IconTile,
  Notice,
  StatusBadge,
  useScreenRefresh,
} from '../components/ui';
import { PARISHES } from '../data/catalog';
import { dialablePhoneUri, mailtoUri } from '../lib/contactLinks';
import { colors, fonts, spacing, type } from '../theme';
import type { Parish, ParishId } from '../types/domain';

export { dialablePhoneUri, mailtoUri };

const ContactRow = ({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string | null | undefined;
  onPress?: () => void;
}) => {
  const rowContent = (
    <View style={styles.contactRow}>
      <Ionicons name={icon} size={18} color={colors.gold} style={styles.contactIcon} />
      <View style={styles.flex}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={value ? [styles.contactValue, onPress && styles.contactLink] : styles.contactMissing}>
          {value ?? 'Not yet published by the parish office'}
        </Text>
      </View>
    </View>
  );

  if (!onPress || !value) return rowContent;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label}: ${value}`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      {rowContent}
    </Pressable>
  );
};

export const ParishesScreen = ({
  homeParishId,
  catalogVersion: _catalogVersion,
  onExploreServices,
}: {
  homeParishId: ParishId;
  catalogVersion?: number;
  onExploreServices: () => void;
}) => {
  const { width } = useWindowDimensions();
  const { refreshing, onRefresh } = useScreenRefresh();
  const [contactNotice, setContactNotice] = useState('');

  const orderedParishes: Parish[] = [
    ...PARISHES.filter((parish) => parish.id === homeParishId),
    ...PARISHES.filter((parish) => parish.id !== homeParishId),
  ];

  const openContactLink = async (uri: string, fallbackMessage: string) => {
    setContactNotice('');
    try {
      await Linking.openURL(uri);
    } catch {
      setContactNotice(fallbackMessage);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.screenScroll, width > 720 && styles.screenScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      {...(onRefresh
        ? {
            refreshControl: (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.oxblood}
                colors={[colors.oxblood]}
              />
            ),
          }
        : {})}
    >
      <Eyebrow>Vicariate of St. John Mary Vianney</Eyebrow>
      <Text style={type.title}>Parishes & office hours</Text>
      <Text style={styles.lead}>
        Directory of the eight participating parishes in the Archdiocese of San Fernando, with published office hours, clergy, and one-tap contact actions.
      </Text>

      {contactNotice ? (
        <Notice
          title="Could not open contact app"
          body={contactNotice}
          tone="warning"
          icon="call-outline"
        />
      ) : null}

      {orderedParishes.map((parish) => {
        const isHome = parish.id === homeParishId;
        const contact = parish.contact;
        const phoneHref = dialablePhoneUri(contact?.phone);
        const emailHref = mailtoUri(contact?.email);

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
            <ContactRow
              icon="call-outline"
              label="Telephone"
              value={contact?.phone}
              {...(phoneHref
                ? {
                    onPress: () =>
                      void openContactLink(
                        phoneHref,
                        `Dial ${contact?.phone ?? ''} on a phone-capable device to reach ${parish.name}.`,
                      ),
                  }
                : {})}
            />
            <ContactRow
              icon="mail-outline"
              label="Email"
              value={contact?.email}
              {...(emailHref
                ? {
                    onPress: () =>
                      void openContactLink(
                        emailHref,
                        `Send an email to ${contact?.email ?? ''} from your mail app.`,
                      ),
                  }
                : {})}
            />

            {phoneHref || emailHref ? (
              <View style={styles.contactActions}>
                {phoneHref ? (
                  <AppButton
                    label="Call office"
                    icon="call-outline"
                    variant="secondary"
                    style={styles.contactActionButton}
                    accessibilityLabel={`Call ${parish.name}`}
                    onPress={() =>
                      void openContactLink(
                        phoneHref,
                        `Dial ${contact?.phone ?? ''} on a phone-capable device to reach ${parish.name}.`,
                      )
                    }
                  />
                ) : null}
                {emailHref ? (
                  <AppButton
                    label="Email office"
                    icon="mail-outline"
                    variant="secondary"
                    style={styles.contactActionButton}
                    accessibilityLabel={`Email ${parish.name}`}
                    onPress={() =>
                      void openContactLink(
                        emailHref,
                        `Send an email to ${contact?.email ?? ''} from your mail app.`,
                      )
                    }
                  />
                ) : null}
              </View>
            ) : null}

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
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: -spacing.sm },
  card: { gap: spacing.sm },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  parishTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 23, lineHeight: 28 },
  descriptionText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, marginTop: 3 },
  contactRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, paddingVertical: 2 },
  contactIcon: { marginTop: 2 },
  contactLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  contactValue: { color: colors.ink, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 23 },
  contactLink: { color: colors.oxblood, fontFamily: fonts.bodySemibold, textDecorationLine: 'underline' },
  contactMissing: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, fontStyle: 'italic', lineHeight: 23 },
  contactActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xxs },
  contactActionButton: { flex: 1, minWidth: 148 },
  pressed: { opacity: 0.72 },
  clergyBlock: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, gap: 3, marginTop: spacing.xxs, paddingTop: spacing.sm },
});

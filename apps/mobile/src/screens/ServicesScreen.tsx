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
import { SACRAMENT_SERVICES, getService } from '../data/catalog';
import { colors, fonts, spacing, type } from '../theme';
import type { SacramentId } from '../types/domain';

const serviceIcons: Record<SacramentId, keyof typeof Ionicons.glyphMap> = {
  baptism: 'water-outline',
  wedding: 'heart-outline',
  confirmation: 'shield-checkmark-outline',
  first_communion: 'sunny-outline',
  funeral: 'flame-outline',
};

export const ServicesScreen = ({
  focusedServiceId,
  onBook,
}: {
  focusedServiceId: SacramentId | undefined;
  onBook: (id: SacramentId) => void;
}) => {
  const { width } = useWindowDimensions();
  const focusedService = focusedServiceId ? getService(focusedServiceId) : undefined;
  const orderedServices = focusedService
    ? [focusedService, ...SACRAMENT_SERVICES.filter((service) => service.id !== focusedService.id)]
    : SACRAMENT_SERVICES;

  return (
    <ScrollView
      contentContainerStyle={[styles.screenScroll, width > 720 && styles.screenScrollWide]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Eyebrow>Parish services</Eyebrow>
      <Text style={type.title}>Prepare with confidence</Text>
      <Text style={styles.lead}>Review the usual documents before sending a schedule request. The selected parish will confirm final requirements.</Text>
      {focusedService ? (
        <Notice title={`${focusedService.name} is shown first`} body="This is the service you selected from Parish guide. Review its checklist below or begin a request." tone="info" icon="navigate-circle-outline" />
      ) : null}
      {orderedServices.map((service) => (
        <Card key={service.id} style={styles.serviceCard}>
          <View style={styles.serviceHeader}>
            <IconTile name={serviceIcons[service.id]} />
            <View style={styles.flex}>
              <Text style={styles.serviceTitle}>{service.name}</Text>
              <Text style={styles.mutedText}>{service.shortDescription}</Text>
            </View>
            <StatusBadge label={`${service.durationMinutes} min`} tone="neutral" />
          </View>
          <Divider />
          <Text style={styles.requirementsLabel}>Typical checklist</Text>
          {service.requirements.slice(0, 3).map((requirement) => (
            <View key={requirement} style={styles.requirementRow}>
              <Ionicons name="checkmark-circle-outline" size={17} color={colors.green} />
              <Text style={styles.requirementText}>{requirement}</Text>
            </View>
          ))}
          {service.requirements.length > 3 ? (
            <Text style={styles.moreRequirements}>+ {service.requirements.length - 3} more in the request checklist</Text>
          ) : null}
          <AppButton label={`Request ${service.name}`} icon="arrow-forward" onPress={() => onBook(service.id)} />
        </Card>
      ))}
      <Notice title="Requirements may vary" body="The capstone catalog guides preparation. The parish office may request additional documents after human review." tone="info" />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screenScroll: { gap: spacing.lg, padding: spacing.md, paddingBottom: 120 },
  screenScrollWide: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
  serviceCard: { gap: spacing.sm },
  serviceHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  serviceTitle: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 23 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  requirementsLabel: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase' },
  requirementRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xs },
  requirementText: { color: colors.ink, flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  moreRequirements: { color: colors.oxblood, fontFamily: fonts.bodySemibold, fontSize: 13 },
});

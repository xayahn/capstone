import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  Card,
  ChoiceChip,
  Eyebrow,
  Notice,
  QueueStat,
  Screen,
  StatusBadge,
} from '../components/ui';
import { PARISHES, QUEUE_SERVICES, getParish } from '../data/catalog';
import { colors, fonts, radii, spacing } from '../theme';
import type { ParishId, ParishionerProfile, QueueService, RepositorySnapshot } from '../types/domain';

export interface QueueScreenProps {
  profile: ParishionerProfile;
  ticket?: RepositorySnapshot['activeQueueTicket'];
  loading: boolean;
  onJoin: (parishId: ParishId, service: QueueService) => Promise<unknown>;
  onLeave: () => Promise<void>;
}

export const QueueScreen = ({
  profile,
  ticket,
  loading,
  onJoin,
  onLeave,
}: QueueScreenProps) => {
  const [parishId, setParishId] = useState<ParishId>(profile.homeParishId);
  const [service, setService] = useState<QueueService>('General inquiry');
  const [confirmLeave, setConfirmLeave] = useState(false);

  return (
    <Screen>
      <Notice
        title="Walk-in support only"
        body="A queue ticket estimates your place for a parish office visit. It is not an appointment and does not guarantee a completion time."
        tone="warning"
        icon="people-outline"
      />
      {ticket ? (
        <Card style={styles.ticketCard}>
          <Eyebrow>Active ticket</Eyebrow>
          <Text style={styles.ticketNumberLarge}>{ticket.number}</Text>
          <Text style={styles.ticketParish}>{getParish(ticket.parishId)?.name}</Text>
          <StatusBadge label={ticket.status === 'waiting' ? 'Waiting' : ticket.status} tone="warning" />
          <View style={styles.queueStats}>
            <QueueStat value={String(ticket.ahead)} label="people ahead" />
            <View style={styles.verticalDivider} />
            <QueueStat
              value={ticket.estimatedWaitMinutes === null ? '—' : `~${ticket.estimatedWaitMinutes}`}
              label={ticket.estimatedWaitMinutes === null ? 'estimate pending' : 'minutes'}
            />
          </View>
          <Text style={styles.mutedCentered}>
            For: {ticket.service}. Keep this screen available and follow parish staff instructions.
          </Text>
          <AppButton label="Leave queue" variant="danger" loading={loading} onPress={() => setConfirmLeave(true)} />
          {confirmLeave ? (
            <View accessibilityRole="alert">
              <Text style={styles.mutedCentered}>Leave this queue? Your ticket will be released.</Text>
              <AppButton label="Keep my ticket" variant="secondary" onPress={() => setConfirmLeave(false)} />
              <AppButton
                label="Confirm leave queue"
                variant="danger"
                loading={loading}
                onPress={() => {
                  void onLeave().then(() => setConfirmLeave(false)).catch(() => undefined);
                }}
              />
            </View>
          ) : null}
        </Card>
      ) : (
        <Card>
          <Eyebrow>Request one ticket</Eyebrow>
          <Text style={styles.cardHeadline}>Plan your parish visit</Text>
          <Text style={styles.fieldLabel}>Parish office</Text>
          <View style={styles.chipWrap}>
            {PARISHES.map((parish) => (
              <ChoiceChip
                key={parish.id}
                label={parish.name}
                selected={parish.id === parishId}
                onPress={() => setParishId(parish.id)}
              />
            ))}
          </View>
          <Text style={styles.fieldLabel}>Purpose of visit</Text>
          <View style={styles.chipWrap}>
            {QUEUE_SERVICES.map((item) => (
              <ChoiceChip
                key={item}
                label={item}
                selected={item === service}
                onPress={() => setService(item)}
              />
            ))}
          </View>
          <AppButton
            label="Join walk-in queue"
            icon="ticket-outline"
            loading={loading}
            onPress={() => void onJoin(parishId, service).catch(() => undefined)}
          />
        </Card>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  ticketCard: { alignItems: 'center', gap: spacing.md },
  ticketNumberLarge: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 32, textAlign: 'center', flexShrink: 1, maxWidth: '100%' },
  ticketParish: { color: colors.ink, fontFamily: fonts.display, fontSize: 20, textAlign: 'center' },
  queueStats: { alignItems: 'center', backgroundColor: colors.paperLight, borderRadius: radii.md, flexDirection: 'row', padding: spacing.md, width: '100%' },
  verticalDivider: { backgroundColor: colors.line, height: 46, width: 1 },
  mutedCentered: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 27, lineHeight: 31 },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.xs, marginTop: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

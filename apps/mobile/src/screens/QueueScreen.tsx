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
import { isQueueTicketAtCounter, queueStatusLabel, queueStatusTone } from '../lib/status';
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
  const activeTicket =
    ticket && !['completed', 'cancelled'].includes(ticket.status) ? ticket : undefined;
  const atCounter = activeTicket ? isQueueTicketAtCounter(activeTicket.status) : false;

  return (
    <Screen>
      <Notice
        title="Walk-in support only"
        body="A queue ticket estimates your place for a parish office visit. It is not an appointment and does not guarantee a completion time."
        tone="warning"
        icon="people-outline"
      />
      {activeTicket ? (
        <>
          {atCounter ? (
            <Notice
              title="Please proceed to the parish window"
              body="Parish staff have called your ticket number. Present this screen at the parish office counter."
              tone="positive"
              icon="megaphone-outline"
            />
          ) : null}
          <Card style={styles.ticketCard}>
            <Eyebrow>{atCounter ? 'Called to counter' : 'Active ticket'}</Eyebrow>
            <Text style={styles.ticketNumberLarge}>{activeTicket.number}</Text>
            <Text style={styles.ticketParish}>{getParish(activeTicket.parishId)?.name}</Text>
            <StatusBadge label={queueStatusLabel[activeTicket.status]} tone={queueStatusTone[activeTicket.status]} />
            <View style={styles.queueStats}>
              <QueueStat value={String(activeTicket.ahead)} label={activeTicket.ahead === 1 ? 'person ahead' : 'people ahead'} />
              <View style={styles.verticalDivider} />
              <QueueStat
                value={activeTicket.estimatedWaitMinutes === null ? '—' : `~${activeTicket.estimatedWaitMinutes}`}
                label={activeTicket.estimatedWaitMinutes === null ? 'estimate pending' : 'minutes'}
              />
            </View>
            <Text style={styles.mutedCentered}>
              {atCounter
                ? `For: ${activeTicket.service}. Show ticket ${activeTicket.number} to the staff member at the counter.`
                : `For: ${activeTicket.service}. Keep this screen available and follow parish staff instructions.`}
            </Text>
            {confirmLeave ? (
              <View style={styles.confirmLeaveBox} accessibilityRole="alert">
                <Text style={styles.mutedCentered}>Leave this queue? Your ticket will be released.</Text>
                <AppButton label="Keep my ticket" variant="secondary" disabled={loading} onPress={() => setConfirmLeave(false)} />
                <AppButton
                  label="Confirm leave queue"
                  variant="danger"
                  loading={loading}
                  onPress={() => {
                    void onLeave().then(() => setConfirmLeave(false)).catch(() => undefined);
                  }}
                />
              </View>
            ) : (
              <AppButton label="Leave queue" variant="danger" loading={loading} onPress={() => setConfirmLeave(true)} />
            )}
          </Card>
        </>
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
  ticketNumberLarge: { color: colors.oxblood, fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 44, textAlign: 'center', flexShrink: 1, maxWidth: '100%' },
  ticketParish: { color: colors.ink, fontFamily: fonts.display, fontSize: 22, textAlign: 'center' },
  queueStats: { alignItems: 'center', backgroundColor: colors.paperLight, borderRadius: radii.md, flexDirection: 'row', padding: spacing.md, width: '100%' },
  verticalDivider: { backgroundColor: colors.line, height: 46, width: 1 },
  mutedCentered: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22, textAlign: 'center' },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 32 },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, marginBottom: spacing.xs, marginTop: spacing.md },
  confirmLeaveBox: { gap: spacing.sm, width: '100%' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});

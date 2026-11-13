import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppButton, Card, ChoiceChip, Notice, SectionTitle } from './ui';
import { changeOptionsFor, RESCHEDULE_MIN_NOTICE_HOURS } from '../lib/changePolicy';
import { formatDate, getBookableDates } from '../lib/scheduling';
import { colors, fonts, radii, spacing } from '../theme';
import type { Appointment, AvailabilitySearchInput, AvailabilitySlot, RescheduleInput } from '../types/domain';

/**
 * Parishioner actions on an existing appointment (paper Tables 4.2, 4.8, 4.11, 4.20):
 * request a new schedule, cancel (immediately before approval or by request after
 * approval), and see/withdraw a pending request. All decisions remain with the parish.
 */
export const AppointmentChangesPanel = ({
  appointment,
  onSearchAvailability,
  onCancel,
  onReschedule,
  onWithdraw,
}: {
  appointment: Appointment;
  onSearchAvailability: (input: AvailabilitySearchInput) => Promise<AvailabilitySlot[]>;
  onCancel: (appointmentId: string, reason: string) => Promise<Appointment>;
  onReschedule: (appointmentId: string, input: RescheduleInput) => Promise<Appointment>;
  onWithdraw: (appointmentId: string) => Promise<Appointment>;
}) => {
  const options = changeOptionsFor(appointment);
  const pending = appointment.pendingChange ?? null;
  const decision = appointment.lastChangeDecision ?? null;
  const [mode, setMode] = useState<'idle' | 'reschedule' | 'cancel'>('idle');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Offer bookable dates starting tomorrow; the server enforces the notice period and slot validity.
  const dates = useMemo(() => getBookableDates(new Date(), 14), []);

  useEffect(() => {
    let active = true;
    setTime('');
    setSlotsError('');
    if (mode !== 'reschedule' || !date) { setSlots([]); return () => { active = false; }; }
    setSlotsLoading(true);
    void onSearchAvailability({
      serviceId: appointment.serviceId, parishId: appointment.parishId, clergyId: appointment.clergyId,
      venueId: appointment.venueId, date, excludeAppointmentId: appointment.id,
    })
      .then((next) => { if (active) setSlots(next); })
      .catch((cause) => { if (active) setSlotsError(cause instanceof Error ? cause.message : 'Availability could not be checked.'); })
      .finally(() => { if (active) setSlotsLoading(false); });
    return () => { active = false; };
  }, [appointment.clergyId, appointment.id, appointment.parishId, appointment.serviceId, appointment.venueId, date, mode, onSearchAvailability]);

  const reset = () => { setMode('idle'); setDate(''); setTime(''); setReason(''); setSlots([]); };

  const submit = async (work: () => Promise<Appointment>, success: string) => {
    setBusy(true);
    setMessage('');
    try {
      await work();
      setMessage(success);
      reset();
    } catch {
      // The shared screen-level error banner shows the server's message.
    } finally {
      setBusy(false);
    }
  };

  const reasonValid = reason.trim().length >= 4;
  const hasActions = options.reschedule || options.cancel !== null;

  if (!pending && !decision && !hasActions && !message) return null;

  return (
    <>
      <SectionTitle>Schedule changes</SectionTitle>
      <Card>
        {message ? <Notice title="Request saved" body={message} tone="positive" icon="checkmark-circle-outline" /> : null}

        {pending ? (
          <View style={styles.block}>
            <Notice
              title={pending.kind === 'reschedule' ? 'Reschedule request waiting for the parish' : 'Cancellation request waiting for the parish'}
              body={pending.kind === 'reschedule'
                ? `You asked to move this appointment to ${pending.proposedDate ? formatDate(pending.proposedDate) : 'a new date'} at ${pending.proposedTime ?? 'a new time'}. Your current schedule stays in place until the parish approves.`
                : 'You asked to cancel this approved appointment. It stays scheduled until the parish confirms.'}
              tone="warning"
              icon="time-outline"
            />
            <Text style={styles.muted}>Reason: {pending.reason}</Text>
            <AppButton label="Withdraw request" icon="arrow-undo-outline" variant="ghost" loading={busy} disabled={busy}
              onPress={() => void submit(() => onWithdraw(appointment.id), 'Your request was withdrawn. Your appointment is unchanged.')} />
          </View>
        ) : decision ? (
          <Notice
            title={`${decision.kind === 'reschedule' ? 'Reschedule' : 'Cancellation'} request ${decision.status === 'approved' ? 'approved' : 'declined'}`}
            body={decision.note ?? (decision.status === 'approved' ? 'The parish approved your request.' : 'The parish could not approve your request. Contact the parish office if you need help.')}
            tone={decision.status === 'approved' ? 'positive' : 'critical'}
            icon={decision.status === 'approved' ? 'checkmark-circle-outline' : 'close-circle-outline'}
          />
        ) : null}

        {mode === 'idle' && !pending ? (
          <View style={styles.actions}>
            {options.reschedule ? (
              <AppButton label="Request a new schedule" icon="calendar-outline" variant="secondary" onPress={() => setMode('reschedule')} />
            ) : null}
            {options.cancel ? (
              <AppButton label={options.cancel === 'immediate' ? 'Cancel this request' : 'Request cancellation'} icon="close-circle-outline" variant="danger" onPress={() => setMode('cancel')} />
            ) : null}
            {!options.reschedule && options.cancel && hasActions ? (
              <Text style={styles.muted}>Reschedule requests must be made at least {RESCHEDULE_MIN_NOTICE_HOURS} hours before the appointment.</Text>
            ) : null}
          </View>
        ) : null}

        {mode === 'reschedule' ? (
          <View style={styles.block}>
            <Text style={styles.label}>New date (same priest and venue)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {dates.map((item) => <ChoiceChip key={item} label={formatDate(item, true)} selected={item === date} onPress={() => setDate(item)} />)}
            </ScrollView>
            <Text style={styles.label}>New time</Text>
            {!date ? <Text style={styles.muted}>Choose a date to see the priest's live availability.</Text>
              : slotsLoading ? <View style={styles.row}><ActivityIndicator color={colors.oxblood} /><Text style={styles.muted}>Checking the live parish schedule.</Text></View>
                : slotsError ? <Text style={styles.error}>{slotsError}</Text>
                  : (
                    <View style={styles.wrap}>
                      {slots.map((slot) => (
                        <ChoiceChip key={slot.time} label={slot.available ? slot.time : `${slot.time} · unavailable`} selected={slot.time === time}
                          disabled={!slot.available} onPress={() => setTime(slot.time)} />
                      ))}
                    </View>
                  )}
            <Text style={styles.label}>Reason for the change</Text>
            <TextInput accessibilityLabel="Reason for the change" style={styles.input} value={reason} maxLength={500} multiline
              placeholder="For example: our godparent arrives a week later" placeholderTextColor={colors.inkSoft} onChangeText={setReason} />
            <Text style={styles.muted}>The parish office reviews every request. Your current schedule stays until they approve.</Text>
            <View style={styles.actions}>
              <AppButton label="Send reschedule request" icon="send-outline" loading={busy} disabled={busy || !date || !time || !reasonValid}
                onPress={() => void submit(() => onReschedule(appointment.id, { date, time, reason: reason.trim() }), 'Your reschedule request was sent to the parish office.')} />
              <AppButton label="Keep current schedule" variant="ghost" disabled={busy} onPress={reset} />
            </View>
          </View>
        ) : null}

        {mode === 'cancel' ? (
          <View style={styles.block}>
            <Notice
              title={options.cancel === 'immediate' ? 'Cancel this request?' : 'Ask the parish to cancel?'}
              body={options.cancel === 'immediate'
                ? 'This request has not been approved yet, so it will be cancelled right away. You can submit a new request later.'
                : 'Your appointment is already approved. The parish office will confirm the cancellation.'}
              tone="warning"
              icon="alert-circle-outline"
            />
            <Text style={styles.label}>Reason</Text>
            <TextInput accessibilityLabel="Reason for cancelling" style={styles.input} value={reason} maxLength={500} multiline
              placeholder="A short reason helps the parish office" placeholderTextColor={colors.inkSoft} onChangeText={setReason} />
            <View style={styles.actions}>
              <AppButton label={options.cancel === 'immediate' ? 'Confirm cancellation' : 'Send cancellation request'} icon="close-circle-outline" variant="danger"
                loading={busy} disabled={busy || !reasonValid}
                onPress={() => void submit(() => onCancel(appointment.id, reason.trim()), options.cancel === 'immediate'
                  ? 'Your request was cancelled.' : 'Your cancellation request was sent to the parish office.')} />
              <AppButton label="Go back" variant="ghost" disabled={busy} onPress={reset} />
            </View>
          </View>
        ) : null}
      </Card>
    </>
  );
};

const styles = StyleSheet.create({
  block: { gap: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  label: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, marginTop: spacing.sm },
  muted: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  error: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 14.5, lineHeight: 21 },
  chips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  row: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  input: {
    backgroundColor: colors.cardStrong, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, color: colors.ink,
    fontFamily: fonts.body, fontSize: 16.5, minHeight: 78, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, textAlignVertical: 'top',
  },
});

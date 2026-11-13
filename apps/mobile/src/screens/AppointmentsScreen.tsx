import { StyleSheet, Text } from 'react-native';
import { AppointmentCard } from '../components/AppointmentCard';
import { EmptyCard, Eyebrow, Screen } from '../components/ui';
import { colors, fonts, spacing, type } from '../theme';
import type { Appointment } from '../types/domain';

export interface AppointmentsScreenProps {
  appointments: Appointment[];
  onOpen: (id: string) => void;
}

export const AppointmentsScreen = ({ appointments, onOpen }: AppointmentsScreenProps) => (
  <Screen>
    <Eyebrow>Request history</Eyebrow>
    <Text style={type.title}>Track every stage</Text>
    <Text style={styles.lead}>
      Status changes are recorded separately from file selection. Only staff-reviewed files display as verified.
    </Text>
    {appointments.length ? (
      appointments.map((appointment) => (
        <AppointmentCard key={appointment.id} appointment={appointment} onPress={() => onOpen(appointment.id)} />
      ))
    ) : (
      <EmptyCard title="No appointment requests" body="Your submitted requests will appear here." />
    )}
  </Screen>
);

const styles = StyleSheet.create({
  lead: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21, marginTop: -spacing.sm },
});

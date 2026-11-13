import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AppButton,
  ChoiceChip,
  Field,
  FormSection,
  Notice,
  ReviewRow,
  Screen,
  StatusBadge,
} from '../components/ui';
import { PARISHES, SACRAMENT_SERVICES, getParish, getService } from '../data/catalog';
import { formatDate, getBookableDates } from '../lib/scheduling';
import { colors, fonts, spacing } from '../theme';
import type {
  AppointmentDocument,
  AvailabilitySearchInput,
  AvailabilitySlot,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  SacramentId,
} from '../types/domain';

export interface BookingScreenProps {
  initialServiceId: SacramentId;
  profile: ParishionerProfile;
  loading: boolean;
  onSearchAvailability: (input: AvailabilitySearchInput) => Promise<AvailabilitySlot[]>;
  onCancel: () => void;
  onSubmit: (input: CreateAppointmentInput) => Promise<void>;
}

export const makeChecklist = (serviceId: SacramentId): AppointmentDocument[] => {
  const service = getService(serviceId)!;
  return service.requirements.map((label, index) => {
    const configured = service.requirementDetails?.find((item) => item.name === label);
    const required = configured?.required ?? true;
    return {
      id: configured?.id ?? `${serviceId}-requirement-${index + 1}`,
      label,
      required,
      status: required ? 'missing' : 'not_required',
      note: configured?.instructions ?? (required ? 'Select a file before submitting.' : 'Optional if available.'),
    };
  });
};

export const BookingScreen = ({
  initialServiceId,
  profile,
  loading,
  onSearchAvailability,
  onCancel,
  onSubmit,
}: BookingScreenProps) => {
  const bookableParishes = PARISHES.filter((item) => item.clergy.length > 0 && Boolean(item.venueId));
  const defaultParishId = bookableParishes.some((item) => item.id === profile.homeParishId)
    ? profile.homeParishId
    : bookableParishes[0]?.id ?? profile.homeParishId;
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [parishId, setParishId] = useState<ParishId>(defaultParishId);
  const [clergyId, setClergyId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [documents, setDocuments] = useState<AppointmentDocument[]>(() => makeChecklist(initialServiceId));
  const [participantName, setParticipantName] = useState(profile.displayName);
  const [participantDateOfBirth, setParticipantDateOfBirth] = useState('');
  const [localError, setLocalError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  const service = getService(serviceId)!;
  const parish = getParish(parishId);
  const dates = useMemo(() => getBookableDates(new Date(), 10), []);
  const requiredComplete = documents
    .filter((document) => document.required)
    .every((document) => ['selected', 'submitted', 'under_review', 'verified'].includes(document.status));
  const participantDateValid = !participantDateOfBirth || /^\d{4}-\d{2}-\d{2}$/.test(participantDateOfBirth);
  const complete = Boolean(
    serviceId && parish && clergyId && date && time
    && slots.some((slot) => slot.time === time && slot.available)
    && participantName.trim().length >= 2 && participantDateValid && requiredComplete,
  );

  useEffect(() => {
    let active = true;
    setTime('');
    setAvailabilityError('');
    if (!date || !clergyId || !parish) {
      setSlots([]);
      setAvailabilityLoading(false);
      return () => { active = false; };
    }
    setSlots([]);
    setAvailabilityLoading(true);
    void onSearchAvailability({ serviceId, parishId, clergyId, venueId: parish.venueId, date })
      .then((next) => {
        if (active) setSlots(next);
      })
      .catch((cause) => {
        if (active) setAvailabilityError(cause instanceof Error ? cause.message : 'Availability could not be checked.');
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [clergyId, date, onSearchAvailability, parish, parishId, serviceId]);

  const chooseService = (id: SacramentId) => {
    setServiceId(id);
    setDocuments(makeChecklist(id));
    setDate('');
    setTime('');
  };

  const chooseParish = (id: ParishId) => {
    setParishId(id);
    setClergyId('');
    setDate('');
    setTime('');
  };

  const pickDocument = async (document: AppointmentDocument) => {
    setLocalError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024) {
        setLocalError('Choose a PDF, JPG, or PNG file no larger than 10 MB.');
        return;
      }
      setDocuments((current) => current.map((item) => item.id === document.id ? {
        ...item,
        status: 'selected',
        fileName: asset.name,
        fileUri: asset.uri,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        ...(asset.size === undefined ? {} : { sizeBytes: asset.size }),
        note: 'Selected on this device. Parish staff have not verified this file.',
      } : item));
    } catch {
      setLocalError('The document picker could not open. Check the device permission and try again.');
    }
  };

  const submit = async () => {
    if (!complete || !parish) {
      setLocalError('Complete the schedule and select every required document before submitting.');
      return;
    }
    setLocalError('');
    try {
      await onSubmit({
        serviceId,
        parishId,
        clergyId,
        venueId: parish.venueId,
        date,
        time,
        durationMinutes: service.durationMinutes,
        bufferBeforeMinutes: 15,
        bufferAfterMinutes: 15,
        participants: [{
          type: serviceId === 'funeral' ? 'deceased' : serviceId === 'wedding' ? 'principal' : 'candidate',
          fullName: participantName.trim().replace(/\s+/g, ' '),
          ...(participantDateOfBirth ? { dateOfBirth: participantDateOfBirth } : {}),
        }],
        documents,
      });
    } catch {
      // The shared repository error is displayed above the screen.
    }
  };

  if (!parish) {
    return (
      <Screen>
        <Notice
          title="Scheduling is being configured"
          body="No parish has an active priest and venue yet. Your system administrator must finish resource setup before appointment requests can be submitted."
          tone="warning"
          icon="construct-outline"
        />
        <AppButton label="Return to services" variant="ghost" onPress={onCancel} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Notice
        title="Request, not automatic approval"
        body="Submitting sends the preferred schedule and documents for parish staff review. It does not confirm the sacrament or replace official records."
        tone="warning"
        icon="shield-checkmark-outline"
      />

      <FormSection number="1" title="Sacramental service">
        <View style={styles.chipWrap}>
          {SACRAMENT_SERVICES.map((item) => (
            <ChoiceChip key={item.id} label={item.name} selected={item.id === serviceId} onPress={() => chooseService(item.id)} />
          ))}
        </View>
        <Text style={styles.helperText}>{service.durationMinutes} minutes, plus 15-minute preparation buffers before and after.</Text>
      </FormSection>

      <FormSection number="2" title="Parish and clergy">
        <Text style={styles.fieldLabel}>Parish</Text>
        <View style={styles.chipWrap}>
          {bookableParishes.map((item) => (
            <ChoiceChip key={item.id} label={item.name} selected={item.id === parishId} onPress={() => chooseParish(item.id)} />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Preferred clergy member</Text>
        <View style={styles.chipWrap}>
          {parish.clergy.map((clergy) => (
            <ChoiceChip
              key={clergy.id}
              label={clergy.name}
              selected={clergy.id === clergyId}
              onPress={() => { setClergyId(clergy.id); setDate(''); setTime(''); }}
            />
          ))}
        </View>
      </FormSection>

      <FormSection number="3" title="Preferred schedule">
        {!clergyId ? (
          <Text style={styles.helperText}>Choose a clergy member before viewing availability.</Text>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
              {dates.map((item) => (
                <ChoiceChip key={item} label={formatDate(item, true)} selected={item === date} onPress={() => { setDate(item); setTime(''); }} />
              ))}
            </ScrollView>
            <Text style={styles.fieldLabel}>Time</Text>
            {date ? (
              availabilityLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.oxblood} />
                  <Text style={styles.helperText}>Checking the live parish schedule…</Text>
                </View>
              ) : (
                <View style={styles.chipWrap}>
                  {slots.map((slot) => (
                    <ChoiceChip
                      key={slot.time}
                      label={slot.available ? slot.time : `${slot.time} • unavailable`}
                      selected={slot.time === time}
                      disabled={!slot.available}
                      onPress={() => setTime(slot.time)}
                    />
                  ))}
                </View>
              )
            ) : (
              <Text style={styles.helperText}>Choose a date to see time slots.</Text>
            )}
            {availabilityError ? <Text style={styles.errorText}>{availabilityError}</Text> : null}
          </>
        )}
      </FormSection>

      <FormSection number="4" title="Participant details">
        <Notice
          title="Only necessary details"
          body="Enter the primary person connected to this request. Parish staff may ask for service-specific details through the approved review process."
          tone="info"
          icon="person-outline"
        />
        <Field label="Primary participant’s complete name" value={participantName} maxLength={160} autoCapitalize="words" onChangeText={setParticipantName} />
        <Field label="Birth date (optional, YYYY-MM-DD)" value={participantDateOfBirth} maxLength={10} inputMode="numeric" placeholder="YYYY-MM-DD" onChangeText={setParticipantDateOfBirth} />
        {!participantDateValid ? <Text style={styles.errorText}>Use the birth date format YYYY-MM-DD.</Text> : null}
      </FormSection>

      <FormSection number="5" title="Document checklist">
        <Notice
          title="Human verification"
          body="Selecting or submitting a file never marks it verified. Authorized parish staff review each file after submission."
          tone="info"
          icon="person-outline"
        />
        {documents.map((document) => (
          <View key={document.id} style={styles.documentRow}>
            <View style={styles.flex}>
              <View style={styles.documentHeading}>
                <Text style={styles.itemTitle}>{document.label}</Text>
                <StatusBadge label={document.required ? 'Required' : 'Optional'} tone={document.required ? 'warning' : 'neutral'} />
              </View>
              <Text style={styles.mutedText}>
                {document.fileName ?? (document.required ? 'No file selected' : 'You may provide this if available.')}
              </Text>
              {document.status === 'selected' ? (
                <Text style={styles.selectedFileNote}>Selected locally • not staff verified</Text>
              ) : null}
            </View>
            <AppButton
              label={document.status === 'selected' ? 'Replace' : 'Choose file'}
              variant="secondary"
              onPress={() => void pickDocument(document)}
            />
          </View>
        ))}
        <Text style={styles.helperText}>Accepted formats: PDF, JPG, PNG • Maximum 10 MB per file.</Text>
      </FormSection>

      <FormSection number="6" title="Review and submit">
        <ReviewRow label="Service" value={service.name} />
        <ReviewRow label="Parish" value={parish.name} />
        <ReviewRow label="Clergy" value={parish.clergy.find((item) => item.id === clergyId)?.name ?? 'Not selected'} />
        <ReviewRow label="Primary participant" value={participantName.trim() || 'Not entered'} />
        <ReviewRow label="Schedule" value={date && time ? `${formatDate(date)} at ${time}` : 'Not selected'} />
        <ReviewRow
          label="Documents"
          value={`${documents.filter((item) => item.status === 'selected').length} selected • ${documents.filter((item) => item.status === 'verified').length} verified`}
        />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        <AppButton
          label="Submit request for review"
          icon="send-outline"
          loading={loading}
          disabled={loading || !complete}
          onPress={() => void submit()}
        />
        <AppButton label="Cancel" variant="ghost" onPress={onCancel} />
      </FormSection>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  horizontalChips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.xs, marginTop: spacing.md },
  helperText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  documentRow: {
    alignItems: 'center',
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  documentHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  selectedFileNote: { color: colors.oxblood, fontFamily: fonts.bodySemibold, fontSize: 12, lineHeight: 18, marginTop: 3 },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 20 },
});

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DocumentAttachmentControls } from '../components/DocumentAttachmentControls';
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
import {
  formatBirthDateInput,
  formatDate,
  getBookableDates,
  getParticipantFields,
  validateBirthDate,
} from '../lib/scheduling';
import { colors, fonts, radii, spacing } from '../theme';
import type {
  AppointmentDocument,
  AppointmentParticipant,
  AvailabilitySearchInput,
  AvailabilitySlot,
  CreateAppointmentInput,
  ParishId,
  ParishionerProfile,
  SacramentId,
  UploadAppointmentDocumentInput,
} from '../types/domain';

export interface BookingScreenProps {
  initialServiceId: SacramentId;
  profile: ParishionerProfile;
  loading: boolean;
  catalogVersion?: number;
  onSearchAvailability: (input: AvailabilitySearchInput) => Promise<AvailabilitySlot[]>;
  onCancel: () => void;
  onSubmit: (input: CreateAppointmentInput) => Promise<void>;
}

export const makeChecklist = (serviceId: SacramentId): AppointmentDocument[] => {
  const service = getService(serviceId) ?? SACRAMENT_SERVICES[0]!;
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
  catalogVersion,
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
  const [participantName, setParticipantName] = useState('');
  const [participantDateOfBirth, setParticipantDateOfBirth] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerDateOfBirth, setPartnerDateOfBirth] = useState('');
  const [localError, setLocalError] = useState('');
  const [availabilityError, setAvailabilityError] = useState('');
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  useEffect(() => {
    setServiceId(initialServiceId);
    setDocuments(makeChecklist(initialServiceId));
    setDate('');
    setTime('');
    setParticipantName('');
    setParticipantDateOfBirth('');
    setPartnerName('');
    setPartnerDateOfBirth('');
    setLocalError('');
  }, [initialServiceId]);

  useEffect(() => {
    if (catalogVersion === undefined) return;
    setDocuments((current) => {
      const fresh = makeChecklist(serviceId);
      return fresh.map((item) => {
        const existing = current.find((doc) => doc.id === item.id || doc.label === item.label);
        return existing && existing.status === 'selected' ? { ...item, ...existing, id: item.id, required: item.required } : item;
      });
    });
  }, [catalogVersion, serviceId]);

  const service = getService(serviceId) ?? SACRAMENT_SERVICES[0]!;
  const parish = getParish(parishId);
  const participantFields = getParticipantFields(serviceId);
  const dates = useMemo(() => getBookableDates(new Date(), 10), []);
  const requiredDocs = documents.filter((document) => document.required);
  const attachedRequiredCount = requiredDocs.filter((document) =>
    ['selected', 'submitted', 'under_review', 'verified'].includes(document.status),
  ).length;
  const requiredComplete = attachedRequiredCount === requiredDocs.length;

  const primaryBirthError = validateBirthDate(participantDateOfBirth);
  const secondaryBirthError = participantFields.secondaryType
    ? validateBirthDate(partnerDateOfBirth)
    : null;
  const secondaryValid =
    !participantFields.secondaryType ||
    (partnerName.trim().length >= 2 && secondaryBirthError === null);
  const slotValid = Boolean(time && slots.some((slot) => slot.time === time && slot.available));

  const missingSteps: string[] = [];
  if (!clergyId) missingSteps.push('Choose a preferred clergy member in Step 2.');
  if (!date || !slotValid) missingSteps.push('Choose a date and available time slot in Step 3.');
  if (participantName.trim().length < 2) missingSteps.push(`Enter ${participantFields.primaryLabel.toLowerCase()} in Step 4.`);
  if (primaryBirthError) missingSteps.push('Correct the birth date format in Step 4.');
  if (participantFields.secondaryType && partnerName.trim().length < 2) {
    missingSteps.push(`Enter ${(participantFields.secondaryLabel ?? 'second partner name').toLowerCase()} in Step 4.`);
  }
  if (secondaryBirthError) missingSteps.push('Correct the second partner birth date format in Step 4.');
  if (!requiredComplete) {
    const remaining = requiredDocs.length - attachedRequiredCount;
    missingSteps.push(`Attach ${remaining} remaining required ${remaining === 1 ? 'document' : 'documents'} in Step 5.`);
  }

  const complete = Boolean(
    serviceId &&
      parish &&
      clergyId &&
      date &&
      slotValid &&
      participantName.trim().length >= 2 &&
      primaryBirthError === null &&
      secondaryValid &&
      requiredComplete,
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
    if (id === serviceId) return;
    setServiceId(id);
    setDocuments(makeChecklist(id));
    setDate('');
    setTime('');
    setParticipantName('');
    setParticipantDateOfBirth('');
    setPartnerName('');
    setPartnerDateOfBirth('');
    setLocalError('');
  };

  const chooseParish = (id: ParishId) => {
    setParishId(id);
    setClergyId('');
    setDate('');
    setTime('');
  };

  const applySelectedFile = (documentId: string, file: UploadAppointmentDocumentInput) => {
    setDocuments((current) =>
      current.map((item) =>
        item.id === documentId
          ? {
              ...item,
              status: 'selected',
              fileName: file.fileName,
              fileUri: file.fileUri,
              mimeType: file.mimeType,
              ...(file.sizeBytes === undefined ? {} : { sizeBytes: file.sizeBytes }),
              note: 'Attached on this device. Parish staff verify every file after submission.',
            }
          : item,
      ),
    );
  };

  const submit = async () => {
    if (!complete || !parish) {
      setLocalError('Complete the schedule, participant details, and every required document before submitting.');
      return;
    }
    setLocalError('');
    const participants: AppointmentParticipant[] = [
      {
        type: participantFields.primaryType,
        fullName: participantName.trim().replace(/\s+/g, ' '),
        ...(participantDateOfBirth.trim() ? { dateOfBirth: participantDateOfBirth.trim() } : {}),
      },
      ...(participantFields.secondaryType
        ? [
            {
              type: participantFields.secondaryType,
              fullName: partnerName.trim().replace(/\s+/g, ' '),
              ...(partnerDateOfBirth.trim() ? { dateOfBirth: partnerDateOfBirth.trim() } : {}),
            },
          ]
        : []),
    ];

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
        participants,
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
    <Screen keyboard>
      <Notice
        title="Request, not automatic approval"
        body="Submitting sends your preferred schedule and documents for parish staff review. It does not confirm the sacrament or replace official records."
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
          <Text style={styles.helperText}>Choose a clergy member in Step 2 before viewing available dates and times.</Text>
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
              <Text style={styles.helperText}>Choose a date above to see available time slots.</Text>
            )}
            {availabilityError ? <Text style={styles.errorText}>{availabilityError}</Text> : null}
          </>
        )}
      </FormSection>

      <FormSection number="4" title="Participant details">
        <Notice
          title="Sacrament participant details"
          body={participantFields.guidanceBody}
          tone="info"
          icon="person-outline"
        />
        <Field
          label={participantFields.primaryLabel}
          value={participantName}
          maxLength={160}
          autoCapitalize="words"
          placeholder="Enter complete name"
          onChangeText={setParticipantName}
        />
        <Field
          label={participantFields.primaryBirthLabel}
          value={participantDateOfBirth}
          maxLength={10}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder="YYYY-MM-DD (type 8 digits, e.g. 19580512)"
          onChangeText={(value) => setParticipantDateOfBirth(formatBirthDateInput(value))}
        />
        <Text style={styles.dateHint}>Type numbers only — hyphens are added automatically (YYYY-MM-DD).</Text>
        {primaryBirthError ? <Text style={styles.errorText}>{primaryBirthError}</Text> : null}

        {participantFields.secondaryType && participantFields.secondaryLabel ? (
          <>
            <Field
              label={participantFields.secondaryLabel}
              value={partnerName}
              maxLength={160}
              autoCapitalize="words"
              placeholder="Enter complete name"
              onChangeText={setPartnerName}
            />
            {participantFields.secondaryBirthLabel ? (
              <>
                <Field
                  label={participantFields.secondaryBirthLabel}
                  value={partnerDateOfBirth}
                  maxLength={10}
                  keyboardType="number-pad"
                  inputMode="numeric"
                  placeholder="YYYY-MM-DD (optional)"
                  onChangeText={(value) => setPartnerDateOfBirth(formatBirthDateInput(value))}
                />
                {secondaryBirthError ? <Text style={styles.errorText}>{secondaryBirthError}</Text> : null}
              </>
            ) : null}
          </>
        ) : null}
      </FormSection>

      <FormSection number="5" title="Document checklist">
        <Notice
          title="Staff verification"
          body="Take a clear photo of your certificate, choose from your photo library, or attach a PDF. Authorized parish staff verify every file after submission."
          tone="info"
          icon="person-outline"
        />
        {localError ? <Text style={styles.errorText}>{localError}</Text> : null}
        {documents.map((document) => (
          <View key={document.id} style={styles.documentBlock}>
            <View style={styles.documentHeading}>
              <Text style={styles.itemTitle}>{document.label}</Text>
              <StatusBadge label={document.required ? 'Required' : 'Optional'} tone={document.required ? 'warning' : 'neutral'} />
            </View>
            <Text style={styles.mutedText}>
              {document.fileName ?? (document.required ? 'No file attached yet' : 'Optional — attach if available')}
            </Text>
            {document.status === 'selected' ? (
              <Text style={styles.selectedFileNote}>Attached on this device • awaiting submission</Text>
            ) : null}
            <DocumentAttachmentControls
              triggerLabel={document.status === 'selected' ? 'Replace document' : 'Attach document'}
              requirementLabel={document.label}
              disabled={loading}
              onPicked={(file) => applySelectedFile(document.id, file)}
              onError={setLocalError}
            />
          </View>
        ))}
        <Text style={styles.helperText}>Accepted formats: Camera photo, JPG, PNG, or PDF • Maximum 10 MB per file.</Text>
      </FormSection>

      <FormSection number="6" title="Review and submit">
        <ReviewRow label="Service" value={service.name} />
        <ReviewRow label="Parish" value={parish.name} />
        <ReviewRow label="Clergy" value={parish.clergy.find((item) => item.id === clergyId)?.name ?? 'Not selected'} />
        <ReviewRow label={participantFields.primaryReviewLabel} value={participantName.trim() || 'Not entered'} />
        {participantFields.secondaryReviewLabel ? (
          <ReviewRow label={participantFields.secondaryReviewLabel} value={partnerName.trim() || 'Not entered'} />
        ) : null}
        <ReviewRow label="Schedule" value={date && time ? `${formatDate(date)} at ${time}` : 'Not selected'} />
        <ReviewRow
          label="Documents"
          value={`${attachedRequiredCount} of ${requiredDocs.length} required attached`}
        />
        {!complete && missingSteps.length > 0 ? (
          <View style={styles.missingStepsBox} accessibilityRole="summary">
            <Text style={styles.missingStepsTitle}>Still needed before submitting:</Text>
            {missingSteps.map((step) => (
              <Text key={step} style={styles.missingStepText}>• {step}</Text>
            ))}
          </View>
        ) : null}
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
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  horizontalChips: { gap: spacing.xs, paddingVertical: spacing.xxs },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, marginBottom: spacing.xs, marginTop: spacing.md },
  helperText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: spacing.xs },
  dateHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: 4 },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.md },
  documentBlock: {
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  documentHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, justifyContent: 'space-between' },
  itemTitle: { color: colors.ink, flex: 1, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23, minWidth: 180 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15.5, lineHeight: 22 },
  selectedFileNote: { color: colors.oxblood, fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20 },
  missingStepsBox: {
    backgroundColor: colors.paperLight,
    borderColor: colors.gold,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 4,
    marginTop: spacing.xs,
    padding: spacing.md,
  },
  missingStepsTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15.5, lineHeight: 22 },
  missingStepText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 22, marginTop: 4 },
});

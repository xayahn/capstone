import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { EmailVerificationCard } from '../components/AccountEmailForms';
import { PushSettings } from '../components/PushSettings';
import {
  AppButton,
  Card,
  ChoiceChip,
  Eyebrow,
  Field,
  Notice,
  PasswordChecklist,
  Screen,
} from '../components/ui';
import { PARISHES } from '../data/catalog';
import { evaluatePasswordRules } from '../lib/auth';
import type { PushState } from '../notifications/pushRegistration';
import { colors, fonts, spacing } from '../theme';
import type { ParishId, ParishionerProfile } from '../types/domain';

export interface ProfileScreenProps {
  profile: ParishionerProfile;
  mode: 'demo' | 'api';
  loading: boolean;
  onSave: (profile: ParishionerProfile) => Promise<void>;
  onChangePassword: (input: { currentPassword: string; newPassword: string; confirmPassword: string }) => Promise<void>;
  onSignOut: () => void;
  onReset: () => Promise<void>;
  pushState: PushState;
  onEnablePush: () => Promise<void>;
  onRetryPush: () => Promise<void>;
  onNotificationSettings: () => Promise<void>;
  onRequestEmailVerification: (signal?: AbortSignal) => Promise<void>;
  onConfirmEmailVerification: (code: string, signal?: AbortSignal) => Promise<void>;
}

const VALID_MOBILE_PATTERN = /^\+?[0-9 ()-]{10,20}$/;

export const ProfileScreen = ({
  profile,
  mode,
  loading,
  onSave,
  onChangePassword,
  onSignOut,
  onReset,
  pushState,
  onEnablePush,
  onRetryPush,
  onNotificationSettings,
  onRequestEmailVerification,
  onConfirmEmailVerification,
}: ProfileScreenProps) => {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);
  const passwordRules = evaluatePasswordRules(newPassword, confirmPassword, currentPassword);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  const updateDraft = (patch: Partial<ParishionerProfile>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const mobileTrimmed = draft.mobileNumber.trim();
  const mobileValid = VALID_MOBILE_PATTERN.test(mobileTrimmed);
  const nameValid = draft.displayName.trim().length >= 3;

  return (
    <Screen keyboard>
      {mode === 'demo' ? (
        <Notice
          title="Local demonstration profile"
          body="Changes stay on this device and do not update any parish record."
          tone="warning"
          icon="flask-outline"
        />
      ) : null}
      <EmailVerificationCard
        key={profile.id}
        email={profile.email}
        emailVerified={profile.emailVerified === true}
        mode={mode}
        request={onRequestEmailVerification}
        confirm={onConfirmEmailVerification}
      />
      <Card>
        <Eyebrow>Personal details</Eyebrow>
        <Text style={styles.cardHeadline}>Your contact profile</Text>
        <Field label="Full name" value={draft.displayName} autoCapitalize="words" onChangeText={(displayName) => updateDraft({ displayName })} />
        <Field label="Email address (sign-in ID)" value={draft.email} editable={false} keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.fieldHint}>Your sign-in email cannot be changed here so your parish requests stay linked to your account.</Text>
        <Field label="Mobile number" value={draft.mobileNumber} onChangeText={(mobileNumber) => updateDraft({ mobileNumber })} keyboardType="phone-pad" placeholder="+63 9XX XXX XXXX" />
        {mobileTrimmed && !mobileValid ? (
          <Text style={styles.validationText}>Enter a 10 to 20 digit mobile number (for example +63 917 123 4567).</Text>
        ) : null}
        <Text style={styles.fieldLabel}>Home parish</Text>
        <View style={styles.chipWrap}>
          {PARISHES.map((parish) => (
            <ChoiceChip
              key={parish.id}
              label={parish.name}
              selected={parish.id === draft.homeParishId}
              onPress={() => updateDraft({ homeParishId: parish.id as ParishId })}
            />
          ))}
        </View>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>Notifications</Text>
            <Text style={styles.mutedText}>Allow push alerts for appointment, document, and queue updates. Save this preference, then enable this device below.</Text>
          </View>
          <Switch
            accessibilityLabel="Enable notifications"
            value={draft.notificationsEnabled}
            onValueChange={(notificationsEnabled) => updateDraft({ notificationsEnabled })}
            trackColor={{ false: colors.line, true: colors.greenSoft }}
            thumbColor={draft.notificationsEnabled ? colors.green : colors.card}
          />
        </View>
        {saved ? <Text style={styles.savedText}>Profile changes saved.</Text> : null}
        <AppButton
          label="Save profile"
          icon="save-outline"
          loading={loading}
          disabled={loading || !nameValid || !mobileValid || !draft.email.trim()}
          onPress={() => void onSave(draft).then(() => setSaved(true)).catch(() => undefined)}
        />
      </Card>
      <PushSettings
        state={pushState}
        accountEnabled={profile.notificationsEnabled}
        onEnable={onEnablePush}
        onRetry={onRetryPush}
        onSettings={onNotificationSettings}
      />
      <Card>
        <Eyebrow>Account security</Eyebrow>
        <Text style={styles.cardHeadline}>Change password</Text>
        <Text style={styles.mutedText}>Changing your password signs out other devices while keeping this one active.</Text>
        <Field
          label="Current password"
          value={currentPassword}
          onChangeText={(value) => { setPasswordSaved(false); setCurrentPassword(value); }}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Field
          label="New password"
          value={newPassword}
          onChangeText={(value) => { setPasswordSaved(false); setNewPassword(value); }}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <Field
          label="Confirm new password"
          value={confirmPassword}
          onChangeText={(value) => { setPasswordSaved(false); setConfirmPassword(value); }}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <PasswordChecklist password={newPassword} confirmPassword={confirmPassword} currentPassword={currentPassword} />
        {passwordSaved ? <Text style={styles.savedText}>Password changed. Other sessions were signed out.</Text> : null}
        <AppButton
          label="Change password"
          icon="key-outline"
          loading={loading}
          disabled={loading || !currentPassword || !passwordRules.allValid}
          onPress={() => void onChangePassword({ currentPassword, newPassword, confirmPassword }).then(() => {
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPasswordSaved(true);
          }).catch(() => undefined)}
        />
      </Card>
      <Card>
        <Text style={styles.itemTitle}>Privacy and account</Text>
        <Text style={styles.mutedText}>Upload documents only for your active parish service requests. Official parish register updates are handled by authorized parish staff.</Text>
        <AppButton label="Sign out" variant="secondary" icon="log-out-outline" onPress={onSignOut} />
        {mode === 'demo' ? (
          confirmReset ? (
            <View style={styles.confirmBox} accessibilityRole="alert">
              <Text style={styles.mutedText}>Reset sample data? This removes local sample changes and restores the original demonstration.</Text>
              <AppButton label="Keep my changes" variant="secondary" disabled={loading} onPress={() => setConfirmReset(false)} />
              <AppButton
                label="Confirm reset"
                variant="danger"
                icon="refresh-outline"
                loading={loading}
                onPress={() => {
                  void onReset().then(() => setConfirmReset(false)).catch(() => undefined);
                }}
              />
            </View>
          ) : (
            <AppButton
              label="Reset sample data"
              variant="danger"
              icon="refresh-outline"
              onPress={() => setConfirmReset(true)}
            />
          )
        ) : null}
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 28, lineHeight: 32 },
  fieldHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, marginTop: -spacing.xxs },
  validationText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 14.5, lineHeight: 21 },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16, marginBottom: spacing.xs, marginTop: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginVertical: spacing.md },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 16.5, lineHeight: 23 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  savedText: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 15 },
  confirmBox: { gap: spacing.sm, marginTop: spacing.xs },
});

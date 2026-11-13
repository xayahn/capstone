import { useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';
import { EmailVerificationCard } from '../components/AccountEmailForms';
import { PushSettings } from '../components/PushSettings';
import {
  AppButton,
  Card,
  ChoiceChip,
  Eyebrow,
  Field,
  Notice,
  Screen,
} from '../components/ui';
import { PARISHES } from '../data/catalog';
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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaved, setPasswordSaved] = useState(false);

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
        <Field label="Full name" value={draft.displayName} onChangeText={(displayName) => setDraft({ ...draft, displayName })} />
        <Field label="Email address" value={draft.email} editable={false} keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.fieldHint}>The sign-in email is protected as the account identifier.</Text>
        <Field label="Mobile number" value={draft.mobileNumber} onChangeText={(mobileNumber) => setDraft({ ...draft, mobileNumber })} keyboardType="phone-pad" />
        <Text style={styles.fieldLabel}>Home parish</Text>
        <View style={styles.chipWrap}>
          {PARISHES.map((parish) => (
            <ChoiceChip
              key={parish.id}
              label={parish.name}
              selected={parish.id === draft.homeParishId}
              onPress={() => setDraft({ ...draft, homeParishId: parish.id as ParishId })}
            />
          ))}
        </View>
        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>Notifications</Text>
            <Text style={styles.mutedText}>Allow push alerts for appointment, document and queue updates. Save this preference, then enable this device below.</Text>
          </View>
          <Switch
            accessibilityLabel="Enable notifications"
            value={draft.notificationsEnabled}
            onValueChange={(notificationsEnabled) => setDraft({ ...draft, notificationsEnabled })}
            trackColor={{ false: colors.line, true: colors.greenSoft }}
            thumbColor={draft.notificationsEnabled ? colors.green : colors.inkSoft}
          />
        </View>
        {saved ? <Text style={styles.savedText}>Profile changes saved.</Text> : null}
        <AppButton
          label="Save profile"
          icon="save-outline"
          loading={loading}
          disabled={loading || !draft.displayName.trim() || !draft.email.trim()}
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
        <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
        <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Text style={styles.fieldHint}>12–128 characters with uppercase and lowercase letters plus a number.</Text>
        <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {passwordSaved ? <Text style={styles.savedText}>Password changed. Other sessions were signed out.</Text> : null}
        <AppButton
          label="Change password"
          icon="key-outline"
          loading={loading}
          disabled={loading || !currentPassword || !newPassword || !confirmPassword}
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
        <Text style={styles.mutedText}>Avoid uploading documents unless the selected parish has asked for them. Official archive changes require parish staff.</Text>
        <AppButton label="Sign out" variant="secondary" icon="log-out-outline" onPress={onSignOut} />
        {mode === 'demo' ? (
          <AppButton
            label="Reset sample data"
            variant="danger"
            icon="refresh-outline"
            onPress={() => Alert.alert(
              'Reset demonstration?',
              'This removes local sample changes and restores the original demonstration.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: () => void onReset() },
              ],
            )}
          />
        ) : null}
      </Card>
    </Screen>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 27, lineHeight: 31 },
  fieldHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: -spacing.xs },
  fieldLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.xs, marginTop: spacing.md },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  settingRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, marginVertical: spacing.lg },
  itemTitle: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 22 },
  mutedText: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 },
  savedText: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 14, marginBottom: spacing.sm },
});

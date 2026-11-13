import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PasswordRecoveryForm, type PasswordRecoveryActions } from '../components/AccountEmailForms';
import {
  AppButton,
  BrandMark,
  Card,
  ChoiceChip,
  Eyebrow,
  Feature,
  Field,
  Notice,
} from '../components/ui';
import { PARISHES } from '../data/catalog';
import { colors, fonts, radii, spacing } from '../theme';
import type { ParishId } from '../types/domain';

export interface WelcomeScreenProps {
  loading: boolean;
  error: string;
  mode: 'demo' | 'api';
  onSignIn: (input: { email: string; password: string }) => Promise<void>;
  onSignUp: (input: {
    displayName: string;
    email: string;
    mobileNumber: string;
    homeParishId: ParishId;
    password: string;
    confirmPassword: string;
    acceptPrivacyNotice: boolean;
  }) => Promise<void>;
  recoveryActions: PasswordRecoveryActions;
  onClearError: () => void;
}

export const WelcomeScreen = ({
  loading,
  error,
  mode,
  onSignIn,
  onSignUp,
  recoveryActions,
  onClearError,
}: WelcomeScreenProps) => {
  const [showAuth, setShowAuth] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryConfirmed, setRecoveryConfirmed] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(mode === 'demo' ? 'maria.santos@example.test' : '');
  const [password, setPassword] = useState(mode === 'demo' ? 'parishlink-demo' : '');
  const [displayName, setDisplayName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [homeParishId, setHomeParishId] = useState<ParishId>('metropolitan-cathedral');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptPrivacyNotice, setAcceptPrivacyNotice] = useState(false);

  const chooseMode = (next: 'signin' | 'signup') => {
    setAuthMode(next);
    onClearError();
    setRecoveryConfirmed(false);
    if (next === 'signup' && mode === 'demo' && email.endsWith('@example.test')) {
      setEmail('');
      setPassword('');
    }
  };

  const closeAuth = () => {
    setShowAuth(false);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setDisplayName('');
    setMobileNumber('');
    setAcceptPrivacyNotice(false);
    setRecoveryOpen(false);
    setRecoveryConfirmed(false);
    onClearError();
  };

  const submitDisabled = loading || !email.trim() || !password || (
    authMode === 'signup' && (
      !displayName.trim() || !mobileNumber.trim() || !confirmPassword || !acceptPrivacyNotice
    )
  );

  return (
    <LinearGradient colors={[colors.leatherDark, colors.oxbloodDark, colors.leather]} style={styles.welcomeBackground}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.welcomeSafe}>
        <ScrollView contentContainerStyle={styles.welcomeScroll} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={styles.welcomeBrand}>
            <BrandMark />
            <Eyebrow light>Faith • Service • Community</Eyebrow>
            <Text style={styles.welcomeTitle}>ParishLink</Text>
            <Text style={styles.welcomeSubtitle}>Sacramental services, thoughtfully connected.</Text>
          </View>

          <Card style={styles.welcomeCard}>
            {showAuth ? recoveryOpen ? (
              <PasswordRecoveryForm
                initialEmail={email}
                actions={recoveryActions}
                onClose={(confirmed) => {
                  setRecoveryOpen(false);
                  setRecoveryConfirmed(confirmed);
                  setAuthMode('signin');
                  setEmail('');
                  setPassword('');
                  setConfirmPassword('');
                  onClearError();
                }}
              />
            ) : (
              <>
                <Eyebrow>{mode === 'demo' ? 'Local review workspace' : 'Secure parishioner access'}</Eyebrow>
                <Text style={styles.cardHeadline}>{authMode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
                {recoveryConfirmed ? (
                  <Notice title="Password updated" body="Sign in with your new password." tone="positive" icon="checkmark-circle-outline" />
                ) : null}
                <View style={styles.authModeSwitch} accessibilityRole="tablist">
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: authMode === 'signin' }}
                    onPress={() => chooseMode('signin')}
                    style={[styles.authModeButton, authMode === 'signin' && styles.authModeButtonActive]}
                  >
                    <Text style={[styles.authModeText, authMode === 'signin' && styles.authModeTextActive]}>Sign in</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: authMode === 'signup' }}
                    onPress={() => chooseMode('signup')}
                    style={[styles.authModeButton, authMode === 'signup' && styles.authModeButtonActive]}
                  >
                    <Text style={[styles.authModeText, authMode === 'signup' && styles.authModeTextActive]}>Create account</Text>
                  </Pressable>
                </View>
                {mode === 'demo' ? (
                  <Notice
                    title={authMode === 'signin' ? 'Review account' : 'Local account only'}
                    body={authMode === 'signin'
                      ? 'Use the filled fictional account, or sign in with an account you created on this device.'
                      : 'This creates a separate account only on this device. It is not yet an official parish account.'}
                    tone="warning"
                    icon="flask-outline"
                  />
                ) : null}
                {authMode === 'signup' ? (
                  <>
                    <Field label="Complete name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" autoComplete="name" textContentType="name" />
                    <Field label="Mobile number" value={mobileNumber} onChangeText={setMobileNumber} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+63 9XX XXX XXXX" />
                  </>
                ) : null}
                <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} textContentType={authMode === 'signup' ? 'newPassword' : 'password'} />
                {authMode === 'signup' ? (
                  <>
                    <Text style={styles.fieldHint}>12–128 characters with uppercase and lowercase letters plus a number.</Text>
                    <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
                    <View style={styles.authSection}>
                      <Text style={styles.authSectionLabel}>Home parish</Text>
                      <View style={styles.chipWrap}>
                        {PARISHES.map((parish) => (
                          <ChoiceChip
                            key={parish.id}
                            label={parish.name}
                            selected={homeParishId === parish.id}
                            onPress={() => setHomeParishId(parish.id)}
                          />
                        ))}
                      </View>
                    </View>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: acceptPrivacyNotice }}
                      onPress={() => setAcceptPrivacyNotice((value) => !value)}
                      style={styles.privacyConsent}
                    >
                      <View style={[styles.checkbox, acceptPrivacyNotice && styles.checkboxChecked]}>
                        {acceptPrivacyNotice ? <Ionicons name="checkmark" size={15} color={colors.paperLight} /> : null}
                      </View>
                      <Text style={styles.privacyConsentText}>
                        I understand ParishLink stores personal and sacramental-service information only for coordination, and authorized parish personnel make all official decisions.
                      </Text>
                    </Pressable>
                  </>
                ) : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <AppButton
                  label={authMode === 'signin' ? (mode === 'demo' ? 'Enter demonstration' : 'Sign in securely') : 'Create account'}
                  icon={authMode === 'signin' ? 'log-in-outline' : 'person-add-outline'}
                  loading={loading}
                  disabled={submitDisabled}
                  onPress={() => void (authMode === 'signin'
                    ? onSignIn({ email, password })
                    : onSignUp({ displayName, email, mobileNumber, homeParishId, password, confirmPassword, acceptPrivacyNotice })).catch(() => undefined)}
                />
                {authMode === 'signin' && mode === 'api' ? (
                  <AppButton
                    label="Forgot password?"
                    variant="secondary"
                    disabled={loading}
                    onPress={() => {
                      setRecoveryOpen(true);
                      setPassword('');
                      setConfirmPassword('');
                      onClearError();
                    }}
                  />
                ) : null}
                <AppButton label="Back to introduction" variant="ghost" onPress={closeAuth} />
                <Text style={styles.privacyNote}>
                  Passwords are never included in uploaded documents or assistant messages. Production mode stores the session token in the device’s protected credential storage.
                </Text>
              </>
            ) : (
              <>
                <Eyebrow>One respectful path</Eyebrow>
                <Text style={styles.cardHeadline}>Prepare before you visit</Text>
                <Feature icon="calendar-outline" title="Request a schedule" body="Check parish, clergy, venue, and service-time availability." />
                <Feature icon="documents-outline" title="Prepare documents" body="Follow clear checklists and staff verification updates." />
                <Feature icon="notifications-outline" title="Stay informed" body="Track requests, notices, and your walk-in queue ticket." />
                <AppButton label="Continue" icon="arrow-forward" onPress={() => setShowAuth(true)} />
              </>
            )}
          </Card>
          <Text style={styles.welcomeFooter}>
            ParishLink supports coordination. Parish personnel retain final authority over approvals, records, and sacramental decisions.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  welcomeBackground: { flex: 1 },
  welcomeSafe: { flex: 1 },
  welcomeScroll: { alignItems: 'center', gap: spacing.xl, minHeight: '100%', padding: spacing.xl, paddingBottom: 48 },
  welcomeBrand: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  welcomeTitle: { color: colors.card, fontFamily: fonts.displayBold, fontSize: 48, lineHeight: 52 },
  welcomeSubtitle: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, maxWidth: 330, textAlign: 'center' },
  welcomeCard: { gap: spacing.md, maxWidth: 520, width: '100%' },
  welcomeFooter: { color: colors.paperLight, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, maxWidth: 500, opacity: 0.88, textAlign: 'center' },
  cardHeadline: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 27, lineHeight: 31 },
  authModeSwitch: {
    backgroundColor: colors.paperLight,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    padding: spacing.xxs,
  },
  authModeButton: {
    alignItems: 'center',
    borderRadius: radii.pill,
    flex: 1,
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  authModeButtonActive: { backgroundColor: colors.oxblood },
  authModeText: { color: colors.inkSoft, fontFamily: fonts.bodyBold, fontSize: 14 },
  authModeTextActive: { color: colors.paperLight },
  authSection: { gap: spacing.sm, marginTop: spacing.sm },
  authSectionLabel: { color: colors.ink, fontFamily: fonts.bodyBold, fontSize: 14 },
  fieldHint: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginTop: -spacing.xs },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  privacyConsent: {
    alignItems: 'flex-start',
    backgroundColor: colors.paperLight,
    borderColor: colors.line,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.oxblood,
    borderRadius: 5,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    marginTop: 1,
    width: 22,
  },
  checkboxChecked: { backgroundColor: colors.oxblood },
  privacyConsentText: { color: colors.inkSoft, flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 },
  privacyNote: { color: colors.inkSoft, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  errorText: { color: colors.red, fontFamily: fonts.bodySemibold, fontSize: 13, lineHeight: 20 },
});

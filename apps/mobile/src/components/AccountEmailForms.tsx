import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { AppButton, Card, Eyebrow, Notice, StatusBadge } from './ui';
import { useAccountCodeFlow } from '../hooks/useAccountCodeFlow';
import { colors, fonts, radii, spacing, type } from '../theme';
import type { PasswordResetInput } from '../types/domain';

export type PasswordRecoveryActions = {
  request: (email: string, signal?: AbortSignal) => Promise<void>;
  confirm: (input: PasswordResetInput, signal?: AbortSignal) => Promise<void>;
};

function CodeField({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput {...props} accessibilityLabel={label} style={styles.input}
      placeholderTextColor={colors.inkSoft} />
  </View>;
}
function CodeNotice() {
  return <Text style={styles.hint}>Only the newest code works, and it expires after 15 minutes. An accepted request does not confirm inbox delivery. Check your inbox and spam folder; request a new code if none arrives.</Text>;
}
function FlowError({ error }: { error: string }) {
  return error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{error}</Text> : null;
}

export function PasswordRecoveryForm({ initialEmail = '', actions, onClose }: {
  initialEmail?: string; actions: PasswordRecoveryActions; onClose: (confirmed: boolean) => void;
}) {
  const flow = useAccountCodeFlow('reset', initialEmail, actions);
  const { state } = flow;
  const close = (confirmed = false) => { flow.reset(); onClose(confirmed); };
  if (state.phase === 'success') return <View style={styles.form}>
    <Eyebrow>Account recovery</Eyebrow>
    <Text accessibilityRole="header" style={type.heading}>Password updated</Text>
    <Notice title="Reset confirmed" body="Sign in with your new password. Existing sessions have been signed out." tone="positive" icon="checkmark-circle-outline" />
    <AppButton label="Return to sign in" onPress={() => close(true)} icon="log-in-outline" />
  </View>;
  return <View style={styles.form}>
    <Eyebrow>Account recovery</Eyebrow>
    <Text accessibilityRole="header" style={type.heading}>{state.phase === 'request' ? 'Forgot your password?' : 'Enter your reset code'}</Text>
    <Text style={styles.copy}>{state.phase === 'request'
      ? 'Request a code for your sign-in email. ParishLink gives the same response whether an eligible account exists or not.'
      : 'If an eligible account exists, a reset code will be sent. Enter the code from your email to choose a new password.'}</Text>
    <CodeField label="Recovery email address" value={state.email} onChangeText={value => flow.setField('email', value)}
      editable={!state.busy && state.phase === 'request'} keyboardType="email-address"
      autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" maxLength={254} />
    {state.phase === 'confirm' ? <>
      <CodeNotice />
      <CodeField label="Password reset code" value={state.code} onChangeText={value => flow.setField('code', value)}
        editable={!state.busy} placeholder="XXXX-XXXX-XXXX" maxLength={30} autoCapitalize="characters"
        autoCorrect={false} autoComplete="one-time-code" textContentType="oneTimeCode" />
      <CodeField label="New recovery password" value={state.newPassword} onChangeText={value => flow.setField('newPassword', value)}
        editable={!state.busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" maxLength={128} />
      <Text style={styles.hint}>Use 12–128 characters with uppercase and lowercase letters plus a number.</Text>
      <CodeField label="Confirm recovery password" value={state.confirmPassword} onChangeText={value => flow.setField('confirmPassword', value)}
        editable={!state.busy} secureTextEntry autoCapitalize="none" autoCorrect={false}
        autoComplete="new-password" textContentType="newPassword" maxLength={128} />
    </> : null}
    <FlowError error={state.error} />
    <AppButton label={state.phase === 'request' ? 'Request reset code' : 'Reset password'}
      loading={state.busy} disabled={state.busy || !state.email.trim()}
      onPress={() => void (state.phase === 'request' ? flow.request() : flow.confirm())} />
    {state.phase === 'confirm' ? <>
      <AppButton label="Request a new reset code" variant="secondary" disabled={state.busy} onPress={() => void flow.request()} />
      <AppButton label="Use a different email" variant="ghost" disabled={state.busy} onPress={() => flow.reset(state.email)} />
    </> : null}
    <AppButton label={state.busy ? 'Cancel and return to sign in' : 'Back to sign in'}
      variant="ghost" onPress={() => close()} />
  </View>;
}

export function EmailVerificationCard({ email, emailVerified, mode, request, confirm }: {
  email: string; emailVerified?: boolean; mode: 'demo' | 'api';
  request: (signal?: AbortSignal) => Promise<void>;
  confirm: (code: string, signal?: AbortSignal) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const flow = useAccountCodeFlow('verification', email, {
    request: (_email, signal) => request(signal),
    confirm: (input, signal) => confirm(input.code, signal),
  });
  const verified = mode === 'api' && emailVerified === true;
  useEffect(() => { if (verified) { flow.reset(email); setOpen(false); } }, [verified, email, flow.reset]);
  return <Card>
    <Eyebrow>Email security</Eyebrow>
    <View style={styles.row}>
      <Text accessibilityRole="header" style={[type.heading, styles.flex]}>Verify your email</Text>
      <StatusBadge label={verified ? 'Verified' : 'Not verified'} tone={verified ? 'positive' : 'warning'} />
    </View>
    <Text style={styles.copy}>{verified ? 'Your account email has been confirmed by the server.' : 'Confirm that you can receive messages at your sign-in email.'}</Text>
    <Text style={styles.email}>{email}</Text>
    {mode === 'demo' ? <Notice title="Demonstration account" body="Email delivery and verification are unavailable in the local demonstration. This account is not marked verified." tone="info" />
      : verified ? null : <>
        {open && flow.state.phase === 'confirm' ? <>
          <CodeNotice />
          <CodeField label="Email verification code" value={flow.state.code} onChangeText={value => flow.setField('code', value)}
            editable={!flow.state.busy} placeholder="XXXX-XXXX-XXXX" maxLength={30}
            autoCapitalize="characters" autoCorrect={false} autoComplete="one-time-code" textContentType="oneTimeCode" />
          <AppButton label="Confirm email address" disabled={flow.state.busy || !flow.state.code.trim()}
            loading={flow.state.busy} onPress={() => void flow.confirm()} />
        </> : null}
        <FlowError error={flow.state.error} />
        <AppButton label={flow.state.phase === 'confirm' ? 'Request a new verification code' : 'Send verification code'}
          variant={flow.state.phase === 'confirm' ? 'secondary' : 'primary'}
          loading={flow.state.busy} disabled={flow.state.busy} onPress={() => { setOpen(true); void flow.request(); }} />
        {open ? <AppButton label={flow.state.busy ? 'Cancel verification request' : 'Close verification'}
          variant="ghost" onPress={() => { flow.reset(email); setOpen(false); }} /> : null}
      </>}
  </Card>;
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm }, field: { gap: spacing.xs },
  label: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  input: { ...type.body, minHeight: 54, borderWidth: 1, borderColor: colors.line, borderRadius: radii.sm,
    backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  copy: { ...type.body, color: colors.inkSoft }, hint: { ...type.body, fontSize: 14.5, lineHeight: 21, color: colors.inkSoft },
  error: { ...type.body, color: colors.red }, email: { ...type.body, fontFamily: fonts.bodySemibold },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, flex: { flex: 1 },
});

import { StyleSheet, Text } from 'react-native';
import { AppButton, Card, Eyebrow } from './ui';
import type { PushState } from '../notifications/pushRegistration';
import { colors, type } from '../theme';

export function PushSettings({ state, accountEnabled, onEnable, onRetry, onSettings }: {
  state: PushState; accountEnabled: boolean;
  onEnable: () => Promise<void>; onRetry: () => Promise<void>; onSettings: () => Promise<void>;
}) {
  const unavailable = ['unsupported', 'unconfigured'].includes(state.status);
  return <Card>
    <Eyebrow>Device alerts</Eyebrow>
    <Text style={type.heading}>Push notifications</Text>
    <Text accessibilityLiveRegion="polite" style={styles.copy}>{state.message}</Text>
    <Text style={styles.copy}>Lock-screen alerts use a general message. Open ParishLink and sign in to view private details.</Text>
    {!accountEnabled ? <Text style={styles.copy}>Turn on Notifications above and save your profile first.</Text>
      : state.status === 'denied' ? <>
        <AppButton label="Open notification settings" variant="secondary" onPress={() => void onSettings()} />
        <AppButton label="Check permission again" variant="ghost" onPress={() => void onRetry()} />
      </> : !unavailable ? <AppButton
        label={state.status === 'registered' ? 'Check push connection' : 'Enable on this device'}
        icon="notifications-outline" loading={state.status === 'registering'}
        disabled={state.status === 'registering'}
        onPress={() => void (state.status === 'permission_required' ? onEnable() : state.status === 'registered' ? onRetry() : onEnable())}
      /> : null}
  </Card>;
}

const styles = StyleSheet.create({ copy: { ...type.body, color: colors.inkSoft } });

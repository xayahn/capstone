import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { Linking, Platform } from 'react-native';
import { uuidPattern, type PushAdapter } from './pushRegistration';

const INSTALLATION_KEY = 'parishlink.push.installation.v1';
let installation: Promise<string> | undefined;
const getProjectId = () => process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim()
  || Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;

export const pushAdapter: PushAdapter = {
  availability: () => {
    if ((Platform.OS !== 'ios' && Platform.OS !== 'android') || !Device.isDevice || Constants.expoVersion) {
      return { status: 'unsupported', message: 'Push alerts need an installed ParishLink development or release build on a physical iOS or Android device. Expo Go and this preview use in-app updates.' };
    }
    const projectId: unknown = getProjectId();
    if (typeof projectId !== 'string' || !uuidPattern.test(projectId)) {
      return { status: 'unconfigured', message: 'Push alerts are not configured for this build yet. Your in-app updates remain available.' };
    }
    return { status: 'available', platform: Platform.OS, projectId };
  },
  permissions: async request => {
    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('parishlink-updates', {
        name: 'Parish updates', importance: Notifications.AndroidImportance.DEFAULT,
        description: 'Appointment, document and queue updates', sound: 'default',
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    const granted = () => permission.granted
      || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (request && !granted() && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } });
    }
    return { granted: granted(), canAskAgain: permission.canAskAgain };
  },
  token: async projectId => (await (await import('expo-notifications')).getExpoPushTokenAsync({ projectId })).data,
  installationId: async () => {
    installation ??= (async () => {
      const saved = await SecureStore.getItemAsync(INSTALLATION_KEY);
      if (saved && uuidPattern.test(saved)) return saved;
      const id = Crypto.randomUUID();
      await SecureStore.setItemAsync(INSTALLATION_KEY, id, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
      return id;
    })().catch(error => { installation = undefined; throw error; });
    return installation;
  },
  subscribe: async (received, tapped, enabled) => {
    if (pushAdapter.availability().status !== 'available') return () => undefined;
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: enabled(), shouldShowList: enabled(), shouldPlaySound: enabled(), shouldSetBadge: false,
      }),
    });
    const receiveListener = Notifications.addNotificationReceivedListener(() => { if (enabled()) received(); });
    const tapListener = Notifications.addNotificationResponseReceivedListener(response => {
      tapped(response.notification.request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });
    const tokenListener = Notifications.addPushTokenListener(() => { if (enabled()) received(); });
    const cleanup = () => { receiveListener.remove(); tapListener.remove(); tokenListener.remove(); };
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      if (last) {
        tapped(last.notification.request.content.data);
        await Notifications.clearLastNotificationResponseAsync();
      }
    } catch (error) {
      cleanup();
      throw error;
    }
    return cleanup;
  },
  openSettings: () => Linking.openSettings(),
};

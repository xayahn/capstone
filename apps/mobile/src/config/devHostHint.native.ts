import Constants from 'expo-constants';
import type { DevelopmentHostHint } from './devHostHint';

// Native Expo Go / Dev Client sessions expose the active Metro LAN host in Constants.expoConfig.hostUri.
// Never rewrite a physical device's API host to loopback ('localhost' / '127.0.0.1').
export const getDevelopmentHostHint = (): DevelopmentHostHint | undefined => {
  const hostUri = Constants.expoConfig?.hostUri;
  if (typeof hostUri !== 'string' || !hostUri.trim()) return undefined;
  return { hostname: hostUri.trim(), allowLoopback: false };
};

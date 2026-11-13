import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const API_TOKEN_KEY = 'parishlink_mobile_api_token_v1';
const LEGACY_API_TOKEN_KEY = '@parishlink/mobile-api-token-v1';

/**
 * Native builds keep the session token in the operating system's protected
 * credential store (Expo SecureStore). Keys in SecureStore must be alphanumeric
 * plus . - or _ (never @ or /).
 * AsyncStorage is used only by the browser-based local preview.
 */
export async function getMobileApiToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const current = await AsyncStorage.getItem(API_TOKEN_KEY);
    if (current) return current;
    return AsyncStorage.getItem(LEGACY_API_TOKEN_KEY);
  }
  return SecureStore.getItemAsync(API_TOKEN_KEY);
}

export async function setMobileApiToken(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(API_TOKEN_KEY, value);
    return;
  }
  await SecureStore.setItemAsync(API_TOKEN_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearMobileApiToken(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(API_TOKEN_KEY);
    await AsyncStorage.removeItem(LEGACY_API_TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(API_TOKEN_KEY);
}

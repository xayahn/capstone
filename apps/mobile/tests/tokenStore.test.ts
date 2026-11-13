import { beforeEach, describe, expect, it, vi } from 'vitest';

const { secureStoreMock, asyncStorageMock, platformRef } = vi.hoisted(() => ({
  secureStoreMock: {
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when_unlocked_this_device_only',
  },
  asyncStorageMock: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
  platformRef: {
    OS: 'ios' as 'ios' | 'android' | 'web',
  },
}));

vi.mock('expo-secure-store', () => secureStoreMock);
vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorageMock }));
vi.mock('react-native', () => ({
  Platform: {
    get OS() {
      return platformRef.OS;
    },
  },
}));

import {
  clearMobileApiToken,
  getMobileApiToken,
  setMobileApiToken,
} from '../src/api/tokenStore';

describe('tokenStore', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    platformRef.OS = 'ios';
  });

  describe('native platform (iOS / Android)', () => {
    it('uses an Expo SecureStore key that conforms to the alphanumeric spec', async () => {
      secureStoreMock.getItemAsync.mockResolvedValue('test-native-token');

      const token = await getMobileApiToken();
      expect(token).toBe('test-native-token');
      expect(secureStoreMock.getItemAsync).toHaveBeenCalledOnce();

      const callArgs = secureStoreMock.getItemAsync.mock.calls[0] ?? [];
      const calledKey = callArgs[0] as string;
      // SecureStore requires alphanumeric characters, '.', '-', or '_' only. No '@' or '/'!
      expect(calledKey).toMatch(/^[a-zA-Z0-9._-]+$/);
      expect(calledKey).not.toContain('@');
      expect(calledKey).not.toContain('/');
    });

    it('stores token in SecureStore with device-unlocked protection', async () => {
      secureStoreMock.setItemAsync.mockResolvedValue(undefined);

      await setMobileApiToken('sample-session-jwt');
      expect(secureStoreMock.setItemAsync).toHaveBeenCalledOnce();

      const callArgs = secureStoreMock.setItemAsync.mock.calls[0] ?? [];
      const [calledKey, value, options] = callArgs as [string, string, { keychainAccessible: string }];
      expect(calledKey).toMatch(/^[a-zA-Z0-9._-]+$/);
      expect(value).toBe('sample-session-jwt');
      expect(options).toEqual({
        keychainAccessible: 'when_unlocked_this_device_only',
      });
    });

    it('clears token from SecureStore using valid key', async () => {
      secureStoreMock.deleteItemAsync.mockResolvedValue(undefined);

      await clearMobileApiToken();
      expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledOnce();

      const callArgs = secureStoreMock.deleteItemAsync.mock.calls[0] ?? [];
      const calledKey = callArgs[0] as string;
      expect(calledKey).toMatch(/^[a-zA-Z0-9._-]+$/);
    });
  });

  describe('web preview fallback', () => {
    beforeEach(() => {
      platformRef.OS = 'web';
    });

    it('reads token from AsyncStorage on web preview', async () => {
      asyncStorageMock.getItem.mockResolvedValueOnce('web-preview-token');

      const token = await getMobileApiToken();
      expect(token).toBe('web-preview-token');
      expect(asyncStorageMock.getItem).toHaveBeenCalled();
      expect(secureStoreMock.getItemAsync).not.toHaveBeenCalled();
    });

    it('falls back to legacy web key if new key is unset', async () => {
      asyncStorageMock.getItem
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('legacy-web-token');

      const token = await getMobileApiToken();
      expect(token).toBe('legacy-web-token');
      expect(asyncStorageMock.getItem).toHaveBeenCalledTimes(2);
    });

    it('sets token in AsyncStorage on web preview', async () => {
      await setMobileApiToken('new-web-token');
      expect(asyncStorageMock.setItem).toHaveBeenCalledWith(
        'parishlink_mobile_api_token_v1',
        'new-web-token',
      );
      expect(secureStoreMock.setItemAsync).not.toHaveBeenCalled();
    });

    it('clears token from AsyncStorage on web preview', async () => {
      await clearMobileApiToken();
      expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('parishlink_mobile_api_token_v1');
      expect(asyncStorageMock.removeItem).toHaveBeenCalledWith('@parishlink/mobile-api-token-v1');
      expect(secureStoreMock.deleteItemAsync).not.toHaveBeenCalled();
    });
  });
});

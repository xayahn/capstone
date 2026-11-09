import { beforeEach, describe, expect, it, vi } from 'vitest';
const { constants, device, native } = vi.hoisted(() => ({
  constants: { expoVersion: null as string | null, expoConfig: {}, easConfig: { projectId: '12345678-1234-4234-8234-123456789abc' } },
  device: { isDevice: true },
  native: {
    AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationChannelAsync: vi.fn(), getPermissionsAsync: vi.fn(), requestPermissionsAsync: vi.fn(),
    setNotificationHandler: vi.fn(), addNotificationReceivedListener: vi.fn(),
    addNotificationResponseReceivedListener: vi.fn(), addPushTokenListener: vi.fn(),
    getLastNotificationResponseAsync: vi.fn(), clearLastNotificationResponseAsync: vi.fn(),
  },
}));
vi.mock('expo-constants', () => ({ default: constants }));
vi.mock('expo-device', () => device);
vi.mock('expo-notifications', () => native);
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => 'abcdefab-1234-4234-8234-123456789abc' }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, Linking: { openSettings: vi.fn() } }));
import { pushAdapter } from '../src/notifications/pushAdapter.native';

beforeEach(() => {
  vi.resetAllMocks();
  constants.expoVersion = null;
  device.isDevice = true;
  native.setNotificationChannelAsync.mockResolvedValue(null);
  native.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
  native.requestPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
});
describe('native notification adapter', () => {
  it('does not request OS permission during an automatic check', async () => {
    expect(await pushAdapter.permissions(false)).toEqual({ granted: false, canAskAgain: true });
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(native.setNotificationChannelAsync).toHaveBeenCalledWith('parishlink-updates', expect.any(Object));
  });
  it('asks for permission only after the user explicitly enables this device', async () => {
    expect(await pushAdapter.permissions(true)).toEqual({ granted: true, canAskAgain: true });
    expect(native.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
  it('does not repeatedly prompt after permission is blocked in settings', async () => {
    native.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await pushAdapter.permissions(true)).toEqual({ granted: false, canAskAgain: false });
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it('recognizes iOS provisional permission', async () => {
    native.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true, ios: { status: 3 } });
    expect((await pushAdapter.permissions(true)).granted).toBe(true);
    expect(native.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it('reports Expo Go and nonphysical previews as unsupported before initializing listeners', async () => {
    constants.expoVersion = '57.0.0';
    expect(pushAdapter.availability().status).toBe('unsupported');
    await pushAdapter.subscribe(vi.fn(), vi.fn(), () => true);
    expect(native.addNotificationReceivedListener).not.toHaveBeenCalled();
    constants.expoVersion = null;
    device.isDevice = false;
    expect(pushAdapter.availability().status).toBe('unsupported');
  });
  it('cleans up listeners if reading the cold-launch response fails', async () => {
    const remove = vi.fn();
    native.addNotificationReceivedListener.mockReturnValue({ remove });
    native.addNotificationResponseReceivedListener.mockReturnValue({ remove });
    native.addPushTokenListener.mockReturnValue({ remove });
    native.getLastNotificationResponseAsync.mockRejectedValue(new Error('native unavailable'));
    await expect(pushAdapter.subscribe(vi.fn(), vi.fn(), () => true)).rejects.toThrow('native unavailable');
    expect(remove).toHaveBeenCalledTimes(3);
  });
});

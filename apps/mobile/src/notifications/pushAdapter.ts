import type { PushAdapter } from './pushRegistration';

// Web previews deliberately never import the native notification module.
export const pushAdapter: PushAdapter = {
  availability: () => ({ status: 'unsupported', message: 'Push alerts are available in the installed iOS and Android app. This browser still shows in-app updates.' }),
  permissions: async () => ({ granted: false, canAskAgain: false }),
  token: async () => { throw new Error('Native push unavailable'); },
  installationId: async () => { throw new Error('Native push unavailable'); },
  subscribe: async () => () => undefined,
  openSettings: async () => undefined,
};

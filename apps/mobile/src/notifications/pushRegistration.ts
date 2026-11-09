import type { AppNotification, RepositorySnapshot } from '../types/domain';

export type PushDeviceRegistration = {
  installationId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
  projectId: string;
};

export type PushStatus = 'disabled' | 'unsupported' | 'unconfigured' | 'permission_required'
  | 'denied' | 'registering' | 'registered' | 'error';
export type PushState = { status: PushStatus; message: string };
export type PushAvailability = { status: 'available'; platform: 'ios' | 'android'; projectId: string }
  | { status: 'unsupported' | 'unconfigured'; message: string };

export interface PushAdapter {
  availability(): PushAvailability;
  permissions(request: boolean): Promise<{ granted: boolean; canAskAgain: boolean }>;
  token(projectId: string): Promise<string>;
  installationId(): Promise<string>;
  subscribe(onReceived: () => void, onTap: (data: unknown) => void, enabled: () => boolean): Promise<() => void>;
  openSettings(): Promise<void>;
}

const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Only an opaque notification identifier is accepted from an OS notification.
 * Navigation comes from the authenticated snapshot, never from a push URL. */
export function pushNotificationId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const id = (data as Record<string, unknown>).notificationId;
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:.+-]{0,255}$/.test(id) ? id : undefined;
}

export function resolvePushNotification(data: unknown, snapshot: RepositorySnapshot): AppNotification | undefined {
  const id = pushNotificationId(data);
  if (!id) return undefined;
  const notice = snapshot.notifications.find(item => item.id === id);
  if (!notice) return undefined;
  const target = notice.target;
  if (target.kind === 'appointment'
    && !snapshot.appointments.some(item => item.id === target.appointmentId)) return undefined;
  return notice;
}

/** Session generations prevent a delayed native token/storage operation from
 * registering a device after logout or under a subsequently signed-in account. */
export class PushRegistration {
  private generation = 0;
  private operation = 0;
  private context: { key: string; enabled: boolean } | undefined;
  constructor(private readonly adapter: PushAdapter,
    private readonly register: (input: PushDeviceRegistration) => Promise<void>,
    private readonly changed: (state: PushState) => void) {}

  configure(key: string | undefined, enabled: boolean): void {
    if (this.context?.key === key && this.context?.enabled === enabled) return;
    this.generation += 1;
    this.operation += 1;
    this.context = key ? { key, enabled } : undefined;
    if (!key || !enabled) this.changed({ status: 'disabled', message: 'Push notifications are off for this account. In-app updates remain available.' });
  }

  invalidate(): void {
    this.generation += 1;
    this.operation += 1;
    this.context = undefined;
  }

  enabled(): boolean { return Boolean(this.context?.enabled); }

  async synchronize(requestPermission = false): Promise<void> {
    if (!this.context?.enabled) return;
    const generation = this.generation;
    const operation = ++this.operation;
    let timedOut = false;
    const sameContext = () => generation === this.generation && operation === this.operation && Boolean(this.context?.enabled);
    const isCurrent = () => sameContext() && !timedOut;
    const available = this.adapter.availability();
    if (available.status !== 'available') { this.changed(available); return; }
    this.changed({ status: 'registering', message: 'Checking notifications on this device…' });
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const work = async () => {
      const permission = await this.adapter.permissions(requestPermission);
      if (!isCurrent()) return;
      if (!permission.granted) {
        this.changed(permission.canAskAgain
          ? { status: 'permission_required', message: 'Choose Enable on this device to allow appointment and queue alerts.' }
          : { status: 'denied', message: 'Notifications are blocked in device settings. You can enable them there and then check again.' });
        return;
      }
      const installationId = await this.adapter.installationId();
      if (!isCurrent()) return;
      const expoPushToken = await this.adapter.token(available.projectId);
      if (!isCurrent()) return;
      if (!uuidPattern.test(installationId) || !tokenPattern.test(expoPushToken)) throw new Error('Invalid device registration');
      await this.register({ installationId, expoPushToken, projectId: available.projectId, platform: available.platform });
      if (!isCurrent()) return;
      this.changed({ status: 'registered', message: 'This device is registered for push alerts. Delivery also depends on your connection and device settings.' });
    };
    try {
      await Promise.race([work(), new Promise<never>((_, reject) => {
        deadline = setTimeout(() => { timedOut = true; reject(new Error('Notification setup timed out')); }, 25_000);
      })]);
    } catch {
      if (sameContext()) this.changed({ status: 'error', message: timedOut
        ? 'Device notification setup took too long. Check your connection and try again. In-app updates remain available.'
        : 'This device could not register for push alerts. Check your connection and try again. In-app updates remain available.' });
    } finally {
      if (deadline) clearTimeout(deadline);
    }
  }
}

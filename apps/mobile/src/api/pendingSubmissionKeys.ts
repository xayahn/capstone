type Dependencies = {
  read: (key: string) => Promise<string | null>;
  write: (key: string, value: string) => Promise<void>;
  digest: (value: string) => Promise<string>;
  randomUUID: () => string;
  now?: () => number;
};

/** Persist only a digest, opaque retry key, and timestamp; never names or form data. */
export class PendingSubmissionKeys {
  private serial: Promise<unknown> = Promise.resolve();
  constructor(private readonly dependencies: Dependencies) {}

  get(fingerprint: string): Promise<string> {
    const operation = this.serial.then(async () => {
      const storageKey = '@parishlink/submission-v1:' + await this.dependencies.digest(fingerprint);
      const stored = await this.dependencies.read(storageKey);
      const now = this.dependencies.now?.() ?? Date.now();
      if (stored) {
        let value: { key?: unknown; createdAt?: unknown };
        try { value = JSON.parse(stored); }
        catch { throw new Error('The saved submission could not be recovered. Check your requests before submitting again.'); }
        if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value.key)
          || typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) {
          throw new Error('The saved submission could not be recovered. Check your requests before submitting again.');
        }
        // Server keys expire in seven days. Never silently retry with a fresh key.
        if (now - value.createdAt > 6 * 86_400_000 || value.createdAt > now + 60_000) {
          throw new Error('This saved submission is too old to retry safely. Check your existing requests and contact parish staff before rebooking.');
        }
        return value.key;
      }
      const key = 'appointment-' + this.dependencies.randomUUID();
      if (!/^appointment-[0-9a-f-]{36}$/i.test(key)) throw new Error('Could not prepare the submission.');
      await this.dependencies.write(storageKey, JSON.stringify({ key, createdAt: now }));
      return key;
    });
    this.serial = operation.catch(() => undefined);
    return operation;
  }
}

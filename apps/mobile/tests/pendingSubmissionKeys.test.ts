import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { PendingSubmissionKeys } from '../src/api/pendingSubmissionKeys';

function fixture() {
  const values = new Map<string,string>();
  let now = 100000000;
  const deps = {
    read: async (key: string) => values.get(key) ?? null,
    write: async (key: string, value: string) => { values.set(key,value); },
    digest: async (value: string) => createHash('sha256').update(value).digest('hex'),
    randomUUID: vi.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
    now: () => now,
  };
  return { values, deps, advance: () => { now += 7 * 86400000; } };
}
describe('persistent booking retry identity', () => {
  it('reuses one key across retries, concurrent requests and app restarts', async () => {
    const { deps } = fixture(), keys = new PendingSubmissionKeys(deps);
    const result = await Promise.all([keys.get('user-one:booking'), keys.get('user-one:booking')]);
    expect(result[0]).toBe(result[1]);
    expect(await new PendingSubmissionKeys(deps).get('user-one:booking')).toBe(result[0]);
    expect(deps.randomUUID).toHaveBeenCalledOnce();
  });
  it('does not store names or form content', async () => {
    const { deps, values } = fixture();
    await new PendingSubmissionKeys(deps).get('private name and birth date');
    expect(JSON.stringify([...values])).not.toContain('private name');
  });
  it('separates changed requests and account scopes', async () => {
    const { deps, values } = fixture(), keys = new PendingSubmissionKeys(deps);
    await keys.get('user-one:request-a'); await keys.get('user-two:request-a'); await keys.get('user-one:request-b');
    expect(values.size).toBe(3);
  });
  it('fails closed when a retry is older than the server safety window', async () => {
    const { deps, advance } = fixture(), keys = new PendingSubmissionKeys(deps);
    await keys.get('same'); advance();
    await expect(keys.get('same')).rejects.toThrow('too old');
    expect(deps.randomUUID).toHaveBeenCalledOnce();
  });
  it('does not send a submission if persistence fails', async () => {
    const { deps } = fixture();
    deps.write = async () => { throw new Error('disk failure'); };
    await expect(new PendingSubmissionKeys(deps).get('same')).rejects.toThrow('disk failure');
  });
});

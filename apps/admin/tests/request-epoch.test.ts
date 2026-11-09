import { describe, expect, it } from 'vitest';
import { RequestEpoch } from '../frontend/lib/request-epoch';

describe('dashboard read ordering', () => {
  it('allows only the latest refresh to commit', () => {
    const epoch = new RequestEpoch(), old = epoch.begin(), latest = epoch.begin();
    expect(epoch.isCurrent(old)).toBe(false);
    expect(epoch.isCurrent(latest)).toBe(true);
  });
  it('invalidates every pending read on auth denial or unmount', () => {
    const epoch = new RequestEpoch(), pending = epoch.begin(); epoch.invalidate();
    expect(epoch.isCurrent(pending)).toBe(false);
    expect(epoch.isCurrent(epoch.begin())).toBe(true);
  });
  it('does not let a pre-write snapshot replace the refreshed result', () => {
    const epoch = new RequestEpoch(), beforeWrite = epoch.begin(); epoch.invalidate();
    const afterWrite = epoch.begin();
    expect(epoch.isCurrent(beforeWrite)).toBe(false);
    expect(epoch.isCurrent(afterWrite)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { probeOptions } from '../scripts/local-runtime-probe.mjs';

describe('local runtime probe boundaries', () => {
  it('defaults to a bounded loopback-only read probe', () => {
    expect(probeOptions({})).toEqual({ origin: 'http://127.0.0.1:3000', rounds: 12, intervalMs: 5500 });
  });
  it.each(['https://example.org', 'http://localhost.example.org', 'http://user:password@localhost:3000', 'http://localhost:3000/path', 'http://localhost:3000?token=private'])('rejects nonlocal or data-bearing origins: %s', origin => {
    expect(() => probeOptions({ PARISHLINK_PROBE_ORIGIN: origin })).toThrow();
  });
  it.each(['0', '31', '1.5', 'NaN'])('rejects unbounded/invalid round count %s', rounds => {
    expect(() => probeOptions({ PARISHLINK_PROBE_ROUNDS: rounds })).toThrow();
  });
  it.each(['0', '249', '10001', 'NaN'])('rejects invalid pacing %s', interval => {
    expect(() => probeOptions({ PARISHLINK_PROBE_INTERVAL_MS: interval })).toThrow();
  });
});

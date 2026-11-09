import { describe, expect, it } from 'vitest';
import { privatePageState, type PrivatePageResult } from '../frontend/lib/private-page-state';

const result: PrivatePageResult<string[]> = { pageKey: 'staff:p1:query:cursor', requestKey: 'r1', page: ['private row'] };
describe('private list refresh state', () => {
  it('starts with loading and no rows', () => {
    expect(privatePageState(undefined, 'scope', 'r1')).toMatchObject({ loading: true, page: undefined, pending: true });
  });
  it('keeps the same page visible but blocks actions while refreshing', () => {
    expect(privatePageState(result, result.pageKey, 'r2')).toMatchObject({ page: result.page, refreshing: true, loading: false, pending: true });
  });
  it.each(['other-user:p1:query:cursor', 'staff:p2:query:cursor', 'staff:p1:other-query:cursor', 'staff:p1:query:other-cursor'])(
    'never displays the old private page after changing %s', pageKey => {
      expect(privatePageState(result, pageKey, 'r2')).toMatchObject({ page: undefined, loading: true, pending: true });
    },
  );
  it('removes old rows after a failed or denied refresh', () => {
    const failed = { pageKey: result.pageKey, requestKey: 'r2', error: 'Access denied' };
    expect(privatePageState(failed, result.pageKey, 'r2')).toMatchObject({ page: undefined, error: 'Access denied', loading: false, pending: false });
    expect(privatePageState(failed, result.pageKey, 'r3')).toMatchObject({ page: undefined, error: undefined, loading: true });
  });
  it('enables a successfully refreshed page, including an empty result', () => {
    expect(privatePageState({ pageKey: result.pageKey, requestKey: 'r2', page: [] }, result.pageKey, 'r2')).toMatchObject({ page: [], refreshing: false, pending: false });
  });
});

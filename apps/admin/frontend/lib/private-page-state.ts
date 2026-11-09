export type PrivatePageResult<T> = { pageKey: string; requestKey: string; page?: T; error?: string };

/** Never carry private rows across an actor/scope/query change. Keep them only
 * during a refresh of the same page, with actions disabled until it completes. */
export function privatePageState<T>(result: PrivatePageResult<T> | undefined, pageKey: string, requestKey: string) {
  const current = result?.pageKey === pageKey ? result : undefined;
  const pending = current?.requestKey !== requestKey;
  return {
    page: current?.page,
    error: pending ? undefined : current?.error,
    loading: pending && !current?.page,
    refreshing: pending && Boolean(current?.page),
    pending,
  };
}

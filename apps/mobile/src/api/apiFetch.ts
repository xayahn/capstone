/** Web and test transport. Resolve the current fetch so test mocks remain usable. */
export const apiFetch: typeof fetch = (input, init) => fetch(input, init);

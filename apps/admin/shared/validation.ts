/** Calendar validation must reject Date's normalization of February 31, etc. */
export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validPhoneNumber(value: string): boolean {
  return /^\+?[0-9 ()-]{10,24}$/.test(value) && /^\d{10,15}$/.test(value.replace(/\D/g, ''));
}

export function utcTimestamp(value: string): string {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value;
}

// SQL fragments take internal aliases only, never user input.
export function occupiedStart(alias: string): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid scheduling alias');
  return `datetime(${alias}.starts_at, '-' || COALESCE((SELECT buffer_before_minutes FROM service_types WHERE id = ${alias}.service_type_id), 0) || ' minutes')`;
}
export function occupiedEnd(alias: string): string {
  if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid scheduling alias');
  return `datetime(${alias}.ends_at, '+' || COALESCE((SELECT buffer_after_minutes FROM service_types WHERE id = ${alias}.service_type_id), 0) || ' minutes')`;
}

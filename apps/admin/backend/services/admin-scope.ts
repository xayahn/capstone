import type { Actor } from '@/shared/domain';

/** SQL aliases are fixed by the caller, never supplied by a request. */
export function scoped(alias: string, actor: Actor, clergyOnly = false): { sql: string; values: string[] } {
  if (actor.role === 'system_admin') return { sql: '1 = 1', values: [] };
  if (actor.role === 'clergy' && clergyOnly) {
    if (!actor.clergyProfileId) return { sql: '0 = 1', values: [] };
    return { sql: `${alias}.clergy_id = ?`, values: [actor.clergyProfileId] };
  }
  if (!actor.parishId || !['parish_staff', 'clergy'].includes(actor.role)) return { sql: '0 = 1', values: [] };
  return { sql: `${alias}.parish_id = ?`, values: [actor.parishId] };
}

export function announcementScope(actor: Actor): { sql: string; values: string[] } {
  return actor.role === 'system_admin'
    ? { sql: '1 = 1', values: [] }
    : { sql: '(an.parish_id IS NULL OR an.parish_id = ?)', values: [actor.parishId ?? ''] };
}

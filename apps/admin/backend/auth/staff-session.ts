import { headers } from 'next/headers';
import { ensureRuntimeDatabase } from '@/db/runtime';
import { readStaffSession, type StaffIdentity } from '@/backend/auth/staff-auth';

export type { StaffIdentity } from '@/backend/auth/staff-auth';

/** The signed-in internal user for the current request, or null. */
export async function getStaffUser(): Promise<StaffIdentity | null> {
  await ensureRuntimeDatabase();
  const requestHeaders = await headers();
  return readStaffSession(requestHeaders.get('cookie'));
}

import { AdminPortal } from '@/frontend/components/admin-portal';
import { ChangePasswordPanel } from '@/frontend/components/change-password-panel';
import { SignInLanding } from '@/frontend/components/sign-in-landing';
import { getStaffUser } from '@/backend/auth/staff-session';
import { STAFF_SIGN_OUT_PATH } from '@/frontend/lib/staff-session';
import { LOCAL_DEMO_PASSWORD, LOCAL_DEMO_STAFF_ACCOUNTS } from '@/db/demo-accounts';

export const dynamic = 'force-dynamic';

type HomeProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function Home({ searchParams }: HomeProps) {
  const user = await getStaffUser();
  if (!user) {
    const development = process.env.NODE_ENV !== 'production';
    return (
      <SignInLanding
        demoAccounts={development ? LOCAL_DEMO_STAFF_ACCOUNTS : undefined}
        demoPassword={development ? LOCAL_DEMO_PASSWORD : undefined}
      />
    );
  }

  const params = (await searchParams) ?? {};
  if (user.mustChangePassword || params['change-password'] === '1') {
    return <ChangePasswordPanel name={user.fullName} required={user.mustChangePassword} />;
  }

  return <AdminPortal signedInName={user.fullName} signOutPath={STAFF_SIGN_OUT_PATH} />;
}

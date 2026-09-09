import { AdminPortal } from '@/frontend/components/admin-portal';
import { SignInLanding } from '@/frontend/components/sign-in-landing';
import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) {
    return <SignInLanding signInPath={chatGPTSignInPath('/')} />;
  }

  return (
    <AdminPortal
      signedInName={user.fullName ?? user.displayName}
      signOutPath={chatGPTSignOutPath('/')}
    />
  );
}

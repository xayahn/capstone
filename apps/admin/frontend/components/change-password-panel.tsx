'use client';

import { useState, type FormEvent } from 'react';
import { changeStaffPassword, PORTAL_HOME_URL, reloadPortal, signOutStaff } from '@/frontend/lib/staff-session';

type ChangePasswordPanelProps = {
  name: string;
  /** True when the account holds a temporary password and cannot use the portal yet. */
  required: boolean;
};

export function ChangePasswordPanel({ name, required }: ChangePasswordPanelProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await changeStaffPassword(currentPassword, newPassword, confirmPassword);
      reloadPortal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The password could not be changed.');
      setBusy(false);
    }
  }

  return (
    <main className="signin-shell">
      <section className="signin-card" aria-labelledby="change-password-title">
        <div className="brand-seal large" aria-hidden="true">PL</div>
        <span className="eyebrow">{name}</span>
        <h1 id="change-password-title">{required ? 'Choose your own password' : 'Change your password'}</h1>
        <p>
          {required
            ? 'You signed in with a temporary password from your system administrator. Choose a new password to continue.'
            : 'Use at least 12 characters with uppercase and lowercase letters and a number. Your other signed-in browsers will be signed out.'}
        </p>
        <form className="stack-form signin-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span>{required ? 'Temporary password' : 'Current password'}</span>
            <input type="password" autoComplete="current-password" value={currentPassword} maxLength={128}
              onChange={(event) => setCurrentPassword(event.target.value)} />
          </label>
          <label>
            <span>New password</span>
            <input type="password" autoComplete="new-password" value={newPassword} maxLength={128}
              onChange={(event) => setNewPassword(event.target.value)} />
          </label>
          <label>
            <span>Confirm new password</span>
            <input type="password" autoComplete="new-password" value={confirmPassword} maxLength={128}
              onChange={(event) => setConfirmPassword(event.target.value)} />
          </label>
          {error && <div className="alert error" role="alert"><span>{error}</span></div>}
          <button className="primary-button signin-button" disabled={busy || !currentPassword || newPassword.length < 12 || !confirmPassword}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </form>
        <div className="signin-secondary-actions">
          {!required && <a className="text-link" href={PORTAL_HOME_URL}>Back to the portal</a>}
          <button type="button" className="text-link" onClick={() => void signOutStaff()}>Sign out</button>
        </div>
      </section>
    </main>
  );
}

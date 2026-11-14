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
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lengthOk = newPassword.length >= 12 && newPassword.length <= 128;
  const upperLowerOk = /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword);
  const numberOk = /[0-9]/.test(newPassword);
  const differentOk = newPassword.length > 0 && newPassword !== currentPassword;
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
  const allRulesMet = lengthOk && upperLowerOk && numberOk && differentOk && matchOk;

  const checklistItems = [
    { label: '12 to 128 characters', met: lengthOk },
    { label: 'Uppercase and lowercase letters (A–Z, a–z)', met: upperLowerOk },
    { label: 'At least one number (0–9)', met: numberOk },
    { label: 'Different from current password', met: differentOk },
    { label: 'New and confirmation passwords match', met: matchOk },
  ];

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
          <div className="field-group">
            <label htmlFor="staff-current-password">{required ? 'Temporary password' : 'Current password'}</label>
            <div className="password-input-row">
              <input
                id="staff-current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                maxLength={128}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                aria-pressed={showCurrent}
                onClick={() => setShowCurrent((value) => !value)}
              >
                {showCurrent ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="staff-new-password">New password</label>
            <div className="password-input-row">
              <input
                id="staff-new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                maxLength={128}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showNew ? 'Hide new password' : 'Show new password'}
                aria-pressed={showNew}
                onClick={() => setShowNew((value) => !value)}
              >
                {showNew ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <div className="field-group">
            <label htmlFor="staff-confirm-password">Confirm new password</label>
            <div className="password-input-row">
              <input
                id="staff-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                maxLength={128}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((value) => !value)}
              >
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <ul className="password-checklist" aria-label="Password requirements">
            {checklistItems.map((item) => (
              <li key={item.label} className={item.met ? 'met' : undefined}>
                <span aria-hidden="true">{item.met ? '✓' : '○'}</span>
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
          {error && <div className="alert error" role="alert"><span>{error}</span></div>}
          <button className="primary-button signin-button" disabled={busy || !currentPassword || !allRulesMet}>
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

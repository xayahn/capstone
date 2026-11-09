'use client';

import { useState, type FormEvent } from 'react';
import { reloadPortal, signInStaff } from '@/frontend/lib/staff-session';

export type DemoAccount = { email: string; label: string };

type SignInLandingProps = {
  /** Shown only in local development so each role can be demonstrated. */
  demoAccounts?: readonly DemoAccount[];
  demoPassword?: string;
};

export function SignInLanding({ demoAccounts, demoPassword }: SignInLandingProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInStaff(email.trim(), password);
      reloadPortal();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed. Please try again.');
      setPassword('');
      setBusy(false);
    }
  }

  return (
    <main className="signin-shell">
      <section className="signin-card" aria-labelledby="signin-title">
        <div className="brand-seal large" aria-hidden="true">PL</div>
        <span className="eyebrow">Vicariate of St. John Mary Vianney</span>
        <h1 id="signin-title">ParishLink Administration</h1>
        <p>
          Secure coordination for sacramental appointments, documentary review, parish records,
          clergy schedules, and walk-in services.
        </p>
        <form className="stack-form signin-form" onSubmit={(event) => void submit(event)} noValidate>
          <label>
            <span>Email address</span>
            <input type="email" autoComplete="username" value={email} maxLength={254} required
              onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            <span>Password</span>
            <input type="password" autoComplete="current-password" value={password} maxLength={128} required
              onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <div className="alert error" role="alert"><span>{error}</span></div>}
          <button className="primary-button signin-button" disabled={busy || !email.includes('@') || password.length === 0}>
            {busy ? 'Signing in…' : 'Sign in to the internal portal'}
          </button>
        </form>
        <small>For authorized parish staff, clergy, and system administrators only. Parishioners use the ParishLink mobile app.</small>
        <small>Forgot your password? Ask your ParishLink system administrator to issue a temporary password.</small>
        {demoAccounts && demoAccounts.length > 0 && (
          <details className="demo-accounts">
            <summary>Local demonstration accounts (synthetic data only)</summary>
            <p>Password for every demo account: <code>{demoPassword}</code></p>
            <ul>
              {demoAccounts.map((account) => (
                <li key={account.email}>
                  <button type="button" className="text-link" onClick={() => { setEmail(account.email); setPassword(demoPassword ?? ''); }}>
                    {account.email}
                  </button>
                  <span> — {account.label}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </main>
  );
}

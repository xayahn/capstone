type SignInLandingProps = {
  signInPath: string;
};

export function SignInLanding({ signInPath }: SignInLandingProps) {
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
        <a className="primary-button signin-button" href={signInPath}>
          Sign in to the internal portal
        </a>
        <small>For authorized parish staff, clergy, and system administrators only.</small>
      </section>
    </main>
  );
}

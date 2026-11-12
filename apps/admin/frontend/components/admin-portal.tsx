'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { AdminMutation, AppointmentDocument, DashboardState } from '@/shared/domain';
import { AnnouncementsModule } from '@/frontend/components/modules/announcements-module';
import { AppointmentsModule } from '@/frontend/components/modules/appointments-module';
import { AuditLogModule } from '@/frontend/components/modules/audit-log-module';
import { ClergyModule } from '@/frontend/components/modules/clergy-module';
import { DocumentsModule } from '@/frontend/components/modules/documents-module';
import { OverviewModule } from '@/frontend/components/modules/overview-module';
import {
  initials,
  NAV_ITEMS,
  roleLabel,
  type ModuleId,
} from '@/frontend/components/modules/portal-shared';
import { QueueModule } from '@/frontend/components/modules/queue-module';
import { RecordsModule } from '@/frontend/components/modules/records-module';
import { ReportsModule } from '@/frontend/components/modules/reports-module';
import { SettingsModule } from '@/frontend/components/modules/settings-module';
import { adminMutationKey, adminRequest, AdminAccessError } from '@/frontend/lib/admin-request';
import { RequestEpoch } from '@/frontend/lib/request-epoch';
import { CHANGE_PASSWORD_URL, issueTemporaryPassword, signOutStaff } from '@/frontend/lib/staff-session';

function ErrorPanel({
  message,
  onRetry,
  signOutPath,
}: {
  message: string;
  onRetry: () => void;
  signOutPath: string;
}) {
  return (
    <section className="state-panel" role="alert">
      <span className="state-icon">!</span>
      <h1>We could not open the portal</h1>
      <p>{message}</p>
      <button className="primary-button" onClick={onRetry}>
        Try again
      </button>
      <button type="button" className="text-link" onClick={() => void signOutStaff(signOutPath)}>
        Sign in again
      </button>
    </section>
  );
}

export function AdminPortal({ signedInName, signOutPath }: { signedInName: string; signOutPath: string }) {
  const [activeModule, setActiveModule] = useState<ModuleId>('overview');
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const readEpoch = useRef(new RequestEpoch());
  const actorScope = useRef<string | null>(null);
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);

  const resetPrivateDrafts = useCallback(() => {
    setSelectedAppointmentId(null);
    setNotice(null);
    setDraftGeneration((current) => current + 1);
  }, []);

  const clearPrivateState = useCallback(() => {
    readEpoch.current.invalidate();
    actorScope.current = null;
    setData(null);
    setLoading(false);
    resetPrivateDrafts();
  }, [resetPrivateDrafts]);

  const handleAccessLost = useCallback(
    (caught: AdminAccessError) => {
      clearPrivateState();
      setError(caught.message);
    },
    [clearPrivateState],
  );

  const loadState = useCallback(
    async (showSpinner = true) => {
      const ticket = readEpoch.current.begin();
      if (showSpinner) setLoading(true);
      setError(null);
      try {
        const { response, payload } = await adminRequest<DashboardState | { error?: string }>(
          '/api/admin/state',
          { cache: 'no-store', headers: { Accept: 'application/json' } },
        );
        if (!readEpoch.current.isCurrent(ticket)) return false;
        if (!response.ok || !('actor' in payload)) {
          throw new Error('error' in payload ? payload.error : 'The portal did not return valid data.');
        }
        const scope = JSON.stringify([
          payload.actor.id,
          payload.actor.role,
          payload.actor.parishId,
          payload.actor.clergyProfileId,
        ]);
        if (actorScope.current !== null && actorScope.current !== scope) resetPrivateDrafts();
        actorScope.current = scope;
        setData(payload);
        setSelectedAppointmentId((current) =>
          current && payload.appointments.some((item) => item.id === current)
            ? current
            : payload.appointments[0]?.id ?? null,
        );
        return true;
      } catch (caught) {
        if (caught instanceof AdminAccessError) clearPrivateState();
        else if (!readEpoch.current.isCurrent(ticket)) return false;
        setError(caught instanceof Error ? caught.message : 'The portal could not load.');
        return false;
      } finally {
        if (readEpoch.current.isCurrent(ticket)) setLoading(false);
      }
    },
    [clearPrivateState, resetPrivateDrafts],
  );

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      void loadState();
    }, 0);
    const refreshTimer = window.setInterval(() => {
      if (!busyRef.current && document.visibilityState === 'visible') void loadState(false);
    }, 30_000);
    const epoch = readEpoch.current;
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(refreshTimer);
      epoch.invalidate();
    };
  }, [loadState]);

  const runMutation = useCallback(
    async (mutation: AdminMutation, successMessage: string) => {
      if (busyRef.current || !data) return false;
      readEpoch.current.invalidate();
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const body = JSON.stringify(mutation);
        const retry = await adminMutationKey(data.actor.id, body);
        const { response, payload } = await adminRequest<{ error?: string }>('/api/admin/state', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'Idempotency-Key': retry.key,
          },
          body,
        });
        if (!response.ok) throw new Error(payload.error ?? 'The action could not be completed.');
        try {
          sessionStorage.removeItem(retry.storageKey);
        } catch {
          /* Keeping the key is safer than losing a confirmed result. */
        }
        setNotice(successMessage);
        const refreshed = await loadState(false);
        if (!refreshed) {
          setError(successMessage + ' The latest view could not load. Refresh instead of submitting again.');
        }
        return true;
      } catch (caught) {
        if (caught instanceof AdminAccessError) clearPrivateState();
        setError(caught instanceof Error ? caught.message : 'The action could not be completed.');
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [loadState, data, clearPrivateState],
  );

  /** System administrators issue a one-time password; it is shown once and never stored in plain text. */
  const issueTemporary = useCallback(async (userId: string, name: string) => {
    if (busyRef.current) return;
    if (
      !window.confirm(
        `Issue a new temporary password for ${name}? Their current password and sessions will stop working.`,
      )
    ) {
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await issueTemporaryPassword(userId);
      setNotice(
        `Temporary password for ${result.email}: ${result.temporaryPassword} (shown once; share it privately. They must change it at first sign-in.)`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The temporary password could not be issued.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  const uploadDocument = useCallback(
    async (document: AppointmentDocument, event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file || busyRef.current) return;
      readEpoch.current.invalidate();
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const form = new FormData();
        form.set('file', file);
        form.set('appointmentId', document.appointmentId);
        form.set('requirementId', document.requirementId);
        const { response, payload } = await adminRequest<{ error?: string; message?: string }>(
          '/api/admin/documents/upload',
          { method: 'POST', body: form },
          60_000,
        );
        if (!response.ok) throw new Error(payload.error ?? 'The file could not be uploaded.');
        setNotice(payload.message ?? 'The document was submitted for review.');
        await loadState(false);
      } catch (caught) {
        if (caught instanceof AdminAccessError) clearPrivateState();
        setError(caught instanceof Error ? caught.message : 'The file could not be uploaded.');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [clearPrivateState, loadState],
  );

  function openModule(module: ModuleId) {
    setActiveModule(module);
    setNotice(null);
    document.getElementById('main-content')?.focus();
  }

  if (loading) {
    return (
      <main className="loading-shell">
        <div className="loading-mark" aria-hidden="true">
          PL
        </div>
        <p>Preparing your parish workspace…</p>
      </main>
    );
  }
  if (error && !data) return <ErrorPanel message={error} onRetry={() => void loadState()} signOutPath={signOutPath} />;
  if (!data) return null;

  const pendingChangeCount = data.changeRequests.filter((item) => item.status === 'pending').length;
  const today = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());
  const scopeKey = `${JSON.stringify([
    data.actor.id,
    data.actor.role,
    data.actor.parishId,
    data.actor.clergyProfileId,
  ])}:${draftGeneration}`;

  let moduleContent;
  switch (activeModule) {
    case 'overview':
      moduleContent = (
        <OverviewModule
          key={scopeKey}
          data={data}
          selectedAppointmentId={selectedAppointmentId}
          onOpenModule={openModule}
          onReviewAppointment={(appointmentId) => {
            setSelectedAppointmentId(appointmentId);
            openModule('appointments');
          }}
        />
      );
      break;
    case 'appointments':
      moduleContent = (
        <AppointmentsModule
          key={scopeKey}
          data={data}
          busy={busy}
          selectedAppointmentId={selectedAppointmentId}
          onSelectAppointment={setSelectedAppointmentId}
          runMutation={runMutation}
        />
      );
      break;
    case 'documents':
      moduleContent = (
        <DocumentsModule
          key={scopeKey}
          data={data}
          busy={busy}
          onUploadDocument={uploadDocument}
          runMutation={runMutation}
        />
      );
      break;
    case 'clergy':
      moduleContent = (
        <ClergyModule
          key={scopeKey}
          data={data}
          busy={busy}
          onAccessLost={handleAccessLost}
          runMutation={runMutation}
        />
      );
      break;
    case 'records':
      moduleContent = (
        <RecordsModule
          key={scopeKey}
          data={data}
          busy={busy}
          onAccessLost={handleAccessLost}
          runMutation={runMutation}
        />
      );
      break;
    case 'queue':
      moduleContent = <QueueModule key={scopeKey} data={data} busy={busy} runMutation={runMutation} />;
      break;
    case 'announcements':
      moduleContent = <AnnouncementsModule key={scopeKey} data={data} busy={busy} runMutation={runMutation} />;
      break;
    case 'reports':
      moduleContent = <ReportsModule key={scopeKey} data={data} busy={busy} onAccessLost={handleAccessLost} />;
      break;
    case 'audit':
      moduleContent = <AuditLogModule key={scopeKey} data={data} busy={busy} onAccessLost={handleAccessLost} />;
      break;
    case 'settings':
      moduleContent = (
        <SettingsModule
          key={scopeKey}
          data={data}
          busy={busy}
          runMutation={runMutation}
          onIssueTemporaryPassword={issueTemporary}
        />
      );
      break;
  }

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-seal" aria-hidden="true">
            PL
          </div>
          <div>
            <strong>ParishLink</strong>
            <span>Internal administration</span>
          </div>
        </div>
        <div className="parish-context">
          <span className="eyebrow">Access scope</span>
          <strong>{data.actor.parishName}</strong>
          <span>{roleLabel(data.actor.role)}</span>
        </div>
        <nav aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={activeModule === item.id ? 'nav-link active' : 'nav-link'}
              aria-current={activeModule === item.id ? 'page' : undefined}
              onClick={() => openModule(item.id)}
            >
              <span aria-hidden="true">{item.number}</span>
              {item.label}
              {item.id === 'appointments' && pendingChangeCount > 0 && (
                <strong className="nav-badge" aria-label={`${pendingChangeCount} pending change requests`}>
                  {pendingChangeCount}
                </strong>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" aria-hidden="true" />
          Data refreshed{' '}
          {new Intl.DateTimeFormat('en-PH', {
            timeZone: 'Asia/Manila',
            hour: 'numeric',
            minute: '2-digit',
          }).format(new Date(data.generatedAt))}
        </div>
      </aside>
      <main className="admin-main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          <div>
            <span className="eyebrow">{today}</span>
            <h1>{NAV_ITEMS.find((item) => item.id === activeModule)?.label}</h1>
          </div>
          <div className="topbar-actions">
            <div
              className="profile-button"
              aria-label={`${data.actor.name}, ${roleLabel(data.actor.role)}`}
            >
              <span className="avatar">{initials(data.actor.name || signedInName)}</span>
              <span>
                <strong>{data.actor.name}</strong>
                <small>{roleLabel(data.actor.role)}</small>
              </span>
            </div>
            <a className="signout-link" href={CHANGE_PASSWORD_URL}>
              Change password
            </a>
            <button type="button" className="signout-link" onClick={() => void signOutStaff(signOutPath)}>
              Sign out
            </button>
          </div>
        </header>
        {data.source === 'demo' && (
          <div className="demo-banner">
            <strong>Demonstration workspace</strong>
            <span>
              This local preview uses fictional records. It is not evidence of deployment, UAT, or parish
              approval.
            </span>
          </div>
        )}
        {(notice || error) && (
          <div className={`toast ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
            <span>{error ?? notice}</span>
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError(null);
                setNotice(null);
              }}
            >
              ×
            </button>
          </div>
        )}
        {moduleContent}
        <div className="sr-only" aria-live="polite">
          {busy ? 'Working on your request.' : 'Ready.'}
        </div>
      </main>
    </div>
  );
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const { runtime } = vi.hoisted(() => ({ runtime: {
  getRawDb: vi.fn(),
  ensureRuntimeDatabase: vi.fn(async () => {}),
  ensurePublicRuntimeDatabase: vi.fn(async () => {}),
} }));
vi.mock('cloudflare:workers', () => ({ env: {}, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
vi.mock('@/db/runtime', () => runtime);

import {
  changeStaffPassword,
  generateTemporaryPassword,
  issueTemporaryStaffPassword,
  readStaffSession,
  signInStaff,
  signOutStaff,
  staffSessionCookie,
  staffTokenFromCookieHeader,
  validateStaffPassword,
  StaffAuthError,
} from '../backend/auth/staff-auth';
import { derivePassword, PASSWORD_ITERATIONS } from '../backend/auth/mobile-auth';
import { resolveActor } from '../backend/services/admin-service';

let sql: DatabaseSync;
const PASSWORD = 'StaffPassword2026';

function adapter(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let values: Array<string | number | null> = [];
      const statement = {
        bind(...args: Array<string | number | null>) { values = args; return statement; },
        async first() { return database.prepare(query).get(...values) ?? null; },
        async all() { return { success: true, results: database.prepare(query).all(...values), meta: {} }; },
        async run() { return statement.syncRun(); },
        syncRun() {
          const before = Number(database.prepare('SELECT total_changes() AS n').get()!.n);
          database.prepare(query).run(...values);
          const after = Number(database.prepare('SELECT total_changes() AS n').get()!.n);
          return { success: true, results: [], meta: { changes: after - before } };
        },
      };
      return statement;
    },
    async batch(statements: Array<{ syncRun(): unknown }>) {
      database.exec('BEGIN');
      try { const result = statements.map((s) => s.syncRun()); database.exec('COMMIT'); return result; }
      catch (error) { database.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
}

const cookieFor = (token: string) => `other=1; ${staffSessionCookie(token).split(';')[0]}`;

async function addCredential(userId: string, password = PASSWORD, mustChange = 0) {
  const hash = await derivePassword(password, `salt-${userId}`, PASSWORD_ITERATIONS);
  sql.prepare(`INSERT INTO staff_credentials(user_id,password_hash,password_salt,must_change_password)
    VALUES(?,?,?,?)`).run(userId, hash, `salt-${userId}`, mustChange);
}

beforeEach(async () => {
  sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const file of readdirSync(folder).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    sql.exec(readFileSync(resolve(folder, file), 'utf8').replaceAll('--> statement-breakpoint', ''));
  }
  sql.exec("INSERT INTO parishes(id,slug,name) VALUES('p1','p1','Test parish')");
  sql.exec(`INSERT INTO users(id,email,full_name,role,home_parish_id) VALUES
    ('admin','admin@parishlink.test','Test Admin','system_admin',NULL),
    ('staff','staff@parishlink.test','Test Staff','parish_staff','p1'),
    ('member','member@example.test','Test Member','parishioner','p1')`);
  await addCredential('admin');
  await addCredential('staff');
  // A parishioner with a mobile password must never open the internal portal.
  const memberHash = await derivePassword(PASSWORD, 'member-salt', PASSWORD_ITERATIONS);
  sql.prepare("INSERT INTO mobile_credentials(user_id,password_hash,password_salt) VALUES('member',?,'member-salt')").run(memberHash);
  runtime.getRawDb.mockReturnValue(adapter(sql));
});

describe('staff password policy and cookie handling', () => {
  it('enforces the same password policy as parishioner accounts', () => {
    expect(() => validateStaffPassword('short1A')).toThrow(StaffAuthError);
    expect(() => validateStaffPassword('alllowercase123')).toThrow(StaffAuthError);
    expect(() => validateStaffPassword('ValidPassword123')).not.toThrow();
  });

  it('issues HttpOnly SameSite=Strict cookies and ignores malformed or duplicated tokens', () => {
    const cookie = staffSessionCookie('a'.repeat(43));
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(staffTokenFromCookieHeader(`pl_staff_session=${'a'.repeat(43)}`)).toBe('a'.repeat(43));
    expect(staffTokenFromCookieHeader('pl_staff_session=not-a-token')).toBeNull();
    expect(staffTokenFromCookieHeader(`pl_staff_session=${'a'.repeat(43)}; pl_staff_session=${'b'.repeat(43)}`)).toBeNull();
    expect(staffTokenFromCookieHeader(null)).toBeNull();
  });

  it('generates temporary passwords that always satisfy the policy', () => {
    for (let index = 0; index < 50; index += 1) {
      const value = generateTemporaryPassword();
      expect(value).toHaveLength(16);
      expect(() => validateStaffPassword(value)).not.toThrow();
    }
  });
});

describe('staff sign-in', () => {
  it('signs in with email and password, stores only a token hash, and resolves the actor', async () => {
    const result = await signInStaff({ email: 'STAFF@parishlink.test ', password: PASSWORD }, 'test-agent');
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = sql.prepare('SELECT token_hash FROM staff_sessions WHERE user_id = ?').get('staff') as { token_hash: string };
    expect(stored.token_hash).not.toBe(result.token);
    const identity = await readStaffSession(cookieFor(result.token));
    expect(identity).toMatchObject({ userId: 'staff', role: 'parish_staff', mustChangePassword: false });
    const actor = await resolveActor(identity!);
    expect(actor).toMatchObject({ id: 'staff', role: 'parish_staff', parishId: 'p1' });
    const audit = sql.prepare("SELECT outcome FROM audit_logs WHERE action = 'staff.sign_in'").get() as { outcome: string };
    expect(audit.outcome).toBe('success');
  });

  it('rejects wrong passwords with a generic message and locks after five failures', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(signInStaff({ email: 'staff@parishlink.test', password: 'WrongPassword123' }, null)).rejects.toMatchObject({ status: 401 });
    }
    const row = sql.prepare('SELECT failed_attempts, locked_until FROM staff_credentials WHERE user_id = ?').get('staff') as { failed_attempts: number; locked_until: string | null };
    expect(row.failed_attempts).toBe(5);
    expect(row.locked_until).not.toBeNull();
    // Even the correct password is refused while locked.
    await expect(signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null)).rejects.toMatchObject({ status: 401 });
  });

  it('does not let a parishioner mobile password open the internal portal', async () => {
    await expect(signInStaff({ email: 'member@example.test', password: PASSWORD }, null)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses deactivated accounts and their existing sessions', async () => {
    const { token } = await signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null);
    sql.exec("UPDATE users SET is_active = 0 WHERE id = 'staff'");
    expect(await readStaffSession(cookieFor(token))).toBeNull();
    await expect(signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null)).rejects.toMatchObject({ status: 401 });
  });

  it('treats expired and signed-out sessions as signed out', async () => {
    const first = await signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null);
    sql.exec("UPDATE staff_sessions SET expires_at = datetime('now','-1 minute')");
    expect(await readStaffSession(cookieFor(first.token))).toBeNull();
    const second = await signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null);
    await signOutStaff(cookieFor(second.token));
    expect(await readStaffSession(cookieFor(second.token))).toBeNull();
  });
});

describe('temporary passwords and password changes', () => {
  it('only system administrators can issue temporary passwords', async () => {
    await expect(issueTemporaryStaffPassword({ id: 'staff', role: 'parish_staff' }, 'admin')).rejects.toMatchObject({ status: 403 });
    await expect(issueTemporaryStaffPassword({ id: 'admin', role: 'system_admin' }, 'admin')).rejects.toMatchObject({ status: 409 });
    await expect(issueTemporaryStaffPassword({ id: 'admin', role: 'system_admin' }, 'member')).rejects.toMatchObject({ status: 404 });
  });

  it('forces a password change before the portal can be used, then ends other sessions', async () => {
    const before = await signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null);
    const { temporaryPassword } = await issueTemporaryStaffPassword({ id: 'admin', role: 'system_admin' }, 'staff');
    // Issuing a temporary password ends existing sessions and invalidates the old password.
    expect(await readStaffSession(cookieFor(before.token))).toBeNull();
    await expect(signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null)).rejects.toMatchObject({ status: 401 });

    const temporary = await signInStaff({ email: 'staff@parishlink.test', password: temporaryPassword }, null);
    expect(temporary.mustChangePassword).toBe(true);
    const identity = (await readStaffSession(cookieFor(temporary.token)))!;
    await expect(resolveActor(identity)).rejects.toMatchObject({ status: 403 });

    const second = await signInStaff({ email: 'staff@parishlink.test', password: temporaryPassword }, null);
    await changeStaffPassword(identity, { currentPassword: temporaryPassword, newPassword: 'MyNewPassword2026', confirmPassword: 'MyNewPassword2026' });
    const updated = (await readStaffSession(cookieFor(temporary.token)))!;
    expect(updated.mustChangePassword).toBe(false);
    await expect(resolveActor(updated)).resolves.toMatchObject({ id: 'staff' });
    expect(await readStaffSession(cookieFor(second.token))).toBeNull();
    await expect(signInStaff({ email: 'staff@parishlink.test', password: 'MyNewPassword2026' }, null)).resolves.toMatchObject({ mustChangePassword: false });
  });

  it('rejects an incorrect current password or a mismatched confirmation', async () => {
    const { token } = await signInStaff({ email: 'staff@parishlink.test', password: PASSWORD }, null);
    const identity = (await readStaffSession(cookieFor(token)))!;
    await expect(changeStaffPassword(identity, { currentPassword: 'NotTheRightOne1', newPassword: 'MyNewPassword2026', confirmPassword: 'MyNewPassword2026' })).rejects.toThrow('current password');
    await expect(changeStaffPassword(identity, { currentPassword: PASSWORD, newPassword: 'MyNewPassword2026', confirmPassword: 'Different2026xx' })).rejects.toThrow('do not match');
  });
});

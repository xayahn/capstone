import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import type { AccountEmail, AccountMailer } from '../backend/auth/account-mailer';

const { env, runtime } = vi.hoisted(() => ({ env: {} as Record<string,string | undefined>, runtime: { getRawDb: vi.fn(), ensurePublicRuntimeDatabase: vi.fn(async () => {}) } }));
vi.mock('cloudflare:workers', () => ({ env, waitUntil: vi.fn() }));
vi.mock('../db/runtime', () => runtime);
import { confirmMobileEmailVerification, confirmMobilePasswordReset, requestMobileEmailVerification, requestMobilePasswordReset } from '../backend/auth/account-recovery';
import { AccountMailError, accountMailConfigured, createAccountMailer } from '../backend/auth/account-mailer';
import { changeMobilePassword, derivePassword, PASSWORD_ITERATIONS, requireMobileActor, signInMobile, type MobileActor } from '../backend/auth/mobile-auth';
import { POST as resetRequestRoute } from '../backend/routes/mobile/auth/password-reset-request';
import { POST as verificationConfirmRoute } from '../backend/routes/mobile/auth/email-verification-confirm';

let sql: DatabaseSync;
let queued: Array<() => Promise<void>>;
let messages: AccountEmail[];
let mailer: AccountMailer;
const oldPassword = 'OriginalPassword123';
const newPassword = 'UpdatedPassword456';
const email = 'member@example.test';
const actor = (sessionId = 'session-1'): MobileActor => ({ id:'u1',sessionId,displayName:'Test member',email,mobileNumber:'+639170000001',homeParishId:'p1',notificationsEnabled:true,emailVerified:false });
const request = () => new Request('https://api.example.test/api/mobile/auth/password-reset/request', {method:'POST',headers:{'cf-connecting-ip':'192.0.2.1'}});
const input = (code: string, address = email) => ({ email:address,code,newPassword,confirmPassword:newPassword });
const dependencies = () => ({ mailer, schedule:(work: () => Promise<void>) => queued.push(work) });
const runBackground = async () => { for (const work of queued.splice(0)) await work(); };
const lastCode = () => messages.at(-1)!.code;
async function issue(address = email) { await requestMobilePasswordReset(request(),{email:address},dependencies()); await runBackground(); return messages.at(-1)?.code ?? ''; }

function adapter(database: DatabaseSync): D1Database {
  return {
    prepare(query: string) {
      let values: Array<string | number | null> = [];
      const statement = {
        bind(...args: Array<string | number | null>) { values=args; return statement; },
        async first() { return database.prepare(query).get(...values) ?? null; },
        async all() { return { success:true,results:database.prepare(query).all(...values),meta:{} }; },
        async run() { return statement.syncRun(); },
        // D1 reports a total_changes() delta, including triggers and FK actions.
        // DatabaseSync.run().changes counts only direct rows and would hide
        // false-error bugs introduced by credential invalidation triggers.
        syncRun() {
          const before=Number(database.prepare('SELECT total_changes() AS n').get()!.n);
          database.prepare(query).run(...values);
          const after=Number(database.prepare('SELECT total_changes() AS n').get()!.n);
          return { success:true,results:[],meta:{ changes:after-before } };
        },
      }; return statement;
    },
    async batch(statements: Array<{syncRun():unknown}>) {
      database.exec('BEGIN');
      try { const result=statements.map(s=>s.syncRun()); database.exec('COMMIT'); return result; }
      catch(error) { database.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
}

beforeEach(async () => {
  for (const key of Object.keys(env)) delete env[key];
  queued=[]; messages=[]; mailer={send:vi.fn(async message=>{ messages.push(message); })};
  sql=new DatabaseSync(':memory:'); sql.exec('PRAGMA foreign_keys=ON');
  const folder=fileURLToPath(new URL('../drizzle/',import.meta.url));
  for (const file of readdirSync(folder).filter(f=>/^\d{4}_.+\.sql$/.test(f)).sort()) sql.exec(readFileSync(resolve(folder,file),'utf8').replaceAll('--> statement-breakpoint',''));
  sql.exec("INSERT INTO parishes(id,slug,name)VALUES('p1','p1','Test parish')");
  sql.prepare("INSERT INTO users(id,email,full_name,role,home_parish_id)VALUES('u1',?,'Test member','parishioner','p1')").run(email);
  const hash=await derivePassword(oldPassword,'test-salt',PASSWORD_ITERATIONS);
  sql.prepare("INSERT INTO mobile_credentials(user_id,password_hash,password_salt)VALUES('u1',?,'test-salt')").run(hash);
  sql.exec("INSERT INTO mobile_sessions(id,user_id,token_hash,expires_at)VALUES('session-1','u1','unused',datetime('now','+1 day'))");
  runtime.getRawDb.mockReturnValue(adapter(sql));
  vi.spyOn(console,'error').mockImplementation(()=>{});
});
afterEach(()=>{ sql.close(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('account email challenge lifecycle with real SQLite',()=>{
  it('acknowledges known, unknown and disabled addresses before any eligibility or delivery task',async()=>{
    const known=await requestMobilePasswordReset(request(),{email},dependencies());
    const unknown=await requestMobilePasswordReset(request(),{email:'missing@example.test'},dependencies());
    sql.exec("UPDATE users SET is_active=0 WHERE id='u1'");
    const disabled=await requestMobilePasswordReset(request(),{email},dependencies());
    expect(known).toEqual(unknown); expect(disabled).toEqual(unknown);
    expect(messages).toHaveLength(0); expect(queued).toHaveLength(3);
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    await runBackground(); expect(messages).toHaveLength(0);
  });
  it('never recovers an internal SSO account even if a credential row exists',async()=>{
    sql.exec("UPDATE users SET role='system_admin' WHERE id='u1'");
    await issue(); expect(messages).toHaveLength(0);
  });
  it('stores only a hash and keeps the code unusable until provider acceptance',async()=>{
    let release!:()=>void;
    mailer.send=vi.fn(async message=>{messages.push(message);await new Promise<void>(r=>{release=r;});});
    await requestMobilePasswordReset(request(),{email},dependencies());
    const sending=runBackground();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const row=sql.prepare('SELECT * FROM mobile_email_challenges').get();
    expect(row?.delivery_status).toBe('pending'); expect(row?.code_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.values(row!).some(value=>value===lastCode())).toBe(false);
    await expect(confirmMobilePasswordReset(request(),input(lastCode()))).rejects.toMatchObject({status:400});
    release(); await sending;
    expect(sql.prepare('SELECT delivery_status FROM mobile_email_challenges').get()?.delivery_status).toBe('ready');
  });
  it('resets once, verifies proven email, revokes all sessions and removes push bindings',async()=>{
    sql.exec("INSERT INTO mobile_sessions(id,user_id,token_hash,expires_at)VALUES('session-2','u1','unused2',datetime('now','+1 day'))");
    sql.exec("INSERT INTO push_devices(id,user_id,session_id,expo_push_token,platform,project_id)VALUES('device','u1','session-1','ExponentPushToken[test]','android','project')");
    const code=await issue(); await confirmMobilePasswordReset(request(),input(code.toLowerCase().replace(/(.{4})/g,'$1-')));
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_sessions').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM push_devices').get()?.n).toBe(0);
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    expect(sql.prepare('SELECT email_verified_at,auth_version FROM mobile_credentials').get()).toMatchObject({auth_version:1,email_verified_at:expect.any(String)});
    await expect(confirmMobilePasswordReset(request(),input(code))).rejects.toMatchObject({status:400});
    await expect(signInMobile({email,password:oldPassword},null)).rejects.toMatchObject({status:401});
    const signedIn=await signInMobile({email,password:newPassword},null); expect(signedIn.profile.emailVerified).toBe(true);
  });
  it('has one winner for simultaneous correct code redemption',async()=>{
    const code=await issue(); const results=await Promise.allSettled([confirmMobilePasswordReset(request(),input(code)),confirmMobilePasswordReset(request(),input(code))]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    expect(sql.prepare("SELECT count(*) AS n FROM audit_logs WHERE action='mobile.password.reset'").get()?.n).toBe(1);
  });
  it('allows only the newest requested code',async()=>{
    const old=await issue(); const latest=await issue(); expect(old===latest).toBe(false);
    await expect(confirmMobilePasswordReset(request(),input(old))).rejects.toMatchObject({status:400});
    await confirmMobilePasswordReset(request(),input(latest));
  });
  it('expires on an integer deadline and rejects a correctly formed old code',async()=>{
    const code=await issue(); sql.exec('UPDATE mobile_email_challenges SET expires_at=unixepoch()');
    await expect(confirmMobilePasswordReset(request(),input(code))).rejects.toMatchObject({status:400});
  });
  it('locks only the challenge after five wrong codes without locking account login',async()=>{
    const code=await issue();
    for(let n=0;n<5;n++) await expect(confirmMobilePasswordReset(request(),input('AAAAAAAAAAAA'))).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT attempts FROM mobile_email_challenges').get()?.attempts).toBe(5);
    await expect(confirmMobilePasswordReset(request(),input(code))).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT failed_attempts,locked_until FROM mobile_credentials').get()).toMatchObject({failed_attempts:0,locked_until:null});
    expect((await signInMobile({email,password:oldPassword},null)).profile.emailVerified).toBe(false);
  });
  it('invalidates challenges on any password change even within the same second',async()=>{
    const code=await issue(); sql.exec("UPDATE mobile_credentials SET password_hash='changed' WHERE user_id='u1'");
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    await expect(confirmMobilePasswordReset(request(),input(code))).rejects.toMatchObject({status:400});
  });
  it('does not accept a stale confirmation racing a credential update',async()=>{
    const code=await issue(); const resetting=confirmMobilePasswordReset(request(),input(code));
    sql.exec("UPDATE mobile_credentials SET password_hash='concurrent-change' WHERE user_id='u1'");
    await expect(resetting).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT password_hash FROM mobile_credentials').get()?.password_hash).toBe('concurrent-change');
  });
  it('does not leave an old-password login session alive when reset races sign in',async()=>{
    const code=await issue();
    await Promise.allSettled([signInMobile({email,password:oldPassword},null),confirmMobilePasswordReset(request(),input(code))]);
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_sessions').get()?.n).toBe(0);
    await expect(signInMobile({email,password:newPassword},null)).resolves.toMatchObject({profile:{emailVerified:true}});
  });
  it('invalidates a code when the user is disabled or their email changes',async()=>{
    const code=await issue(); sql.exec("UPDATE users SET email='changed@example.test' WHERE id='u1'");
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    await expect(confirmMobilePasswordReset(request(),input(code))).rejects.toMatchObject({status:400});
    await issue('changed@example.test'); sql.exec("UPDATE users SET is_active=0 WHERE id='u1'");
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
  });
  it('removes a failed or cancelled delivery and emits no raw diagnostic or code',async()=>{
    const raw='PRIVATE_PROVIDER_ERROR'; mailer.send=vi.fn(async message=>{ messages.push(message); throw new Error(raw); });
    await issue(); expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(raw);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(lastCode());
  });
  it('does not reactivate a replaced challenge after an older send completes',async()=>{
    let release!:()=>void; let count=0;
    mailer.send=vi.fn(async message=>{messages.push(message); if(count++===0) await new Promise<void>(r=>{release=r;});});
    await requestMobilePasswordReset(request(),{email},dependencies()); const older=runBackground();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const old=lastCode(); const latest=await issue(); release(); await older;
    await expect(confirmMobilePasswordReset(request(),input(old))).rejects.toMatchObject({status:400});
    await confirmMobilePasswordReset(request(),input(latest));
  });
  it('requires authentication and the same live session for email verification',async()=>{
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground(); const code=lastCode();
    await expect(confirmMobileEmailVerification(request(),actor('wrong-session'),{code})).rejects.toMatchObject({status:400});
    await expect(confirmMobileEmailVerification(request(),actor(),{code})).resolves.toEqual({emailVerified:true});
    await expect(confirmMobileEmailVerification(request(),actor(),{code})).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT email_verified_at FROM mobile_credentials').get()?.email_verified_at).toEqual(expect.any(String));
  });
  it('does not send a queued verification after logout',async()=>{
    await requestMobileEmailVerification(request(),actor(),dependencies());
    sql.exec("UPDATE mobile_sessions SET revoked_at=datetime('now') WHERE id='session-1'");
    await runBackground(); expect(messages).toHaveLength(0);
  });
  it('rejects a verification whose session was revoked after delivery',async()=>{
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground(); const code=lastCode();
    sql.exec("UPDATE mobile_sessions SET revoked_at=datetime('now') WHERE id='session-1'");
    await expect(confirmMobileEmailVerification(request(),actor(),{code})).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT email_verified_at FROM mobile_credentials').get()?.email_verified_at).toBeNull();
  });
  it('has one winner for simultaneous verification and caps wrong attempts on its own challenge',async()=>{
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground();
    const results=await Promise.allSettled([
      confirmMobileEmailVerification(request(),actor(),{code:lastCode()}),
      confirmMobileEmailVerification(request(),actor(),{code:lastCode()}),
    ]);
    expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    sql.exec("UPDATE mobile_credentials SET email_verified_at=NULL WHERE user_id='u1'");
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground(); const correct=lastCode();
    // A distinct fixed rate bucket isolates the independent five-attempt challenge boundary.
    sql.exec("DELETE FROM mobile_rate_limits WHERE scope='auth-verify-confirm-account'");
    for(let n=0;n<5;n++) await expect(confirmMobileEmailVerification(request(),actor(),{code:'AAAAAAAAAAAA'})).rejects.toMatchObject({status:400});
    await expect(confirmMobileEmailVerification(request(),actor(),{code:correct})).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT email_verified_at FROM mobile_credentials').get()?.email_verified_at).toBeNull();
  });
  it('rate limits the IP even when many different nonexistent addresses are requested',async()=>{
    for(let n=0;n<20;n++) await requestMobilePasswordReset(request(),{email:`missing-${n}@example.test`},dependencies());
    await expect(requestMobilePasswordReset(request(),{email:'another@example.test'},dependencies())).rejects.toMatchObject({status:429});
    expect(messages).toHaveLength(0);
  });
  it('keeps legacy users unverified and clears proof when email changes',async()=>{
    expect(sql.prepare('SELECT email_verified_at FROM mobile_credentials').get()?.email_verified_at).toBeNull();
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground();
    await confirmMobileEmailVerification(request(),actor(),{code:lastCode()});
    sql.exec("UPDATE users SET email='different@example.test' WHERE id='u1'");
    expect(sql.prepare('SELECT email_verified_at FROM mobile_credentials').get()?.email_verified_at).toBeNull();
  });
  it('returns uniform unavailable responses without configuration and never returns a code',async()=>{
    for(const address of [email,'missing@example.test']) {
      const response=await resetRequestRoute(new Request(request(),{body:JSON.stringify({email:address}),headers:{'Content-Type':'application/json'}}));
      expect(response.status).toBe(503); expect(await response.json()).toEqual({error:expect.any(String)});
    }
    const response=await verificationConfirmRoute(new Request(request(),{body:JSON.stringify({code:'AAAAAAAAAAAA'})}));
    expect(response.status).toBe(401);
  });
  it('limits requests equally for known and unknown emails and bounds confirmation rate',async()=>{
    for(let n=0;n<3;n++) await requestMobilePasswordReset(request(),{email:'missing@example.test'},dependencies());
    await expect(requestMobilePasswordReset(request(),{email:'missing@example.test'},dependencies())).rejects.toMatchObject({status:429});
    for(let n=0;n<10;n++) await expect(confirmMobilePasswordReset(request(),input('bad'))).rejects.toMatchObject({status:400});
    await expect(confirmMobilePasswordReset(request(),input('bad'))).rejects.toMatchObject({status:429});
  });
  it('uses the existing password policy and confirms the password before consuming a code',async()=>{
    const code=await issue();
    await expect(confirmMobilePasswordReset(request(),{...input(code),newPassword:'weak',confirmPassword:'weak'})).rejects.toMatchObject({status:400});
    await expect(confirmMobilePasswordReset(request(),{...input(code),confirmPassword:'Mismatch12345'})).rejects.toMatchObject({status:400});
    expect(sql.prepare('SELECT consumed_by FROM mobile_email_challenges').get()?.consumed_by).toBeNull();
  });
  it('a reset racing authenticated password change commits only one password transition',async()=>{
    const signed=await signInMobile({email,password:oldPassword},null);
    const code=await issue();
    const authenticated=new Request(request(),{headers:{Authorization:`Bearer ${signed.accessToken}`}});
    const results=await Promise.allSettled([
      confirmMobilePasswordReset(request(),input(code)),
      changeMobilePassword(authenticated,{currentPassword:oldPassword,newPassword:'OtherPassword789',confirmPassword:'OtherPassword789'}),
    ]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(sql.prepare('SELECT auth_version FROM mobile_credentials').get()?.auth_version).toBe(1);
    if(results[0].status==='fulfilled') await expect(requireMobileActor(authenticated)).rejects.toMatchObject({status:401});
  });
  it('confirms authenticated password change when D1 counts trigger invalidation of both challenge purposes',async()=>{
    const signed=await signInMobile({email,password:oldPassword},null);
    await issue();
    await requestMobileEmailVerification(request(),actor(),dependencies()); await runBackground();
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(2);
    const authenticated=new Request(request(),{headers:{Authorization:`Bearer ${signed.accessToken}`}});
    await expect(changeMobilePassword(authenticated,{currentPassword:oldPassword,newPassword,confirmPassword:newPassword})).resolves.toBeUndefined();
    expect(sql.prepare('SELECT count(*) AS n FROM mobile_email_challenges').get()?.n).toBe(0);
    expect(sql.prepare('SELECT auth_version FROM mobile_credentials').get()?.auth_version).toBe(1);
    await expect(signInMobile({email,password:newPassword},null)).resolves.toMatchObject({mode:'api'});
    await expect(signInMobile({email,password:oldPassword},null)).rejects.toMatchObject({status:401});
  });
});

describe('fixed account email provider transport',()=>{
  const configuration={MAIL_ENABLED:'true',MAIL_DELIVERY_VERIFIED:'true',MAIL_FROM:'noreply@example.test',RESEND_API_KEY:'re_test_private_key_12345'};
  const message: AccountEmail={email,purpose:'password_reset',code:'ABCDEFGHJKLM',challengeId:'challenge-id'};
  it('requires explicit delivery verification and never configures from an arbitrary endpoint',()=>{
    expect(accountMailConfigured({...configuration,MAIL_DELIVERY_VERIFIED:'false'})).toBe(false);
    expect(accountMailConfigured({...configuration,MAIL_FROM:'bad\r\nBcc:person@example.test'})).toBe(false);
    expect(()=>createAccountMailer({})).toThrow(AccountMailError);
  });
  it('uses manual redirects and a fixed endpoint with minimal content',async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>Response.json({id:'accepted-id'}));
    await createAccountMailer(configuration,fetcher).send(message);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.resend.com/emails');
    expect(fetcher.mock.calls[0][1]).toMatchObject({method:'POST',redirect:'manual'});
    const payload=JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    expect(payload.to).toEqual([email]); expect(payload.text).toContain('ABCD-EFGH-JKLM');
    expect(Object.keys(payload).sort()).toEqual(['from','subject','text','to']);
  });
  for(const status of [302,401,429,500]) it(`rejects provider status ${status} without exposing its response`,async()=>{
    const fetcher=vi.fn<typeof fetch>(async()=>new Response('PRIVATE_PROVIDER_BODY',{status}));
    await expect(createAccountMailer(configuration,fetcher).send(message)).rejects.toThrow('Account email delivery is unavailable.');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('rejects an oversized body',async()=>{
    await expect(createAccountMailer(configuration,vi.fn(async()=>new Response('X'.repeat(9000)))).send(message)).rejects.toThrow(AccountMailError);
  });
  it('bounds stalled requests and cancels stalled response bodies',async()=>{
    vi.useFakeTimers(); const cancel=vi.fn();
    const body=new ReadableStream<Uint8Array>({cancel});
    const sending=createAccountMailer(configuration,vi.fn(async()=>new Response(body))).send(message);
    const result=expect(sending).rejects.toThrow(AccountMailError);
    await vi.advanceTimersByTimeAsync(8001); await result; expect(cancel).toHaveBeenCalled();
  });
  it('bounds a fetch implementation which never resolves or respects abort',async()=>{
    vi.useFakeTimers();
    const sending=createAccountMailer(configuration,vi.fn(()=>new Promise<Response>(()=>{}))).send(message);
    const result=expect(sending).rejects.toThrow(AccountMailError);
    await vi.advanceTimersByTimeAsync(8001); await result;
  });
  it('rejects a response already followed by the transport',async()=>{
    const response=Response.json({id:'accepted-id'}); Object.defineProperty(response,'redirected',{value:true});
    await expect(createAccountMailer(configuration,vi.fn(async()=>response)).send(message)).rejects.toThrow(AccountMailError);
  });
  it('normalizes raw network failures rather than exposing provider text',async()=>{
    await expect(createAccountMailer(configuration,vi.fn(async()=>{throw new Error('PRIVATE_NETWORK_ERROR');})).send(message)).rejects.toThrow('Account email delivery is unavailable.');
  });
});

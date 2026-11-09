import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';

const dir = dirname(fileURLToPath(import.meta.url));
const root = resolve(dir, '..');
const require = createRequire(resolve(root, 'package.json'));
const ts = require('typescript');
const sql = new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys = ON');
for (const file of readdirSync(resolve(root, 'drizzle')).filter(x => /^\d{4}_.+\.sql$/.test(x)).sort()) {
  sql.exec(readFileSync(resolve(root, 'drizzle', file), 'utf8').replaceAll('--> statement-breakpoint',''));
}
let statementHook;
let beforeRunHook;
const db = {
  prepare(query) {
    let values = [];
    const statement = {
      bind(...args) { values = args; return statement; },
      async first(column) {
        const row = sql.prepare(query).get(...values) ?? null;
        if (statementHook) await statementHook(query, row);
        return column ? row?.[column] : row;
      },
      async all() { const results = sql.prepare(query).all(...values); return { success: true, results, meta: {} }; },
      async run() { if (beforeRunHook) await beforeRunHook(query); return statement.syncRun(); },
      syncRun() { const r = sql.prepare(query).run(...values); return { success:true, results:[], meta:{ changes:Number(r.changes), last_row_id:Number(r.lastInsertRowid) } }; },
    }; return statement;
  },
  async batch(statements) {
    sql.exec('BEGIN');
    try { const r = statements.map(s => s.syncRun()); sql.exec('COMMIT'); return r; }
    catch(e) { sql.exec('ROLLBACK'); throw e; }
  },
};
const objects = new Map();
const env = { DB: db, FILES: {
  async put(key, value, metadata) { objects.set(key,{ value, metadata }); },
  async delete(key) { objects.delete(key); },
  async get(key) { const o=objects.get(key); return o ? { body:o.value, httpMetadata:o.metadata?.httpMetadata } : null; },
} };
let identity = null;
let observedProviderPrompt = null;
const realFetch = globalThis.fetch;
const cache = new Map();
function load(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const loadedModule = { exports:{} }; cache.set(file,loadedModule);
  const compiled = ts.transpileModule(readFileSync(file,'utf8'), { compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true } }).outputText;
  const localRequire = (name) => {
    if (name === '@/db/runtime') return { getRawDb:() => db, ensureRuntimeDatabase:async()=>{}, ensurePublicRuntimeDatabase:async()=>{} };
    if (name === 'cloudflare:workers') return { env };
    // Internal routes resolve the signed-in person from the ParishLink staff session cookie.
    if (name === '@/backend/auth/staff-session') return { getStaffUser:async()=>identity ? { ...identity, fullName:identity.email, displayName:identity.email, role:'parish_staff', sessionId:'audit-session', mustChangePassword:false } : null };
    if (name === 'next/headers') return { headers:async()=>new Headers() };
    if (name === 'next/navigation') return { redirect:(p)=>{throw new Error('redirect '+p);} };
    if (name.startsWith('@/')) return load(resolve(root, name.slice(2)+'.ts'));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`,{filename:file})(localRequire,loadedModule,loadedModule.exports);
  return loadedModule.exports;
}
const service = load(resolve(root,'backend/services/admin-service.ts'));
const mobile = load(resolve(root,'backend/services/mobile-service.ts'));
const auth = load(resolve(root,'backend/auth/mobile-auth.ts'));
const uploadRoute = load(resolve(root,'backend/routes/mobile/appointment-document.ts'));
const downloadRoute = load(resolve(root,'backend/routes/admin/document.ts'));
const results = [];
function record(name, observed, expected, pass) { const r={name,observed,expected,pass}; results.push(r); console.log(JSON.stringify(r)); }
async function attempt(work) {try {return {status:200,result:await work()};}catch(e){return {status:e.status ?? 500,error:e.message};}}
function runSql(q,...args){return sql.prepare(q).run(...args);}
async function mutate(actor,body,key=crypto.randomUUID()){return attempt(()=>service.performAdminMutation(actor,body,key));}
function actor(id,role,parishId,clergyProfileId=null){return {id,name:id,email:`${id}@example.test`,role,parishId,parishName:parishId,clergyProfileId};}
const admin=actor('audit-admin','system_admin',null), staff=actor('audit-staff','parish_staff','p1'), otherStaff=actor('audit-other-staff','parish_staff','p2');
const clergy=actor('audit-clergy','clergy','p1','c1'), otherClergy=actor('audit-other-clergy','clergy','p1','c2');
for(const id of ['p1','p2'])runSql('INSERT INTO parishes(id,slug,name)VALUES(?,?,?)',id,id,id);
for(const a of [admin,staff,otherStaff,clergy,otherClergy])runSql('INSERT INTO users(id,email,full_name,role,home_parish_id)VALUES(?,?,?,?,?)',a.id,a.email,a.name,a.role,a.parishId);
for(const [id,user] of [['c1',clergy.id],['c2',otherClergy.id]])runSql('INSERT INTO clergy_profiles(id,user_id,display_title,home_parish_id)VALUES(?,?,?,?)',id,user,id,'p1');
for(const [id,p]of[['v1','p1'],['v2','p2']])runSql('INSERT INTO venues(id,parish_id,name)VALUES(?,?,?)',id,p,id);
runSql("INSERT INTO service_types(id,slug,name,duration_minutes,buffer_before_minutes,buffer_after_minutes)VALUES('baptism','baptism','Baptism',60,15,15)");
runSql("INSERT INTO document_requirements(id,service_type_id,name)VALUES('requirement-one','baptism','Synthetic birth record')");
runSql("INSERT INTO sacramental_records(id,parish_id,record_type,subject_name,event_date,reference)VALUES('record-other-person','p1','Baptismal','Synthetic unrelated parish resident','2000-01-01','SYNTHETIC-ONLY')");

function pdf(label) {
  // A small complete, inert one-page PDF, with byte-correct xref offsets.
  const bodies = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>'];
  let output = '%PDF-1.7\n% ' + label + '\n'; const offsets = [0];
  bodies.forEach((body,i) => { offsets.push(Buffer.byteLength(output)); output += `${i+1} 0 obj\n${body}\nendobj\n`; });
  const start = Buffer.byteLength(output);
  output += 'xref\n0 4\n0000000000 65535 f \n' + offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  return output + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
}
try {
  {
    // Force both signups to pass the preflight lookup before either insert.
    const input = { displayName:'Synthetic Signup Race', email:'signup-race@example.test', mobileNumber:'+63 917 000 0000', homeParishId:'p1', password:'SyntheticService!2026', confirmPassword:'SyntheticService!2026', acceptPrivacyNotice:true };
    let reads = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    statementHook = async (query, row) => {
      if (query.startsWith('SELECT id FROM users WHERE lower(email)') && !row) {
        if (++reads === 2) release();
        await gate;
      }
    };
    const raced = await Promise.all([attempt(() => auth.signUpMobile(input,null)), attempt(() => auth.signUpMobile(input,null))]);
    statementHook = undefined;
    const statuses = raced.map(value => value.status).sort((a,b) => a-b);
    record('concurrent signup returns one success and one account conflict', statuses, [200,409], JSON.stringify(statuses) === '[200,409]');
    const winner = raced.find(value => value.status === 200).result;
    const counts = sql.prepare('SELECT COUNT(*) AS count FROM mobile_credentials WHERE user_id IN (SELECT id FROM users WHERE email=?)').get(input.email);
    record('concurrent signup leaves exactly one complete credential record', counts.count, 1, counts.count === 1);
    // Force timestamp ties to exercise session pruning deterministically.
    runSql(`CREATE TEMP TRIGGER tied_test_session_time AFTER INSERT ON mobile_sessions BEGIN UPDATE mobile_sessions SET created_at='2026-01-01 00:00:00' WHERE id=NEW.id; END`);
    runSql("UPDATE mobile_sessions SET created_at='2026-01-01 00:00:00' WHERE user_id=?", winner.profile.id);
    const issued = [];
    let latestToken;
    for (let index=0;index<6;index++) {
      const login = await auth.signInMobile({email:input.email,password:input.password},null);
      latestToken = login.accessToken;
      const result = await attempt(() => auth.requireMobileActor(new Request('http://localhost/api/mobile/auth/session',{headers:{Authorization:`Bearer ${login.accessToken}`}})));
      issued.push(result.status);
    }
    runSql('DROP TRIGGER tied_test_session_time');
    record('newly issued sessions survive equal-timestamp session pruning', issued, 'all 200', issued.every(status => status === 200));
    const kept = sql.prepare('SELECT COUNT(*) AS count FROM mobile_sessions WHERE user_id=?').get(winner.profile.id).count;
    record('session pruning retains its five-session limit', kept, 5, kept === 5);
    const passwordRoute = load(resolve(root,'backend/routes/mobile/auth/change-password.ts'));
    const attempts = [];
    for (let index=0;index<6;index++) {
      const response = await passwordRoute.POST(new Request('http://localhost/api/mobile/auth/change-password', {
        method:'POST', headers:{Authorization:`Bearer ${latestToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({currentPassword:'IncorrectCurrent!2026',newPassword:'AnotherSynthetic!2026',confirmPassword:'AnotherSynthetic!2026'}),
      }));
      attempts.push(response.status);
    }
    record('password-change attempts are rate limited per account',attempts,[400,400,400,400,400,429],JSON.stringify(attempts)==='[400,400,400,400,400,429]');
  }
  const signup=await auth.signUpMobile({displayName:'Synthetic Regression',email:'synthetic-service@example.test',mobileNumber:'+63 917 000 0000',homeParishId:'p1',password:'SyntheticService!2026',confirmPassword:'SyntheticService!2026',acceptPrivacyNotice:true},null);
  const token=signup.accessToken;
  const request=()=>new Request('http://localhost/api/mobile/snapshot',{headers:{Authorization:`Bearer ${token}`}});
  const mobileActor=await auth.requireMobileActor(request());
  const date=new Date(Date.now()+80*86400000).toISOString().slice(0,10);
  const input={serviceId:'baptism',parishId:'p1',clergyId:'c1',venueId:'v1',date,time:'8:00 AM',documents:[]};
  const appointment=await mobile.createMobileAppointment(mobileActor,input,crypto.randomUUID());
  const doc=appointment.documents[0], context={params:Promise.resolve({id:appointment.id,documentId:doc.id})};
  async function upload(name,body=pdf(name)){const form=new FormData();form.set('file',new File([body],name,{type:'application/pdf'}));return uploadRoute.POST(new Request('http://localhost/api/mobile/appointments/x/documents/y',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form}),context);}
  const original=await upload('original.pdf');
  record('valid document upload',original.status,200,original.status===200);
  const originalDoc=sql.prepare('SELECT storage_key AS key,sha256 FROM document_submissions WHERE id=?').get(doc.id);
  const fake=await upload('fake.pdf','%PDF-1.7\nFake\n%%EOF');
  record('header-only fake PDF rejected',fake.status,400,fake.status===400);
  const states=await Promise.all([staff,otherStaff,clergy,otherClergy,admin].map(a=>service.loadDashboardState(a,a.email)));
  record('staff parish isolation',states.slice(0,2).map(s=>s.appointments.length),[1,0],states[0].appointments.length===1&&states[1].appointments.length===0);
  record('clergy assigned-appointment isolation',states.slice(2,4).map(s=>s.appointments.length),[1,0],states[2].appointments.length===1&&states[3].appointments.length===0);
  record('clergy and technical admin cannot read private sacramental records',states.slice(2).map(s=>s.records.length),[0,0,0],states.slice(2).every(s=>s.records.length===0));
  const wrongWrite=await mutate(otherStaff,{action:'document.review',documentId:doc.id,status:'verified',expectedSha256:originalDoc.sha256});
  record('wrong-parish review denied',wrongWrite.status,403,wrongWrite.status===403);
  identity={userId:admin.id,email:admin.email};
  const downloaded=await downloadRoute.GET(new Request('http://localhost'),{params:Promise.resolve({id:doc.id})});
  record('technical admin private download denied',downloaded.status,403,downloaded.status===403);
  const memberships=sql.prepare("PRAGMA foreign_key_list('appointments')").all();
  let orphanAccepted=false;try{runSql("INSERT INTO notifications(id,recipient_user_id,type,title,body)VALUES('orphan-test','missing-user','test','Audit','Audit')");orphanAccepted=true;}catch{}
  record('owner foreign keys enforced',{orphanAccepted,appointmentForeignKeys:memberships.length},'orphan rejected',!orphanAccepted);
  let resume,seen;const readSeen=new Promise(resolve=>seen=resolve),gate=new Promise(resolve=>resume=resolve);
  statementHook=async(q,row)=>{if(q.includes('ds.storage_key AS storageKey')&&q.includes('ds.status')&&row?.id===doc.id){statementHook=undefined;seen();await gate;}};
  const reviewing=mutate(staff,{action:'document.review',documentId:doc.id,status:'verified',expectedSha256:originalDoc.sha256});
  await Promise.race([readSeen,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Review race hook not reached')),3000);timer.unref();})]);
  await upload('replacement-never-reviewed.pdf');resume();const review=await reviewing;
  const freshDoc=sql.prepare('SELECT status,sha256 FROM document_submissions WHERE id=?').get(doc.id);
  record('stale review cannot verify replacement',{status:review.status,document:freshDoc.status},'409 and submitted',review.status===409&&freshDoc.status==='submitted');
  record('previous document retained for audit',objects.has(originalDoc.key),true,objects.has(originalDoc.key));
  async function transition(a,status){return mutate(a,{action:'appointment.transition',appointmentId:appointment.id,expectedVersion:sql.prepare('SELECT version FROM appointments WHERE id=?').get(appointment.id).version,status,reason:'Synthetic regression transition'});}
  const techDecision=await transition(admin,'under_review');
  record('technical admin workflow changes denied',techDecision.status,'403 or 409',[403,409].includes(techDecision.status));
  const staffReview=await transition(staff,'under_review');
  record('staff begins document review',staffReview.status,200,staffReview.status===200);
  const verified=await mutate(staff,{action:'document.review',documentId:doc.id,status:'verified',expectedSha256:freshDoc.sha256});
  record('review current exact document succeeds',verified.status,200,verified.status===200);
  const ready=await transition(staff,'ready_to_approve');
  record('verified request can become ready',ready.status,200,ready.status===200);
  const locked=await upload('after-ready.pdf');
  record('ready request document changes blocked',locked.status,409,locked.status===409);
  runSql("INSERT INTO availability_blocks(id,parish_id,kind,starts_at,ends_at,created_by)VALUES('approval-block','p1','closure',?,?,?)",date+'T00:00:00Z',date+'T23:59:59Z',staff.id);
  const blockedApproval=await transition(clergy,'approved');
  record('approval rechecks parish-wide closure',blockedApproval.status,409,blockedApproval.status===409);
  runSql("DELETE FROM availability_blocks WHERE id='approval-block'");
  runSql('UPDATE users SET is_active=0 WHERE id=?',clergy.id);
  const inactiveApproval=await transition(clergy,'approved');
  record('approval rechecks active clergy',inactiveApproval.status,409,inactiveApproval.status===409);
  runSql('UPDATE users SET is_active=1 WHERE id=?',clergy.id);
  const approved=await transition(clergy,'approved');
  record('assigned clergy can approve',approved.status,200,approved.status===200);
  const replacement=await upload('after-approval.pdf');
  record('approved request document changes blocked',replacement.status,409,replacement.status===409);
  const cancelled=await transition(staff,'cancelled');
  record('staff can cancel approved request',cancelled.status,200,cancelled.status===200);
  const closed=await upload('after-cancelled.pdf');
  record('cancelled request document changes blocked',closed.status,409,closed.status===409);
  await mutate(admin,{action:'user.set_active',userId:clergy.id,isActive:false});
  const catalog=await mobile.loadMobileCatalog();
  const disabledListed=catalog.parishes.some(p=>p.clergy.some(c=>c.id==='c1'));
  const newBooking=await attempt(()=>mobile.createMobileAppointment(mobileActor,{...input,time:'1:30 PM'},crypto.randomUUID()));
  record('inactive clergy not listed or bookable',{listed:disabledListed,status:newBooking.status},'hidden and 409',!disabledListed&&newBooking.status===409);
  runSql('UPDATE users SET is_active=1 WHERE id=?',clergy.id);
  const invalidTime=await attempt(()=>mobile.createMobileAppointment(mobileActor,{...input,time:'2:17 AM'},crypto.randomUUID()));
  record('unoffered booking time rejected',invalidTime.status,400,invalidTime.status===400);
  const validation=load(resolve(root,'shared/validation.ts'));
  record('invalid calendar date rejected',validation.validCalendarDate('2000-02-31'),false,!validation.validCalendarDate('2000-02-31'));
  record('valid leap day accepted',validation.validCalendarDate('2000-02-29'),true,validation.validCalendarDate('2000-02-29'));
  const badPhone=await attempt(()=>mobile.updateMobileProfile(mobileActor,{displayName:'Synthetic Regression',mobileNumber:'----------',homeParishId:'p1',notificationsEnabled:true}));
  record('punctuation-only phone rejected',badPhone.status,400,badPhone.status===400);
  record('SQLite UTC timestamp normalized',validation.utcTimestamp('2026-09-20 12:30:00'),'2026-09-20T12:30:00Z',validation.utcTimestamp('2026-09-20 12:30:00')==='2026-09-20T12:30:00Z');
  // An existing service's buffer matters even when the incoming request's own buffer does not overlap its core time.
  const buffered = await mobile.createMobileAppointment(mobileActor,input,crypto.randomUUID());
  runSql("UPDATE service_types SET buffer_after_minutes=45 WHERE id='baptism'");
  const bufferBooking=await attempt(()=>mobile.createMobileAppointment(mobileActor,{...input,time:'9:30 AM'},crypto.randomUUID()));
  const bufferAvailability=await mobile.searchMobileAvailability(input);
  record('existing appointment buffer blocks adjacent booking',bufferBooking.status,409,bufferBooking.status===409);
  record('availability and booking agree on buffers',bufferAvailability.slots.find(s=>s.time==='9:30 AM')?.available,false,bufferAvailability.slots.find(s=>s.time==='9:30 AM')?.available===false);
  runSql("UPDATE appointments SET status='cancelled' WHERE id=?",buffered.id);
  runSql("INSERT INTO availability_blocks(id,parish_id,kind,starts_at,ends_at,created_by)VALUES('parish-closure','p1','closure',?,?,?)",date+'T00:00:00Z',date+'T23:59:59Z',staff.id);
  const closureBooking=await attempt(()=>mobile.createMobileAppointment(mobileActor,input,crypto.randomUUID()));
  const closureSlots=await mobile.searchMobileAvailability(input);
  record('parish-wide closure blocks booking and slots',{status:closureBooking.status,available:closureSlots.slots.filter(s=>s.available).length},'409 and no slots',closureBooking.status===409&&closureSlots.slots.every(s=>!s.available));
  runSql("DELETE FROM availability_blocks WHERE id='parish-closure'");
  const failures=await Promise.all(Array.from({length:8},()=>attempt(()=>auth.signInMobile({email:signup.profile.email,password:'IncorrectAudit!2026'},null))));
  const counter=sql.prepare('SELECT failed_attempts AS attempts,locked_until AS lockedUntil FROM mobile_credentials WHERE user_id=?').get(signup.profile.id);
  record('simultaneous bad passwords trigger lockout',{statuses:failures.map(x=>x.status),...counter},'at least 5 attempts and lockout',counter.attempts>=5&&!!counter.lockedUntil);
  const lockedLogin=await attempt(()=>auth.signInMobile({email:signup.profile.email,password:'SyntheticService!2026'},null));
  record('correct password cannot bypass active lockout',lockedLogin.status,401,lockedLogin.status===401);
  const badCurrentPassword=await attempt(()=>auth.changeMobilePassword(request(),{currentPassword:'WrongPassword!2026',newPassword:'NewSynthetic!2026',confirmPassword:'NewSynthetic!2026'}));
  record('incorrect current password does not signal expired session',badCurrentPassword.status,400,badCurrentPassword.status===400);
  const passwordResults=await Promise.all(['UpdatedAlpha!2026','UpdatedBravo!2026'].map(password=>attempt(()=>auth.changeMobilePassword(request(),{currentPassword:'SyntheticService!2026',newPassword:password,confirmPassword:password}))));
  record('concurrent password changes have one winner',passwordResults.map(result=>result.status).sort(),[200,409],passwordResults.filter(r=>r.status===200).length===1&&passwordResults.filter(r=>r.status===409).length===1);
  const winnerPassword=passwordResults[0].status===200?'UpdatedAlpha!2026':'UpdatedBravo!2026';
  let releaseIssue,seenIssue;
  const issueSeen=new Promise(resolve=>seenIssue=resolve),issueGate=new Promise(resolve=>releaseIssue=resolve);
  beforeRunHook=async query=>{if(query.includes('INSERT INTO mobile_sessions')){beforeRunHook=undefined;seenIssue();await issueGate;}};
  const staleLogin=attempt(()=>auth.signInMobile({email:signup.profile.email,password:winnerPassword},null));
  await Promise.race([issueSeen,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Session issue hook not reached')),3000);timer.unref();})]);
  await auth.changeMobilePassword(request(),{currentPassword:winnerPassword,newPassword:'FinalSynthetic!2026',confirmPassword:'FinalSynthetic!2026'});
  releaseIssue();
  const staleResult=await staleLogin;
  record('old-password login cannot issue session after a password change',staleResult.status,401,staleResult.status===401);
  const duplicateKey=crypto.randomUUID(), duplicateRecord={action:'record.create',parishId:'p1',recordType:'Baptismal',subjectName:'Synthetic Concurrent Record',eventDate:'2000-01-01',reference:'SYNTHETIC-CONCURRENT'};
  const recordResponses=await Promise.all([mutate(staff,duplicateRecord,duplicateKey),mutate(staff,duplicateRecord,duplicateKey)]);
  record('concurrent record retry responses',recordResponses.map(r=>r.status),[200,200],recordResponses.every(r=>r.status===200));
  const count=sql.prepare('SELECT count(*) AS n FROM sacramental_records WHERE reference=?').get(duplicateRecord.reference).n;
  record('concurrent record retries create one record',count,1,count===1);
  const recordSearch=load(resolve(root,'backend/services/record-search-service.ts'));
  for(let i=0;i<137;i++)runSql("INSERT INTO sacramental_records(id,parish_id,record_type,subject_name,event_date,reference)VALUES(?,'p1','Baptismal',?,'2000-01-01',?)",'paged-'+String(i).padStart(4,'0'),'Synthetic paged '+i,'PAGED-'+i);
  runSql("INSERT INTO sacramental_records(id,parish_id,record_type,subject_name,event_date,reference)VALUES('paged-other','p2','Baptismal','Synthetic paged other parish','2000-01-01','PAGED-OTHER')");
  const pages=[];let cursor=null;
  for(let i=0;i<10;i++){
    const page=await recordSearch.searchParishRecords(staff,{query:'Synthetic paged',cursor,parishId:'p2'});
    pages.push(page);cursor=page.nextCursor;if(!cursor)break;
  }
  const records=pages.flatMap(page=>page.records);
  record('record pagination returns all 137 matches beyond the old cap',{count:records.length,pages:pages.length},'137 across bounded pages',records.length===137&&pages.every(page=>page.records.length<=25));
  record('equal-date record pages have no duplicates',new Set(records.map(row=>row.id)).size,137,new Set(records.map(row=>row.id)).size===137);
  record('client parish override cannot widen record search',records.every(row=>row.parish==='p1'),true,records.every(row=>row.parish==='p1'));
  const otherPage=await recordSearch.searchParishRecords(otherStaff,{query:'Synthetic paged'});
  record('other parish sees only its own matching record',otherPage.records.map(row=>row.id),['paged-other'],otherPage.records.length===1&&otherPage.records[0].id==='paged-other');
  for(const a of [admin,clergy]){
    const denied=await attempt(()=>recordSearch.searchParishRecords(a,{}));
    record(a.role+' cannot use record search',denied.status,403,denied.status===403);
  }
  const injected=await recordSearch.searchParishRecords(staff,{query:"' OR 1=1 --"});
  record('record search binds SQL-looking text literally',injected.records.length,0,injected.records.length===0);
  runSql("INSERT INTO sacramental_records(id,parish_id,record_type,subject_name,event_date,reference)VALUES('literal-wildcard','p1','Baptismal','Literal 100%_proof','2000-01-01','LITERAL-WILDCARD')");
  const literal=await recordSearch.searchParishRecords(staff,{query:'100%_proof'});
  record('record search escapes wildcard characters',literal.records.map(row=>row.id),['literal-wildcard'],literal.records.length===1&&literal.records[0].id==='literal-wildcard');
  const invalidCursor=await attempt(()=>recordSearch.searchParishRecords(staff,{cursor:{eventDate:'2000-02-31',id:'x'}}));
  record('malformed record page cursor rejected',invalidCursor.status,400,invalidCursor.status===400);
  const oversizedSearch=await attempt(()=>recordSearch.searchParishRecords(staff,{query:'x'.repeat(121)}));
  record('record search length bounded',oversizedSearch.status,400,oversizedSearch.status===400);
  const recordRoute=load(resolve(root,'backend/routes/admin/records.ts'));
  const searchRequest=()=>new Request('http://localhost/api/admin/records',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},body:JSON.stringify({query:'Synthetic paged'})});
  identity=null;
  const anonymousSearch=await recordRoute.POST(searchRequest());
  record('record search requires authentication',anonymousSearch.status,401,anonymousSearch.status===401);
  identity={userId:staff.id,email:staff.email};
  const searched=await recordRoute.POST(searchRequest()),searchedBody=await searched.json();
  record('protected record search route returns one page',{status:searched.status,count:searchedBody.records?.length},'200 and 25',searched.status===200&&searchedBody.records.length===25);
  const crossOriginSearch=await recordRoute.POST(new Request('http://localhost/api/admin/records',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'}));
  record('cross-origin record search denied',crossOriginSearch.status,403,crossOriginSearch.status===403);

  // Large-data regressions: identical instants with different stored offsets.
  const schedules=load(resolve(root,'backend/services/assignment-search-service.ts'));
  const insertSchedule=(id,parish,priest,start,end,serviceName='Paged duty',status='confirmed')=>runSql(
    'INSERT INTO clergy_assignments(id,parish_id,clergy_id,clergy_name,venue_name,service,starts_at,ends_at,status,created_by)VALUES(?,?,?,?,?,?,?,?,?,?)',
    id,parish,priest,priest,'Synthetic venue',serviceName,start,end,status,staff.id);
  for(let i=0;i<137;i++)insertSchedule('schedule-'+String(i).padStart(4,'0'),'p1','c1',
    i%2?'2099-01-02T08:00:00+08:00':'2099-01-02T00:00:00.000Z',
    '2099-01-02T01:00:00.000Z');
  insertSchedule('schedule-other-priest','p1','c2','2099-01-02T00:00:00Z','2099-01-02T01:00:00Z','Other priest');
  insertSchedule('schedule-other-parish','p2','c1','2099-01-02T00:00:00Z','2099-01-02T01:00:00Z');
  insertSchedule('schedule-past','p1','c1','2000-01-01T00:00:00Z','2000-01-01T01:00:00Z','Past duty');
  insertSchedule('schedule-cancelled','p1','c1','2099-01-02T00:00:00Z','2099-01-02T01:00:00Z','Paged duty','cancelled');
  insertSchedule('schedule-literal','p1','c1','2099-01-02T00:00:00Z','2099-01-02T01:00:00Z','Literal 100%_duty');
  const ongoingStart=new Date(Date.now()-3600000).toISOString(),ongoingEnd=new Date(Date.now()+3600000).toISOString();
  insertSchedule('schedule-ongoing','p1','c1',ongoingStart,ongoingEnd,'In progress');
  const assignmentPages=[]; let assignmentCursor=null;
  for(let i=0;i<10;i++){
    const page=await schedules.searchClergyAssignments(staff,{query:'Paged duty',period:'all',cursor:assignmentCursor,parishId:'p2',pageSize:10000});
    assignmentPages.push(page);assignmentCursor=page.nextCursor;if(!assignmentCursor)break;
  }
  const assignmentRows=assignmentPages.flatMap(page=>page.assignments);
  record('schedule pagination retrieves every matching assignment beyond 100',{total:assignmentRows.length,pages:assignmentPages.length},'137 in six bounded pages',assignmentRows.length===137&&assignmentPages.length===6&&assignmentPages.every(p=>p.assignments.length<=25));
  record('equal-instant offset variations do not duplicate or skip schedule rows',new Set(assignmentRows.map(row=>row.id)).size,137,new Set(assignmentRows.map(row=>row.id)).size===137&&assignmentRows.every(row=>row.startsAt==='2099-01-02T00:00:00.000Z'));
  record('client overrides cannot widen schedule parish scope',assignmentRows.every(row=>row.parish==='p1'),true,assignmentRows.every(row=>row.parish==='p1'));
  const ownSchedule=await schedules.searchClergyAssignments(otherClergy,{period:'all'});
  record('clergy schedule restricted to own assignments',ownSchedule.assignments.map(row=>row.id),['schedule-other-priest'],ownSchedule.assignments.length===1&&ownSchedule.assignments[0].id==='schedule-other-priest');
  const otherParishSchedule=await schedules.searchClergyAssignments(otherStaff,{period:'all'});
  record('staff schedule restricted to assigned parish',otherParishSchedule.assignments.map(row=>row.id),['schedule-other-parish'],otherParishSchedule.assignments.length===1&&otherParishSchedule.assignments[0].id==='schedule-other-parish');
  const globalSchedule=await schedules.searchClergyAssignments(admin,{query:'Paged duty',period:'all'});
  record('system administrator may browse the operational schedule',globalSchedule.assignments.length,25,globalSchedule.assignments.length===25);
  const unassignedSchedule=await attempt(()=>schedules.searchClergyAssignments({...clergy,clergyProfileId:null},{}));
  const unscopedSchedule=await attempt(()=>schedules.searchClergyAssignments({...staff,parishId:null},{}));
  record('missing assignment identity or parish fails closed',[unassignedSchedule.status,unscopedSchedule.status],[403,403],unassignedSchedule.status===403&&unscopedSchedule.status===403);
  const past=await schedules.searchClergyAssignments(staff,{query:'Past duty',period:'past'});
  const notUpcoming=await schedules.searchClergyAssignments(staff,{query:'Past duty',period:'upcoming'});
  const ongoing=await schedules.searchClergyAssignments(staff,{query:'In progress',period:'upcoming'});
  record('schedule period filter keeps in-progress work and separates past work',[past.assignments.length,notUpcoming.assignments.length,ongoing.assignments.length],[1,0,1],past.assignments.length===1&&notUpcoming.assignments.length===0&&ongoing.assignments.length===1);
  const literalDuty=await schedules.searchClergyAssignments(staff,{query:'100%_duty',period:'all'});
  const injectionDuty=await schedules.searchClergyAssignments(staff,{query:"' OR 1=1 --",period:'all'});
  record('schedule search treats wildcard and SQL-looking input literally',[literalDuty.assignments.length,injectionDuty.assignments.length],[1,0],literalDuty.assignments.length===1&&injectionDuty.assignments.length===0);
  for(const [label,bad]of[
    ['oversized query',{query:'x'.repeat(121)}],
    ['unknown period',{period:'private'}],
    ['impossible cursor date',{cursor:{startsAt:'2099-02-31T00:00:00.000Z',id:'x'}}],
    ['noncanonical cursor time',{cursor:{startsAt:'2099-01-01T24:00:00.000Z',id:'x'}}],
    ['invalid cursor ID',{cursor:{startsAt:'2099-01-01T00:00:00.000Z',id:{}}}],
  ]){
    const rejected=await attempt(()=>schedules.searchClergyAssignments(staff,bad));
    record('schedule rejects '+label,rejected.status,400,rejected.status===400);
  }
  const assignmentRoute=load(resolve(root,'backend/routes/admin/assignments.ts'));
  const scheduleRequest=(origin='http://localhost',body='{"query":"Paged duty","period":"all"}')=>new Request('http://localhost/api/admin/assignments',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body});
  identity=null;
  const anonymousSchedule=await assignmentRoute.POST(scheduleRequest());
  record('schedule search requires authentication',anonymousSchedule.status,401,anonymousSchedule.status===401);
  identity={userId:staff.id,email:staff.email};
  const scheduleResponse=await assignmentRoute.POST(scheduleRequest()),scheduleBody=await scheduleResponse.json();
  record('schedule route serves a bounded private page',{status:scheduleResponse.status,count:scheduleBody.assignments?.length,cache:scheduleResponse.headers.get('Cache-Control')},'200, 25, no-store',scheduleResponse.status===200&&scheduleBody.assignments.length===25&&scheduleResponse.headers.get('Cache-Control').includes('no-store'));
  const crossOriginSchedule=await assignmentRoute.POST(scheduleRequest('https://untrusted.example'));
  const malformedSchedule=await assignmentRoute.POST(scheduleRequest('http://localhost','{'));
  const oversizedSchedule=await assignmentRoute.POST(scheduleRequest('http://localhost',JSON.stringify({query:'x'.repeat(5000)})));
  record('schedule route rejects cross-origin, malformed and oversized bodies',[crossOriginSchedule.status,malformedSchedule.status,oversizedSchedule.status],[403,400,413],crossOriginSchedule.status===403&&malformedSchedule.status===400&&oversizedSchedule.status===413);

  runSql("UPDATE sacramental_records SET status='verified_against_archive' WHERE id LIKE 'paged-%'");
  for(let i=0;i<137;i++)runSql("INSERT INTO announcements(id,parish_id,author_id,title,body,status,audience,published_at)VALUES(?,'p1',?,'Synthetic notice','Synthetic text','published','parish','2026-09-23T00:00:00Z')",'notice-'+i,staff.id);
  runSql("INSERT INTO announcements(id,parish_id,author_id,title,body,status,audience,published_at)VALUES('notice-other','p2',?,'Other notice','Synthetic text','published','parish','2026-09-23T00:00:00Z')",otherStaff.id);
  runSql("INSERT INTO announcements(id,parish_id,author_id,title,body,status,audience,published_at)VALUES('notice-global',NULL,?,'Global notice','Synthetic text','published','parish','2026-09-23T00:00:00Z')",admin.id);
  runSql("INSERT INTO announcements(id,parish_id,author_id,title,body,status,audience,published_at)VALUES('notice-draft','p1',?,'Draft notice','Synthetic text','draft','parish',NULL)",staff.id);
  const counted=await service.loadDashboardState(staff,staff.email);
  record('verified record count is not truncated to the 100-item preview',{count:counted.metrics.verifiedRecords,preview:counted.records.length},'137 and 100',counted.metrics.verifiedRecords===137&&counted.records.length===100);
  record('published notice count includes all scoped notices, excludes drafts',{count:counted.metrics.publishedAnnouncements,preview:counted.announcements.length},'138 and 20',counted.metrics.publishedAnnouncements===138&&counted.announcements.length===20);
  const expectedAssignments=sql.prepare("SELECT COUNT(*) AS n FROM clergy_assignments WHERE parish_id='p1' AND status='confirmed'").get().n;
  record('assignment total comes from the full scoped database',{count:counted.metrics.confirmedAssignments,preview:counted.clergyAssignments.length},expectedAssignments,counted.metrics.confirmedAssignments===expectedAssignments&&counted.clergyAssignments.length===100);
  const restrictedCounts=await Promise.all([clergy,admin].map(a=>service.loadDashboardState(a,a.email)));
  record('restricted archive and document counts are unavailable, not leaked or false zeros',restrictedCounts.map(s=>[s.metrics.verifiedRecords,s.metrics.verifiedDocuments,s.metrics.awaitingDocumentReview]),'all null',restrictedCounts.every(s=>s.metrics.verifiedRecords===null&&s.metrics.verifiedDocuments===null&&s.metrics.awaitingDocumentReview===null));
  const otherCounts=await service.loadDashboardState(otherStaff,otherStaff.email);
  record('aggregate counts do not cross parish boundaries',[otherCounts.metrics.verifiedRecords,otherCounts.metrics.publishedAnnouncements,otherCounts.metrics.confirmedAssignments],[1,2,1],otherCounts.metrics.verifiedRecords===1&&otherCounts.metrics.publishedAnnouncements===2&&otherCounts.metrics.confirmedAssignments===1);
  record('appointment status totals are database-backed',Object.values(counted.metrics.appointmentStatuses).reduce((a,b)=>a+b,0),counted.appointments.length,Object.values(counted.metrics.appointmentStatuses).reduce((a,b)=>a+b,0)===counted.appointments.length);
  record('clergy queue metrics remain restricted',[restrictedCounts[0].metrics.waitingQueue,restrictedCounts[0].metrics.servingQueue],[null,null],restrictedCounts[0].metrics.waitingQueue===null&&restrictedCounts[0].metrics.servingQueue===null);
  const plan=sql.prepare("EXPLAIN QUERY PLAN SELECT id FROM clergy_assignments ca WHERE ca.parish_id=? AND ca.status='confirmed' ORDER BY julianday(ca.starts_at),ca.id LIMIT 26").all('p1');
  record('schedule paging uses its parish index without a temporary sort',plan.map(row=>row.detail),'idx_assignments_parish_page, no temp sort',plan.some(row=>row.detail.includes('idx_assignments_parish_page'))&&!plan.some(row=>row.detail.includes('TEMP B-TREE')));
  env.GEMINI_API_KEY='synthetic-audit-key';
  const stateRoute=load(resolve(root,'backend/routes/admin/state.ts'));
  const mutationRequest=body=>new Request('http://localhost/api/admin/state',{method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body});
  const invalidMutation=await stateRoute.POST(mutationRequest('{'));
  const largeMutation=await stateRoute.POST(mutationRequest(JSON.stringify({action:'record.create',subjectName:'x'.repeat(12001)})));
  record('admin mutations reject malformed and oversized JSON',[invalidMutation.status,largeMutation.status],[400,413],invalidMutation.status===400&&largeMutation.status===413);
  let mutationStreamCancelled=false;
  const streamedMutation=await stateRoute.POST(new Request('http://localhost/api/admin/state',{
    method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
    body:new ReadableStream({start(controller){controller.enqueue(new Uint8Array(12001));},cancel(){mutationStreamCancelled=true;}}),duplex:'half',
  }));
  record('admin mutation intake cancels an oversized stream before buffering it all',{status:streamedMutation.status,cancelled:mutationStreamCancelled},'413 and cancelled',streamedMutation.status===413&&mutationStreamCancelled);
  globalThis.fetch=async(url,init)=>{if(String(url).includes('generativelanguage.googleapis.com')){observedProviderPrompt=JSON.parse(init.body);return Response.json({});}return realFetch(url,init);};
  await mobile.askMobileAssistant(mobileActor,{prompt:'My name is Maria Sample. My passport is P1234567A and I live at 12 Sample Street. Can the app help me organize things?'});
  record('private chat text is not sent to an external provider',observedProviderPrompt,null,observedProviderPrompt===null);
  const history=sql.prepare('SELECT count(*) AS n FROM chatbot_messages').get().n;
  record('raw chat transcript is not persisted',history,0,history===0);
  const uploadSecurity=load(resolve(root,'backend/security/document-upload.ts'));
  const oversized=await attempt(()=>uploadSecurity.readDocumentForm(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'multipart/form-data; boundary=x'},body:new Uint8Array(11*1024*1024)})));
  record('oversized multipart without length rejected',oversized.status,413,oversized.status===413);
  runSql("UPDATE appointments SET status='documents_pending' WHERE id=?",appointment.id);
  const previousEnvironment=process.env.NODE_ENV;
  try {
    process.env.NODE_ENV='production';
    const readyRoute=load(resolve(root,'backend/routes/system/ready.ts'));
    const missingScanReadiness=await readyRoute.GET();
    record('production readiness refuses a missing scanner',missingScanReadiness.status,503,missingScanReadiness.status===503);
    const noScanner=await upload('unscanned.pdf');
    record('production upload fails closed without scanner',noScanner.status,503,noScanner.status===503);
    env.DOCUMENT_SCANNER={fetch:async()=>Response.json({status:'clean',sha256:'wrong-digest'})};
    const wrongScan=await upload('wrong-scan.pdf');
    record('scanner verdict must match uploaded bytes',wrongScan.status,422,wrongScan.status===422);
    env.DOCUMENT_SCANNER={fetch:async request=>Response.json({status:'clean',sha256:request.headers.get('X-Document-SHA256')})};
    const configuredReadiness=await readyRoute.GET();
    record('configured readiness passes its database probe',configuredReadiness.status,200,configuredReadiness.status===200);
    const clean=await upload('scanned.pdf');
    record('matching clean scan accepted',clean.status,200,clean.status===200);
  } finally {if(previousEnvironment===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousEnvironment;delete env.DOCUMENT_SCANNER;}
  let readinessQueries=0, outage=true;
  const readinessDb={prepare(){return {async all(){readinessQueries++;if(outage)throw new Error('Synthetic transient outage');return {results:[]};}};}};
  const readinessModule={exports:{}};
  const readinessCode=ts.transpileModule(readFileSync(resolve(root,'db/runtime.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const readinessRequire=runtimeDb=>name=>{
    if(name==='cloudflare:workers')return {env:{DB:runtimeDb}};
    if(name.startsWith('@/'))return load(resolve(root,name.slice(2)+'.ts'));
    return require(name);
  };
  vm.runInNewContext(`(function(require,module,exports){${readinessCode}\n})`,{process:{env:{NODE_ENV:'production'}}})(readinessRequire(readinessDb),readinessModule,readinessModule.exports);
  for(let i=0;i<2;i++){try{await readinessModule.exports.ensurePublicRuntimeDatabase();}catch{/* No real tables in this fault-injection adapter. */}outage=false;}
  record('transient readiness failure is retried in the same worker',readinessQueries,2,readinessQueries===2);
  const migratedReadiness={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${readinessCode}\n})`,{process:{env:{NODE_ENV:'production'}}})(readinessRequire(db),migratedReadiness,migratedReadiness.exports);
  sql.exec('DROP INDEX idx_assignments_parish_page');
  const missingPaginationIndex=await attempt(()=>migratedReadiness.exports.ensurePublicRuntimeDatabase());
  record('production schema readiness rejects an unapplied pagination migration',missingPaginationIndex.status,500,missingPaginationIndex.status===500&&missingPaginationIndex.error.includes('migration is incomplete'));
  sql.exec(readFileSync(resolve(root,'drizzle/0003_schedule_pagination.sql'),'utf8').replaceAll('--> statement-breakpoint',''));
  const restoredPaginationIndex=await attempt(()=>migratedReadiness.exports.ensurePublicRuntimeDatabase());
  record('schema readiness recovers after the missing index is restored',restoredPaginationIndex.status,200,restoredPaginationIndex.status===200);
  const accountReadiness={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${readinessCode}\n})`,{process:{env:{NODE_ENV:'production'}}})(readinessRequire(db),accountReadiness,accountReadiness.exports);
  sql.exec('DROP INDEX idx_mobile_email_challenges_user_purpose');
  const missingAccountIndex=await attempt(()=>accountReadiness.exports.ensurePublicRuntimeDatabase());
  record('production schema readiness rejects an incomplete account lifecycle migration',missingAccountIndex.status,500,missingAccountIndex.status===500&&missingAccountIndex.error.includes('migration is incomplete'));
  sql.exec('CREATE UNIQUE INDEX idx_mobile_email_challenges_user_purpose ON mobile_email_challenges(user_id,purpose)');
  const restoredAccountIndex=await attempt(()=>accountReadiness.exports.ensurePublicRuntimeDatabase());
  record('account lifecycle readiness recovers when its index is restored',restoredAccountIndex.status,200,restoredAccountIndex.status===200);
  const triggerReadiness={exports:{}};
  vm.runInNewContext(`(function(require,module,exports){${readinessCode}\n})`,{process:{env:{NODE_ENV:'production'}}})(readinessRequire(db),triggerReadiness,triggerReadiness.exports);
  sql.exec('DROP TRIGGER mobile_password_invalidate_challenges');
  const missingAccountTrigger=await attempt(()=>triggerReadiness.exports.ensurePublicRuntimeDatabase());
  record('production schema readiness rejects a missing password invalidation trigger',missingAccountTrigger.status,500,missingAccountTrigger.status===500);
  const passwordTrigger=readFileSync(resolve(root,'drizzle/0005_account_recovery.sql'),'utf8').split('--> statement-breakpoint').find(statement=>statement.includes('CREATE TRIGGER mobile_password_invalidate_challenges'));
  sql.exec(passwordTrigger);
  const restoredAccountTrigger=await attempt(()=>triggerReadiness.exports.ensurePublicRuntimeDatabase());
  record('account lifecycle readiness recovers when its trigger is restored',restoredAccountTrigger.status,200,restoredAccountTrigger.status===200);
}catch(error){record('isolated regression harness completed',error.stack,'completed',false);}
finally{globalThis.fetch=realFetch;sql.close();}
const failed=results.filter(r=>!r.pass);
console.log(`\nSecurity regression: ${results.length-failed.length}/${results.length} passed (migrated SQLite; mocked storage/scanner, not production infrastructure).`);
if(failed.length)process.exitCode=1;

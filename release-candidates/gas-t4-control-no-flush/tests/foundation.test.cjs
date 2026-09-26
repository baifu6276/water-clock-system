// Offline only: GAS services are in-memory; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = ['程式碼', 'EmployeeBaselineControl', 'EmployeeIdentity', 'EmployeeLifecycleStore', 'EmployeeApplication', 'EmployeeApplicationAdmin', 'EmployeeLifecycleRead', 'EmployeeLifecycleMutation', 'EmployeeLifecycleBaseline'];
let checks = 0;
function test(name, work) { work(); checks++; console.log('PASS', name); }
function env(allowEmployeeWrites = false) {
  let locked = false, writes = 0, verifies = 0, failTable = null, failAfter = 0, failPersisted = false, beforeLock = null, onWrite = null;
  const tables = {}, logs = [];
  function sheet(name, rows) {
    const s = { rows, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
      getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
      getRange: (r, c, n, m) => ({
        getValues: () => Array.from({length:n}, (_, i) => Array.from({length:m}, (_, j) => rows[r-1+i]?.[c-1+j] ?? '')),
        setValues: values => {
          assert.equal(locked, true, 'writes must hold lock');
          if (!allowEmployeeWrites) assert.notEqual(name, '員工資料表');
          const fail = failTable === name && failAfter-- === 0;
          if (fail) failTable = null;
          if (fail && !failPersisted) throw Error('simulated storage failure');
          writes++;
          values.forEach((row, i) => { rows[r-1+i] ||= []; row.forEach((v,j) => {
            rows[r-1+i][c-1+j] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
          }); });
          if (onWrite) { const hook=onWrite; onWrite=null; hook(); }
          if (fail) throw Error('simulated uncertain storage acknowledgement');
        }
      }) };
    tables[name] = s; return s;
  }
  const ctx = vm.createContext({ console: {log: (...v) => logs.push(v), error: (...v) => logs.push(v)},
    Logger: {log: (...v) => logs.push(v)},
    PropertiesService: { getScriptProperties: () => ({getProperty: () => 'test-channel'}) },
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => tables[name] || null}), flush: () => {}},
    LockService: {getScriptLock: () => ({tryLock: () => { if(locked)return false; if(beforeLock){const hook=beforeLock;beforeLock=null;hook();} locked=true; return true; }, waitLock: () => { assert(!locked); locked=true; }, releaseLock: () => {locked=false;}})},
    Utilities: {getUuid: crypto.randomUUID, DigestAlgorithm: {SHA_256:'sha256'}, Charset:{UTF_8:'utf8'},
      formatDate: date => new Date(date.getTime()+8*3600000).toISOString().slice(0,10),
      computeDigest: (_, str) => [...crypto.createHash('sha256').update(str).digest()]},
    ContentService: {MimeType:{JSON:'json'}, createTextOutput: text => ({setMimeType: () => JSON.parse(text)})},
    UrlFetchApp: {fetch: (url, options) => {
      assert.equal(locked, false, 'LINE verification must run outside lock'); verifies++;
      assert.equal(url, 'https://api.line.me/oauth2/v2.1/verify');
      assert.equal(options.payload.client_id, 'test-channel');
      const token = options.payload.id_token;
      if (token === 'network-secret') throw Error(token);
      const claims = {iss:'https://access.line.me', aud:'test-channel', sub:token.replace('token:', ''), exp:Date.now()/1000+600};
      if (token === 'expired') claims.exp=1;
      if (token === 'wrong-channel') claims.aud='other';
      return {getResponseCode: () => token === 'invalid-secret' ? 400 : 200,
        getContentText: () => JSON.stringify(token === 'invalid-secret' ? {error:token} : claims)};
    }} });
  files.forEach(f => vm.runInContext(read('sources/'+f+'.gs'), ctx, {filename:f+'.gs'}));
  sheet('員工資料表', [Array(12).fill('header'), ['E-owner','owner','測試管理員','', '', 0,'OWNER','','','在職','','']]);
  Object.values(ctx.EMPLOYEE_TABLES_).forEach(s => sheet(s.name, [[...s.headers]]));
  return {ctx, tables, logs, get writes(){return writes;}, get verifies(){return verifies;}, get locked(){return locked;},
    fail: (name, after=0, persisted=false) => {failTable=name;failAfter=after;failPersisted=persisted;},
    beforeLock: hook => {beforeLock=hook;}, onWrite: hook => {onWrite=hook;},
    call: (action, data={}, sub='new') => ctx.doPost({postData:{contents:JSON.stringify({action,idToken:'token:'+sub,...data})}}) };
}
const {seedV3}=require('./v3-data.cjs');
const {makeEnv}=require('./foundation-fixture.cjs');
const payload = {requestId:'request-submit-0001', type:'NEW_EMPLOYEE', name:'測試申請', phone:'0900000000', note:'測試資料'};
test('all candidate GAS parses',()=>{files.forEach(f=>new vm.Script(read('sources/'+f+'.gs')));});

test('missing/invalid/expired/wrong-channel/network tokens fail closed without token disclosure', () => {
  const e=env();
  for(const token of ['', 'invalid-secret', 'expired','wrong-channel','network-secret']) {
    const r=e.call('identityBootstrap',{idToken:token}); assert.equal(r.code,'AUTH_ERROR'); assert.equal(r.state,'AUTH_ERROR');
    if(token) assert(!JSON.stringify(r).includes(token));
  }
  assert.equal(e.writes,0); assert.equal(e.logs.length,0);
});
test('verified identity ignores claimed user/role; active and lifecycle states', () => {
  const e=env(); assert.equal(e.call('identityBootstrap',{userId:'owner',role:'OWNER',employeeId:'E-owner'}).state,'UNREGISTERED');
  assert.equal(e.call('identityBootstrap',{},'owner').state,'ACTIVE_EMPLOYEE');
  for(const [status,state] of [['停職','SUSPENDED'],['留停','LEAVE'],['離職','TERMINATED']]) {
    e.tables['員工資料表'].rows[1][9]=status; assert.equal(e.call('identityBootstrap',{},'owner').state,state);
  }
  e.tables['員工資料表'].rows[1][9]='unknown'; assert.equal(e.call('identityBootstrap',{},'owner').code,'IDENTITY_CONFLICT');
});
test('submit, pending, own list, idempotency/conflict, no duplicate pending and no token persistence', () => {
  const e=env(); const a=e.call('employeeApplicationSubmit',payload); assert.equal(a.success,true);
  const w=e.writes;
  assert.equal(e.call('identityBootstrap').state,'APPLICATION_PENDING');
  assert.equal(e.call('employeeApplicationSubmit',payload).application.applicationId,a.application.applicationId);
  assert.equal(e.writes,w);
  assert.equal(e.call('employeeApplicationSubmit',{...payload,name:'不同'}).code,'REQUEST_CONFLICT');
  assert.equal(e.call('employeeApplicationSubmit',{...payload,requestId:'request-submit-0002'}).application.applicationId,a.application.applicationId);
  assert.equal(e.writes,w+1); // Receipt only; no duplicate application or version change.
  assert.equal(e.call('employeeApplicationSubmit',{...payload,requestId:'request-submit-0002',name:'不同'}).code,'REQUEST_CONFLICT');
  assert.equal(e.call('employeeApplicationListOwn').applications.length,1);
  assert.equal(e.call('employeeApplicationListOwn',{},'other').applications.length,0);
  assert(!JSON.stringify(e.tables).includes('token:'));
  assert.equal(e.logs.length,0);
});
test('cancel owner only, expected version, pending only, replay without audit duplication', () => {
  const e=env(), a=e.call('employeeApplicationSubmit',payload).application;
  const p={requestId:'request-cancel-0001',applicationId:a.applicationId,expectedVersion:1};
  assert.equal(e.call('employeeApplicationCancel',p,'other').code,'FORBIDDEN');
  assert.equal(e.call('employeeApplicationCancel',{...p,expectedVersion:2}).code,'VERSION_CONFLICT');
  assert.equal(e.call('employeeApplicationCancel',p).application.status,'已取消');
  const w=e.writes; assert.equal(e.call('employeeApplicationCancel',p).success,true); assert.equal(e.writes,w);
  assert.equal(e.call('employeeApplicationCancel',{...p,requestId:'request-cancel-0002',expectedVersion:2}).code,'INVALID_STATE');
});
test('partial application write failure resumes durable intent with same request', () => {
  const e=env(); e.fail('員工加入申請');
  assert.equal(e.call('employeeApplicationSubmit',payload).code,'OPERATION_ERROR');
  assert.equal(e.call('employeeApplicationSubmit',{...payload,requestId:'request-submit-0002'}).code,'OPERATION_PENDING');
  assert.equal(e.call('employeeApplicationSubmit',payload).success,true);
  assert.equal(e.tables['員工加入申請'].rows.length,2);
  assert.equal(e.tables['員工異動紀錄'].rows.length,3);
});
test('lost completion audit resumes without rewriting the application', () => {
  const e=env();e.fail('員工異動紀錄',1);
  assert.equal(e.call('employeeApplicationSubmit',payload).code,'OPERATION_ERROR');
  assert.equal(e.tables['員工加入申請'].rows.length,2);
  const w=e.writes;assert.equal(e.call('employeeApplicationSubmit',payload).success,true);
  assert.equal(e.writes,w+1);assert.equal(e.tables['員工加入申請'].rows.length,2);
});
test('baseline is read-only, detects exceptions, restricted to active OWNER/ADMIN', () => {
  const e=env();
  e.tables['員工資料表'].rows.push(['dup','same','測試','','',0,'EMPLOYEE','','','unknown','',''],['dup','same','測試','','',0,'EMPLOYEE','','','在職','',''],['','','測試','','',0,'EMPLOYEE','','','在職','','']);
  const before=JSON.stringify(e.tables), result=e.call('employeeLifecycleBaselineDryRun',{},'owner');
  assert.equal(result.success,true); assert.deepEqual(result.duplicateEmployeeIds,['dup']);
  assert.equal(result.duplicateLineUidCount,1); assert(!JSON.stringify(result).includes('same')); assert(!('duplicateLineUids' in result)); assert.equal(result.blankEmployeeId,1); assert.equal(result.blankLineUid,1);
  assert.equal(result.unknownStatus,1); assert.equal(result.noOwner,false); assert.equal(result.eligibleEmploymentCount,1);
  assert.equal(result.eligibleBindingCount,1); assert.equal(JSON.stringify(e.tables),before); assert.equal(e.writes,0);
  assert.equal(e.call('employeeLifecycleBaselineDryRun',{role:'OWNER'}).code,'FORBIDDEN');
  for(const role of ['EMPLOYEE','SITE_MANAGER']) {e.tables['員工資料表'].rows[1][6]=role; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').code,'FORBIDDEN');}
  e.tables['員工資料表'].rows[1][6]='ADMIN'; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').success,true);
  e.tables['員工資料表'].rows[1][9]='離職'; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').code,'FORBIDDEN');
});
test('all original dispatcher actions retain handler and lock, including attendance fallback', () => {
  const e=env(); let count=0;
  const dispatcher=read('sources/程式碼.gs').split('function doPost(e) {')[1].split('function handleBootstrap_')[0];
  for(const m of dispatcher.matchAll(/action === "([^"]+)"\s*\)\s*\{\s*return (\w+)\(data\);/g)) {
    e.ctx[m[2]]=()=>{assert(e.locked);count++; return {legacy:m[1]};};
    assert.equal(e.call(m[1]).legacy,m[1]);
  }
  assert(count>=25);
  e.ctx.handleClock_=()=>({legacy:'clock'});
  assert.equal(e.call('clock').legacy,'clock'); assert.equal(e.call('',{type:'IN'}).legacy,'clock');
  assert.equal(e.verifies,0); assert.equal(e.writes,0);
});
test('schemas and duplicate identity fail safely; no silent sheet creation', () => {
  const e=env(); assert.deepEqual(Object.values(e.ctx.EMPLOYEE_TABLES_).map(s=>s.headers.length),[17,21,14,18]);
  delete e.tables['員工加入申請']; assert.equal(e.call('identityBootstrap').state,'UNREGISTERED');
  assert.equal(e.call('employeeApplicationSubmit',payload).code,'SCHEMA_ERROR');
  e.tables['員工資料表'].rows.push([...e.tables['員工資料表'].rows[1]]);
  assert.equal(e.call('identityBootstrap',{},'owner').code,'IDENTITY_CONFLICT'); assert.equal(e.writes,0);
});
test('safe verify diagnostics cover HTTP, documented rejection, claims and backend failures', () => {
  const cases = [
    [503, 'sensitive upstream text', 'LINE_VERIFY_HTTP_ERROR'],
    [200, 'not JSON', 'LINE_VERIFY_MALFORMED_RESPONSE'],
    [200, 'null', 'LINE_VERIFY_MALFORMED_RESPONSE'],
    [400, {error_description:'Invalid IdToken Audience.'}, 'LINE_AUDIENCE_MISMATCH'],
    [400, {error_description:'Invalid IdToken Issuer.'}, 'LINE_ISSUER_MISMATCH'],
    [400, {error_description:'IdToken expired.'}, 'LINE_TOKEN_EXPIRED'],
    [400, {error_description:'diagnostic-secret'}, 'LINE_TOKEN_REJECTED'],
    [200, {iss:'wrong'}, 'LINE_ISSUER_MISMATCH'],
    [200, {iss:'https://access.line.me',aud:'wrong'}, 'LINE_AUDIENCE_MISMATCH'],
    [200, {iss:'https://access.line.me',aud:'test-channel',exp:'wrong'}, 'LINE_VERIFY_MALFORMED_RESPONSE'],
    [200, {iss:'https://access.line.me',aud:'test-channel',exp:1}, 'LINE_TOKEN_EXPIRED'],
    [200, {iss:'https://access.line.me',aud:'test-channel',exp:Date.now()/1000+600}, 'LINE_SUB_MISSING']
  ];
  for(const [status,body,code] of cases) {
    const e=env();
    e.ctx.Utilities.computeDigest=()=>{throw Error('authentication must not hash tokens')};
    e.ctx.UrlFetchApp.fetch=()=>{assert(!e.locked);return {getResponseCode:()=>status,getContentText:()=>typeof body==='string'?body:JSON.stringify(body)}};
    const result=e.call('identityBootstrap',{idToken:'diagnostic-secret'});
    assert.equal(result.diagnosticCode,code);assert.equal(result.state,'AUTH_ERROR');
    assert(!JSON.stringify(result).includes('diagnostic-secret'));assert.equal(e.writes,0);assert.equal(e.logs.length,0);
  }
  let e=env(); e.ctx.PropertiesService.getScriptProperties=()=>({getProperty:()=>''});
  assert.equal(e.call('identityBootstrap').diagnosticCode,'LINE_CHANNEL_ID_MISSING');assert.equal(e.verifies,0);
  e=env();assert.equal(e.call('identityBootstrap',{idToken:'network-secret'}).diagnosticCode,'LINE_VERIFY_FETCH_ERROR');
  assert.equal(e.call('identityBootstrap',{idToken:''}).diagnosticCode,'LINE_TOKEN_MISSING_OR_INVALID');
  delete e.tables['員工資料表'];assert.equal(e.call('identityBootstrap').diagnosticCode,'BACKEND_SCHEMA_ERROR');
  e=env();e.ctx.employeeLegacyRows_=()=>{throw Error('diagnostic-secret')};
  const lookup=e.call('identityBootstrap');assert.equal(lookup.diagnosticCode,'BACKEND_LOOKUP_ERROR');assert(!JSON.stringify(lookup).includes('diagnostic-secret'));
  e=env();e.ctx.employeeBootstrap_=()=>{throw Error('diagnostic-secret')};assert.equal(e.call('identityBootstrap').diagnosticCode,'BACKEND_INTERNAL_ERROR');
});
test('UrlFetch exception categories never disclose exception data or hash tokens', () => {
  const cases=[
    ['You do not have permission to call UrlFetchApp.fetch. Required permissions: https://www.googleapis.com/auth/script.external_request','LINE_VERIFY_PERMISSION_ERROR'],
    ['Exception: Authorization is required to perform that action.','LINE_VERIFY_PERMISSION_ERROR'],
    ['Service invoked too many times for one day: urlfetch.','LINE_VERIFY_QUOTA_ERROR'],
    ['Limit exceeded: URL Fetch POST size.','LINE_VERIFY_QUOTA_ERROR'],
    ['DNS error: https://api.line.me','LINE_VERIFY_CONNECTIVITY_ERROR'],
    ['Address unavailable: https://api.line.me','LINE_VERIFY_CONNECTIVITY_ERROR'],
    ['Connection timed out','LINE_VERIFY_CONNECTIVITY_ERROR'],
    ['SSL error','LINE_VERIFY_CONNECTIVITY_ERROR'],
    ['Invalid argument: payload','LINE_VERIFY_REQUEST_ERROR'],
    ["The parameters (String,Object) don't match the method signature for UrlFetchApp.fetch.",'LINE_VERIFY_REQUEST_ERROR'],
    ['未知例外','LINE_VERIFY_FETCH_ERROR'],
    ['Unexpected failure','LINE_VERIFY_FETCH_ERROR']
  ];
  for(const [message,expected] of cases){
    const e=env();
    e.ctx.Utilities.computeDigest=()=>{throw Error('must not hash token')};
    e.ctx.UrlFetchApp.fetch=()=>{assert(!e.locked);throw Error(message+' sensitive-token-sentinel')};
    const result=e.call('identityBootstrap',{idToken:'sensitive-token-sentinel'});
    assert.equal(result.diagnosticCode,expected);assert.equal(result.code,'AUTH_ERROR');
    assert(!JSON.stringify(result).includes('sensitive-token-sentinel'));assert.equal(e.logs.length,0);assert.equal(e.writes,0);
  }
});
test('editor-only dummy probe: status only, no identity reads, writes, hashes or API exposure', () => {
  function probe(status, error) {
    const e=env();
    e.ctx.PropertiesService.getScriptProperties=()=>{throw Error('must not read properties')};
    e.ctx.SpreadsheetApp.getActiveSpreadsheet=()=>{throw Error('must not read sheets')};
    e.ctx.Utilities.computeDigest=()=>{throw Error('must not hash')};
    e.ctx.UrlFetchApp.fetch=(url,options)=>{
      assert(!e.locked);assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');
      assert.equal(options.method,'post');assert.equal(options.contentType,'application/x-www-form-urlencoded');
      assert.equal(options.payload.id_token,'dummy-invalid-editor-probe');assert.equal(options.payload.client_id,'0');assert(options.muteHttpExceptions);
      if(error)throw error;
      return {getResponseCode:()=>status,getContentText:()=>{throw Error('must not read body')}};
    };
    const result=e.ctx.employeeIdentityEditorConnectivityTest();
    assert.equal(e.logs.length,1);assert.equal(e.writes,0);
    const log=JSON.stringify(e.logs);assert(!log.includes('secret-sentinel'));assert(!log.includes('dummy-invalid-editor-probe'));
    assert.equal(e.ctx.EMPLOYEE_ACTIONS_.includes('employeeIdentityEditorConnectivityTest'),false);
    assert.equal(e.ctx.employeeFoundationRequest_({postData:{contents:JSON.stringify({action:'employeeIdentityEditorConnectivityTest'})}}),null);
    return result;
  }
  for(const status of [200,400,401,429,500]){const r=probe(status);assert.equal(r.success,true);assert.equal(r.httpStatus,status);}
  const cases=[
    ['You do not have permission to call UrlFetchApp.fetch. script.external_request','EXTERNAL_REQUEST_SCOPE_MENTIONED'],
    ['UrlFetchApp is not defined','URLFETCH_SERVICE_UNAVAILABLE'],
    ['fetch is not a function','FETCH_METHOD_UNAVAILABLE'],
    ['Unexpected error while getting the method or property fetch on object UrlFetchApp.','SERVICE_METHOD_ACCESS_ERROR'],
    ['Service unavailable','SERVICE_INTERNAL_ERROR'],
    ['Other unknown error','UNCLASSIFIED']
  ];
  for(const [message,hint] of cases){const error=Error(message+' secret-sentinel');const r=probe(null,error);assert.equal(r.success,false);assert.equal(r.hint,hint);assert.equal(r.exceptionType,'Error');}
  const hostile=Error('secret-sentinel');hostile.name='secret-sentinel';assert.equal(probe(null,hostile).exceptionType,'UNCLASSIFIED');
});
test('complete explicit manifest preserves deployment settings and current-file scope', () => {
  const manifest=JSON.parse(read('sources/appsscript.json'));
  assert.equal(manifest.timeZone,'Asia/Taipei');assert.equal(manifest.runtimeVersion,'V8');
  assert.equal(manifest.exceptionLogging,'STACKDRIVER');assert.deepEqual(manifest.dependencies,{});
  assert.deepEqual(manifest.webapp,{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'});
  assert.deepEqual(manifest.oauthScopes,[
    'https://www.googleapis.com/auth/spreadsheets.currentonly',
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  // New service/file use needs a fresh scope audit, not a silently stale manifest.
  const gs=fs.readdirSync(path.join(root,'sources')).filter(f=>f.endsWith('.gs')).sort();
  assert.deepEqual(gs,files.map(f=>f+'.gs').sort());
  const source=gs.map(f=>read('sources/'+f)).join('\n');
  assert(!/SpreadsheetApp\s*\.\s*(openById|openByUrl|create)\s*\(/.test(source));
  assert(!/\b(DriveApp|GmailApp|MailApp|CalendarApp|DocumentApp|SlidesApp|FormApp|ScriptApp|HtmlService)\s*\./.test(source));
  assert(!/Session\s*\.\s*(getActiveUser|getEffectiveUser)\s*\(/.test(source));
});
test('acceptance: active bootstrap is read-only and doPost cannot dispatch editor probe', () => {
  const e=env(), before=JSON.stringify(e.tables);
  const result=e.call('identityBootstrap',{},'owner');
  assert.equal(result.state,'ACTIVE_EMPLOYEE');assert.equal(result.employee.employeeId,'E-owner');
  assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);assert.equal(e.logs.length,0);
  assert(!JSON.stringify(result).includes('token:'));assert(!JSON.stringify(result).includes('lineSub'));
  const verifies=e.verifies;
  e.ctx.employeeIdentityEditorConnectivityTest=()=>{throw Error('must not dispatch editor probe')};
  const rejected=e.call('employeeIdentityEditorConnectivityTest');
  assert.equal(rejected.success,false);assert.equal(e.verifies,verifies);
  assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);assert.equal(e.logs.length,0);
});
function reviewEnv(role='OWNER') {
  const e=env(true); e.tables['員工資料表'].rows[1][6]=role;
  const a=e.call('employeeApplicationSubmit',payload).application;
  return {e, p:{applicationId:a.applicationId,requestId:'request-approve-0001',expectedVersion:1,
    grade:'師傅',salaryType:'日薪',salaryAmount:2000,systemRole:'EMPLOYEE',hireDate:'2026-09-15',adminNote:'測試審核'}};
}
function rows(e,table){return e.ctx.employeeStoreRows_(table);}
function seed(e,table,object){e.tables[e.ctx.EMPLOYEE_TABLES_[table].name].rows.push(e.ctx.EMPLOYEE_TABLES_[table].keys.map(k=>object[k]??''));}
function approve(e,p,sub='owner'){return e.call('employeeApplicationApprove',p,sub);}
function consistent(e,r) {
  assert.equal(r.success,true,JSON.stringify(r));
  const app=rows(e,'applications')[0], periods=rows(e,'employments'), bindings=rows(e,'bindings');
  assert.equal(app.status,'已核准'); assert.equal(app.version,2); assert.equal(app.employeeId,r.employeeId);
  assert.equal(periods.length,1); assert.equal(bindings.length,1);
  assert.equal(periods[0].employeeId,r.employeeId); assert.equal(periods[0].endDate,'');
  assert.equal(bindings[0].employeeId,r.employeeId); assert.equal(bindings[0].status,'有效');
  assert.equal(e.tables['員工資料表'].rows.length,3); assert.equal(e.tables['員工資料表'].rows[2][9],'在職');
  assert.equal(rows(e,'audit').filter(a=>a.action==='APPLICATION_APPROVE'&&a.phase==='COMPLETED').length,1);
  assert.equal(e.call('identityBootstrap').state,'ACTIVE_EMPLOYEE');
  assert(!JSON.stringify(e.tables).includes('token:'));assert.equal(e.logs.length,0);
}
test('approval role matrix, authoritative applicant identity and consistent five-table state',()=>{
  for(const [actor,assigned] of [['OWNER','EMPLOYEE'],['OWNER','ADMIN'],['OWNER','OWNER'],['OWNER','SITE_MANAGER'],
    ['ADMIN','EMPLOYEE'],['ADMIN','SITE_MANAGER'],['ADMIN','ADMIN']]) {
    const {e,p}=reviewEnv(actor), old=JSON.stringify(e.tables['員工資料表'].rows[1]);
    const r=approve(e,{...p,systemRole:assigned,employeeId:'EMP999',name:'forged',lineSub:'forged',userId:'forged'});
    consistent(e,r);assert.equal(r.employeeId,'EMP001');
    assert.equal(e.tables['員工資料表'].rows[2][1],'new');assert.equal(e.tables['員工資料表'].rows[2][2],payload.name);
    assert.equal(e.tables['員工資料表'].rows[2][6],assigned);assert.equal(JSON.stringify(e.tables['員工資料表'].rows[1]),old);
  }
});
test('unauthorized reviewers, role escalation and stale actor after lock denied without writes',()=>{
  for(const role of ['ADMIN','SITE_MANAGER','EMPLOYEE']){
    const {e,p}=reviewEnv(role), w=e.writes;
    assert.equal(approve(e,{...p,systemRole:'OWNER'}).code,role==='ADMIN'?'INVALID_ROLE_ASSIGNMENT':'FORBIDDEN');
    if(role!=='ADMIN')assert.equal(e.call('employeeApplicationReject',p,'owner').code,'FORBIDDEN');
    assert.equal(e.writes,w);
  }
  for(const mutation of [e=>e.tables['員工資料表'].rows[1][6]='EMPLOYEE',e=>e.tables['員工資料表'].rows[1][9]='離職']){
    const {e,p}=reviewEnv(),w=e.writes;e.beforeLock(()=>mutation(e));assert.equal(approve(e,p).code,'FORBIDDEN');assert.equal(e.writes,w);
  }
});
test('admin list default/status filtering is readonly and excludes identity internals and payroll',()=>{
  const {e,p}=reviewEnv(),w=e.writes;const list=e.call('employeeApplicationAdminList',{},'owner');
  assert.equal(list.applications.length,1);assert.equal(e.writes,w);
  for(const key of ['lineSub','channelId','requestHash','idToken','salaryAmount'])assert(!JSON.stringify(list).includes(key));
  assert.equal(e.call('employeeApplicationAdminList').code,'FORBIDDEN');
  assert.equal(e.call('employeeApplicationAdminList',{status:'bogus'},'owner').code,'VALIDATION_ERROR');
  approve(e,p);assert.equal(e.call('employeeApplicationAdminList',{},'owner').applications.length,0);
  assert.equal(e.call('employeeApplicationAdminList',{status:'已核准'},'owner').applications.length,1);
});
test('reject requires reason, writes no master/period/binding and cannot later be approved',()=>{
  const {e,p}=reviewEnv(),w=e.writes;
  assert.equal(e.call('employeeApplicationReject',{...p,adminNote:''},'owner').code,'INVALID_APPROVAL_DATA');assert.equal(e.writes,w);
  const r=e.call('employeeApplicationReject',p,'owner');assert.equal(r.application.status,'已拒絕');
  assert.equal(rows(e,'employments').length,0);assert.equal(rows(e,'bindings').length,0);assert.equal(e.tables['員工資料表'].rows.length,2);
  const after=e.writes;assert.deepEqual(e.call('employeeApplicationReject',p,'owner'),r);assert.equal(e.writes,after);
  assert.equal(approve(e,{...p,requestId:'request-other-0001',expectedVersion:2}).code,'APPLICATION_NOT_PENDING');
});
test('versions, cancelled applications and invalid grade/salary/date rejected before mutation',()=>{
  const {e,p}=reviewEnv(),w=e.writes;
  assert.equal(approve(e,{...p,expectedVersion:2}).code,'VERSION_CONFLICT');
  for(const change of [{grade:''},{salaryType:'guess'},{salaryAmount:-1},{salaryAmount:'2000'},{hireDate:'2026-02-30'},{hireDate:''}])
    assert.equal(approve(e,{...p,...change}).code,'INVALID_APPROVAL_DATA');
  assert.equal(e.writes,w);
  e.call('employeeApplicationCancel',{requestId:'request-cancel-1000',applicationId:p.applicationId,expectedVersion:1});
  assert.equal(approve(e,{...p,expectedVersion:2}).code,'APPLICATION_NOT_PENDING');
});
test('completed replay returns original result, changed payload conflicts and another request cannot duplicate',()=>{
  const {e,p}=reviewEnv(),r=approve(e,p);consistent(e,r);const w=e.writes;
  assert.deepEqual(approve(e,p),r);assert.equal(e.writes,w);
  assert.equal(approve(e,{...p,salaryAmount:2100}).code,'REQUEST_CONFLICT');
  assert.equal(approve(e,{...p,requestId:'request-approve-0002'}).code,'APPLICATION_NOT_PENDING');
  e.tables['員工加入申請'].rows[1][6]='後續人工修改';
  assert.deepEqual(approve(e,p),r);assert.equal(e.writes,w);
});
test('ID allocation reserves historic maximum and independent applicants cannot share IDs',()=>{
  const {e,p}=reviewEnv();e.tables['員工資料表'].rows.push(['EMP007','legacy','假資料','','',0,'EMPLOYEE','','','離職','','']);
  seed(e,'employments',{employeeId:'EMP099'});seed(e,'audit',{employeeId:'EMP123',phase:'STARTED',requestId:'reserved'});
  assert.equal(approve(e,p).employeeId,'EMP124');
  const a=e.call('employeeApplicationSubmit',{...payload,requestId:'request-submit-other'},'other').application;
  assert.equal(approve(e,{...p,applicationId:a.applicationId,requestId:'request-approve-other'}).employeeId,'EMP125');
});
test('historical LINE, active/historic binding and existing open employment cannot create duplicate people',()=>{
  for(const kind of ['master','binding','employment','application']){
    const {e,p}=reviewEnv();
    if(kind==='master')e.tables['員工資料表'].rows.push(['EMP008','new','假資料','','',0,'EMPLOYEE','','','離職','','']);
    if(kind==='binding')seed(e,'bindings',{bindingId:'historic',employeeId:'EMP008',lineSub:'new',status:'有效'});
    if(kind==='employment')seed(e,'employments',{employmentId:'historic',employeeId:'EMP008',applicationId:p.applicationId,status:'在職'});
    if(kind==='application')seed(e,'applications',{applicationId:'historic',lineSub:'new',employeeId:'EMP008',status:'已核准'});
    const w=e.writes;assert.equal(approve(e,p).code,{master:'IDENTITY_CONFLICT',binding:'LINE_BINDING_CONFLICT',employment:'EMPLOYMENT_CONFLICT',application:'IDENTITY_CONFLICT'}[kind]);assert.equal(e.writes,w);
  }
});
test('every approval checkpoint recovers same request before/after uncertain persistence without duplicates',()=>{
  for(const persisted of [false,true])for(const [table,after] of [['員工異動紀錄',0],['員工任職紀錄',0],['員工LINE綁定紀錄',0],['員工加入申請',0],['員工資料表',0],['員工異動紀錄',1]]){
    const {e,p}=reviewEnv();e.fail(table,after,persisted);
    assert.equal(approve(e,p).success,false,table);assert.equal(e.locked,false);
    const r=approve(e,p);consistent(e,r);const w=e.writes;assert.deepEqual(approve(e,p),r);assert.equal(e.writes,w);
  }
});
test('ambiguous partial records require manual recovery and block applicant cancellation/different review',()=>{
  const {e,p}=reviewEnv();e.fail('員工LINE綁定紀錄');assert.equal(approve(e,p).success,false);
  assert.equal(e.call('employeeApplicationCancel',{requestId:'request-cancel-blocked',applicationId:p.applicationId,expectedVersion:1}).code,'RECOVERY_REQUIRED');
  assert.equal(approve(e,{...p,requestId:'request-approve-other'}).code,'RECOVERY_REQUIRED');
  e.tables['員工任職紀錄'].rows[1][7]='人工衝突';const w=e.writes;
  assert.equal(approve(e,p).code,'RECOVERY_REQUIRED');assert.equal(e.writes,w);
  assert.equal(e.call('employeeApplicationAdminList',{},'owner').applications[0].recoveryRequired,true);
});
test('reject resumes partial app/audit checkpoints without employee writes',()=>{
  for(const persisted of [false,true])for(const [table,after] of [['員工加入申請',0],['員工異動紀錄',1]]){
    const {e,p}=reviewEnv();e.fail(table,after,persisted);assert.equal(e.call('employeeApplicationReject',p,'owner').success,false);
    assert.equal(e.call('employeeApplicationReject',p,'owner').application.status,'已拒絕');
    assert.equal(e.tables['員工資料表'].rows.length,2);assert.equal(rows(e,'bindings').length,0);assert.equal(rows(e,'employments').length,0);
  }
});
test('recovery accepts Sheets calendar Date cells and guards duplicate checkpoint rows',()=>{
  const {e,p}=reviewEnv();e.fail('員工異動紀錄',1);assert.equal(approve(e,p).success,false);
  const date=vm.runInContext("new Date('2026-09-14T16:00:00.000Z')",e.ctx);
  e.tables['員工資料表'].rows[2][7]=date;
  e.tables['員工任職紀錄'].rows[1][3]=date;e.tables['員工任職紀錄'].rows[1][11]=date;
  consistent(e,approve(e,p));
  const second=reviewEnv();second.e.fail('員工異動紀錄',1);approve(second.e,second.p);
  second.e.tables['員工LINE綁定紀錄'].rows.push([...second.e.tables['員工LINE綁定紀錄'].rows[1]]);
  const w=second.e.writes;assert.equal(approve(second.e,second.p).code,'RECOVERY_REQUIRED');assert.equal(second.e.writes,w);
});
test('overlapping review is locked out and cannot duplicate after lock release',()=>{
  const {e,p}=reviewEnv();let concurrent;
  // Model a second verified caller arriving while the first owns the write lock.
  const verified=e.ctx.employeeContext_({sub:'owner',channelId:'test-channel'});
  e.onWrite(()=>{try{e.ctx.employeeWithLock_(()=>e.ctx.employeeApplicationReview_(verified,{...p,requestId:'request-second-review'},true));}
    catch(error){concurrent=error.employeeCode;}});
  consistent(e,approve(e,p));assert.equal(concurrent,'BUSY');
  assert.equal(approve(e,{...p,requestId:'request-second-review'}).code,'APPLICATION_NOT_PENDING');
});
function lifecycleEnv(role='OWNER') {
  const e=env();e.tables['員工資料表'].rows[1][6]=role;
  e.tables['員工資料表'].rows.push(['EMP009','private-line-sentinel','相同姓名','師傅','日薪',2300,'OWNER','','','在職','0900000000','管理備註']);
  e.ctx.LockService.getScriptLock=()=>{throw Error('read must not lock')};
  e.ctx.SpreadsheetApp.flush=()=>{throw Error('read must not flush')};
  e.ctx.employeeWriteRow_=()=>{throw Error('read must not write')};
  e.ctx.Utilities.computeDigest=()=>{throw Error('read must not hash')};
  return e;
}
function lifeDetail(e,id='EMP009'){return e.call('employeeLifecycleAdminDetail',{employeeId:id},'owner');}
test('lifecycle role matrix: strong active OWNER/ADMIN only; read ADMIN may view OWNER',()=>{
  for(const role of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE']){
    const e=lifecycleEnv(role),before=JSON.stringify(e.tables);
    const list=e.call('employeeLifecycleAdminList',{},'owner'),detail=lifeDetail(e);
    if(['OWNER','ADMIN'].includes(role)){assert.equal(list.success,true);assert.equal(detail.employee.systemRole,'OWNER');}
    else {assert.equal(list.code,'FORBIDDEN');assert.equal(detail.code,'FORBIDDEN');}
    assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);assert.equal(e.logs.length,0);
  }
  for(const state of ['停職','留停','離職']){const e=lifecycleEnv();e.tables['員工資料表'].rows[1][9]=state;assert.equal(lifeDetail(e).code,'FORBIDDEN');}
  const e=lifecycleEnv();assert.equal(e.call('employeeLifecycleAdminList',{role:'OWNER'}).code,'FORBIDDEN');
  assert.equal(e.call('employeeLifecycleAdminList',{idToken:''},'owner').code,'AUTH_ERROR');
});
test('lifecycle detail uses permanent employeeId, validates input and distinguishes missing target',()=>{
  const e=lifecycleEnv();
  for(const id of [undefined,'',{},42])assert.equal(lifeDetail(e,id===undefined?null:id).code,'VALIDATION_ERROR');
  for(const id of ['相同姓名','0900000000','missing'])assert.equal(lifeDetail(e,id).code,'EMPLOYEE_NOT_FOUND');
  assert.equal(e.call('employeeLifecycleAdminDetail',{name:'相同姓名'},'owner').code,'VALIDATION_ERROR');
  e.tables['員工資料表'].rows.push(['EMP010','different-private-line','相同姓名','','',0,'EMPLOYEE','','','離職','0900000000','']);
  assert.equal(lifeDetail(e).employee.salaryAmount,2300);assert.equal(lifeDetail(e,'EMP010').employee.employeeStatus,'離職');
});
test('legacy missing baseline is unknown, never invented or repaired; privacy and A:L mapping',()=>{
  const e=lifecycleEnv(),before=JSON.stringify(e.tables),r=lifeDetail(e);
  assert.equal(r.employee.hireDate,'');assert.equal(r.employee.phone,'0900000000');assert.equal(r.employee.note,'管理備註');
  assert.deepEqual(r.warnings.map(w=>w.code),['LEGACY_NOT_BASELINED']);
  assert.equal(r.lifecycle.baselineStatus,'LEGACY_NOT_BASELINED');assert.equal(r.lifecycle.hasActiveLineBinding,null);
  assert.equal(r.employments.length,0);assert.equal(r.lineBindings.length,0);assert.equal(r.changes.length,0);
  const list=e.call('employeeLifecycleAdminList',{},'owner');
  for(const value of [r,list])for(const secret of ['private-line-sentinel','token:','lineSub','lineUid','requestHash','beforeJson','afterJson','operatorSub'])assert(!JSON.stringify(value).includes(secret));
  assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);
});
test('lifecycle detects duplicate open periods, master status and binding/identity conflicts',()=>{
  const e=lifecycleEnv();
  for(const n of [1,2]){
    seed(e,'employments',{employmentId:'period-'+n,employeeId:'EMP009',sequence:n,startDate:'2026-09-01',status:'在職'});
    seed(e,'bindings',{employeeId:'EMP009',lineSub:'private-line-sentinel',channelId:'test-channel',status:'有效',validFrom:'2020-01-01T00:00:00Z'});
  }
  seed(e,'bindings',{employeeId:'EMP010',lineSub:'private-line-sentinel',channelId:'test-channel',status:'有效',validFrom:'2020-01-01T00:00:00Z'});
  const before=JSON.stringify(e.tables);let r=lifeDetail(e);
  assert(r.warnings.some(w=>w.code==='MULTIPLE_OPEN_EMPLOYMENTS'));assert(r.warnings.some(w=>w.code==='MULTIPLE_ACTIVE_BINDINGS'));
  assert(r.warnings.some(w=>w.code==='LINE_BOUND_TO_MULTIPLE_EMPLOYEES'));assert.equal(r.lifecycle.currentEmployment,null);
  assert.equal(r.lifecycle.bindingStatus,'CONFLICT');assert.equal(JSON.stringify(e.tables),before);
  e.tables['員工資料表'].rows[2][9]='離職';assert(lifeDetail(e).warnings.some(w=>w.code==='TERMINATED_WITH_OPEN_EMPLOYMENT'));
  e.tables['員工任職紀錄'].rows.splice(2,1);e.tables['員工LINE綁定紀錄'].rows.splice(2,2);
  e.tables['員工資料表'].rows[2][1]='different-private-line';r=lifeDetail(e);
  assert(r.warnings.some(w=>w.code==='MASTER_BINDING_MISMATCH'));assert(r.warnings.some(w=>w.code==='EMPLOYMENT_STATUS_MISMATCH'));
  e.tables['員工資料表'].rows[2][9]='在職';e.tables['員工任職紀錄'].rows[1][4]='2026-09-02';
  assert(lifeDetail(e).warnings.some(w=>w.code==='ACTIVE_WITHOUT_OPEN_EMPLOYMENT'));assert.equal(e.writes,0);
});
test('safe detailed projections include dates/snapshots and omit raw audit/LINE/binding IDs',()=>{
  const e=lifecycleEnv();seed(e,'employments',{employmentId:'period-1',employeeId:'EMP009',sequence:1,startDate:'2026-09-01',status:'在職',
    grade:'師傅',salaryType:'日薪',salaryAmount:2300,permission:'OWNER',baselineDate:'2026-09-01',disabledAt:'',version:1});
  seed(e,'bindings',{bindingId:'secret-binding-id',employeeId:'EMP009',lineSub:'private-line-sentinel',channelId:'private-channel',status:'有效',
    validFrom:'2020-01-01T00:00:00Z',sourceType:'BASELINE',reason:'基線'});
  seed(e,'audit',{employeeId:'EMP009',action:'APPLICATION_APPROVE',phase:'STARTED',operatorId:'E-owner',operatorSub:'private-line-sentinel',requestId:'secret-request',requestHash:'secret-hash',
    beforeJson:JSON.stringify({applicationId:'secret-app-id',name:'相同姓名',phone:'0900000000',status:'待審核',lineSub:'private-line-sentinel',idToken:'secret-token'}),
    afterJson:JSON.stringify({format:1,employee:['EMP009','private-line-sentinel','相同姓名','師傅','日薪',2300,'OWNER','2026-09-01','','在職','0900000000','note'],binding:{lineSub:'private-line-sentinel'}}),
    effectiveDate:'2026-09-01',operatedAt:'2026-09-01T00:00:00Z',reason:'核准'});
  const r=lifeDetail(e);assert.equal(r.employments[0].employmentId,'period-1');assert.equal(r.lifecycle.currentEmployment.sequence,1);
  assert.equal(r.changes[0].operatorName,'測試管理員');assert.equal(r.changes[0].before.applicationStatus,'待審核');
  assert.equal(r.changes[0].after.salaryAmount,2300);assert.equal(r.changes[0].after.systemRole,'OWNER');
  assert(r.warnings.some(w=>w.code==='LIFECYCLE_OPERATION_PENDING'));assert(r.warnings.some(w=>w.code==='BINDING_IDENTITY_CONFLICT'));
  for(const result of [r,e.call('employeeLifecycleAdminList',{},'owner')])for(const secret of ['private-line-sentinel','secret-token','secret-hash','secret-request','secret-app-id','secret-binding-id','private-channel','lineSub','beforeJson','afterJson'])assert(!JSON.stringify(result).includes(secret));
  e.tables['員工異動紀錄'].rows[1][9]='invalid-secret-json';const broken=lifeDetail(e);
  assert(broken.warnings.some(w=>w.code==='AUDIT_VALUES_UNAVAILABLE'));assert(!JSON.stringify(broken).includes('invalid-secret-json'));assert.equal(e.logs.length,0);
});
test('lifecycle missing/mismatched schema and storage failures are safe, no auto creation',()=>{
  const e=lifecycleEnv();e.tables['員工任職紀錄'].rows[0][0]='wrong';assert.equal(lifeDetail(e).code,'SCHEMA_ERROR');
  const missing=lifecycleEnv();delete missing.tables['員工任職紀錄'];assert.equal(lifeDetail(missing).code,'SCHEMA_ERROR');assert(!missing.tables['員工任職紀錄']);
  const failed=lifecycleEnv();failed.tables['員工異動紀錄'].getLastRow=()=>{throw Error('private-line-sentinel secret-token')};
  const r=lifeDetail(failed);assert.equal(r.code,'STORAGE_ERROR');assert(!JSON.stringify(r).includes('sentinel'));assert(!JSON.stringify(r).includes('secret-token'));
  assert.equal(e.writes+missing.writes+failed.writes,0);
});
test('lifecycle dates remain unknown when invalid; effective bindings and duplicate master are reported safely',()=>{
  const e=lifecycleEnv();e.tables['員工資料表'].rows[2][7]='unknown';
  seed(e,'bindings',{employeeId:'EMP009',lineSub:'private-line-sentinel',channelId:'test-channel',status:'有效',validFrom:'2999-01-01T00:00:00Z'});
  let r=lifeDetail(e);assert.equal(r.employee.hireDate,'');assert.equal(r.lifecycle.hasActiveLineBinding,false);
  assert(r.warnings.some(w=>w.code==='EMPLOYMENT_HISTORY_MISSING'));
  e.tables['員工資料表'].rows[2][7]='2026-02-30';assert.equal(lifeDetail(e).employee.hireDate,'');
  e.tables['員工資料表'].rows[2][7]=vm.runInContext("new Date('2026-09-14T16:00:00Z')",e.ctx);
  assert.equal(lifeDetail(e).employee.hireDate,'2026-09-15');
  e.tables['員工LINE綁定紀錄'].rows[1][5]='invalid';assert(lifeDetail(e).warnings.some(w=>w.code==='BINDING_DATES_INVALID'));
  e.tables['員工資料表'].rows.push([...e.tables['員工資料表'].rows[2]]);
  assert.equal(lifeDetail(e).code,'IDENTITY_CONFLICT');
  const list=e.call('employeeLifecycleAdminList',{},'owner');
  assert(list.employees[1].warnings.some(w=>w.code==='DUPLICATE_EMPLOYEE_ID'));
  assert(list.employees[1].warnings.some(w=>w.code==='DUPLICATE_MASTER_LINE_BINDING'));assert.equal(e.writes,0);
});
function mutationEnv(status='在職', role='EMPLOYEE', actor='OWNER') {
  const e=env(true);
  e.tables['員工資料表'].rows[1][6]=actor;
  e.tables['員工資料表'].rows.push(['EMP009','target','測試員工','師傅','日薪',2000,role,'2020-01-01','',''+status,'0900000000','保留']);
  seed(e,'employments',{employmentId:'JOB-9',employeeId:'EMP009',sequence:1,startDate:'2020-01-01',status,
    grade:'師傅',salaryType:'日薪',salaryAmount:2000,permission:role,version:3});
  seed(e,'bindings',{bindingId:'BIND-9',employeeId:'EMP009',lineSub:'target',channelId:'test-channel',status:'有效',validFrom:'2020-01-01T00:00:00Z',version:1});
  function source(name,width) { const rows=[Array(width).fill('header')];e.tables[name]={rows,getLastRow:()=>rows.length,
    getLastColumn:()=>width,getDataRange:()=>({getValues:()=>rows.map(r=>[...r])}),
    getRange:(r,c,n,m)=>({getValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>rows[r-1+i]?.[c-1+j]??'')),
      setValues:()=>assert.fail('unrelated production table write')})}; }
  source('工地資料表',12);source('工作區段',26);
  return e;
}
const mutationPayload={employeeId:'EMP009',requestId:'lifecycle-request-0001',expectedVersion:3,reason:'測試狀態異動',effectiveDate:'2026-01-01'};
const mutate=(e,action='Suspend',p=mutationPayload,sub='owner')=>e.call('employeeLifecycle'+action,p,sub);
function masterTarget(e){return e.tables['員工資料表'].rows[2];}
function addSite(e,id='EMP009',status='施工中') {const row=Array(12).fill('');row[0]='SITE-TEST';row[1]='測試工地';row[5]=100;row[6]=id;row[11]=status;e.tables['工地資料表'].rows.push(row);}
function addOpen(e,id='EMP009',closed=false) {const row=Array(26).fill('');row[0]='SEG-TEST';row[2]=id;row[9]='2026-01-01T00:00:00Z';if(closed)row[10]='2026-01-01T08:00:00Z';e.tables['工作區段'].rows.push(row);}
test('Phase 2 authority matrix, active actor and server role rechecked under lock',()=>{
  for(const actor of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE']) for(const target of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE']) {
    const e=mutationEnv('在職',target,actor),r=mutate(e,'Suspend',{...mutationPayload,role:'OWNER',systemRole:'OWNER'});
    const allowed=actor==='OWNER'||actor==='ADMIN'&&target!=='OWNER';
    assert.equal(r.success,allowed,`${actor}->${target}: ${JSON.stringify(r)}`);if(!allowed){assert.equal(r.code,'FORBIDDEN');assert.equal(e.writes,0);}
  }
  for(const s of ['停職','留停','離職']) {const e=mutationEnv();e.tables['員工資料表'].rows[1][9]=s;assert.equal(mutate(e).code,'FORBIDDEN');assert.equal(e.writes,0);}
  const e=mutationEnv();e.beforeLock(()=>e.tables['員工資料表'].rows[1][6]='EMPLOYEE');assert.equal(mutate(e).code,'FORBIDDEN');assert.equal(e.writes,0);
});
test('Phase 2 all 16 transitions; preserve master fields, period identity and bindings',()=>{
  const allowed={Suspend:['在職'],Leave:['在職'],Resume:['停職','留停'],Terminate:['在職','停職','留停']};
  const next={Suspend:'停職',Leave:'留停',Resume:'在職',Terminate:'離職'};
  for(const action of Object.keys(allowed)) for(const status of ['在職','停職','留停','離職']) {
    const e=mutationEnv(status),before=[...masterTarget(e)],binding=JSON.stringify(e.tables['員工LINE綁定紀錄']);
    const r=mutate(e,action);
    if(!allowed[action].includes(status)){assert.equal(r.code,'INVALID_STATUS_TRANSITION');assert.equal(e.writes,0);continue;}
    assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.employeeStatus,next[action]);assert.equal(r.version,4);
    const period=rows(e,'employments')[0];assert.equal(period.employmentId,'JOB-9');assert.equal(rows(e,'employments').length,1);
    assert.equal(period.status,next[action]);assert.equal(period.endDate,action==='Terminate'?'2026-01-01':'');
    assert.equal(masterTarget(e)[8],action==='Terminate'?'2026-01-01':'');
    for(let i=0;i<12;i++)if(i!==9&&!(i===8&&action==='Terminate'))assert.equal(masterTarget(e)[i],before[i]);
    assert.equal(JSON.stringify(e.tables['員工LINE綁定紀錄']),binding);
    assert.equal(e.call('identityBootstrap',{},'target').state,{Suspend:'SUSPENDED',Leave:'LEAVE',Resume:'ACTIVE_EMPLOYEE',Terminate:'TERMINATED'}[action]);
    const writes=e.writes;assert.deepEqual(mutate(e,action),r);assert.equal(e.writes,writes);
    assert.equal(rows(e,'audit').length,2);assert.equal(e.logs.length,0);
    assert(!/token:|target|lineSub|requestHash|beforeJson|afterJson/.test(JSON.stringify(r)));
  }
});
test('Phase 2 last usable OWNER, pending/invalid owners excluded, current master role wins',()=>{
  for(const action of ['Suspend','Leave','Terminate']) {
    const e=mutationEnv('在職','OWNER');e.tables['員工資料表'].rows[1][9]='停職';
    // Target is the only usable OWNER, and is the authenticated actor.
    assert.equal(mutate(e,action,mutationPayload,'target').code,'LAST_OWNER_REQUIRED');assert.equal(e.writes,0);
    e.tables['員工資料表'].rows[1][9]='在職';e.tables['員工資料表'].rows[1][1]='';
    assert.equal(mutate(e,action,mutationPayload,'target').code,'LAST_OWNER_REQUIRED');assert.equal(e.writes,0);
    e.tables['員工資料表'].rows[1][1]='owner';assert.equal(mutate(e,action).success,true);
  }
  const e=mutationEnv('在職','OWNER');seed(e,'audit',{employeeId:'E-owner',operatorSub:'other',requestId:'unfinished-owner-1',phase:'STARTED'});
  assert.equal(mutate(e).code,'LAST_OWNER_REQUIRED');
  const a=mutationEnv('在職','EMPLOYEE','ADMIN');a.beforeLock(()=>masterTarget(a)[6]='OWNER');assert.equal(mutate(a).code,'FORBIDDEN');assert.equal(a.writes,0);
});
test('Phase 2 actual primary assignment blocks any role; inactive/non-responsible sites do not',()=>{
  for(const role of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE'])for(const action of ['Suspend','Leave','Terminate']){
    const e=mutationEnv('在職',role);addSite(e);const before=JSON.stringify(e.tables);
    assert.equal(mutate(e,action).code,'SITE_HANDOFF_REQUIRED');assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);
  }
  for(const [id,status] of [['EMP009','已完工'],['OTHER','施工中']]){const e=mutationEnv();addSite(e,id,status);assert.equal(mutate(e).success,true);}
  const e=mutationEnv('停職');addSite(e);const before=JSON.stringify(e.tables['工地資料表']);assert.equal(mutate(e,'Resume').success,true);assert.equal(JSON.stringify(e.tables['工地資料表']),before);
});
test('Phase 2 production open-segment helper blocks all access-removing actions; no attendance writes',()=>{
  for(const action of ['Suspend','Leave','Terminate']){const e=mutationEnv();addOpen(e);const before=JSON.stringify(e.tables);assert.equal(mutate(e,action).code,'OPEN_ATTENDANCE_REQUIRED');assert.equal(e.writes,0);assert.equal(JSON.stringify(e.tables),before);}
  for(const [id,closed] of [['OTHER',false],['EMP009',true]]){const e=mutationEnv();addOpen(e,id,closed);assert.equal(mutate(e).success,true);}
  const e=mutationEnv('留停');addOpen(e);const before=JSON.stringify(e.tables['工作區段']);assert.equal(mutate(e,'Resume').success,true);assert.equal(JSON.stringify(e.tables['工作區段']),before);
});
test('Phase 2 missing baseline, duplicate/mismatched periods and ambiguous bindings fail without writes',()=>{
  for(const table of ['員工任職紀錄','員工LINE綁定紀錄']){const e=mutationEnv();e.tables[table].rows.length=1;const before=JSON.stringify(e.tables);assert.equal(mutate(e).code,'BASELINE_REQUIRED');assert.equal(JSON.stringify(e.tables),before);}
  const e=mutationEnv();e.tables['員工任職紀錄'].rows.push([...e.tables['員工任職紀錄'].rows[1]]);assert.equal(mutate(e).code,'EMPLOYMENT_CONFLICT');assert.equal(e.writes,0);
  for(const change of [e=>e.tables['員工任職紀錄'].rows[1][5]='停職',e=>masterTarget(e)[8]='2025-12-31']){const e=mutationEnv();change(e);assert.equal(mutate(e).code,'EMPLOYMENT_CONFLICT');assert.equal(e.writes,0);}
  for(const change of [e=>e.tables['員工LINE綁定紀錄'].rows[1][4]='失效',e=>e.tables['員工LINE綁定紀錄'].rows[1][3]='wrong-channel',e=>e.tables['員工LINE綁定紀錄'].rows.push([...e.tables['員工LINE綁定紀錄'].rows[1]]),e=>masterTarget(e)[1]='changed']){
    const e=mutationEnv('停職');change(e);assert.equal(mutate(e,'Resume').code,'BINDING_RECOVERY_REQUIRED');assert.equal(e.writes,0);
  }
});
test('Phase 2 strict inputs, Taipei boundary, version and immutable request payload',()=>{
  for(const patch of [{employeeId:''},{reason:''},{reason:[]},{expectedVersion:0},{expectedVersion:'3'},{effectiveDate:''},{effectiveDate:'2026-02-30'},{effectiveDate:'2026-1-01'},{effectiveDate:'2026-01-01T00:00:00Z'}]){
    const e=mutationEnv();assert.equal(mutate(e,'Suspend',{...mutationPayload,...patch}).code,'VALIDATION_ERROR');assert.equal(e.writes,0);
  }
  const e=mutationEnv();assert.equal(mutate(e,'Suspend',{...mutationPayload,expectedVersion:2}).code,'VERSION_CONFLICT');assert.equal(e.writes,0);
  assert.equal(mutate(e).success,true);assert.equal(mutate(e,'Suspend',{...mutationPayload,reason:'不同'}).code,'REQUEST_CONFLICT');
  assert.equal(mutate(e,'Leave').code,'REQUEST_CONFLICT');
  for(const [now,day,expected] of [['2026-09-19T15:59:59Z','2026-09-20','FUTURE_EFFECTIVE_DATE_UNSUPPORTED'],['2026-09-19T16:00:00Z','2026-09-20',true]]){
    const f=mutationEnv();vm.runInContext(`{const RealDate=Date;Date=class extends RealDate {constructor(...a){super(...(a.length?a:[${JSON.stringify(now)}]));}static now(){return new RealDate(${JSON.stringify(now)}).getTime();}}}`,f.ctx);
    const r=mutate(f,'Suspend',{...mutationPayload,effectiveDate:day});assert.equal(r.code||r.success,expected);
  }
});
test('Phase 2 failure injection at STARTED/master/period/COMPLETED checkpoints, both acknowledged states',()=>{
  for(const action of ['Suspend','Leave','Resume','Terminate'])for(const [table,after] of [['員工異動紀錄',0],['員工資料表',0],['員工任職紀錄',0],['員工異動紀錄',1]])for(const persisted of [false,true]){
    const e=mutationEnv(action==='Resume'?'停職':'在職');e.fail(table,after,persisted);
    const failed=mutate(e,action);assert.equal(failed.code,'OPERATION_ERROR',`${action} ${table} ${persisted}`);
    assert(!JSON.stringify(failed).includes('simulated'));assert.equal(e.locked,false);
    const r=mutate(e,action);assert.equal(r.success,true,JSON.stringify(r));assert.equal(r.version,4);
    const writes=e.writes;assert.deepEqual(mutate(e,action),r);assert.equal(e.writes,writes);
    assert.equal(rows(e,'audit').length,2);assert.equal(rows(e,'employments').length,1);assert.equal(rows(e,'bindings').length,1);
    assert(!JSON.stringify(e.tables).includes('token:'));assert.equal(e.logs.length,0);
  }
});
test('Phase 2 incomplete intent blocks competing mutations; ambiguous drift never overwritten',()=>{
  const e=mutationEnv();e.fail('員工任職紀錄');assert.equal(mutate(e).code,'OPERATION_ERROR');
  assert.equal(masterTarget(e)[9],'停職');assert.equal(e.call('identityBootstrap',{},'target').state,'SUSPENDED');
  assert.equal(mutate(e,'Resume',{...mutationPayload,requestId:'lifecycle-request-0002'}).code,'RECOVERY_REQUIRED');
  e.tables['員工任職紀錄'].rows[1][5]='留停';const before=JSON.stringify(e.tables);assert.equal(mutate(e).code,'RECOVERY_REQUIRED');assert.equal(JSON.stringify(e.tables),before);
  const f=mutationEnv('停職');f.fail('員工資料表');assert.equal(mutate(f,'Resume').code,'OPERATION_ERROR');assert.equal(f.call('identityBootstrap',{},'target').state,'SUSPENDED');
  masterTarget(f)[3]='changed';assert.equal(mutate(f,'Resume').code,'RECOVERY_REQUIRED');
  const g=mutationEnv();g.fail('員工異動紀錄',1);assert.equal(mutate(g).code,'OPERATION_ERROR');masterTarget(g)[9]='在職';
  const snapshot=JSON.stringify(g.tables);assert.equal(mutate(g).code,'RECOVERY_REQUIRED');assert.equal(JSON.stringify(g.tables),snapshot);
});
test('Phase 2 guards rerun on retry; read APIs expose version and safe status audit only',()=>{
  const e=mutationEnv();e.fail('員工資料表');assert.equal(mutate(e).code,'OPERATION_ERROR');addOpen(e);assert.equal(mutate(e).code,'OPEN_ATTENDANCE_REQUIRED');
  e.tables['工作區段'].rows.length=1;assert.equal(mutate(e).success,true);
  const detail=e.call('employeeLifecycleAdminDetail',{employeeId:'EMP009'},'owner');assert.equal(detail.lifecycle.currentEmployment.version,4);
  assert.equal(detail.changes[0].before.employeeStatus,'在職');assert.equal(detail.changes[0].after.employeeStatus,'停職');
  assert(!/token:|target|lineSub|requestHash|beforeJson|afterJson/.test(JSON.stringify(detail)));
  assert.equal(e.logs.length,0);
});
test('Phase 2 recovery handles Sheets calendar cells without duplicate transition',()=>{
  const e=mutationEnv();e.fail('員工異動紀錄',1);assert.equal(mutate(e,'Terminate').code,'OPERATION_ERROR');
  const date=vm.runInContext("new Date('2025-12-31T16:00:00Z')",e.ctx);
  masterTarget(e)[8]=date;e.tables['員工任職紀錄'].rows[1][4]=date;
  assert.equal(mutate(e,'Terminate').success,true);assert.equal(rows(e,'employments')[0].version,4);assert.equal(rows(e,'audit').length,2);
});
test('Phase 2 self-disable cannot bypass active actor requirement after lost acknowledgement',()=>{
  const e=mutationEnv('在職','OWNER');e.fail('員工任職紀錄');assert.equal(mutate(e,'Suspend',mutationPayload,'target').code,'OPERATION_ERROR');
  const before=JSON.stringify(e.tables);assert.equal(mutate(e,'Suspend',mutationPayload,'target').code,'FORBIDDEN');assert.equal(JSON.stringify(e.tables),before);
  assert.equal(mutate(e,'Resume',{...mutationPayload,requestId:'lifecycle-request-0002'}).code,'RECOVERY_REQUIRED');
});
function baselineEnv(status='在職',role='EMPLOYEE',actor='OWNER') {
  const e=mutationEnv(status,role,actor);e.tables['員工任職紀錄'].rows.length=1;e.tables['員工LINE綁定紀錄'].rows.length=1;return e;
}
const preview=e=>e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP009'},'owner');
const baselineInput=e=>({employeeId:'EMP009',requestId:'baseline-request-0001',expectedSnapshotVersion:preview(e).snapshotVersion || '0'.repeat(64),reason:'受控基線測試',confirmed:true});
const migrate=(e,p)=>e.call('employeeLifecycleBaselineMigrate',p,'owner');
// Status tests use real dispatcher with fully in-memory GAS services.
function statusCall(e, p, actor='owner', extra={}) {
  const before=JSON.stringify(e.tables), count=e.writes; let sideEffects=0;
  const forbidden=()=>{sideEffects++;throw Error('PRIVATE_WRITE_FORBIDDEN');};
  const names=['employeeWithLock_','employeeWriteRow_','employeeAuditAppend_','employeeBaselineMigrate_',
    'employeeBaselineFinish_','employeeReplay_','employeeFinishIntent_','employeeLifecycleFinish_'];
  const saved=names.map(k=>[k,e.ctx[k]]), flush=e.ctx.SpreadsheetApp.flush;
  names.forEach(k=>e.ctx[k]=forbidden);e.ctx.SpreadsheetApp.flush=forbidden;
  const ranges=[];
  for(const table of Object.values(e.tables)) {
    const get=table.getRange;ranges.push([table,get]);
    table.getRange=(...args)=>{const range=get(...args);for(const k of ['setValue','setValues','clear','clearContent'])range[k]=forbidden;return range;};
    for(const k of ['appendRow','insertRowAfter','insertRows','deleteRow','deleteRows','clear'])table[k]=forbidden;
  }
  let r;
  try{r=e.call('employeeLifecycleBaselineRequestStatus',{employeeId:p.employeeId,requestId:p.requestId,...extra},actor);}
  finally{saved.forEach(([k,v])=>e.ctx[k]=v);e.ctx.SpreadsheetApp.flush=flush;ranges.forEach(([t,g])=>t.getRange=g);}
  assert.equal(sideEffects,0);assert.equal(e.writes,count);assert.equal(JSON.stringify(e.tables),before);assert.equal(e.logs.length,0);
  if(r.success) {
    assert.deepEqual(Object.keys(r).sort(),['success','employeeId','requestId','action','requestStatus','historicalCompletion','currentConsistency','recoveryAllowed','newRequestAllowed'].sort());
    assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);
    assert.equal(r.action,'employeeLifecycleBaselineMigrate');
  }
  assert(!/PRIVATE_|token:|operatorSub|operatorId|lineSub|salary|snapshotVersion|requestHash|afterJson|beforeJson/.test(JSON.stringify(r)));
  return r;
}
function statusFixture(checkpoint='complete') { const e=baselineEnv(),p=baselineInput(e); seedV3(e,p,checkpoint); return {e,p}; }
const statusStartCount=checks;
for(const [checkpoint,status,consistency,historical] of [
  ['none','NOT_OBSERVED','UNKNOWN',false],['start','STARTED','ABSENT',false],
  ['employment','STARTED','PARTIAL',false],['both','STARTED','MATCHED',false],['complete','COMPLETED','MATCHED',true]]) {
  test('status pure checkpoint '+checkpoint,()=>{const {e,p}=statusFixture(checkpoint),r=statusCall(e,p);
    assert.equal(r.requestStatus,status);assert.equal(r.currentConsistency,consistency);assert.equal(r.historicalCompletion,historical);});
}
for(const [label,change] of [
  ['binding only',e=>e.tables['員工任職紀錄'].rows.length=1],
  ['changed business',e=>e.tables['員工任職紀錄'].rows[1][7]='changed'],
  ['completed missing business',e=>e.tables['員工LINE綁定紀錄'].rows.length=1]]) {
  test('status conservative '+label,()=>{const {e,p}=statusFixture(label==='binding only'?'both':'complete');change(e);
    const r=statusCall(e,p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.historicalCompletion,label==='binding only'?false:true);});
}
for(const [label,change] of [
  ['corrupt completed',e=>e.tables['員工異動紀錄'].rows[2][10]='PRIVATE_BROKEN'],
  ['duplicate started',e=>e.tables['員工異動紀錄'].rows.push([...e.tables['員工異動紀錄'].rows[1]])],
  ['duplicate completed',e=>e.tables['員工異動紀錄'].rows.push([...e.tables['員工異動紀錄'].rows[2]])],
  ['hash mismatch',e=>e.tables['員工異動紀錄'].rows[2][2]='0'.repeat(64)],
  ['wrong action',e=>e.tables['員工異動紀錄'].rows[1][6]='APPLICATION_APPROVE'],
  ['wrong target',e=>e.tables['員工異動紀錄'].rows[1][3]='EMP010'],
  ['invalid after image',e=>{for(const row of e.tables['員工異動紀錄'].rows.slice(1)){const b=JSON.parse(row[10]);b.employment.salaryAmount={};row[10]=JSON.stringify(b);}}]]) {
  test('status rejects '+label,()=>{const {e,p}=statusFixture();change(e);const r=statusCall(e,p);
    assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.historicalCompletion,null);});
}
test('status legitimate later mutation conservatively preserves historical receipt',()=>{
  const {e,p}=statusFixture();assert.equal(mutate(e,'Suspend',{...mutationPayload,expectedVersion:1}).success,true);
  const r=statusCall(e,p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.historicalCompletion,true);assert.equal(r.currentConsistency,'CONFLICT');
});
for(const value of [undefined,'short',{},'x'.repeat(101)])test('status malformed requestId '+String(value),()=>{
  const {e,p}=statusFixture('none');assert.equal(statusCall(e,{...p,requestId:value}).code,'VALIDATION_ERROR');
});
test('status absent request and foreign request indistinguishable',()=>{
  const {e,p}=statusFixture();e.tables['員工資料表'].rows.push(['OTHER','other','其他','','',0,'ADMIN','','','在職','','']);
  const foreign=statusCall(e,p,'other'),absent=statusCall(e,{...p,requestId:'absent-request-0001'},'other');
  assert.deepEqual({...foreign,requestId:''},{...absent,requestId:''});assert.equal(foreign.requestStatus,'NOT_OBSERVED');
});
test('status rebound same employee cannot adopt old request',()=>{
  const {e,p}=statusFixture();e.tables['員工資料表'].rows[1][1]='rebound';assert.equal(statusCall(e,p,'rebound').requestStatus,'NOT_OBSERVED');
});
test('status same requestId across actors is never mixed',()=>{
  const {e,p}=statusFixture();const copy=[...e.tables['員工異動紀錄'].rows[1]];copy[12]='other';copy[13]='OTHER';e.tables['員工異動紀錄'].rows.push(copy);
  assert.equal(statusCall(e,p).requestStatus,'RECOVERY_REQUIRED');
});
for(const role of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE'])test('status actor role '+role,()=>{
  const {e,p}=statusFixture('none');e.tables['員工資料表'].rows[1][6]=role;const r=statusCall(e,p);
  assert.equal(r.success,['OWNER','ADMIN'].includes(role));if(!r.success)assert.equal(r.code,'FORBIDDEN');
});
for(const status of ['停職','留停','離職'])test('status inactive actor '+status,()=>{
  const {e,p}=statusFixture('none');e.tables['員工資料表'].rows[1][9]=status;assert.equal(statusCall(e,p).code,'FORBIDDEN');
});
test('status ADMIN cannot inspect OWNER',()=>{
  const e=baselineEnv('在職','OWNER','ADMIN'),p=baselineInput(e);assert.equal(statusCall(e,p).code,'FORBIDDEN');
});
test('status lock busy is UNKNOWN without flush',()=>{
  const {e,p}=statusFixture();e.ctx.LockService.getScriptLock=()=>({tryLock:ms=>{assert.equal(ms,1000);return false;},releaseLock:()=>assert.fail('not acquired')});
  const r=statusCall(e,p);assert.equal(r.requestStatus,'UNKNOWN');assert.equal(r.historicalCompletion,null);
});
test('status reauthorizes inside lock',()=>{
  const {e,p}=statusFixture();e.beforeLock(()=>e.tables['員工資料表'].rows[1][6]='EMPLOYEE');
  // Simulated external change is intentionally outside status write assertions.
  const old=e.ctx.employeeRequireReviewer_;let n=0;e.ctx.employeeRequireReviewer_=c=>{n++;return old(c);};
  const r=e.call('employeeLifecycleBaselineRequestStatus',{employeeId:p.employeeId,requestId:p.requestId},'owner');
  assert.equal(r.code,'FORBIDDEN');assert.equal(n,2);assert.equal(e.locked,false);
});
test('status cannot observe a running write through held lock',()=>{
  const e=makeEnv('OWNER'),p=e.input();e.prepare(p);let seen;const verified=e.ctx.resolveEmployeeIdentity_('token:owner');
  e.onWrite(()=>{const before=JSON.stringify(e.tables),w=e.writes;
    seen=e.ctx.employeeBaselineRequestStatus_(verified,{action:'employeeLifecycleBaselineRequestStatus',employeeId:p.employeeId,requestId:p.requestId});
    assert.equal(e.writes,w);assert.equal(JSON.stringify(e.tables),before);});migrate(e,p);
  assert.equal(seen.requestStatus,'UNKNOWN');assert.equal(statusCall(e,p).requestStatus,'COMPLETED');
});
test('status unknown fields rejected, raw storage errors remain safe',()=>{
  const {e,p}=statusFixture('none');assert.equal(statusCall(e,p,'owner',{role:'OWNER'}).code,'VALIDATION_ERROR');
  e.ctx.employeeStoreRows_=()=>{throw Error('PRIVATE_STORAGE_STACK');};const r=statusCall(e,p);assert.equal(r.success,false);
});
console.log(`${checks-statusStartCount} status test groups; ${checks} total foundation groups passed.`);

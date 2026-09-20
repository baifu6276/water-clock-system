// Offline only: GAS services are in-memory; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = ['Code', 'EmployeeIdentity', 'EmployeeLifecycleStore', 'EmployeeApplication', 'EmployeeApplicationAdmin', 'EmployeeLifecycleRead'];
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
          values.forEach((row, i) => { rows[r-1+i] = row.map(v => typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v); });
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
  files.forEach(f => vm.runInContext(read('gas/'+f+'.gs'), ctx, {filename:f+'.gs'}));
  sheet('員工資料表', [Array(12).fill('header'), ['E-owner','owner','測試管理員','', '', 0,'OWNER','','','在職','','']]);
  Object.values(ctx.EMPLOYEE_TABLES_).forEach(s => sheet(s.name, [[...s.headers]]));
  return {ctx, tables, logs, get writes(){return writes;}, get verifies(){return verifies;}, get locked(){return locked;},
    fail: (name, after=0, persisted=false) => {failTable=name;failAfter=after;failPersisted=persisted;},
    beforeLock: hook => {beforeLock=hook;}, onWrite: hook => {onWrite=hook;},
    call: (action, data={}, sub='new') => ctx.doPost({postData:{contents:JSON.stringify({action,idToken:'token:'+sub,...data})}}) };
}
const payload = {requestId:'request-submit-0001', type:'NEW_EMPLOYEE', name:'測試申請', phone:'0900000000', note:'測試資料'};
test('GAS and frontend syntax; original V3.4.3 preserved except dispatcher hook (normalized EOL)', () => {
  files.forEach(f => new vm.Script(read('gas/'+f+'.gs')));
  fs.readdirSync(path.join(root,'js')).filter(f=>f.endsWith('.js')).forEach(f=>new vm.Script(read('js/'+f),{filename:f}));
  const hook = '\n  // Employee foundation actions authenticate before taking their own short write lock.\n  var employeeRequest = employeeFoundationRequest_(e);\n  if (employeeRequest) return handleEmployeeFoundation_(employeeRequest);\n\n';
  const source = read('gas/Code.gs').replace(/\r\n/g,'\n'); assert(source.includes(hook));
  assert.equal(crypto.createHash('sha256').update(source.replace(hook,'')).digest('hex'), '8afc109fb41c98682f1bc3d0a7ab7406587d03d3d4df597d8f5eecd934399e73');
  for(const match of read('index.html').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
});
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
  assert.deepEqual(result.duplicateLineUids,['same']); assert.equal(result.blankEmployeeId,1); assert.equal(result.blankLineUid,1);
  assert.equal(result.unknownStatus,1); assert.equal(result.noOwner,false); assert.equal(result.eligibleEmploymentCount,1);
  assert.equal(result.eligibleBindingCount,1); assert.equal(JSON.stringify(e.tables),before); assert.equal(e.writes,0);
  assert.equal(e.call('employeeLifecycleBaselineDryRun',{role:'OWNER'}).code,'FORBIDDEN');
  for(const role of ['EMPLOYEE','SITE_MANAGER']) {e.tables['員工資料表'].rows[1][6]=role; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').code,'FORBIDDEN');}
  e.tables['員工資料表'].rows[1][6]='ADMIN'; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').success,true);
  e.tables['員工資料表'].rows[1][9]='離職'; assert.equal(e.call('employeeLifecycleBaselineDryRun',{},'owner').code,'FORBIDDEN');
});
test('all original dispatcher actions retain handler and lock, including attendance fallback', () => {
  const e=env(); let count=0;
  const dispatcher=read('gas/Code.gs').split('function doPost(e) {')[1].split('function handleBootstrap_')[0];
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
  const manifest=JSON.parse(read('gas/appsscript.json'));
  assert.equal(manifest.timeZone,'Asia/Taipei');assert.equal(manifest.runtimeVersion,'V8');
  assert.equal(manifest.exceptionLogging,'STACKDRIVER');assert.deepEqual(manifest.dependencies,{});
  assert.deepEqual(manifest.webapp,{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'});
  assert.deepEqual(manifest.oauthScopes,[
    'https://www.googleapis.com/auth/spreadsheets.currentonly',
    'https://www.googleapis.com/auth/script.external_request'
  ]);
  // New service/file use needs a fresh scope audit, not a silently stale manifest.
  const gs=fs.readdirSync(path.join(root,'gas')).filter(f=>f.endsWith('.gs')).sort();
  assert.deepEqual(gs,files.map(f=>f+'.gs').sort());
  const source=gs.map(f=>read('gas/'+f)).join('\n');
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
console.log(`${checks} test groups passed; no network or production writes.`);

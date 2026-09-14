// Offline only: GAS services are in-memory; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const files = ['Code', 'EmployeeIdentity', 'EmployeeLifecycleStore', 'EmployeeApplication'];
let checks = 0;
function test(name, work) { work(); checks++; console.log('PASS', name); }
function env() {
  let locked = false, writes = 0, verifies = 0, failTable = null, failAfter = 0;
  const tables = {}, logs = [];
  function sheet(name, rows) {
    const s = { rows, getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
      getDataRange: () => ({ getValues: () => rows.map(r => [...r]) }),
      getRange: (r, c, n, m) => ({
        getValues: () => Array.from({length:n}, (_, i) => Array.from({length:m}, (_, j) => rows[r-1+i]?.[c-1+j] ?? '')),
        setValues: values => {
          assert.equal(locked, true, 'writes must hold lock');
          assert.notEqual(name, '員工資料表');
          if (failTable === name && failAfter-- === 0) { failTable = null; throw Error('simulated storage failure'); }
          writes++;
          values.forEach((row, i) => { rows[r-1+i] = row.map(v => typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v); });
        }
      }) };
    tables[name] = s; return s;
  }
  const ctx = vm.createContext({ console: {log: (...v) => logs.push(v), error: (...v) => logs.push(v)},
    Logger: {log: (...v) => logs.push(v)},
    PropertiesService: { getScriptProperties: () => ({getProperty: () => 'test-channel'}) },
    SpreadsheetApp: {getActiveSpreadsheet: () => ({getSheetByName: name => tables[name] || null}), flush: () => {}},
    LockService: {getScriptLock: () => ({tryLock: () => { assert(!locked); locked=true; return true; }, waitLock: () => { assert(!locked); locked=true; }, releaseLock: () => {locked=false;}})},
    Utilities: {getUuid: crypto.randomUUID, DigestAlgorithm: {SHA_256:'sha256'}, Charset:{UTF_8:'utf8'},
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
    fail: (name, after=0) => {failTable=name;failAfter=after;},
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
console.log(`${checks} test groups passed; no network or production writes.`);

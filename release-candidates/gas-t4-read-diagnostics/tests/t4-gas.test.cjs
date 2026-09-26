const test = require('node:test'), assert = require('node:assert/strict');
const { makeEnv, legacyEnv } = require('./foundation-fixture.cjs');
const {seedV3}=require('./v3-data.cjs');
const controlKey = 'T4_EMP001_BASELINE_CONTROL';
const fixed = e => { const p = e.input(); e.prepare(p); return p; };
function complete(e) {
  assert.equal(e.rows('employments').length, 1); assert.equal(e.rows('bindings').length, 1);
  assert.deepEqual(e.rows('audit').map(a => a.phase), ['STARTED', 'COMPLETED']);
}
for (const role of ['OWNER', 'ADMIN']) test(role + ' one controlled EMP001 effect and strict completed replay', () => {
  const e = makeEnv(role), p = fixed(e), master = JSON.stringify(e.tables['員工資料表']);
  const r = e.migrate(p); assert.equal(r.success, true); assert.equal(r.requestId, p.requestId); complete(e);
  const writes = e.writes; assert.equal(e.migrate(p).success, true); assert.equal(e.writes, writes);
  const s = e.status(p); assert.equal(s.requestStatus, 'COMPLETED'); assert.equal(s.currentConsistency, 'MATCHED');
  assert.equal(s.recoveryAllowed, false); assert.equal(s.newRequestAllowed, false);
  assert.equal(JSON.stringify(e.tables['員工資料表']), master); assert.equal(e.call('identityBootstrap', {}, e.actor).state, 'ACTIVE_EMPLOYEE');
});
for (const role of ['SITE_MANAGER', 'EMPLOYEE']) test(role + ' cannot bypass permit via direct dispatcher', () => {
  const e = makeEnv(role), p = { ...e.input(), expectedSnapshotVersion: 'a'.repeat(64) };
  assert.equal(e.migrate(p).code, 'FORBIDDEN'); assert.equal(e.writes, 0);
});
for (const status of ['停職', '留停', '離職']) test('inactive ' + status, () => {
  const e = makeEnv('ADMIN', 'ADMIN', status);
  assert.equal(e.migrate({ ...e.input(), expectedSnapshotVersion: 'a'.repeat(64) }).code, 'FORBIDDEN'); assert.equal(e.writes, 0);
});
test('ADMIN cannot manage OWNER', () => {
  const e = makeEnv('ADMIN', 'OWNER'); assert.equal(e.migrate({ ...e.input(), expectedSnapshotVersion: 'a'.repeat(64) }).code, 'FORBIDDEN'); assert.equal(e.writes, 0);
});
const mutations = [
  ['unknown role', p => p.role = 'OWNER'], ['unknown alias snapshotVersion', p => p.snapshotVersion = p.expectedSnapshotVersion],
  ['employee scope', p => p.employeeId = 'EMP002'], ['employee whitespace', p => p.employeeId = ' EMP001'],
  ['confirmation type', p => p.confirmed = 'true'], ['reason type', p => p.reason = {}], ['empty reason', p => p.reason = ' '],
  ['snapshot type', p => p.expectedSnapshotVersion = []], ['bad snapshot', p => p.expectedSnapshotVersion = 'x'],
  ['status probe', p => p.requestId = 'status-probe-123456789'], ['short id', p => p.requestId = 'x'], ['id object', p => p.requestId = {}],
  ...['employeeId', 'requestId', 'expectedSnapshotVersion', 'reason', 'confirmed'].map(k => ['missing ' + k, p => delete p[k]])
];
for (const [name, change] of mutations) test('strict ' + name, () => {
  const e = makeEnv(), p = fixed(e); change(p); assert.equal(e.migrate(p).code, 'VALIDATION_ERROR'); assert.equal(e.writes, 0);
});
test('missing and malformed token fail before write; exact action checked', () => {
  const e = makeEnv(), p = fixed(e);
  for (const idToken of [undefined, '', {}, 'invalid-secret']) { assert.equal(e.migrate({ ...p, idToken }).success, false); assert.equal(e.writes, 0); }
  assert.equal(e.call(' employeeLifecycleBaselineMigrate', p, e.actor).code, 'VALIDATION_ERROR');
});
for (const setup of [() => {}, e => e.props.set(controlKey, '{}'), e => e.props.set(controlKey, 'bad')]) test('absent or malformed permit denies', () => {
  const e = makeEnv(), p = e.input(); setup(e); assert.equal(e.migrate(p).success, false); assert.equal(e.writes, 0);
});
for (const key of ['operatorId', 'operatorRole', 'requestId', 'requestHash', 'snapshotVersion', 'state', 'mode']) test('permit mismatched ' + key, () => {
  const e = makeEnv(), p = fixed(e), c = JSON.parse(e.props.get(controlKey)); c[key] = 'invalid'; e.props.set(controlKey, JSON.stringify(c));
  assert.equal(e.migrate(p).success, false); assert.equal(e.writes, 0);
});
for (const [column, value] of [[1,'rebound'],[3,'領班'],[4,'月薪'],[5,2300],[6,'OWNER'],[7,'2020-01-01'],[9,'停職']]) test('stale master field ' + column, () => {
  const e = makeEnv(), p = fixed(e); e.beforeLock(() => e.tables['員工資料表'].rows[1][column] = value);
  assert.equal(e.migrate(p).success, false); assert.equal(e.writes, 0);
});
test('binding and employment drift invalidate original snapshot', () => {
  for (const table of ['bindings', 'employments']) {
    const e = makeEnv(), p = fixed(e), schema = e.ctx.EMPLOYEE_TABLES_[table];
    e.tables[schema.name].rows.push(schema.keys.map(k => k === 'employeeId' ? 'EMP001' : ''));
    assert.equal(e.migrate(p).success, false); assert.equal(e.writes, 0);
  }
});
for (const [table, n] of [['員工異動紀錄',0],['員工任職紀錄',0],['員工LINE綁定紀錄',0],['員工異動紀錄',1]]) {
  for (const persisted of [false, true]) test(`checkpoint ${table}/${n} persisted=${persisted}`, () => {
    const e = makeEnv(), p = fixed(e), master = JSON.stringify(e.tables['員工資料表']); e.fail(table, n, persisted);
    assert.equal(e.migrate(p).code, 'OPERATION_ERROR'); assert.equal(e.locked, false);
    const status = e.status(p), writes = e.writes;
    if (status.requestStatus === 'COMPLETED') { assert.equal(e.migrate(p).success, true); assert.equal(e.writes, writes); }
    else {
      assert.equal(e.migrate(p).success, false); assert.equal(e.writes, writes, 'no implicit retry recovery');
      e.prepare(p, status.requestStatus === 'NOT_OBSERVED' ? 'INITIAL' : 'RECOVER_ORIGINAL');
      assert.equal(e.migrate(p).success, true);
    }
    complete(e); assert.equal(JSON.stringify(e.tables['員工資料表']), master);
    assert.equal(e.logs.length, 0); assert(!JSON.stringify(e.tables).includes('token:'));
    assert(!e.props.get(controlKey).includes('token:'));
  });
}
for (const when of ['before', 'after']) test('claim property failure ' + when + ' stops before Sheet writes', () => {
  const e = makeEnv(), p = fixed(e); e.propFailure = when;
  assert.equal(e.migrate(p).success, false); assert.equal(e.writes, 0);
  if (when === 'after') assert.equal(e.migrate(p).success, false);
});
test('flush uncertainty retains STARTED and never auto resumes', () => {
  const e = makeEnv(), p = fixed(e); e.flushFailure = true;
  assert.equal(e.migrate(p).success, false); assert.equal(e.status(p).requestStatus, 'STARTED');
  const w = e.writes; assert.equal(e.migrate(p).code, 'RECOVERY_APPROVAL_REQUIRED'); assert.equal(e.writes, w);
});
for (const kind of ['same', 'different', 'other-actor']) test('deterministic concurrent ' + kind, () => {
  const e = makeEnv(), p = fixed(e); let competing;
  e.tables['員工資料表'].rows.push(['EMP002','other','測試OWNER','','',0,'OWNER','','','在職','','']);
  // Two independent GAS executions share storage and ScriptLock. The second
  // execution verifies LINE without owning the first execution's lock.
  const second = makeEnv();
  for (const service of ['SpreadsheetApp', 'LockService', 'PropertiesService']) second.ctx[service] = e.ctx[service];
  // Unrelated actor addition does not change target snapshot.
  e.onWrite(() => { competing = second.call('employeeLifecycleBaselineMigrate', kind === 'different' ? { ...p, requestId: 't4-other-request-0001' } : p, kind === 'other-actor' ? 'other' : e.actor); });
  assert.equal(e.migrate(p).success, true); assert.equal(competing.code, 'BUSY'); complete(e);
  const w = e.writes;
  const after = e.call('employeeLifecycleBaselineMigrate', kind === 'different' ? { ...p, requestId: 't4-other-request-0001' } : p, kind === 'other-actor' ? 'other' : e.actor);
  assert.equal(after.success, kind === 'same'); assert.equal(e.writes, w);
});
test('same request different content conflicts, new ID cannot shortcut partial', () => {
  const e = makeEnv(), p = fixed(e); e.fail('員工LINE綁定紀錄'); e.migrate(p); const w = e.writes;
  assert.equal(e.migrate({ ...p, reason: '不同' }).code, 'REQUEST_CONFLICT');
  assert.equal(e.migrate({ ...e.input('new-request-0000001') }).success, false); assert.equal(e.writes, w);
});
for (const damage of ['employment', 'binding', 'audit', 'duplicate-completion', 'before-image']) test('completed replay checks ' + damage, () => {
  const e = makeEnv(), p = fixed(e); e.migrate(p); const w = e.writes;
  if (damage === 'employment') e.tables['員工任職紀錄'].rows[1][7] = '變更';
  if (damage === 'binding') e.tables['員工LINE綁定紀錄'].rows[1][12] = '變更';
  if (damage === 'audit') e.tables['員工異動紀錄'].rows[2][11] = '變更';
  if (damage === 'duplicate-completion') e.tables['員工異動紀錄'].rows.push([...e.tables['員工異動紀錄'].rows[2]]);
  if (damage === 'before-image') { const before = JSON.parse(e.tables['員工異動紀錄'].rows[1][9]); before.master[5] = 1; e.tables['員工異動紀錄'].rows[1][9] = JSON.stringify(before); }
  assert.equal(e.migrate(p).success, false); assert.equal(e.writes, w);
});
test('binding-only is conflict and cannot acquire recovery permit', () => {
  const e = makeEnv(), p = fixed(e); e.fail('員工異動紀錄',1); e.migrate(p); e.tables['員工任職紀錄'].rows.length=1;
  assert.equal(e.status(p).requestStatus,'RECOVERY_REQUIRED'); assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL')); const w=e.writes;
  assert.equal(e.migrate(p).success,false); assert.equal(e.writes,w);
});
test('v4 audit linkage, complete before image, unknown hire date and no token', () => {
  const e=makeEnv(),p=fixed(e); const master=JSON.stringify(e.tables['員工資料表'].rows[1]); e.migrate(p);
  const [start,done]=e.rows('audit'), before=JSON.parse(start.beforeJson), after=JSON.parse(start.afterJson);
  assert.equal(before.format,4); assert.equal(JSON.stringify(before.master),master); assert.deepEqual(after.warnings,['HIRE_DATE_UNKNOWN']);
  assert.equal(after.employment.startDate,''); assert.equal(start.requestId,p.requestId); assert.equal(start.operatorId,'EMP001');
  for(const key of Object.keys(start))if(!['auditId','phase','operatedAt'].includes(key))assert.deepEqual(done[key],start[key]);
  assert.equal(after.approvalReference,'approval-offline-0001'); assert.equal(e.props.get(controlKey).includes('token:'),false);
});
test('v3 historical rows remain readable and strict replay is read-only', () => {
  const e=legacyEnv(); e.tables['員工資料表'].rows[1]=['EMP001','owner','測試','師傅','日薪',2200,'OWNER','','','在職','',''];
  const p={employeeId:'EMP001',requestId:'legacy-original-0001',expectedSnapshotVersion:e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},'owner').snapshotVersion,reason:'既有',confirmed:true};
  seedV3(e,p,'complete'); const w=e.writes;
  assert.equal(e.call('employeeLifecycleBaselineRequestStatus',{employeeId:'EMP001',requestId:p.requestId},'owner').requestStatus,'COMPLETED');
  assert.equal(e.call('employeeLifecycleBaselineMigrate',p,'owner').success,true); assert.equal(e.writes,w);
});
test('editor helpers have no dispatcher route; closed permit blocks late request', () => {
  const e=makeEnv(),p=fixed(e); assert(!e.ctx.EMPLOYEE_ACTIONS_.some(a=>/Control|Prepare|Claim/.test(a)));
  e.ctx.employeeBaselineControlClose_(p.requestId,'close-approval-0001'); assert.equal(e.migrate(p).success,false); assert.equal(e.writes,0);
});
test('second invocation queued behind partial first operation cannot resume implicitly', () => {
  const e=makeEnv(),p=fixed(e),second=makeEnv();
  for(const service of ['SpreadsheetApp','LockService','PropertiesService'])second.ctx[service]=e.ctx[service];
  let r; e.onWrite(()=>{r=second.call('employeeLifecycleBaselineMigrate',p,'owner');});e.fail('員工LINE綁定紀錄');
  assert.equal(e.migrate(p).success,false);assert.equal(r.code,'BUSY');const w=e.writes;
  assert.equal(second.call('employeeLifecycleBaselineMigrate',p,'owner').code,'RECOVERY_APPROVAL_REQUIRED');assert.equal(e.writes,w);
});
for(const change of ['actor-role','actor-status','actor-binding'])test('independent actor changed before lock: '+change,()=>{
  const e=makeEnv('OWNER','ADMIN'),p=fixed(e);e.beforeLock(()=>{
    const actor=e.tables['員工資料表'].rows[2];if(change==='actor-role')actor[6]='ADMIN';if(change==='actor-status')actor[9]='停職';if(change==='actor-binding')actor[1]='rebound';
  });assert.equal(e.migrate(p).success,false);assert.equal(e.writes,0);
});
test('partial recovery needs original actor and approved generation; no overwrite of approved images',()=>{
  const e=makeEnv(),p=fixed(e);e.fail('員工LINE綁定紀錄');e.migrate(p);e.prepare(p,'RECOVER_ORIGINAL');
  const before=JSON.parse(e.props.get(controlKey));assert.equal(before.generation,2);assert.equal(before.history.length,3);
  e.tables['員工任職紀錄'].rows[1][7]='changed';const w=e.writes;
  assert.equal(e.migrate(p).code,'RECOVERY_REQUIRED');assert.equal(e.writes,w);assert.equal(JSON.parse(e.props.get(controlKey)).state,'ARMED');
});
test('control read-back mismatch, quota and history corruption fail closed',()=>{
  for(const kind of ['readback','quota','history']){
    const e=makeEnv(),p=fixed(e);
    if(kind==='history'){const c=JSON.parse(e.props.get(controlKey));c.history[0].state='CLAIMED';e.props.set(controlKey,JSON.stringify(c));}
    else if(kind==='quota')e.ctx.Utilities.newBlob=()=>({getBytes:()=>Array(8001).fill(0)});
    else e.ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>e.props.get(k),setProperty:()=>{}})};
    assert.equal(e.migrate(p).success,false);assert.equal(e.writes,0);
  }
});
test('v3 partial records remain readable but cannot be resumed as T4',()=>{
  const e=legacyEnv();e.tables['員工資料表'].rows[1]=['EMP001','owner','測試','師傅','日薪',2200,'OWNER','','','在職','',''];
  const p={employeeId:'EMP001',requestId:'legacy-partial-0001',expectedSnapshotVersion:e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},'owner').snapshotVersion,reason:'既有',confirmed:true};
  seedV3(e,p,'employment');const w=e.writes;
  assert.equal(e.call('employeeLifecycleBaselineRequestStatus',{employeeId:'EMP001',requestId:p.requestId},'owner').requestStatus,'STARTED');
  assert.equal(e.call('employeeLifecycleBaselineMigrate',p,'owner').code,'RECOVERY_REQUIRED');assert.equal(e.writes,w);
});
test('v4 status is strictly read-only including no flush',()=>{
  const e=makeEnv(),p=fixed(e);e.fail('員工異動紀錄',1);e.migrate(p);const before=JSON.stringify(e.tables),props=e.props.get(controlKey),w=e.writes;
  e.ctx.SpreadsheetApp.flush=()=>{throw Error('STATUS_FLUSH_FORBIDDEN');};
  for(const name of ['employeeWriteRow_','employeeAuditAppend_','employeeBaselineClaim_'])e.ctx[name]=()=>{throw Error('STATUS_WRITE_FORBIDDEN');};
  const s=e.status(p);assert.equal(s.requestStatus,'STARTED');assert.equal(s.currentConsistency,'MATCHED');assert.equal(s.recoveryAllowed,false);assert.equal(s.newRequestAllowed,false);
  assert.equal(e.writes,w);assert.equal(JSON.stringify(e.tables),before);assert.equal(e.props.get(controlKey),props);
});
test('control ledger cannot silently re-arm same generation or start with a claim',()=>{
  for(const kind of ['same-generation','initial-claim']){
    const e=makeEnv(),p=fixed(e),c=JSON.parse(e.props.get(controlKey));
    if(kind==='same-generation')c.history.push({...c.history[0],state:'CLAIMED'},{...c.history[0]});
    else{c.state='CLAIMED';c.history[0].state='CLAIMED';}
    e.props.set(controlKey,JSON.stringify(c));assert.equal(e.migrate(p).success,false);assert.equal(e.writes,0);
  }
});

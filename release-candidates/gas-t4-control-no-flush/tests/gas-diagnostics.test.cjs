// Offline: all GAS/LINE services are in-memory. Never imports a deployment client.
const test = require('node:test');
const assert = require('node:assert/strict');
const {env} = require('./service-fixture.cjs');
const trace = '11111111-2222-4333-8444-555555555555';
const metadata = () => ({version:1,traceId:trace});
const keys = ['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'];
const plain = v => JSON.parse(JSON.stringify(v));
function fixture(role='ADMIN',status='在職',flag='true') {
  const e=env(); let time=0, samples=0, serializations=0, propertyReads=0;
  const row=e.tables['員工資料表'].rows[1];
  Object.assign(row,{0:'EMP001',3:'師傅',4:'日薪',5:2200,6:role,9:status});
  e.ctx.PropertiesService.getScriptProperties=()=>({getProperty:key=>{
    if(key==='READ_DIAGNOSTICS_ENABLED'){propertyReads++;if(flag instanceof Error)throw flag;return flag;}
    return 'test-channel';
  },setProperty:()=>assert.fail('property write')});
  const output=e.ctx.ContentService.createTextOutput;
  e.ctx.ContentService.createTextOutput=s=>{serializations++;return output(s);};
  const call=(action='identityBootstrap',extra={},now=()=>{samples++;return time;},sub='owner')=>
    plain(e.ctx.handleEmployeeFoundation_({action,idToken:'token:'+sub,...extra,_transportDiagnostics:metadata()},{now}));
  return {e,call,advance:ms=>time+=ms,get samples(){return samples;},get serializations(){return serializations;},get propertyReads(){return propertyReads;}};
}
const statusData={employeeId:'EMP001',requestId:'status-probe-offline-0001'};
function safe(e,result){assert.equal(e.writes,0);assert.deepEqual(e.logs,[]);assert(!JSON.stringify(result).includes('token:'));assert(!JSON.stringify(e.tables).includes(trace));assert.equal(e.locked,false);}
for(const role of ['ADMIN','OWNER']) test('identity exposure '+role,()=>{
  const f=fixture(role),r=f.call();assert.equal(r.state,'ACTIVE_EMPLOYEE');assert.equal(r._gasReadDiagnostics.transportTraceId,trace);
  assert.equal(r._gasReadDiagnostics.stages.LOCK_WAIT,'NOT_RUN');assert.equal(f.serializations,1);safe(f.e,r);
});
for(const role of ['EMPLOYEE','SITE_MANAGER']) test('no exposure '+role,()=>{const f=fixture(role),r=f.call();assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);safe(f.e,r);});
for(const status of ['停職','留停','離職']) test('inactive has no exposure '+status,()=>{const f=fixture('ADMIN',status),r=f.call();assert(!r._gasReadDiagnostics);safe(f.e,r);});
test('unregistered keeps business result without diagnostics',()=>{const f=fixture(),r=f.call('identityBootstrap',{},undefined,'unregistered');assert.equal(r.state,'UNREGISTERED');assert(!r._gasReadDiagnostics);safe(f.e,r);});
test('dry-run: metadata never reaches context/hash/snapshot/storage',()=>{
  const f=fixture(),before=JSON.stringify(f.e.tables),hash=f.e.ctx.employeeHash_,context=f.e.ctx.employeeContext_;
  f.e.ctx.employeeHash_=v=>{assert(!JSON.stringify(v).includes(trace));assert(!JSON.stringify(v).includes('_transportDiagnostics'));return hash(v);};
  f.e.ctx.employeeContext_=v=>{assert(!JSON.stringify(v).includes(trace));return context(v);};
  const r=f.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'});
  const old=f.e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},'owner');
  assert.equal(r.snapshotVersion,old.snapshotVersion);assert.equal(r.eligible,true);assert.equal(r._gasReadDiagnostics.stages.LOCK_WAIT,'NOT_RUN');
  assert.equal(JSON.stringify(f.e.tables),before);delete r._gasReadDiagnostics;assert.deepEqual(r,old);safe(f.e,r);
});
test('status acquired: cumulative context and exclusive action/lock stages',()=>{
  const f=fixture(); const context=f.e.ctx.employeeContext_,verify=f.e.ctx.verifyLiffIdentity_;
  f.e.ctx.employeeContext_=x=>{f.advance(300);return context(x);};
  f.e.ctx.verifyLiffIdentity_=x=>{f.advance(1000);return verify(x);};
  const getLock=f.e.ctx.LockService.getScriptLock;
  f.e.ctx.LockService.getScriptLock=()=>{const l=getLock();return {...l,tryLock:ms=>{assert.equal(ms,1000);f.advance(2000);return l.tryLock(ms);}};};
  const r=f.call('employeeLifecycleBaselineRequestStatus',statusData),d=r._gasReadDiagnostics;
  assert.equal(r.requestStatus,'NOT_OBSERVED');assert.equal(d.stages.EMPLOYEE_CONTEXT,'MS_500_1999');
  assert.equal(d.stages.LOCK_WAIT,'MS_2000_4999');assert.equal(d.stages.ACTION_READ,'LT_100');assert.equal(d.total,'MS_2000_4999');safe(f.e,r);
});
test('lock unavailable returns UNKNOWN with measured wait',()=>{
  const f=fixture();f.e.ctx.LockService.getScriptLock=()=>({tryLock:ms=>{f.advance(ms);return false;},releaseLock:()=>assert.fail('unowned lock')});
  const r=f.call('employeeLifecycleBaselineRequestStatus',statusData);assert.equal(r.requestStatus,'UNKNOWN');assert.equal(r._gasReadDiagnostics.stages.LOCK_WAIT,'MS_500_1999');safe(f.e,r);
});
for(const change of ['role','status','schema']) test('locked context revokes prior exposure '+change,()=>{
  const f=fixture();f.e.beforeLock(()=>{if(change==='schema')f.e.ctx.employeeContext_=()=>{throw Error('PRIVATE_EXCEPTION');};else f.e.tables['員工資料表'].rows[1][change==='role'?6:9]=change==='role'?'EMPLOYEE':'離職';});
  const r=f.call('employeeLifecycleBaselineRequestStatus',statusData);assert.equal(r.success,false);assert(!r._gasReadDiagnostics);assert(!JSON.stringify(r).includes('PRIVATE_EXCEPTION'));safe(f.e,r);
});
for(const flag of [undefined,null,'false','TRUE',' true',true,'invalid']) test('flag off '+String(flag),()=>{
  const f=fixture('ADMIN','在職',flag===undefined?null:flag),r=f.call();assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);assert.equal(f.samples,0);assert.equal(f.propertyReads,1);safe(f.e,r);
});
test('flag read failure only disables diagnostics',()=>{const f=fixture('ADMIN','在職',Error('PRIVATE_PROPERTY')),r=f.call();assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);assert.equal(f.samples,0);safe(f.e,r);});
test('no metadata: no flag read, no clock, old behavior',()=>{const f=fixture(),r=f.e.call('identityBootstrap',{},'owner');assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);assert.equal(f.propertyReads,0);safe(f.e,r);});
test('request cannot select the production clock dependency',()=>{
  const f=fixture(),factory=f.e.ctx.employeeReadDiagnostics_;let observed=false;
  f.e.ctx.employeeReadDiagnostics_=now=>{assert.equal(typeof now,'function');observed=true;return factory(now);};
  const r=f.e.call('identityBootstrap',{_transportDiagnostics:metadata(),now:'PRIVATE_CLOCK',diagnosticDeps:{now:'PRIVATE_CLOCK'}},'owner');
  assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(observed);safe(f.e,r);
});
test('locked reviewer must succeed before exposure is restored',()=>{
  const f=fixture(),review=f.e.ctx.employeeRequireReviewer_;let n=0;
  f.e.ctx.employeeRequireReviewer_=context=>{if(++n===2)throw Error('PRIVATE_REVIEW');return review(context);};
  const r=f.call('employeeLifecycleBaselineRequestStatus',statusData);assert.equal(r.success,false);assert(!r._gasReadDiagnostics);safe(f.e,r);
});
const malformed=[null,[],{},'PRIVATE_TOKEN',{version:1},{traceId:trace},{version:'1',traceId:trace},{version:2,traceId:trace},{version:1,traceId:trace,extra:'PRIVATE_BODY'},
  ...['',trace.toUpperCase().replace('11111111','aaaaaaaa').toUpperCase(),trace+' ',trace.replace('-4333-','-3333-'),'PRIVATE_SUB',7,{}].map(traceId=>({version:1,traceId}))];
malformed.forEach((value,i)=>test('malformed namespace safely rejected '+i,()=>{
  const f=fixture(),r=f.e.call('identityBootstrap',{_transportDiagnostics:value},'owner');assert.equal(r.code,'VALIDATION_ERROR');assert(!r._gasReadDiagnostics);assert.equal(f.e.verifies,0);safe(f.e,r);
}));
test('all non-read foundation and legacy writes reject namespace before dispatch',()=>{
  const f=fixture();const reads=['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'];
  for(const action of [...f.e.ctx.EMPLOYEE_ACTIONS_,'clockIn','adminPayrollRefresh','unknown-write']){
    if(reads.includes(action))continue;
    const r=f.e.call(action,{_transportDiagnostics:metadata()},'owner');assert.equal(r.code,'VALIDATION_ERROR',action);
  }assert.equal(f.e.verifies,0);safe(f.e,{});
});
test('off flag still separates metadata and preserves status strict unknown-key rejection',()=>{
  const f=fixture('ADMIN','在職','false'),r=f.call('employeeLifecycleBaselineRequestStatus',statusData);assert.equal(r.requestStatus,'NOT_OBSERVED');assert(!r._gasReadDiagnostics);
  assert.equal(f.call('employeeLifecycleBaselineRequestStatus',{...statusData,extra:'PRIVATE'}).code,'VALIDATION_ERROR');safe(f.e,r);
});
const boundaries=[[0,'LT_100'],[99,'LT_100'],[100,'MS_100_499'],[499,'MS_100_499'],[500,'MS_500_1999'],[1999,'MS_500_1999'],[2000,'MS_2000_4999'],[4999,'MS_2000_4999'],[5000,'MS_5000_9999'],[9999,'MS_5000_9999'],[10000,'MS_10000_19999'],[19999,'MS_10000_19999'],[20000,'MS_GE_20000']];
for(const [elapsed,bucket] of boundaries)test('clock boundary '+elapsed,()=>{
  const f=fixture();let now=0;const d=f.e.ctx.employeeReadDiagnostics_(()=>now);d.start();d.expose({employee:{status:'在職',permission:'ADMIN'}});now=elapsed;
  const r=plain(d.freeze(trace));assert.equal(r.total,bucket);assert.equal(r.stages.VERIFY_LINE,bucket);assert.equal(r.stages.ACTION_READ,'NOT_RUN');assert.equal(d.freeze(trace),undefined);
});
for(const value of ['bad',null,NaN,Infinity,-1])test('invalid clock value only disables diagnostics '+String(value),()=>{
  const f=fixture(),r=f.call('identityBootstrap',{},()=>value);assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);safe(f.e,r);
});
test('backwards clock stays disabled without fallback',()=>{const f=fixture();let n=0;const r=f.call('identityBootstrap',{},()=>++n===1?10:9);assert.equal(r.state,'ACTIVE_EMPLOYEE');assert(!r._gasReadDiagnostics);assert.equal(n,2);safe(f.e,r);});
test('throwing clock does not mask success or action error',()=>{
  const f=fixture(),clock=()=>{throw Error('PRIVATE_CLOCK');};assert.equal(f.call('identityBootstrap',{},clock).state,'ACTIVE_EMPLOYEE');
  f.e.ctx.employeeBaselinePreview_=()=>{throw Error('PRIVATE_ACTION');};const r=f.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},clock);assert.equal(r.code,'OPERATION_ERROR');assert(!r._gasReadDiagnostics);safe(f.e,r);
});
test('diagnostic construction and response preparation failures stay isolated',()=>{
  const f=fixture();f.e.ctx.employeeReadDiagnostics_=()=>{throw Error('PRIVATE_INIT');};assert.equal(f.call().state,'ACTIVE_EMPLOYEE');
  const business={success:false,code:'FORBIDDEN'};assert.deepEqual(f.e.ctx.employeeReadDiagnosticResponse_(business,{enter(){throw Error('PRIVATE_PREP');}},trace),business);safe(f.e,business);
});
for(const type of ['auth','initial-context','action-schema','action-read'])test('error exposure '+type,()=>{
  const f=fixture();
  if(type==='auth')f.e.ctx.verifyLiffIdentity_=()=>f.e.ctx.employeeAuthFailure_('LINE_TOKEN_REJECTED');
  if(type==='initial-context')f.e.ctx.employeeContext_=()=>{throw Error('PRIVATE_CONTEXT');};
  if(type.startsWith('action'))f.e.ctx.employeeBaselinePreview_=()=>{if(type==='action-schema')f.e.ctx.employeeFailure_('SCHEMA_ERROR','固定安全訊息');throw Error('PRIVATE_READ');};
  const r=f.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'});assert.equal(r.success,false);assert.equal(Boolean(r._gasReadDiagnostics),type.startsWith('action'));assert(!JSON.stringify(r).includes('PRIVATE'));safe(f.e,r);
});
test('freeze excludes final serialization and ContentService, never samples afterwards',()=>{
  const f=fixture();let time=0,calls=0;const output=f.e.ctx.ContentService.createTextOutput;
  f.e.ctx.ContentService.createTextOutput=s=>{time=999999;const before=calls;const value=output(s);assert.equal(calls,before);return value;};
  const r=f.call('identityBootstrap',{},()=>{calls++;return time;});assert.equal(f.serializations,1);assert.equal(r._gasReadDiagnostics.total,'LT_100');
  assert.deepEqual(Object.keys(r._gasReadDiagnostics),['version','transportTraceId','total','stages']);assert.deepEqual(Object.keys(r._gasReadDiagnostics.stages),keys);safe(f.e,r);
});

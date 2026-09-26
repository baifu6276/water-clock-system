// Offline differential tests: real candidate functions, fake services/data only.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {env}=require('./service-fixture.cjs');
const {makeEnv}=require('./foundation-fixture.cjs');
const {env:referenceEnv}=require('../../gas-v44-read-diagnostics/tests/foundation-regression.cjs');
const {seedV3}=require('./v3-data.cjs');
const root=path.resolve(__dirname,'..'),plain=v=>JSON.parse(JSON.stringify(v));
const trace='11111111-2222-4333-8444-555555555555',meta={version:1,traceId:trace};
const reads=['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'];
const statusInput={employeeId:'EMP001',requestId:'status-probe-offline-0001'};
const controlKey='T4_EMP001_BASELINE_CONTROL';
function fixture(factory){
  const e=factory();e.tables['員工資料表'].rows[1]=['EMP001','owner','測試','師傅','日薪',2200,'ADMIN','','','在職','',''];
  vm.runInContext('Date = class extends Date { constructor(...args){super(...(args.length?args:[1790409600000]));} static now(){return 1790409600000;} };',e.ctx);
  e.ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>k==='READ_DIAGNOSTICS_ENABLED'?'true':k==='LINE_LOGIN_CHANNEL_ID'?'test-channel':null,setProperty:()=>assert.fail('read wrote property')})};
  e.ctx.SpreadsheetApp.flush=()=>assert.fail('read flushed');
  const count={master:0,bindings:0,employments:0,audit:0};
  const master=e.ctx.employeeReviewMasterRows_,store=e.ctx.employeeStoreRows_;
  assert.equal(typeof master,'function');
  e.ctx.employeeReviewMasterRows_=function(){count.master++;return master.apply(this,arguments);};
  e.ctx.employeeStoreRows_=function(table){if(table in count)count[table]++;return store.apply(this,arguments);};
  e.count=count;return e;
}
function call(e,action,extra={}){return plain(e.ctx.handleEmployeeFoundation_({action,idToken:'token:owner',...(action==='identityBootstrap'?{}:action===reads[1]?{employeeId:'EMP001'}:statusInput),...extra,_transportDiagnostics:meta},{now:()=>100}));}
function equivalent(action,setup=()=>{}){
  const a=fixture(referenceEnv),b=fixture(env);setup(a);setup(b);
  const beforeA=JSON.stringify(a.tables),beforeB=JSON.stringify(b.tables),old=call(a,action),current=call(b,action);
  assert.deepEqual(current,old,'entire business JSON and fixed-clock diagnostics must match');
  assert.deepEqual(b.count,a.count,'no read consolidation');
  for(const [e,before] of [[a,beforeA],[b,beforeB]]){assert.equal(e.writes,0);assert.equal(e.locked,false);assert.deepEqual(e.logs,[]);assert.equal(JSON.stringify(e.tables),before);}
  return current;
}
for(const action of reads){
  const cases={
    normal:()=>{},salaryString:e=>e.tables['員工資料表'].rows[1][5]='2200',unknownDate:e=>e.tables['員工資料表'].rows[1][7]='',
    emptyMaster:e=>e.tables['員工資料表'].rows.splice(1),missingMaster:e=>delete e.tables['員工資料表'],
    duplicateId:e=>e.tables['員工資料表'].rows.push(['EMP001','other','duplicate','','',0,'EMPLOYEE','','','在職','','']),
    duplicateUid:e=>e.tables['員工資料表'].rows.push(['EMP002','owner','duplicate','','',0,'EMPLOYEE','','','在職','','']),
    employee:e=>e.tables['員工資料表'].rows[1][6]='EMPLOYEE',siteManager:e=>e.tables['員工資料表'].rows[1][6]='SITE_MANAGER',
    inactive:e=>e.tables['員工資料表'].rows[1][9]='停職',
    badBindingHeader:e=>e.tables['員工LINE綁定紀錄'].rows[0][0]='BAD',
    badEmploymentHeader:e=>e.tables['員工任職紀錄'].rows[0][0]='BAD',
    missingEmployment:e=>delete e.tables['員工任職紀錄'],
    readException:e=>{e.tables['員工資料表'].getDataRange=()=>{throw Error('PRIVATE_STORAGE_EXCEPTION');};}
  };
  for(const [name,setup]of Object.entries(cases))test('V46 equivalence '+action+' '+name,()=>{equivalent(action,setup);});
}
test('schema error with no receipt is never masked as NOT_OBSERVED',()=>{
  const r=equivalent(reads[2],e=>e.tables['員工任職紀錄'].rows[0][0]='BAD');assert.equal(r.code,'SCHEMA_ERROR');
});
for(const kind of ['role','status','binding'])test('status revalidates '+kind+' inside lock and revokes exposure',()=>{
  for(const factory of [referenceEnv,env]){
    const e=fixture(factory);e.beforeLock(()=>{e.tables['員工資料表'].rows[1][kind==='role'?6:kind==='status'?9:1]=kind==='role'?'EMPLOYEE':kind==='status'?'停職':'changed';});
    const r=call(e,reads[2]);assert.equal(r.success,false);assert(!r._gasReadDiagnostics);assert.equal(e.locked,false);assert.equal(e.writes,0);assert.deepEqual(e.logs,[]);
  }
});
test('lock unavailable remains UNKNOWN with neither write permission',()=>{
  const r=equivalent(reads[2],e=>{e.ctx.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock:()=>assert.fail('unowned')});});
  assert.equal(r.requestStatus,'UNKNOWN');assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);
});
for(const checkpoint of ['none','start','employment','both','complete'])test('V46 v3 status equality '+checkpoint,()=>{
  const r=equivalent(reads[2],e=>{const p={...statusInput,expectedSnapshotVersion:e.call(reads[1],{employeeId:'EMP001'},'owner').snapshotVersion,reason:'歷史假資料'};seedV3(e,p,checkpoint);});
  assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);
});
test('V46 corrupted historical receipt remains RECOVERY_REQUIRED/CONFLICT',()=>{
  const r=equivalent(reads[2],e=>{seedV3(e,{...statusInput,expectedSnapshotVersion:e.call(reads[1],{employeeId:'EMP001'},'owner').snapshotVersion,reason:'歷史'},'complete');e.tables['員工任職紀錄'].rows[1][7]='changed';});
  assert.equal(r.currentConsistency,'CONFLICT');assert.equal(r.newRequestAllowed,false);
});
for(const flag of ['true','false',null])for(const state of ['ABSENT','ARMED','CLAIMED','CLOSED'])test('read flag/control independence '+flag+' '+state,()=>{
  const e=makeEnv();if(flag!==null)e.props.set('READ_DIAGNOSTICS_ENABLED',flag);
  const p=e.input();if(state!=='ABSENT'){e.prepare(p);if(state==='CLAIMED'){e.fail('員工異動紀錄');e.migrate(p);}if(state==='CLOSED')e.ctx.employeeBaselineControlClose_(p.requestId,'close-offline-0001');}
  const before=JSON.stringify([...e.props]),tables=JSON.stringify(e.tables),writes=e.writes;
  for(const name of ['employeeBaselineControlPrepare_','employeeBaselineClaim_','employeeBaselineControlClose_'])e.ctx[name]=()=>assert.fail('read reached '+name);
  e.ctx.SpreadsheetApp.flush=()=>assert.fail('read flush');
  for(const action of reads){const r=call(e,action);assert.equal(r.success,true);assert.equal(Boolean(r._gasReadDiagnostics),flag==='true');}
  assert.equal(JSON.stringify([...e.props]),before);assert.equal(JSON.stringify(e.tables),tables);assert.equal(e.writes,writes);assert.equal(e.locked,false);
});
for(const flag of ['true','false',null])test('diagnostics flag never authorizes permit-absent migration '+flag,()=>{
  const e=makeEnv();if(flag!==null)e.props.set('READ_DIAGNOSTICS_ENABLED',flag);
  const p=e.input(),before=JSON.stringify([...e.props]);assert.equal(e.migrate(p).code,'CONTROLLED_MIGRATION_DENIED');assert.equal(e.writes,0);assert.equal(JSON.stringify([...e.props]),before);
});
for(const flag of ['true','false',null])test('metadata on even authorized migration is rejected before verification '+flag,()=>{
  const e=makeEnv();if(flag!==null)e.props.set('READ_DIAGNOSTICS_ENABLED',flag);const p=e.input();e.prepare(p);
  const before=JSON.stringify([...e.props]),v=e.verifies;
  const r=e.migrate({...p,_transportDiagnostics:meta});assert.equal(r.code,'VALIDATION_ERROR');assert.equal(e.verifies,v);assert.equal(e.writes,0);assert.equal(JSON.stringify([...e.props]),before);assert(!r._gasReadDiagnostics);
});
test('editor helper names cannot be dispatched, no property/Sheet writes',()=>{
  const e=makeEnv();for(const action of ['employeeBaselineControlPrepare_','employeeBaselineClaim_','employeeBaselineControlClose_']){
    assert(!e.ctx.EMPLOYEE_ACTIONS_.includes(action));assert.equal(e.call(action,{},e.actor).success,false);
  }assert.equal(e.writes,0);assert.equal(e.props.has(controlKey),false);
});
test('v4 receipts use preserved T4 reader; diagnostics add only metadata',()=>{
  const e=makeEnv(),p=e.input();e.prepare(p);assert.equal(e.migrate(p).success,true);e.props.set('READ_DIAGNOSTICS_ENABLED','true');
  const before=JSON.stringify(e.tables),w=e.writes,r=call(e,reads[2],{requestId:p.requestId});assert.equal(r.requestStatus,'COMPLETED');assert(r._gasReadDiagnostics);
  const diagnostic=r._gasReadDiagnostics;delete r._gasReadDiagnostics;
  vm.runInContext(fs.readFileSync(path.join(root,'../gas-t4-read-diagnostics/evidence/t4/EmployeeLifecycleBaseline.gs'),'utf8'),e.ctx);
  assert.deepEqual(r,plain(e.status(p)));assert.equal(diagnostic.transportTraceId,trace);assert.equal(e.writes,w);assert.equal(JSON.stringify(e.tables),before);
});
test('editor integrity is existence-only, safe and has no dispatcher action',()=>{
  const e=env(),before=JSON.stringify(e.tables);e.ctx.UrlFetchApp.fetch=()=>assert.fail('network');
  const r=e.ctx.employeeProjectIntegrityCheck();assert.equal(r.success,true);assert.equal(r.checked,14);assert.equal(r.missingCount,0);
  assert.equal(JSON.stringify(e.tables),before);assert.equal(e.writes,0);assert(!e.ctx.EMPLOYEE_ACTIONS_.includes('employeeProjectIntegrityCheck'));
});

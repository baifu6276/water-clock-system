// New safety tests. All properties/Sheets are fake; no deployer/API is imported.
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {makeEnv}=require('./foundation-fixture.cjs');
const {makeEnv:oldEnv}=require('../../gas-t4-read-diagnostics/tests/foundation-fixture.cjs');
const key='T4_EMP001_BASELINE_CONTROL',plain=x=>JSON.parse(JSON.stringify(x));
function controlFixture(){
  const e=makeEnv();e.flushes=0;e.lockAttempts=[];e.releases=0;e.propertyWrites=0;
  e.ctx.SpreadsheetApp.flush=()=>{e.flushes++;throw Error('MAINTENANCE_FLUSH_FORBIDDEN');};
  const getLock=e.ctx.LockService.getScriptLock;
  e.ctx.LockService.getScriptLock=()=>{const lock=getLock();return {...lock,tryLock:ms=>{e.lockAttempts.push(ms);return lock.tryLock(ms);},releaseLock:()=>{e.releases++;return lock.releaseLock();}};};
  const getStore=e.ctx.PropertiesService.getScriptProperties;
  e.ctx.PropertiesService.getScriptProperties=()=>{const store=getStore();return {...store,setProperty:(k,v)=>{assert.equal(e.locked,true);assert.equal(k,key);e.propertyWrites++;return store.setProperty(k,v);}};};
  e.ctx.employeeWithLock_=()=>assert.fail('maintenance reached Sheet-write lock helper');
  e.safe=()=>{assert.equal(e.flushes,0);assert.equal(e.writes,0);assert.equal(e.locked,false);assert.deepEqual(e.logs,[]);};
  return e;
}
test('Prepare ABSENT -> ARMED under 5000ms ScriptLock; zero Sheet writes/flush',()=>{
  const e=controlFixture(),p=e.input(),before=JSON.stringify(e.tables),r=e.prepare(p);
  assert.equal(r.state,'ARMED');assert.equal(e.propertyWrites,1);assert.deepEqual(e.lockAttempts,[5000]);assert.equal(e.releases,1);assert.equal(JSON.stringify(e.tables),before);e.safe();
});
test('Close preserves ledger/evidence and only removes authority; zero Sheet writes/flush',()=>{
  const e=controlFixture(),p=e.input();e.prepare(p);const old=JSON.parse(e.props.get(key)),before=JSON.stringify(e.tables);
  const r=e.ctx.employeeBaselineControlClose_(p.requestId,'close-offline-0001'),now=JSON.parse(e.props.get(key));
  assert.equal(r.state,'CLOSED');assert.deepEqual(now.history.slice(0,-1),old.history);assert.equal(now.history.length,old.history.length+1);assert.equal(now.requestId,p.requestId);
  for(const name of Object.keys(old))if(!['state','approvalReference','history'].includes(name))assert.deepEqual(now[name],old[name]);
  assert.equal(e.releases,2);assert.deepEqual(e.lockAttempts,[5000,5000]);assert.equal(JSON.stringify(e.tables),before);e.safe();
});
for(const action of ['prepare','close'])test(action+' BUSY preserves property and has same BUSY contract',()=>{
  const e=controlFixture(),p=e.input();if(action==='close')e.prepare(p);const before=JSON.stringify([...e.props]);let timeout;
  e.ctx.LockService.getScriptLock=()=>({tryLock:ms=>{timeout=ms;return false;},releaseLock:()=>assert.fail('unowned lock')});
  assert.throws(()=>action==='prepare'?e.prepare(p):e.ctx.employeeBaselineControlClose_(p.requestId,'close-offline-0001'),err=>err.employeeCode==='BUSY'&&err.message==='目前忙碌中，請稍後重試。');
  assert.equal(timeout,5000);assert.equal(JSON.stringify([...e.props]),before);e.safe();
});
test('work callback return identity/errors are preserved and finally releases exactly once',()=>{
  const e=controlFixture(),value={safe:true},error=Error('OFFLINE_WORK_ERROR');
  assert.equal(e.ctx.employeeBaselineControlWithLock_(()=>value),value);assert.equal(e.releases,1);
  assert.throws(()=>e.ctx.employeeBaselineControlWithLock_(()=>{throw error;}),err=>err===error);assert.equal(e.releases,2);e.safe();
});
for(const action of ['prepare','close'])for(const when of ['before-release','after-release'])test(action+' releaseLock failure '+when+' is AMBIGUOUS; durable evidence retained',()=>{
  const e=controlFixture(),p=e.input();if(action==='close')e.prepare(p);
  const previous=e.props.get(key),get=e.ctx.LockService.getScriptLock,sentinel=Error('OFFLINE_RELEASE_FAILURE');
  e.ctx.LockService.getScriptLock=()=>{const lock=get();return {...lock,releaseLock:()=>{if(when==='after-release')lock.releaseLock();throw sentinel;}};};
  assert.throws(()=>action==='prepare'?e.prepare(p):e.ctx.employeeBaselineControlClose_(p.requestId,'close-offline-0001'),err=>err===sentinel);
  // This local test classification is not a new API response or automatic recovery.
  const evidence={outcome:'AMBIGUOUS',control:JSON.parse(e.props.get(key))};
  assert.equal(evidence.outcome,'AMBIGUOUS');assert.equal(evidence.control.state,action==='prepare'?'ARMED':'CLOSED');
  if(previous)assert.deepEqual(evidence.control.history.slice(0,-1),JSON.parse(previous).history);
  assert.equal(e.writes,0);assert.equal(e.flushes,0);assert.equal(e.locked,when==='before-release');
});
for(const action of ['prepare','close'])for(const point of ['before','after','readback'])test(action+' property '+point+' failure propagates and preserves possible effect',()=>{
  const e=controlFixture(),p=e.input();if(action==='close')e.prepare(p);const before=e.props.get(key);
  if(point==='readback'){const get=e.ctx.PropertiesService.getScriptProperties;e.ctx.PropertiesService.getScriptProperties=()=>({...get(),setProperty:()=>{}});}else e.propFailure=point;
  assert.throws(()=>action==='prepare'?e.prepare(p):e.ctx.employeeBaselineControlClose_(p.requestId,'close-offline-0001'));
  if(point==='after')assert.equal(JSON.parse(e.props.get(key)).state,action==='prepare'?'ARMED':'CLOSED');else assert.equal(e.props.get(key),before);e.safe();
});
test('duplicate Prepare fixed request never overwrites existing ARMED',()=>{
  const e=controlFixture(),p=e.input('c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab');e.prepare(p);const before=e.props.get(key),n=e.propertyWrites;
  assert.throws(()=>e.prepare(p));assert.equal(e.props.get(key),before);assert.equal(e.propertyWrites,n);e.safe();
});
test('both editor helpers/private lock have no dispatcher exposure',()=>{
  const e=makeEnv();for(const n of ['employeeBaselineControlWithLock_','employeeBaselineControlPrepare_','employeeBaselineControlClose_']){
    assert(!e.ctx.EMPLOYEE_ACTIONS_.includes(n));assert.equal(e.call(n,{},'owner').success,false);
  }assert.equal(e.writes,0);assert.equal(e.props.has(key),false);
});
// Differential execution against the exact old candidate. Compare event order,
// results, and entire mock data/property images; do not compare simulated latency.
function migration(factory,scenario){
  const e=factory();vm.runInContext("Date=class extends Date { constructor(...a){super(...(a.length?a:[1790380800000]));} static now(){return 1790380800000;} };",e.ctx);
  let uuid=0;e.ctx.Utilities.getUuid=()=>('00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0'));
  const p=e.input('migration-differential-0001');e.prepare(p);const events=[];
  const shared=e.ctx.employeeWithLock_;e.ctx.employeeWithLock_=work=>{events.push('migration-write-lock');return shared(work);};
  e.ctx.employeeBaselineControlWithLock_=()=>assert.fail('migration reached maintenance lock');
  const getLock=e.ctx.LockService.getScriptLock;e.ctx.LockService.getScriptLock=()=>{const l=getLock();return {...l,tryLock:ms=>{events.push('lock:'+ms);return l.tryLock(ms);},releaseLock:()=>{events.push('release');return l.releaseLock();}};};
  const claim=e.ctx.employeeBaselineClaim_;e.ctx.employeeBaselineClaim_=(...args)=>{assert(e.locked);events.push('claim:start');const r=claim(...args);events.push('claim:readback');return r;};
  const getStore=e.ctx.PropertiesService.getScriptProperties;e.ctx.PropertiesService.getScriptProperties=()=>{const store=getStore();return {...store,setProperty:(k,v)=>{assert(e.locked);assert.equal(k,key);events.push('property:'+JSON.parse(v).state);return store.setProperty(k,v);}};};
  for(const[name,sheet]of Object.entries(e.tables)){const range=sheet.getRange;sheet.getRange=(...args)=>{const r=range(...args);return {...r,setValues:values=>{events.push('sheet:'+name);return r.setValues(values);}};};}
  const flush=e.ctx.SpreadsheetApp.flush;e.ctx.SpreadsheetApp.flush=()=>{assert(e.locked);events.push('flush');return flush();};
  if(scenario.table)e.fail(scenario.table,scenario.n,scenario.persisted);
  if(scenario.property)e.propFailure=scenario.property;
  if(scenario.flush)e.flushFailure=true;
  const r=e.migrate(p);assert.equal(e.locked,false);assert.deepEqual(e.logs,[]);
  // Existing migration flushes after each completed Sheet checkpoint AND in
  // employeeWithLock_ finally. A throwing setValues does not reach its flush.
  const checkpoints={'員工異動紀錄/0':0,'員工任職紀錄/0':1,'員工LINE綁定紀錄/0':2,'員工異動紀錄/1':3};
  const expectedFlushes=scenario.property?1:scenario.flush?2:scenario.table?checkpoints[scenario.table+'/'+scenario.n]+1:5;
  assert.equal(events.filter(x=>x==='flush').length,expectedFlushes);assert.equal(events.at(-1),'release');
  assert.equal(events.at(-2),'flush'); // Shared write-lock finally still flushes.
  if(!Object.keys(scenario).length)assert.deepEqual(events,[
    'migration-write-lock','lock:5000','claim:start','property:CLAIMED','claim:readback',
    'sheet:員工異動紀錄','flush','sheet:員工任職紀錄','flush',
    'sheet:員工LINE綁定紀錄','flush','sheet:員工異動紀錄','flush','flush','release'
  ]);
  const firstSheet=events.findIndex(x=>x.startsWith('sheet:'));if(firstSheet>=0)assert(events.indexOf('claim:readback')<firstSheet);
  return {result:plain(r),events,tables:plain(e.tables),property:e.props.get(key),writes:e.writes};
}
const scenarios=[['success',{}],...['before','after'].map(property=>['claim-property-'+property,{property}]),['flush-failure',{flush:true}]];
for(const[table,n]of [['員工異動紀錄',0],['員工任職紀錄',0],['員工LINE綁定紀錄',0],['員工異動紀錄',1]])for(const persisted of [false,true])scenarios.push([table+'/'+n+'/'+persisted,{table,n,persisted}]);
for(const[name,scenario]of scenarios)test('migration differential: original checkpoint/flush behavior '+name,()=>{
  assert.deepEqual(migration(makeEnv,scenario),migration(oldEnv,scenario));
});

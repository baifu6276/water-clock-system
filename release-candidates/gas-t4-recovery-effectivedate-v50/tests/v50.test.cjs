const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {fixture,partial,load,plain,evidence,statusEquals,KEY,REQUEST,REASON,CLAIMED,STARTED,v49,v50}=require('./fixture.cjs');
const {trace}=require('./predicate-trace.cjs');
const image=e=>JSON.stringify(e.tables),properties=e=>JSON.stringify([...e.props]);
function unchanged(e,b){assert.equal(image(e),b[0]);assert.equal(properties(e),b[1]);assert.equal(e.writes,b[2]);e.safe();}
function before(e){return [image(e),properties(e),e.writes];}
function mutateIntent(e,work){const b=JSON.parse(e.rows('audit')[0].afterJson);work(b);e.cell('audit','afterJson',JSON.stringify(b));}
function reject(damage){const f=partial(50),{e,p}=f;damage(e,p);const b=before(e),r=evidence(e,p);
 assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.currentConsistency,'CONFLICT');assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);
 assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,b);
}
function recovered(){const f=partial(50),{e,p}=f;e.setClock('2026-09-27T08:00:00.000Z');e.prepare(p,'RECOVER_ORIGINAL');assert.equal(e.migrate(p).success,true);e.roundTrip();return f;}

for(const version of [48,49,50])test('faithful DATE/numeric-channel differential V'+version,()=>{
 const {e,p}=partial(version),b=before(e),flush=e.flushes;
 statusEquals(e.status(p),version===50?'STARTED':'RECOVERY_REQUIRED',version===50?false:null,version===50?'MATCHED':'CONFLICT');
 assert.equal(e.flushes,flush);unchanged(e,b);
});

test('V50 predicate trace rejects nothing for the approved observed-shaped state',()=>{
 const {e,p,state,intent,bundle}=partial(50),r=trace(e,v50,state,intent,bundle,p);
 statusEquals(r.status,'STARTED',false,'MATCHED');assert.equal(r.normallyReachedInspect,true);assert.equal(r.firstReject,null);
 assert(!r.normalTrace.some(x=>x.result==='EVALUATION_ERROR'));e.safe();
});

test('full RECOVER_ORIGINAL gen2: original operation, one COMPLETED, both DATE cells round-trip',()=>{
 const {e,p}=partial(50),initialControl=e.control(),master=JSON.stringify(e.tables['員工資料表'].rows);
 const periods=JSON.stringify(e.rows('employments')),bindings=JSON.stringify(e.rows('bindings')),started=e.rows('audit')[0];
 const operation=JSON.stringify(p),w=e.writes,flush=e.flushes;
 statusEquals(e.status(p),'STARTED',false,'MATCHED');assert.equal(e.migrate(p).code,'RECOVERY_APPROVAL_REQUIRED');assert.equal(e.writes,w);
 e.setClock('2026-09-27T08:00:00.000Z');const result=e.prepare(p,'RECOVER_ORIGINAL');
 assert.equal(result.state,'ARMED');assert.equal(result.generation,2);assert.equal(e.writes,w);
 // migrate denial retains the existing generic finally-flush; Prepare itself must never flush.
 const afterPrepareFlush=e.flushes;e.prepareCalled=true;
 assert.deepEqual(e.control().history.slice(0,2),initialControl.history);
 for(const k of ['employeeId','operatorId','operatorRole','requestId','requestHash','snapshotVersion'])assert.equal(e.control()[k],initialControl[k]);
 const calls=[],inspect=e.ctx.employeeBaselineInspect_;e.ctx.employeeBaselineInspect_=(...a)=>{const x=inspect(...a);calls.push(plain(x));return x;};
 e.events.length=0;const migrated=e.migrate(p);assert.equal(migrated.success,true);assert.equal(migrated.baselineState,'RECORDED');
 assert.equal(JSON.stringify(p),operation);assert.equal(p.requestId,REQUEST);assert.equal(p.reason,REASON);
 assert.equal(e.control().state,'CLAIMED');assert.equal(e.control().mode,'RECOVER_ORIGINAL');assert.equal(e.control().generation,2);
 assert.equal(e.control().requestHash,started.requestHash);assert(calls.every(c=>c.employmentDone&&c.bindingDone));
 assert.deepEqual(e.events.filter(x=>x.startsWith('sheet:')),['sheet:員工異動紀錄']);
 assert(e.events.indexOf('permit:RECOVER_ORIGINAL:CLAIMED:2')<e.events.indexOf('sheet:員工異動紀錄'));
 e.roundTrip();const logs=e.rows('audit');assert.equal(logs.length,2);assert.deepEqual(logs[0],started);
 assert.equal(logs[1].phase,'COMPLETED');assert.notEqual(logs[1].operatedAt,logs[1].effectiveAt);
 assert.equal(logs[1].effectiveDate,'2026-09-26T16:00:00.000Z');assert.equal(logs[0].effectiveDate,logs[1].effectiveDate);
 for(const row of e.tables['員工異動紀錄'].rows.slice(1)){e.ctx.__testDate=row[e.ctx.EMPLOYEE_TABLES_.audit.index.effectiveDate];assert(vm.runInContext('__testDate instanceof Date',e.ctx));}delete e.ctx.__testDate;
 assert.equal(e.writes-w,1);assert.equal(JSON.stringify(e.rows('employments')),periods);assert.equal(JSON.stringify(e.rows('bindings')),bindings);assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);
 for(const k of Object.keys(started))if(!['auditId','phase','operatedAt'].includes(k))assert.deepEqual(logs[1][k],started[k]);
 const b=before(e);statusEquals(e.status(p),'COMPLETED',true,'MATCHED');unchanged(e,b);
 assert.equal(e.migrate(p).success,true);unchanged(e,b);assert.equal(e.rows('audit').length,2);
});

const allowedDates=['2026-09-27','2026-09-26T16:00:00.000Z','2024-02-29','2024-02-28T16:00:00.000Z'];
for(const date of allowedDates)test('narrow date image accepts canonical value '+date,()=>{
 const e=fixture(50),expected=date.includes('T')?new Date(Date.parse(date)+28800000).toISOString().slice(0,10):date;
 assert.equal(e.ctx.employeeBaselineAuditDate_(date),expected);e.safe();
});
const malformedDates=['',' 2026-09-27','2026-09-27 ','2026/09/27','2026-9-27','2026-02-30','2025-02-29','2026-09-26T16:00:00Z',
 '2026-09-26T16:00:00.001Z','2026-09-26T16:00:01.000Z','2026-09-26T15:59:59.999Z','2026-09-27T00:00:00.000Z','2026-09-27T04:00:00.000Z',
 '2026-09-27T00:00:00.000+08:00','2026-09-26t16:00:00.000z','2026-02-30T16:00:00.000Z','2026-09-26T24:00:00.000Z','2026-09-26T16:00:60.000Z',
 '2026-09-26T16:00:00.000Z ',null,undefined,true,46292,{},[],new Date('2026-09-26T16:00:00.000Z')];
malformedDates.forEach((v,i)=>test('strict audit-date image rejects variant '+i,()=>{
 const e=fixture(50);assert.equal(e.ctx.employeeBaselineAuditDate_(v),'');e.safe();
}));
for(const [i,v] of ['2026-09-28','2026-09-27T16:00:00.000Z',...malformedDates.filter(x=>!(x instanceof Date))].entries())test('effectiveDate drift rejects end-to-end '+i,()=>reject(e=>e.cell('audit','effectiveDate',v)));

const drifts={
 startedOperatedAt:e=>e.cell('audit','operatedAt','2026-09-27T07:56:39.143Z'),
 startedOperatedAtInvalid:e=>e.cell('audit','operatedAt','not-a-date'),
 effectiveAt:e=>e.cell('audit','effectiveAt','2026-09-27T07:56:39.143Z'),
 createdAt:e=>mutateIntent(e,b=>b.employment.createdAt='2026-09-27T07:56:39.143Z'),
 requestHash:e=>e.cell('audit','requestHash','0'.repeat(64)),
 snapshot:e=>mutateIntent(e,b=>b.snapshotVersion='0'.repeat(64)),
 beforeMaster:e=>{const b=JSON.parse(e.rows('audit')[0].beforeJson);b.master[5]=2300;e.cell('audit','beforeJson',JSON.stringify(b));},
 employmentId:e=>e.cell('employments','employmentId','changed'),
 employmentGrade:e=>e.cell('employments','grade','領班'),
 employmentSalary:e=>e.cell('employments','salaryAmount',2300),
 bindingId:e=>e.cell('bindings','bindingId','changed'),
 lineSub:e=>e.cell('bindings','lineSub','OFFLINE_DIFFERENT_SUB'),
 numericChannel:e=>e.cell('bindings','channelId',2011467619),
 stringChannel:e=>e.cell('bindings','channelId','2011467619'),
 leadingZeroChannel:e=>e.cell('bindings','channelId','02011467618'),
 bindingOperatedAt:e=>e.cell('bindings','operatedAt','2026-09-27T07:56:39.143Z'),
 duplicateEmployment:e=>e.tables['員工任職紀錄'].rows.push([...e.tables['員工任職紀錄'].rows[1]]),
 duplicateBinding:e=>e.tables['員工LINE綁定紀錄'].rows.push([...e.tables['員工LINE綁定紀錄'].rows[1]]),
 secondStarted:e=>e.tables['員工異動紀錄'].rows.push([...e.tables['員工異動紀錄'].rows[1]]),
 malformedCompleted:e=>{const a=[...e.tables['員工異動紀錄'].rows[1]];a[15]='COMPLETED';e.tables['員工異動紀錄'].rows.push(a);},
 extraReceipt:e=>{const a=[...e.tables['員工異動紀錄'].rows[1]];a[0]='extra-audit';a[15]='UNKNOWN';e.tables['員工異動紀錄'].rows.push(a);},
 action:e=>e.cell('audit','action','OTHER'),
 sourceType:e=>e.cell('bindings','sourceType','OTHER'),
 bindingVersion:e=>e.cell('bindings','version','1'),
 employmentVersion:e=>e.cell('employments','version',2),
 auditVersion:e=>e.cell('audit','afterVersion',2),
 unrelatedAudit:e=>{const a=[...e.tables['員工異動紀錄'].rows[1]];a[0]='other-audit';a[1]='other-request-0001';e.tables['員工異動紀錄'].rows.push(a);},
 changedMaster:e=>e.tables['員工資料表'].rows[1][5]=2300,
 missingEmployment:e=>e.tables['員工任職紀錄'].rows.splice(1)
};
for(const [name,damage]of Object.entries(drifts))test('fail closed '+name,()=>reject(damage));
for(const kind of ['history','generation','mode'])test('invalid permit '+kind+' still denies',()=>{
 const {e,p}=partial(50),c=e.control();if(kind==='history')c.history[0].state='CLAIMED';if(kind==='generation')c.generation=0;if(kind==='mode')c.mode='OTHER';
 e.props.set(KEY,JSON.stringify(c));const b=before(e);assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,b);
});
for(const field of ['requestId','expectedSnapshotVersion','reason'])test('original operation must retain '+field,()=>{
 const {e,p}=partial(50);e.prepare(p,'RECOVER_ORIGINAL');const changed={...p,[field]:field==='expectedSnapshotVersion'?'0'.repeat(64):'changed-request-value'},b=before(e);
 assert.equal(e.migrate(changed).success,false);unchanged(e,b);
});

test('missing binding remains PARTIAL and requires separate approval before filling',()=>{
 const {e,p}=partial(50);e.tables['員工LINE綁定紀錄'].rows.splice(1);statusEquals(e.status(p),'STARTED',false,'PARTIAL');
 const b=before(e);assert.equal(e.migrate(p).code,'RECOVERY_APPROVAL_REQUIRED');unchanged(e,b);
 e.prepare(p,'RECOVER_ORIGINAL');e.events.length=0;assert.equal(e.migrate(p).success,true);e.roundTrip();
 assert.deepEqual(e.events.filter(x=>x.startsWith('sheet:')),['sheet:員工LINE綁定紀錄','sheet:員工異動紀錄']);
 assert.equal(e.rows('employments').length,1);assert.equal(e.rows('bindings').length,1);statusEquals(e.status(p),'COMPLETED',true,'MATCHED');e.safe();
});

test('fresh INITIAL with faithful DATE/channel round-trip preserves order and ends COMPLETED',()=>{
 const e=fixture(50),p=e.input(),master=JSON.stringify(e.tables['員工資料表'].rows);assert.equal(e.preview().baselineState,'LEGACY_NOT_BASELINED');
 e.prepare(p,'INITIAL');assert.equal(e.control().state,'ARMED');assert.equal(e.control().generation,1);e.setClock(CLAIMED);e.events.length=0;
 const r=e.migrate(p);assert.equal(r.success,true);assert.equal(r.baselineState,'RECORDED');
 assert.deepEqual(e.events.filter(x=>x.startsWith('sheet:')),['sheet:員工異動紀錄','sheet:員工任職紀錄','sheet:員工LINE綁定紀錄','sheet:員工異動紀錄']);
 assert(e.events.indexOf('permit:INITIAL:CLAIMED:1')<e.events.indexOf('sheet:員工異動紀錄'));e.roundTrip();
 statusEquals(e.status(p),'COMPLETED',true,'MATCHED');assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);assert.equal(e.rows('employments')[0].startDate,'');e.safe();
});
for(const time of ['2026-09-27T07:56:38.142Z','invalid'])test('COMPLETED operatedAt invalid/earlier still rejects '+time,()=>{
 const {e,p}=recovered(),s=e.ctx.EMPLOYEE_TABLES_.audit;e.tables[s.name].rows[2][s.index.operatedAt]=time;
 const r=e.status(p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.currentConsistency,'CONFLICT');e.safe();
});
for(const kind of ['effectiveAt','effectiveDate','requestHash','extra'])test('COMPLETED receipt drift remains strict '+kind,()=>{
 const {e,p}=recovered(),s=e.ctx.EMPLOYEE_TABLES_.audit,rows=e.tables[s.name].rows;
 if(kind==='extra')rows.push([...rows[2]]);else rows[2][s.index[kind]]=kind==='requestHash'?'0'.repeat(64):kind==='effectiveDate'?'2026-09-28':'2026-09-27T08:00:01.000Z';
 const r=e.status(p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.currentConsistency,'CONFLICT');e.safe();
});

test('v3 effectiveDate/time behavior remains identical to V49 (no new gate)',()=>{
 // Exercise a pure status receipt produced by the existing v3 fixture, independent of T4 permit API.
 const {env}=require(process.env.V48_SERVICE_FIXTURE),{seedV3}=require(require('node:path').join(require('node:path').dirname(process.env.V48_SERVICE_FIXTURE),'v3-data.cjs'));
 for(const alteredTime of [false,true])for(const dateRoundTrip of [false,true]){
  const e=env();e.tables['員工資料表'].rows[1]=['EMP001','owner','測試','師傅','日薪',2200,'ADMIN','','','在職','',''];
  const p={employeeId:'EMP001',requestId:'offline-v3-date-0001',expectedSnapshotVersion:e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},'owner').snapshotVersion,reason:'離線'};seedV3(e,p,'both');
  const s=e.ctx.EMPLOYEE_TABLES_.audit,row=e.tables[s.name].rows[1];if(alteredTime)row[s.index.operatedAt]='2026-09-27T08:00:00.000Z';if(dateRoundTrip)row[s.index.effectiveDate]='2026-09-26T16:00:00.000Z';
  load(e,49);const old=plain(e.call('employeeLifecycleBaselineRequestStatus',{employeeId:'EMP001',requestId:p.requestId},'owner'));
  load(e,50);assert.deepEqual(plain(e.call('employeeLifecycleBaselineRequestStatus',{employeeId:'EMP001',requestId:p.requestId},'owner')),old);assert.equal(e.writes,0);
 }
});

test('wrong audit operator is denied by outer identity boundary, no disclosure/write',()=>{
 const {e,p}=partial(50);e.cell('audit','operatorId','EMP_OTHER');const b=before(e);
 statusEquals(e.status(p),'NOT_OBSERVED',false,'UNKNOWN');assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));
 assert.equal(e.migrate(p).code,'REQUEST_CONFLICT');unchanged(e,b);
});

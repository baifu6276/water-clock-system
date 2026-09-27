const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,partial,patch,evidence,statusEquals,plain,KEY,SUB,CHANNEL,REQUEST,REASON,OBSERVED,STARTED,CLAIMED}=require('./recovery-fixture.cjs');
const snapshot=e=>JSON.stringify(e.tables),props=e=>JSON.stringify([...e.props]);
function unchanged(e,t,p,w){assert.equal(snapshot(e),t);assert.equal(props(e),p);assert.equal(e.writes,w);e.safe();}

test('mandatory V48 -> V49 differential on identical observed-shape partial state',()=>{
 const {e,p,master}=partial(),data=snapshot(e),property=props(e),w=e.writes,flushes=e.flushes;
 statusEquals(e.status(p),'RECOVERY_REQUIRED',false,'CONFLICT');unchanged(e,data,property,w);
 assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));unchanged(e,data,property,w);
 patch(e);statusEquals(e.status(p),'STARTED',false,'MATCHED');unchanged(e,data,property,w);
 assert.equal(e.flushes,flushes);assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);
 assert.equal(e.migrate(p).code,'RECOVERY_APPROVAL_REQUIRED');unchanged(e,data,property,w);
});

test('full RECOVER_ORIGINAL generation 2 only appends one COMPLETED; no duplicate rows/master writes',()=>{
 const {e,p,master}=partial();patch(e);statusEquals(e.status(p),'STARTED',false,'MATCHED');
 const operation=JSON.stringify(p),beforeControl=e.control(),beforeEmployment=JSON.stringify(e.rows('employments')),beforeBinding=JSON.stringify(e.rows('bindings'));
 const beforeAudit=e.rows('audit'),writes=e.writes,flushes=e.flushes;
 e.setClock('2026-09-27T08:00:00.000Z');const prepared=e.prepare(p,'RECOVER_ORIGINAL');
 assert.equal(prepared.state,'ARMED');assert.equal(prepared.generation,2);assert.equal(e.writes,writes);assert.equal(e.flushes,flushes);
 const armed=e.control();assert.equal(armed.mode,'RECOVER_ORIGINAL');assert.equal(armed.state,'ARMED');assert.equal(armed.generation,2);
 assert.deepEqual(armed.history.slice(0,2),beforeControl.history);
 for(const k of ['employeeId','operatorId','operatorRole','requestId','requestHash','snapshotVersion'])assert.equal(armed[k],beforeControl[k]);
 const checks=[],original=e.ctx.employeeBaselineInspect_;
 e.ctx.employeeBaselineInspect_=(...args)=>{const result=original(...args);checks.push(plain(result));return result;};
 e.events.length=0;const result=e.migrate(p);
 assert.equal(result.success,true);assert.equal(result.baselineState,'RECORDED');assert.equal(result.requestId,REQUEST);
 assert.equal(JSON.stringify(p),operation);assert.equal(p.reason,REASON);assert.equal(p.confirmed,true);
 assert(checks.length>=3);assert(checks.every(c=>c.employmentDone&&c.bindingDone));
 assert.equal(e.control().generation,2);assert.equal(e.control().mode,'RECOVER_ORIGINAL');assert.equal(e.control().state,'CLAIMED');
 assert.deepEqual(e.control().history.slice(0,2),beforeControl.history);assert.equal(e.control().history.length,4);
 assert.deepEqual(e.events.filter(s=>s.startsWith('sheet:')),['sheet:員工異動紀錄']);
 assert(e.events.indexOf('permit:RECOVER_ORIGINAL:CLAIMED:2')<e.events.indexOf('sheet:員工異動紀錄'));
 assert.equal(e.writes-writes,1);assert.equal(JSON.stringify(e.rows('employments')),beforeEmployment);assert.equal(JSON.stringify(e.rows('bindings')),beforeBinding);
 assert.equal(e.rows('employments').length,1);assert.equal(e.rows('bindings').length,1);assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);
 const logs=e.rows('audit');assert.equal(logs.length,2);assert.deepEqual(logs[0],beforeAudit[0]);assert.equal(logs[1].phase,'COMPLETED');
 for(const k of Object.keys(logs[0]))if(!['auditId','phase','operatedAt'].includes(k))assert.deepEqual(logs[1][k],logs[0][k]);
 const finalData=snapshot(e),finalProps=props(e),finalWrites=e.writes;statusEquals(e.status(p),'COMPLETED',true,'MATCHED');unchanged(e,finalData,finalProps,finalWrites);
 // Explicit offline replay check; there is no automatic retry in runtime.
 assert.equal(e.migrate(p).success,true);unchanged(e,finalData,finalProps,finalWrites);
});

test('comparison image is pure and generic comparison remains strict',()=>{
 const {e}=partial();patch(e);const intended=JSON.parse(e.rows('audit')[0].afterJson).binding,persisted=e.rows('bindings')[0];
 assert.equal(e.ctx.employeeReviewSame_(persisted,intended),false);
 const original=JSON.stringify([persisted,intended]);Object.freeze(persisted);Object.freeze(intended);
 assert.equal(e.ctx.employeeReviewSame_(e.ctx.employeeBaselineBindingImage_(persisted),e.ctx.employeeBaselineBindingImage_(intended)),true);
 assert.equal(JSON.stringify([persisted,intended]),original);
 for(const k of Object.keys(persisted))if(k!=='channelId')assert.strictEqual(e.ctx.employeeBaselineBindingImage_(persisted)[k],persisted[k]);
});

const channelValues=[2011467619,'2011467619','02011467618',' 2011467618','2011467618 ','+2011467618','2.011467618e9',2011467618.5,0,-1,NaN,Infinity,null,undefined,true,{},[],Number.MAX_SAFE_INTEGER+1];
channelValues.forEach((value,i)=>test('fail closed channel variant '+i,()=>{
 const {e,p}=partial();patch(e);e.cell('bindings','channelId',value);
 statusEquals(evidence(e,p),'RECOVERY_REQUIRED',false,'CONFLICT');
 const t=snapshot(e),pr=props(e),w=e.writes;assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,t,pr,w);
}));
const wrongFields={bindingId:'wrong-id',employeeId:'EMP_OTHER',lineSub:'OFFLINE_CHANGED_SUB',version:'1',validFrom:'2026-09-27T07:56:38.144Z',validTo:'2026-09-28T00:00:00.000Z',operatedAt:'2026-09-27T07:56:38.144Z',status:'失效',reason:'changed reason',operatorId:'EMP_OTHER',sourceType:'APPLICATION_APPROVAL',applicationId:'unexpected-app',previousBindingId:'unexpected-prior'};
for(const [key,value]of Object.entries(wrongFields))test('fail closed binding field '+key,()=>{
 const {e,p}=partial();patch(e);e.cell('bindings',key,value);statusEquals(evidence(e,p),'RECOVERY_REQUIRED',false,'CONFLICT');
 const t=snapshot(e),pr=props(e),w=e.writes;assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,t,pr,w);
});
for(const side of ['persisted','intended'])for(const kind of ['extra','missing'])test(side+' binding '+kind+' field still conflicts',()=>{
 const {e,p}=partial();patch(e);const state=e.ctx.employeeBaselineState_(e.context,'EMP001'),intent=e.rows('audit')[0],bundle=JSON.parse(intent.afterJson);
 const image=side==='persisted'?state.bindings[0]:bundle.binding;
 if(kind==='extra')image.unapproved='value';else delete image.reason;
 if(side==='persisted')assert.throws(()=>e.ctx.employeeBaselineInspect_(state,intent,bundle));
 else{intent.afterJson=JSON.stringify(bundle);statusEquals(plain(e.ctx.employeeBaselineStatusEvidence_(e.context,'EMP001',p.requestId,state,[intent])),'RECOVERY_REQUIRED',null,'CONFLICT');}
});

const corruptions={
 employmentMissing:e=>e.tables['員工任職紀錄'].rows.splice(1),
 duplicateBinding:e=>e.tables['員工LINE綁定紀錄'].rows.push([...e.tables['員工LINE綁定紀錄'].rows[1]]),
 duplicateEmployment:e=>e.tables['員工任職紀錄'].rows.push([...e.tables['員工任職紀錄'].rows[1]]),
 changedEmployment:e=>e.cell('employments','grade','領班'),
 changedMaster:e=>e.tables['員工資料表'].rows[1][5]=2300,
 wrongRequestHash:e=>e.cell('audit','requestHash','0'.repeat(64)),
 secondStarted:e=>e.tables['員工異動紀錄'].rows.push([...e.tables['員工異動紀錄'].rows[1]]),
 malformedCompleted:e=>{const row=[...e.tables['員工異動紀錄'].rows[1]];row[15]='COMPLETED';e.tables['員工異動紀錄'].rows.push(row);},
 snapshotMismatch:e=>{const a=e.rows('audit')[0],b=JSON.parse(a.afterJson);b.snapshotVersion='0'.repeat(64);e.cell('audit','afterJson',JSON.stringify(b));},
 unknownAudit:e=>{const row=[...e.tables['員工異動紀錄'].rows[1]];row[0]='offline-other-audit';row[1]='offline-other-request-0001';e.tables['員工異動紀錄'].rows.push(row);},
 intentChannelNumber:e=>{const b=JSON.parse(e.rows('audit')[0].afterJson);b.binding.channelId=Number(CHANNEL);e.cell('audit','afterJson',JSON.stringify(b));}
};
for(const [name,damage]of Object.entries(corruptions))test('fail closed '+name,()=>{
 const {e,p}=partial();patch(e);damage(e);const result=evidence(e,p);assert.equal(result.requestStatus,'RECOVERY_REQUIRED');assert.equal(result.currentConsistency,'CONFLICT');assert.equal(result.recoveryAllowed,false);assert.equal(result.newRequestAllowed,false);
 const t=snapshot(e),pr=props(e),w=e.writes;assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,t,pr,w);
});

test('missing binding retains existing PARTIAL policy; no new approval means no write',()=>{
 const {e,p}=partial();patch(e);e.tables['員工LINE綁定紀錄'].rows.splice(1);
 statusEquals(e.status(p),'STARTED',false,'PARTIAL');const t=snapshot(e),pr=props(e),w=e.writes;
 assert.equal(e.migrate(p).code,'RECOVERY_APPROVAL_REQUIRED');unchanged(e,t,pr,w);
});

test('wrong requestId cannot authorize a new write',()=>{
 const {e,p}=partial();patch(e);const other={...p,requestId:'offline-wrong-request-0001'},t=snapshot(e),pr=props(e),w=e.writes;
 statusEquals(e.status(other),'NOT_OBSERVED',false,'UNKNOWN');assert.throws(()=>e.prepare(other,'RECOVER_ORIGINAL'));assert.equal(e.migrate(other).success,false);unchanged(e,t,pr,w);
});
for(const state of ['ABSENT','ARMED','CLOSED'])test('recovery prepare requires valid CLAIMED permit '+state,()=>{
 const {e,p}=partial();patch(e);const c=e.control();
 if(state==='ABSENT')e.props.delete(KEY);else{c.state=state;if(state==='ARMED')c.history.pop();else c.history.push({...c.history.at(-1),state:'CLOSED'});e.props.set(KEY,JSON.stringify(c));}
 const t=snapshot(e),pr=props(e),w=e.writes;assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,t,pr,w);
});
for(const damage of ['mode','generation','history','permit-hash'])test('invalid recovery control '+damage,()=>{
 const {e,p}=partial();patch(e);const c=e.control();
 if(damage==='mode')c.mode='OTHER';if(damage==='generation')c.generation=0;if(damage==='history')c.history[0].state='CLAIMED';if(damage==='permit-hash')c.requestHash='0'.repeat(64);
 e.props.set(KEY,JSON.stringify(c));const t=snapshot(e),pr=props(e),w=e.writes;
 assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'));assert.equal(e.migrate(p).success,false);unchanged(e,t,pr,w);
});
for(const mode of ['INITIAL','OTHER'])test('wrong prepare mode '+mode,()=>{
 const {e,p}=partial();patch(e);const t=snapshot(e),pr=props(e),w=e.writes;assert.throws(()=>e.prepare(p,mode));unchanged(e,t,pr,w);
});
for(const damage of ['binding','master','permit','payload-snapshot','payload-reason'])test('drift after recovery approval blocked before claim/write '+damage,()=>{
 const {e,p}=partial();patch(e);e.prepare(p,'RECOVER_ORIGINAL');
 if(damage==='binding')e.cell('bindings','reason','changed');if(damage==='master')e.tables['員工資料表'].rows[1][5]=2300;
 if(damage==='permit'){const c=e.control();c.mode='INITIAL';c.history.at(-1).mode='INITIAL';e.props.set(KEY,JSON.stringify(c));}
 const input={...p};if(damage==='payload-snapshot')input.expectedSnapshotVersion='0'.repeat(64);if(damage==='payload-reason')input.reason+=' changed';
 const t=snapshot(e),pr=props(e),w=e.writes;assert.equal(e.migrate(input).success,false);unchanged(e,t,pr,w);
});

test('unknown Production preimages are not forged or mapped to approved hashes',()=>{
 const {e,p}=partial();patch(e);const current=JSON.stringify(e.tables);
 const input={...p,expectedSnapshotVersion:OBSERVED.snapshot};
 assert.throws(()=>e.prepare(input,'RECOVER_ORIGINAL'));assert.equal(e.migrate(input).code,'REQUEST_CONFLICT');assert.equal(JSON.stringify(e.tables),current);e.safe();
});

for(const numeric of [false,true])test('fresh INITIAL succeeds preserving checkpoint/claim order; numeric round-trip='+numeric,()=>{
 const e=fixture({patched:true,roundTrip:numeric}),master=JSON.stringify(e.tables['員工資料表'].rows),p=e.input();
 const preview=e.preview();assert.equal(preview.baselineState,'LEGACY_NOT_BASELINED');assert.equal(preview.eligible,true);assert.deepEqual(plain(preview.warnings),['HIRE_DATE_UNKNOWN']);
 e.prepare(p,'INITIAL');assert.equal(e.control().state,'ARMED');assert.equal(e.control().generation,1);e.setClock(CLAIMED);e.events.length=0;
 const result=e.migrate(p);assert.equal(result.success,true);assert.equal(result.baselineState,'RECORDED');
 assert.deepEqual(e.events.filter(v=>v.startsWith('sheet:')),['sheet:員工異動紀錄','sheet:員工任職紀錄','sheet:員工LINE綁定紀錄','sheet:員工異動紀錄']);
 assert(e.events.indexOf('permit:INITIAL:CLAIMED:1')<e.events.indexOf('sheet:員工異動紀錄'));
 assert.equal(e.rows('employments').length,1);assert.equal(e.rows('bindings').length,1);assert.deepEqual(e.rows('audit').map(a=>a.phase),['STARTED','COMPLETED']);
 assert.equal(e.rows('employments')[0].startDate,'');assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);
 statusEquals(e.status(p),'COMPLETED',true,'MATCHED');e.safe();
});

test('non-T4 v3 inspect does not gain numeric channel equivalence',()=>{
 const {e,p}=partial();patch(e);const state=e.ctx.employeeBaselineState_(e.context,'EMP001'),intent=e.rows('audit')[0],bundle=JSON.parse(intent.afterJson);bundle.format=3;
 assert.throws(()=>e.ctx.employeeBaselineInspect_(state,intent,bundle));
});

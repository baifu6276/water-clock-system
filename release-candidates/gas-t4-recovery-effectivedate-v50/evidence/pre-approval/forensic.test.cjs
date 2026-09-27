// Forensic gates only. Two required rejection assertions intentionally remain failing:
// do not relax their expectations to turn the existing audit-time policy into a PASS.
const test=require('node:test'),assert=require('node:assert/strict');
const {partial,v49,plain}=require('./fixture.cjs'),{trace}=require('./predicate-trace.cjs');
function calendarControl(){const f=partial(49);f.e.cell('audit','effectiveDate','2026-09-27');return f;}
const changedTime='2026-09-27T07:56:39.143Z';
test('V48 realistic DATE and numeric-channel round-trip remains CONFLICT',()=>{
 const {e,p}=partial(48),r=e.status(p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.currentConsistency,'CONFLICT');e.safe();
});
test('V49 exact failing date predicate proven; independent Inspect matches both rows',()=>{
 const {e,p,state,intent,bundle}=partial(49),native=plain(e.status(p)),t=trace(e,v49,state,intent,bundle,p);
 assert.deepEqual(plain(t.status),native);assert.equal(native.historicalCompletion,null);assert.equal(native.requestStatus,'RECOVERY_REQUIRED');
 assert.equal(t.normallyReachedInspect,false);assert.deepEqual(t.independentInspect.result,{employmentDone:true,bindingDone:true});
 assert(t.normalTrace.some(x=>x.kind==='predicate'&&x.expression==='p.baselineDate !== intent.effectiveDate'&&x.result===true));e.safe();
});
test('counterfactual only audit effectiveDate representation changed: MATCHED; no runtime edit or write',()=>{
 const {e,p}=calendarControl(),w=e.writes,props=JSON.stringify([...e.props]),r=e.status(p);
 assert.equal(r.requestStatus,'STARTED');assert.equal(r.currentConsistency,'MATCHED');assert.equal(r.historicalCompletion,false);
 assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);assert.equal(e.writes,w);assert.equal(JSON.stringify([...e.props]),props);e.safe();
});
test('binding operatedAt mismatch already rejects after date control',()=>{
 const {e,p}=calendarControl();e.cell('bindings','operatedAt',changedTime);
 const r=e.status(p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED');assert.equal(r.currentConsistency,'CONFLICT');e.safe();
});
test('REQUIRED: valid but changed STARTED audit operatedAt must reject [existing contract blocker]',()=>{
 const {e,p}=calendarControl();e.cell('audit','operatedAt',changedTime);
 const r=e.status(p);assert.equal(r.requestStatus,'RECOVERY_REQUIRED','required rejection is absent in V49');assert.equal(r.currentConsistency,'CONFLICT');
});
test('REQUIRED: changed STARTED audit operatedAt must prevent recovery Prepare [existing contract blocker]',()=>{
 const {e,p}=calendarControl();e.cell('audit','operatedAt',changedTime);
 assert.throws(()=>e.prepare(p,'RECOVER_ORIGINAL'),'required rejection absent: mock permit becomes ARMED');
});

// Generates only safe offline summaries/boolean predicate traces, no raw fixtures.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {partial,plain,fixture,statusEquals,CLAIMED,v50}=require('./fixture.cjs'),{trace}=require('./predicate-trace.cjs');
const differential={};for(const v of [48,49,50]){const {e,p}=partial(v);differential['V'+v]=plain(e.status(p));e.safe();}
const f=partial(50),{e,p,state,intent,bundle}=f;const predicate=trace(e,v50,state,intent,bundle,p);statusEquals(predicate.status,'STARTED',false,'MATCHED');assert.equal(predicate.firstReject,null);
const fresh=partial(50),x=fresh.e,q=fresh.p,before={periods:x.rows('employments').length,bindings:x.rows('bindings').length,master:JSON.stringify(x.tables['員工資料表'].rows),audit:x.rows('audit').length};
x.setClock('2026-09-27T08:00:00.000Z');const permit=x.prepare(q,'RECOVER_ORIGINAL');assert.equal(permit.generation,2);const result=x.migrate(q);assert.equal(result.success,true);x.roundTrip();const final=plain(x.status(q));statusEquals(final,'COMPLETED',true,'MATCHED');
const summary={offlineOnly:true,productionByteReplay:false,differential,predicate,
 recovery:{preparedState:permit.state,preparedGeneration:permit.generation,finalPermitState:x.control().state,mode:x.control().mode,
 employmentAdded:x.rows('employments').length-before.periods,bindingAdded:x.rows('bindings').length-before.bindings,
 masterUnchanged:JSON.stringify(x.tables['員工資料表'].rows)===before.master,completedAuditAdded:x.rows('audit').filter(a=>a.phase==='COMPLETED').length,
 requestIdPreserved:final.requestId===q.requestId,requestHashPreserved:x.rows('audit')[0].requestHash===x.rows('audit')[1].requestHash,
 dateRoundTrip:x.rows('audit').map(a=>a.effectiveDate),final},
 approvedScope:'Only format-4 audit calendar image and STARTED operatedAt===effectiveAt; COMPLETED later-time rule unchanged'};
assert.equal(summary.recovery.employmentAdded,0);assert.equal(summary.recovery.bindingAdded,0);assert.equal(summary.recovery.completedAuditAdded,1);assert(summary.recovery.masterUnchanged);
x.safe();
const out=path.resolve(__dirname,'../evidence/v50/forensic-recovery.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',differential:Object.fromEntries(Object.entries(differential).map(([k,v])=>[k,v.requestStatus+'/'+v.currentConsistency])),postCompleted:final.requestStatus+'/'+final.currentConsistency,employmentAdded:0,bindingAdded:0,masterMutations:0,completedAuditAdded:1}));

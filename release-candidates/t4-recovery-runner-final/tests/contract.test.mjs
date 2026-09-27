import test from 'node:test';import assert from 'node:assert/strict';import {handle} from '../../../transport-v2/worker/relay.mjs';
import h from './harness.cjs';
globalThis.fetch=()=>assert.fail('REAL_NETWORK_FORBIDDEN');
const gas='https://script.google.com/macros/s/OFFLINE/exec',origin='https://offline.example';
function transport(flag,counters,mode='success') {return async(url,options,data,stage)=>{
 return handle(new Request(url,{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8'},body:options.body}),
 {GAS_UPSTREAM:gas,ALLOWED_ORIGINS:JSON.stringify([origin]),ENVIRONMENT:'development',...(flag===undefined?{}:{T4_CONTROLLED_MIGRATION_ENABLED:flag})},
 {now:()=>0,fetchImpl:async(target,opts)=>{
  assert.equal(target,gas);assert.equal(opts.redirect,'manual');const sent=JSON.parse(opts.body);counters.push(sent);
  if(data.action==='employeeLifecycleBaselineMigrate'){
   assert.deepEqual(sent,h.payload(data.idToken));assert.equal(Object.keys(sent).length,7);assert(!('_transportDiagnostics'in sent));
   return Response.json(mode==='denied'?{success:false,code:'RECOVERY_APPROVAL_REQUIRED',message:'PRIVATE_RAW'}:h.success);
  }
  assert.equal(sent._transportDiagnostics.version,1);const result=data.action==='identityBootstrap'?h.identity:stage==='STATUS_CHECKING'?{...h.status,requestStatus:'COMPLETED',historicalCompletion:true}:h.status;
  return Response.json({...result,_gasReadDiagnostics:{version:1,transportTraceId:sent._transportDiagnostics.traceId,total:'LT_100',stages:Object.fromEntries(['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'].map(k=>[k,'NOT_RUN']))}});
 }});
};}
for(const flag of [undefined,false,true,'false','TRUE',' true','true ',1,'1','true'])test('real Worker flag gate '+String(flag)+'/'+typeof flag,async()=>{
 const sent=[],f=h.create({transport:transport(flag,sent)});await f.ready();await f.click('recover');assert.equal(f.state(),flag==='true'?'SUCCESS':'WRITE_RESULT_UNKNOWN');
 assert.equal(f.writes().length,1);assert.equal(sent.filter(x=>x.action==='employeeLifecycleBaselineMigrate').length,flag==='true'?1:0);
 await f.click('statusCheck');assert.equal(f.state(),'STATUS_COMPLETED');await f.locked();
});
test('real Worker preserves backend recovery approval denial; no retry',async()=>{const sent=[],f=h.create({transport:transport('true',sent,'denied')});await f.ready();await f.click('recover');assert.equal(f.state(),'WRITE_RESULT_UNKNOWN');assert.equal(f.el('error').textContent,'RECOVERY_APPROVAL_REQUIRED');await f.locked();});
for(const [key,value]of [['requestId','NEW_REQUEST'],['expectedSnapshotVersion','0'.repeat(64)],['reason','OTHER'],['confirmed','true'],['employeeId','EMP002'],['generation',2],['recoveryMode','RECOVER_ORIGINAL'],['_transportDiagnostics',{}]])test('real Worker rejects unexpected operation '+key,async()=>{let count=0;
 const data={...h.payload('PRIVATE_TOKEN'),[key]:value};const response=await handle(new Request('https://employee-identity-transport-t1.baifu6276.workers.dev/employee-baseline-migrate',{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),{GAS_UPSTREAM:gas,ALLOWED_ORIGINS:JSON.stringify([origin]),ENVIRONMENT:'development',T4_CONTROLLED_MIGRATION_ENABLED:'true'},{fetchImpl:()=>{count++;throw Error('FORBIDDEN');}});
 assert.equal((await response.json()).transportError,'REQUEST_INVALID');assert.equal(count,0);
});

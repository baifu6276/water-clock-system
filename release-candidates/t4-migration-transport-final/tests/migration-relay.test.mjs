import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { handle, VERSION } from '../worker/relay.mjs';
const old = await import('../evidence/t3-4-relay.mjs');
globalThis.fetch=()=>assert.fail('REAL_NETWORK_FORBIDDEN');
const env={GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://baifu6276.github.io"]'};
const on={...env,T4_CONTROLLED_MIGRATION_ENABLED:'true'}, token='PRIVATE_TOKEN';
const input={action:'employeeLifecycleBaselineMigrate',idToken:token,employeeId:'EMP001',requestId:'c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab',expectedSnapshotVersion:'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd',reason:'建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。',confirmed:true};
const success={success:true,employeeId:'EMP001',requestId:input.requestId,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED'};
const req=(data=input,path='/employee-baseline-migrate')=>new Request('https://relay.example'+path,{method:'POST',headers:{origin:'https://baifu6276.github.io','content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)});
const redirect=()=>new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});
async function run(data=input,config=on,responses=[Response.json(success)],path='/employee-baseline-migrate'){
 const calls=[];const response=await handle(req(data,path),config,{now:()=>0,fetchImpl:async(...args)=>{calls.push(args);assert(responses.length,'unexpected retry');const value=responses.shift();if(value instanceof Error)throw value;return typeof value==='function'?value(...args):value;}});
 return {calls,response,body:await response.json()};
}
for(const flag of [undefined,false,true,'false','TRUE','1',1,0,'',null,{},' true','true '])test('default deny flag '+JSON.stringify(flag),async()=>{
 const r=await run(input,{...env,...(flag===undefined?{}:{T4_CONTROLLED_MIGRATION_ENABLED:flag})},[]);
 assert.equal(r.body.transportError,'PATH_DENIED');assert.equal(r.calls.length,0);
});
test('exact true enables only fixed seven-key operation; no metadata',async()=>{
 const r=await run();assert.deepEqual(r.body,success);assert.equal(r.calls.length,1);
 assert.deepEqual(JSON.parse(r.calls[0][1].body),input);assert.equal(Object.keys(JSON.parse(r.calls[0][1].body)).length,7);
 assert.equal(r.response.headers.get('x-transport-version'),VERSION);assert.equal(VERSION,'t4-safety-2-gas-read-diag');
});
for(const [key,value]of [['employeeId','EMP002'],['employeeId',' EMP001'],['requestId','status-probe-aaaaaaaaaaaaaaaa'],['requestId','c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ac'],['expectedSnapshotVersion','a'.repeat(64)],['reason',input.reason+' '],['reason','different'],['confirmed',false],['confirmed','true'],['action','identityBootstrap']])test('fixed value reject '+key+' '+String(value).slice(0,16),async()=>{
 const r=await run({...input,[key]:value},on,[]);assert.equal(r.body.transportError,'REQUEST_INVALID');assert.equal(r.calls.length,0);
});
for(const key of Object.keys(input))test('missing migration key '+key,async()=>{
 const data={...input};delete data[key];const r=await run(data,on,[]);assert.equal(r.body.transportError,'REQUEST_INVALID');assert.equal(r.calls.length,0);
});
for(const key of ['_transportDiagnostics','userId','employeeRole','approvalReference','upstream','timeoutMs','requestHash','permit'])test('extra key denied '+key,async()=>{
 const r=await run({...input,[key]:'PRIVATE_SENTINEL'},on,[]);assert.equal(r.body.transportError,'REQUEST_INVALID');assert.equal(r.calls.length,0);
});
for(const idToken of ['',null,{},' '.repeat(3),'a'.repeat(12001)])test('invalid token shape '+typeof idToken+' '+String(idToken).length,async()=>{
 const r=await run({...input,idToken},on,[]);assert.equal(r.body.transportError,'TOKEN_REQUIRED');assert.equal(r.calls.length,0);
});
const reads=[['/identity',{action:'identityBootstrap',idToken:token}],['/employee-read',{action:'employeeLifecycleBaselineDryRun',idToken:token,employeeId:'EMP001'}],['/employee-operation-status',{action:'employeeLifecycleBaselineRequestStatus',idToken:token,employeeId:'EMP001',requestId:input.requestId}]];
for(const[path,data]of reads)for(const flag of [undefined,'true'])test('read preserves injection/reconstruction '+path+' '+flag,async()=>{
 let forwarded;const r=await run(data,{...env,T4_CONTROLLED_MIGRATION_ENABLED:flag},[(url,opts)=>{
  forwarded=JSON.parse(opts.body);const trace=forwarded._transportDiagnostics.traceId;
  return Response.json({success:true,business:'SAME',_gasReadDiagnostics:{version:1,transportTraceId:trace,total:'LT_100',stages:Object.fromEntries(['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'].map(k=>[k,'NOT_RUN']))}});
 }],path);
 assert.deepEqual(forwarded,{...data,_transportDiagnostics:{version:1,traceId:r.response.headers.get('x-correlation-id')}});
 assert.equal(r.body._gasReadDiagnostics.version,1);assert.equal(r.body.business,'SAME');
});
test('write strips GAS read diagnostics even if upstream supplies valid metadata',async()=>{
 const r=await run(input,on,[Response.json({...success,_gasReadDiagnostics:{version:1,secret:token}})]);assert.deepEqual(r.body,success);
});
for(const code of ['AUTH_ERROR','FORBIDDEN','VERSION_CONFLICT','CONTROLLED_MIGRATION_DENIED','REQUEST_CONFLICT','RECOVERY_REQUIRED'])test('GAS business error preserved '+code,async()=>{
 const body={success:false,code};assert.deepEqual((await run(input,on,[Response.json(body)])).body,body);
});
test('redirect GET never resends migration body/token/headers/cookies',async()=>{
 const r=await run(input,on,[redirect(),Response.json(success)]);assert.equal(r.calls.length,2);
 const post=r.calls[0][1],get=r.calls[1][1];assert.deepEqual(JSON.parse(post.body),input);assert.equal(post.redirect,'manual');
 assert.equal(get.method,'GET');for(const key of ['body','headers'])assert.equal(get[key],undefined);
 assert.equal(get.credentials,'omit');assert.equal(get.redirect,'manual');assert.equal(get.cache,'no-store');
 assert(!JSON.stringify([...r.response.headers,r.body]).includes('PRIVATE_'));
});
for(const stage of ['POST_HEADERS','REDIRECT_GET_HEADERS','FINAL_BODY'])test('write timeout '+stage+' global deadline/late freeze',async()=>{
 mock.timers.enable({apis:['setTimeout']});let resolve,calls=0,clock=0,bodyController;
 const pending=handle(req(),on,{now:()=>clock,fetchImpl:async()=>{
  calls++;if(stage==='REDIRECT_GET_HEADERS'&&calls===1)return redirect();
  if(stage==='FINAL_BODY')return new Response(new ReadableStream({start(c){bodyController=c;}}));
  return new Promise(done=>resolve=done);
 }});
 try{
  await new Promise(r=>setImmediate(r));clock=19999;mock.timers.tick(19999);let completed=false;pending.then(()=>completed=true);await new Promise(r=>setImmediate(r));assert.equal(completed,false);
  clock=20000;mock.timers.tick(1);const response=await pending,header=response.headers.get('x-transport-timing'),body=await response.json();
  assert.equal(response.status,504);assert.deepEqual(body,{success:false,transportError:'UPSTREAM_TIMEOUT',transportStage:stage});
  const count=calls;if(resolve)resolve(redirect());if(bodyController){bodyController.enqueue(new TextEncoder().encode(JSON.stringify(success)));bodyController.close();}
  clock=40000;await new Promise(r=>setImmediate(r));assert.equal(calls,count);assert.equal(response.headers.get('x-transport-timing'),header);assert.match(header,/tot=TIMEOUT/);
 }finally{mock.timers.reset();}
});
test('inbound write body timeout shares deadline; no upstream',async()=>{
 mock.timers.enable({apis:['setTimeout']});let calls=0;
 try{const request=new Request('https://relay.example/employee-baseline-migrate',{method:'POST',headers:{origin:'https://baifu6276.github.io','content-type':'text/plain;charset=utf-8'},body:new ReadableStream({start(){}}),duplex:'half'});
 const p=handle(request,on,{fetchImpl:()=>{calls++;assert.fail();},now:()=>0});await new Promise(r=>setImmediate(r));mock.timers.tick(20000);assert.equal((await(await p).json()).transportStage,'READ_REQUEST');assert.equal(calls,0);
 }finally{mock.timers.reset();}
});
test('upstream network failure safe and no retry',async()=>{
 const r=await run(input,on,[Error('PRIVATE_TOKEN PRIVATE_SUB PRIVATE_URL PRIVATE_BODY')]);assert.deepEqual(r.body,{success:false,transportError:'UPSTREAM_NETWORK_ERROR'});assert.equal(r.calls.length,1);
});
for(const[status,location,code]of [[307,'https://script.googleusercontent.com/','UPSTREAM_REDIRECT_DENIED'],[302,'https://evil.example/','UPSTREAM_REDIRECT_DENIED'],[303,'https://user:private@script.googleusercontent.com:8443/#private','UPSTREAM_REDIRECT_DENIED']])test('write redirect security '+status+' '+location.split('/')[2],async()=>{
 const r=await run(input,on,[new Response(null,{status,headers:{location}})]);assert.equal(r.body.transportError,code);assert.equal(r.calls.length,1);assert(!JSON.stringify(r.body).includes('private'));
});
test('migration fourth redirect denied with no extra fetch',async()=>{const r=await run(input,on,[redirect(),redirect(),redirect(),redirect()]);assert.equal(r.calls.length,4);assert.equal(r.body.transportError,'UPSTREAM_REDIRECT_LIMIT');});
for(const big of ['request','response'])test('migration size limit '+big,async()=>{
 const r=big==='request'?await run({...input,idToken:'x'.repeat(17000)},on,[]):await run(input,on,[new Response('x'.repeat(65537))]);
 assert.equal(r.body.transportError,big==='request'?'REQUEST_TOO_LARGE':'UPSTREAM_RESPONSE_TOO_LARGE');assert.equal(r.calls.length,big==='request'?0:1);
});
test('flag availability only: identical read business JSON/errors when off/on/base',async()=>{
 for(const[path,data]of reads)for(const business of [{success:true,marker:'BUSINESS'},{success:false,code:'FORBIDDEN'}]){
  const oldResponse=await old.handle(req(data,path),env,{fetchImpl:async()=>Response.json(business),now:()=>0});
  const a=await run(data,env,[Response.json(business)],path),b=await run(data,on,[Response.json(business)],path);
  assert.deepEqual(a.body,await oldResponse.json());assert.deepEqual(b.body,a.body);
 }
});
test('helper/backbone preservation, exact four routes, no logging/storage/retry',()=>{
 const source=readFileSync(new URL('../worker/relay.mjs',import.meta.url),'utf8'),base=readFileSync(new URL('../evidence/t3-4-relay.mjs',import.meta.url),'utf8');
 for(const[start,end]of [['function gasReadDiagnostics','const fail'],['function timingDiagnostics','async function limitedText'],['async function limitedText','function configuration'],['function configuration','// Dependencies'],['      for (let redirects = 0;','        const safeDiagnostics'],['        delete result._gasReadDiagnostics;','export default']])assert.equal(source.slice(source.indexOf(start),source.indexOf(end)),base.slice(base.indexOf(start),base.indexOf(end)));
 assert.deepEqual([...source.matchAll(/'(\/[^']+)'\s*:\s*\{ action:/g)].map(m=>m[1]),['/identity','/employee-read','/employee-operation-status','/employee-baseline-migrate']);
 assert(!/console\.|Logger|localStorage|sessionStorage|\.put\(|waitUntil|CacheService/.test(source));assert(source.includes('timeoutMs = 20000, now = () => performance.now()'));
});

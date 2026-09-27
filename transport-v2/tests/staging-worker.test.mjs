import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {handle,VERSION} from '../worker/relay.mjs';
import fixture from './staging-fixture.cjs';
const {payload,success,env,origin,rng}=fixture;
globalThis.fetch=()=>assert.fail('REAL_NETWORK_FORBIDDEN');
const on={...env,T4_CONTROLLED_MIGRATION_ENABLED:'true'},random=rng(0x54740001);
const req=(body=JSON.stringify(payload),route='/employee-baseline-migrate')=>new Request('https://relay.example'+route,{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8'},body});
const exact=p=>p&&!Array.isArray(p)&&typeof p==='object'&&Object.keys(p).length===7&&Object.keys(payload).every(k=>Object.hasOwn(p,k)&&(k==='idToken'?typeof p[k]==='string'&&p[k].trim()&&p[k].length<=12000:p[k]===payload[k]));
const privateRe=/PRIVATE_(TOKEN|SUB|LINE_RESPONSE|GAS_BODY|COOKIE|URL|QUERY|STACK|AUDIT)/;
async function run(raw,flag='true',response=()=>Response.json(success)){
 let calls=0,forwarded;const out=await handle(req(raw),{...env,T4_CONTROLLED_MIGRATION_ENABLED:flag},{now:()=>0,fetchImpl:async(url,opts)=>{calls++;forwarded=JSON.parse(opts.body);return response();}});
 const text=await out.text();assert(!privateRe.test(JSON.stringify([...out.headers])));if(!out.ok)assert(!privateRe.test(text));
 return {calls,forwarded,out,body:JSON.parse(text)};
}
const keys=Object.keys(payload),values=[null,[],{},false,true,0,'','true',' EMP001','PRIVATE_SUB'];
function mutation(i){
 let p={...payload};const k=keys[Math.floor(random()*keys.length)];
 switch(i%20){
 case 0: delete p[k];break;
 case 1:p.extra='PRIVATE_AUDIT';break;
 case 2:p[k]=null;break;
 case 3:p[k]=[];break;
 case 4:p[k]={};break;
 case 5:p.confirmed=values[Math.floor(random()*values.length)];break;
 case 6:p.reason+=' ';break;
 case 7:p.reason=p.reason.normalize('NFKC');break;
 case 8:p.idToken='x'.repeat(12001);break;
 case 9:p.reason='x'.repeat(17000);break;
 case 10:p.requestId='status-probe-'+i;break;
 case 11:p.requestId='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ac';break;
 case 12:p.expectedSnapshotVersion=payload.expectedSnapshotVersion.toUpperCase();break;
 case 13:p.employeeId='EMP002';break;
 case 14:p.action='employeeApplicationApprove';break;
 case 15:Object.defineProperty(p,'__proto__',{value:{polluted:'PRIVATE_SUB'},enumerable:true});break;
 case 16:p.constructor='PRIVATE_STACK';break;
 case 17:p._transportDiagnostics={version:1};break;
 case 18:p.idToken={toString:'PRIVATE_TOKEN'};break;
 case 19:p[k]=values[Math.floor(random()*values.length)];p.employeeId='EMP999';break;
 }
 return JSON.stringify(p);
}
for(let i=0;i<1000;i++){
 const raw=mutation(i);test('seed 0x54740001 payload mutation '+i,async()=>{
  const p=JSON.parse(raw),r=await run(raw);const allowed=Buffer.byteLength(raw)<=16384&&!!exact(p);
  assert.equal(r.calls,allowed?1:0);if(allowed)assert.deepEqual(r.forwarded,payload);else assert.equal(r.body.success,false);
 });
}
for(let i=0;i<20;i++)test('valid control '+i,async()=>{const r=await run(JSON.stringify(payload));assert.equal(r.calls,1);assert.deepEqual(r.forwarded,payload);assert(!Object.hasOwn(r.forwarded,'_transportDiagnostics'));});
for(const flag of [undefined,false,true,0,1,'false','TRUE',' true','true ','',null])test('flag exact only '+String(flag),async()=>{const r=await run(JSON.stringify(payload),flag===undefined?{}:flag);assert.equal(r.calls,0);});
for(const [name,raw,accepted] of [
 ['duplicate same',JSON.stringify(payload).replace('"confirmed":true','"confirmed":true,"confirmed":true'),true],
 ['duplicate wrong then correct',JSON.stringify(payload).replace('"confirmed":true','"confirmed":false,"confirmed":true'),true],
 ['duplicate correct then wrong',JSON.stringify(payload).replace('"confirmed":true','"confirmed":true,"confirmed":false'),false]
])test(name+' documented JSON.parse semantics',async()=>{const r=await run(raw);assert.equal(r.calls,accepted?1:0);if(accepted)assert.deepEqual(r.forwarded,payload);});
const responseKinds=[
 ()=>new Response('PRIVATE_GAS_BODY'),
 ()=>Response.json([]),
 ()=>Response.json({message:'PRIVATE_LINE_RESPONSE'}),
 ()=>Response.json({...success,_gasReadDiagnostics:{raw:'PRIVATE_AUDIT'}}),
 ()=>new Response('PRIVATE_GAS_BODY'.repeat(6000)),
 ()=>new Response(null,{status:302,headers:{location:'https://PRIVATE_URL.example/?PRIVATE_QUERY'}}),
 ()=>new Response('PRIVATE_GAS_BODY',{status:503}),
 ()=>Response.json({success:'true',token:'PRIVATE_TOKEN'}),
 ()=>new Response(null,{status:204}),
 ()=>new Response(null,{status:307,headers:{location:'https://script.googleusercontent.com/?PRIVATE_QUERY'}})
];
for(let i=0;i<200;i++)test('seed 0x54740001 response mutation '+i,async()=>{
 const r=await run(JSON.stringify(payload),'true',responseKinds[i%responseKinds.length]);assert.equal(r.calls,1);
 assert(!privateRe.test(JSON.stringify(r.body)));if(i%10===3)assert.deepEqual(r.body,success);
});
test('business passthrough privacy boundary is explicit, UI must filter',async()=>{
 const r=await run(JSON.stringify(payload),'true',()=>Response.json({success:false,code:'AUTH_ERROR',message:'PRIVATE_GAS_BODY'}));
 assert.equal(r.body.message,'PRIVATE_GAS_BODY');assert.equal(r.out.status,200);
 // Characterization, not a privacy PASS for arbitrary valid business JSON.
});
const turn=()=>new Promise(r=>setImmediate(r));
for(const stage of ['POST_HEADERS','REDIRECT_GET_HEADERS','FINAL_BODY'])for(const at of [19999,20000,20001])for(const first of ['resolve','timer'])test('race '+stage+' '+at+' '+first,async()=>{
 mock.timers.enable({apis:['setTimeout']});let clock=0,calls=0,resolve,controller;
 const redirect=()=>new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});
 const p=handle(req(),on,{now:()=>clock,fetchImpl:async()=>{
  calls++;if(stage==='REDIRECT_GET_HEADERS'&&calls===1)return redirect();
  if(stage==='FINAL_BODY')return new Response(new ReadableStream({start(c){controller=c;}}));
  return new Promise(r=>resolve=r);
 }});
 const release=()=>{if(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify(success)));controller.close();}else resolve(Response.json(success));};
 try{
  await turn();clock=at;
  if(first==='resolve'){release();await turn();mock.timers.tick(at);}else{mock.timers.tick(at);release();}
  const response=await p,body=await response.json(),count=calls;
  assert.equal(response.status,first==='timer'&&at>=20000?504:200);
  if(response.status===504)assert.equal(body.transportStage,stage);else assert.deepEqual(body,success);
  await turn();assert.equal(calls,count);assert(calls<=2);assert(!privateRe.test(JSON.stringify([...response.headers,body])));
 }finally{mock.timers.reset();}
});
for(const late of ['redirect','success','reader'])test('abort then late '+late,async()=>{
 mock.timers.enable({apis:['setTimeout']});let done,calls=0,reader;
 try{
  const p=handle(req(),on,{now:()=>0,fetchImpl:async()=>{calls++;return late==='reader'?new Response(new ReadableStream({start(c){reader=c;}})):new Promise(r=>done=r);}});
  await turn();mock.timers.tick(20000);const response=await p,body=await response.text(),headers=JSON.stringify([...response.headers]);
  if(reader){reader.enqueue(new TextEncoder().encode('PRIVATE_GAS_BODY'));reader.close();}
  else done(late==='redirect'?new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/?PRIVATE_QUERY'}}):Response.json(success));
  await turn();assert.equal(calls,1);assert.equal(response.status,504);assert.equal(JSON.stringify([...response.headers]),headers);assert(!privateRe.test(body));
 }finally{mock.timers.reset();}
});

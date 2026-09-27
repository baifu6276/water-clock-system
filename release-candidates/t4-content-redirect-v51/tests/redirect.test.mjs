import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,VERSION} from '../../../transport-v2/worker/relay.mjs';
import h from './harness.cjs';
const origin='https://baifu6276.github.io',upstream='https://script.google.com/macros/s/OFFLINE/exec';
const env={GAS_UPSTREAM:upstream,ALLOWED_ORIGINS:JSON.stringify([origin])};
const root='https://script.googleusercontent.com/macros/echo',dynamic='https://n-a1-b2-script.googleusercontent.com/macros/echo';
const identity={action:'identityBootstrap',idToken:'PRIVATE_TOKEN'};
const redirect=(location,status=302)=>new Response(null,{status,headers:{location,'set-cookie':'PRIVATE_COOKIE','authorization':'PRIVATE_AUTH'}});
async function chain(locations,{data=identity,flag,status=302}={}){
 const calls=[];const route=data.action===identity.action?'/identity':'/employee-baseline-migrate';
 const r=await handle(new Request('https://relay.example'+route,{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8',cookie:'PRIVATE_COOKIE',authorization:'PRIVATE_AUTH'},body:JSON.stringify(data)}),{...env,...(flag!==undefined?{T4_CONTROLLED_MIGRATION_ENABLED:flag}:{})},{now:()=>0,fetchImpl:async(url,options)=>{
  const i=calls.length;calls.push({url,options});
  if(i===0){assert.equal(url,upstream);assert.equal(options.method,'POST');assert.equal(JSON.parse(options.body).idToken,data.idToken);assert.equal(options.headers.cookie,undefined);assert.equal(options.headers.authorization,undefined);}
  else {assert.equal(url,new URL(locations[i-1]).href);assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.headers,undefined);assert(!JSON.stringify(options).includes('PRIVATE_'));}
  assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');assert.equal(options.cache,'no-store');
  return i<locations.length?redirect(locations[i],status):Response.json(data.action===identity.action?h.identity:h.success);
 }});
 const body=await r.json();assert(!/PRIVATE_|Location|googleusercontent/.test(JSON.stringify(body)+JSON.stringify([...r.headers])));return {r,body,calls};
}
for(const host of ['script.googleusercontent.com','n-a-script.googleusercontent.com','n-a1-b2-script.googleusercontent.com','n-0-script.googleusercontent.com'])
 for(const status of [302,303])test('accepted host '+host+' '+status,async()=>{const x=await chain(['https://'+host+'/macros/echo?opaque=PRIVATE_QUERY'],{status});assert.equal(x.r.status,200);assert.equal(x.calls.length,2);});
for(const count of [2,3])test('root/dynamic GET chain length '+count,async()=>{const x=await chain([root+'?one=PRIVATE_QUERY',dynamic+'?two=PRIVATE_QUERY',root+'?three=PRIVATE_QUERY'].slice(0,count));assert.equal(x.r.status,200);assert.equal(x.calls.length,count+1);});
test('fourth redirect denied without fifth fetch',async()=>{const x=await chain([root,dynamic,root,dynamic]);assert.equal(x.body.transportError,'UPSTREAM_REDIRECT_LIMIT');assert.equal(x.calls.length,4);});
const rejected=[
 ...['foo.googleusercontent.com','evil-script.googleusercontent.com','n--script.googleusercontent.com','script.googleusercontent.com.evil.example','n-x-script.googleusercontent.com.evil.example','accounts.google.com','script.google.com','n-x-script.googleusercontent.com.','n-x-script.googleusercontent.com@evil.example'].map(host=>['https://'+host+'/macros/echo','REDIRECT_HOST_DENIED']),
 ['http://n-x-script.googleusercontent.com/macros/echo','REDIRECT_SCHEME_DENIED'],
 ...['https://n-x-script.googleusercontent.com:444/macros/echo','https://user:pass@n-x-script.googleusercontent.com/macros/echo','https://n-x-script.googleusercontent.com/macros/echo#PRIVATE_HASH',root+'/extra',root+'/',root.replace('/macros/echo','/'),root.replace('echo','%65cho'),root.replace('echo','Echo')].map(url=>[url,'REDIRECT_URL_COMPONENT_DENIED']),
 ['not a URL','REDIRECT_LOCATION_INVALID'],['/macros/echo','REDIRECT_LOCATION_INVALID']
];
for(const [i,[url,code]]of rejected.entries())test('URL denial '+i,async()=>{const x=await chain([url]);assert.equal(x.body.transportError,'UPSTREAM_REDIRECT_DENIED');assert.equal(x.body.redirectDiagnostic,code);assert.equal(x.calls.length,1);});
for(const status of [300,301,304,305,307,308])test('status denied '+status,async()=>{const x=await chain([root],{status});assert.equal(x.body.redirectDiagnostic,'REDIRECT_STATUS_DENIED');assert.equal(x.calls.length,1);});
test('URL parser preserves prior normalization (default HTTPS port, case, empty fragment)',async()=>{for(const url of ['https://SCRIPT.GOOGLEUSERCONTENT.COM:443/macros/echo',root+'#'])assert.equal((await chain([url])).r.status,200);});
for(const flag of [undefined,false,true,'TRUE','true ','1',1,'false','true'])test('exact controlled flag '+String(flag)+'/'+typeof flag,async()=>{const x=await chain([root,dynamic],{data:h.payload('PRIVATE_TOKEN'),flag});if(flag==='true'){assert.equal(x.r.status,200);assert.deepEqual(JSON.parse(x.calls[0].options.body),h.payload('PRIVATE_TOKEN'));assert.equal(Object.keys(JSON.parse(x.calls[0].options.body)).length,7);assert(!x.calls[0].options.body.includes('_transportDiagnostics'));}else{assert.equal(x.body.transportError,'PATH_DENIED');assert.equal(x.calls.length,0);}});
// Deterministic hostile-host model: expected trust label is generated independently.
let seed=0x51510001;const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
for(let i=0;i<1000;i++){
 const token=random().toString(36)+'-'+random().toString(36),kind=i%10;
 const host=[`n-${token}-script.googleusercontent.com`,`n-${token}-script.googleusercontent.com.evil.example`,`n-${token}.googleusercontent.com`,`evil-${token}-script.googleusercontent.com`,`n-${token}-script.google.com`,`script.googleusercontent.com.${token}.example`,`n-${token}-script.googleusercontent.com.`,`n-${token}-script.googleusercontent.com@${token}.example`,`n-${token}-script.evil.example`,`n-${token}-script.googleusercontent.com`][kind];
 test('host fuzz seed 0x51510001 case '+i,async()=>{const x=await chain(['https://'+host+'/macros/echo?opaque=PRIVATE_QUERY']);assert.equal(x.r.status,kind===0||kind===9?200:502);assert.equal(x.calls.length,kind===0||kind===9?2:1);});
}
test('actual Worker root/dynamic redirects for all recovery actions',async()=>{
 const sent=[];const f=h.create({transport:async(url,options,data)=>{
  let n=0;return handle(new Request(url,{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8'},body:options.body}),{...env,T4_CONTROLLED_MIGRATION_ENABLED:'true'},{now:()=>0,fetchImpl:async(target,opts)=>{
   if(n++===0){sent.push(JSON.parse(opts.body));return redirect(root+'?PRIVATE_QUERY');}
   assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);assert.equal(opts.headers,undefined);assert.equal(opts.credentials,'omit');
   if(n===2)return redirect(dynamic+'?PRIVATE_QUERY',303);
   return Response.json(data.action==='identityBootstrap'?h.identity:data.action.endsWith('RequestStatus')?h.status:h.success);
  }});
 }});await f.ready();await f.click('recover');assert.equal(f.state(),'SUCCESS');assert.equal(f.writes().length,1);assert.equal(sent.length,5);assert.deepEqual(sent.at(-1),h.payload(sent.at(-1).idToken));await f.locked();
});
test('version exact',()=>assert.equal(VERSION,'t4-safety-3-content-redirect'));

test('base-to-V51 differential proves approved host shape was denied (not Production URL proof)',async()=>{
 const {execFileSync}=await import('node:child_process');
 const src=execFileSync('git',['show','16bf1e13c6afc86d0701e0d3441ca1cdd9fcf57b:transport-v2/worker/relay.mjs']);
 const old=await import('data:text/javascript;base64,'+src.toString('base64'));let calls=0;
 const r=await old.handle(new Request('https://relay.example/identity',{method:'POST',headers:{origin,'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(identity)}),env,{now:()=>0,fetchImpl:async()=>++calls===1?redirect(root):redirect(dynamic)});
 assert.deepEqual(await r.json(),{success:false,transportError:'UPSTREAM_REDIRECT_DENIED',redirectDiagnostic:'REDIRECT_HOST_DENIED',transportStage:'REDIRECT_GET_HEADERS'});assert.equal(calls,2);
 const current=await chain([root,dynamic]);assert.equal(current.r.status,200);assert.equal(current.calls.length,3);
});

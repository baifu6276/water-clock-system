const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {repo,payload,identity,preview,success,status,version,rng}=require('./staging-fixture.cjs');
const source=fs.readFileSync(path.join(repo,'transport-v2/t4-migration-runner/client.js'),'utf8');
const flush=()=>new Promise(r=>setImmediate(r)),seed=0x54740002;
function harness(outcome,reenter){
 const nodes=new Map(),calls=[],logs=[],timers=new Set();let pending;
 const el=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:id==='init'?'尚未開始':'',value:'',disabled:false,events:{},addEventListener(n,fn){this.events[n]=fn;}});return nodes.get(id);};
 const click=id=>{const p=el(id).events.click?.();if(p?.catch)p.catch(e=>logs.push('UNHANDLED'));return p;};
 const response=data=>new Response(JSON.stringify(data),{headers:{'x-transport-version':version}});
 const sandbox={document:{getElementById:el},AbortController,Error,console:{log:()=>logs.push('LOG'),error:()=>logs.push('LOG')},
  setTimeout(fn,ms){assert.equal(ms,20000);timers.add(fn);return fn;},clearTimeout(fn){timers.delete(fn);},
  liff:{init:async options=>assert.deepEqual(JSON.parse(JSON.stringify(options)),{liffId:'2011467618-QZYsTwb9'}),isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>{
   if(reenter&&el('state').textContent==='SUBMITTING'){click('migrate');click('statusCheck');click('precheck');}
   return 'PRIVATE_TOKEN';
  }},
  fetch:async(url,opts)=>{
   assert(!/PRIVATE_/.test(url));assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');const data=JSON.parse(opts.body);calls.push(data);
   if(data.action==='identityBootstrap')return response(identity);
   if(data.action==='employeeLifecycleBaselineDryRun')return response(preview);
   if(data.action==='employeeLifecycleBaselineRequestStatus'){assert.equal(data.requestId,payload.requestId);return response(status(outcome.status));}
   assert.deepEqual(data,payload);return new Promise((resolve,reject)=>pending={resolve,reject});
  }};
 vm.runInNewContext(source,sandbox);
 const finish=()=>{
  if(!pending)return;const p=pending;pending=null;
  if(outcome.write==='network')p.reject(Error('PRIVATE_STACK PRIVATE_URL'));
  else if(outcome.write==='malformed')p.resolve(new Response('PRIVATE_GAS_BODY',{headers:{'x-transport-version':version}}));
  else p.resolve(response(outcome.write==='success'?success:outcome.write==='business'?{success:false,code:'VERSION_CONFLICT',message:'PRIVATE_STACK'}:{...success,extra:'PRIVATE_AUDIT'}));
 };
 return {el,click,calls,logs,timers,finish,nodes};
}
const events=['precheck','correct','wrong','migrate','double','force','status','timeout','settle'];
async function execute(sequence,outcome,reenter){
 const h=harness(outcome,reenter);await flush();let attempted=false;
 for(const e of sequence){
  const before=h.el('state').textContent;
  const mayAttempt=!attempted&&before==='READY'&&h.el('confirmation').value==='MIGRATE EMP001';
  if(['migrate','double','force'].includes(e)&&mayAttempt)attempted=true;
  if(e==='correct'||e==='wrong'){h.el('confirmation').value=e==='correct'?'MIGRATE EMP001':'migrate emp001';h.el('confirmation').events.input();}
  if(e==='precheck')h.click('precheck');
  if(e==='migrate'||e==='double'||e==='force'){if(e==='force')h.el('migrate').disabled=false;h.click('migrate');if(e==='double')h.click('migrate');}
  if(e==='status')h.click('statusCheck');
  if(e==='timeout')for(const fn of [...h.timers])fn();
  if(e==='settle')h.finish();
  await flush();
  const writes=h.calls.filter(p=>p.action===payload.action);assert(writes.length<=1);
  if(attempted){assert.notEqual(h.el('state').textContent,'READY');assert.notEqual(h.el('state').textContent,'PRECHECK');}
  // Forced DOM may set disabled=false, but must never gain handler authority.
  if(attempted&&e==='force')assert(writes.length<=1);
  assert(!/PRIVATE_/.test([...h.nodes.values()].map(n=>n.textContent).join('')+h.logs.join('')));
 }
 h.finish();await flush();
 assert(h.calls.filter(p=>p.action===payload.action).length<=1);assert.equal(h.logs.length,0);
}
for(let i=0;i<1000;i++){
 const random=rng(seed+i),outcome={write:['success','network','malformed','business','bad-success'][i%5],status:['COMPLETED','STARTED','NOT_OBSERVED','UNKNOWN','RECOVERY_REQUIRED'][Math.floor(i/5)%5]};
 const sequence=['precheck','correct','migrate','double','status','precheck',...(i%2?['timeout','settle']:['settle']),'status','force',...Array.from({length:40},()=>events[Math.floor(random()*events.length)])];
 test('model seed 0x54740002 sequence '+i,async()=>{
  try{await execute(sequence,outcome,i%2===0);}
  catch(error){
   let minimal=sequence.slice();
   for(let n=0;n<minimal.length;){const probe=minimal.filter((_,j)=>j!==n);let fails=false;try{await execute(probe,outcome,i%2===0);}catch{fails=true;}if(fails){minimal=probe;n=0;}else n++;}
   fs.writeFileSync(path.join(repo,'release-candidates/t4-release-staging/MODEL_FAILURE.json'),JSON.stringify({seed,index:i,outcome,events:minimal},null,2));
   throw error;
  }
 });
}

const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'../../..'),root=path.join(repo,'transport-v2/t4-recovery-runner');
const source=fs.readFileSync(path.join(root,'client.js'),'utf8');
const version='t4-safety-2-gas-read-diag',requestId='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab',snapshot='f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd';
const reason='建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。';
const identity={success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',permission:'ADMIN'}};
const status={success:true,employeeId:'EMP001',requestId,action:'employeeLifecycleBaselineMigrate',requestStatus:'STARTED',historicalCompletion:false,currentConsistency:'MATCHED',recoveryAllowed:false,newRequestAllowed:false};
const success={success:true,employeeId:'EMP001',requestId,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED'};
const payload=token=>({action:'employeeLifecycleBaselineMigrate',idToken:token,employeeId:'EMP001',requestId,expectedSnapshotVersion:snapshot,reason,confirmed:true});
const flush=()=>new Promise(r=>setImmediate(r));
function create(opt={}){
 const nodes=new Map(),calls=[],logs=[],timers=new Set(),pending=[];let tokenReads=0,inside=true,logged=true;
 const el=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:id==='init'?'尚未開始':'',value:'',disabled:false,events:{},addEventListener(n,fn){this.events[n]=fn;}});return nodes.get(id);};
 const state=()=>el('state').textContent,click=id=>el(id).events.click?.();
 const context={document:{getElementById:el},AbortController,
  console:new Proxy({}, {get:()=>()=>logs.push('LOG')}),
  setTimeout(fn,ms){assert.equal(ms,20000);timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn),
  liff:{init:async x=>{assert.deepEqual(JSON.parse(JSON.stringify(x)),{liffId:'2011467618-QZYsTwb9'});if(opt.initFail)throw Error('PRIVATE_EXCEPTION');},
   isInClient:()=>inside&&!opt.outside,isLoggedIn:()=>logged&&!opt.loggedOut,getIDToken(){tokenReads++;opt.onToken?.({state:state(),click,el,tokenReads});return opt.noToken?null:'PRIVATE_TOKEN_'+tokenReads;}},
  fetch:async(url,options)=>{
   const data=JSON.parse(options.body),stage=state(),number=calls.length;
   assert.equal(url,'https://employee-identity-transport-t1.baifu6276.workers.dev'+({identityBootstrap:'/identity',employeeLifecycleBaselineRequestStatus:'/employee-operation-status',employeeLifecycleBaselineMigrate:'/employee-baseline-migrate'})[data.action]);
   assert.equal(options.method,'POST');assert.equal(options.headers['Content-Type'],'text/plain;charset=utf-8');
   for(const [k,v]of Object.entries({redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}))assert.equal(options[k],v);
   assert.equal(data.idToken,'PRIVATE_TOKEN_'+tokenReads);
   if(data.action==='identityBootstrap')assert.deepEqual(data,{action:data.action,idToken:data.idToken});
   else if(data.action==='employeeLifecycleBaselineRequestStatus')assert.deepEqual(data,{action:data.action,idToken:data.idToken,employeeId:'EMP001',requestId});
   else assert.deepEqual(data,payload(data.idToken));
   calls.push({data,stage,number});opt.onFetch?.({stage,click,el,data});
   if(opt.transport)return opt.transport(url,options,data,stage);
   const reply=opt.reply?.({data,stage,number})||{};
   if(reply.network)throw Error('PRIVATE_EXCEPTION PRIVATE_URL');
   let body=Object.hasOwn(reply,'body')?reply.body:data.action==='identityBootstrap'?identity:data.action==='employeeLifecycleBaselineRequestStatus'?status:success;
   const response={ok:reply.http?reply.http<300:true,headers:{get:()=>Object.hasOwn(reply,'version')?reply.version:version},json:async()=>{if(reply.nonJson)throw Error('PRIVATE_RESPONSE');if(reply.bodyPending)await new Promise(r=>pending.push(r));return JSON.parse(JSON.stringify(body));}};
   if(reply.pending)await new Promise(r=>pending.push(r));return response;
  }};
 for(const k of ['localStorage','sessionStorage','indexedDB','location','URLSearchParams','XMLHttpRequest','WebSocket'])Object.defineProperty(context,k,{get(){throw Error('FORBIDDEN_ACCESS_'+k);}});
 vm.runInNewContext(source,context,{filename:'recovery-client.js'});
 const h={el,click,calls,logs,timers,pending,nodes,state,tokenReads:()=>tokenReads,
  phrase(value='RECOVER EMP001'){el('confirmation').value=value;el('confirmation').events.input();},
  async ready(){await flush();await click('precheck');assert.equal(state(),'READY');h.phrase();},
  writes:()=>calls.filter(c=>c.data.action==='employeeLifecycleBaselineMigrate'),
  expire(){for(const fn of [...timers])fn();},release(){pending.splice(0).forEach(r=>r());},
  inside(v){inside=v;},logged(v){logged=v;},
  safe(){assert.equal(logs.length,0);assert(!/PRIVATE_|idToken|lineSub|rawAudit/.test([...nodes.values()].map(n=>n.textContent).join('')));assert(h.writes().length<=1);},
  async locked(){const n=calls.length;h.phrase();el('recover').disabled=false;await click('recover');await click('precheck');assert.equal(calls.length,n);assert(!['READY','PRECHECK'].includes(state()));h.safe();}
 };return h;
}
module.exports={repo,root,source,version,requestId,snapshot,reason,identity,status,success,payload,create,flush};

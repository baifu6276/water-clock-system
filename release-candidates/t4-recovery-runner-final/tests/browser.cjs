// Headless real Chromium. All requests are fulfilled/aborted locally; never continue a route.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {root,version,identity,status,success,payload}=require('./harness.cjs');
let passed=0;const tests=[];const scenario=(name,fn)=>tests.push({name,fn});
async function fixture(browser,opt={}){
 const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'}),page=await context.newPage(),calls=[],logs=[],pending=[];
 page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
 await context.addInitScript(()=>{
  window.__requests=[];window.__timers=[];window.__tokens=0;window.__touches=0;window.__consoleCalls=0;
  for(const key of ['log','error','warn','info','debug']){const old=console[key];console[key]=(...a)=>{window.__consoleCalls++;return old(...a);};}
  for(const name of ['localStorage','sessionStorage','indexedDB'])Object.defineProperty(window,name,{get(){window.__touches++;throw Error('PRIVATE_STORAGE');}});
  Object.defineProperty(document,'cookie',{get(){window.__touches++;return '';},set(){window.__touches++;}});
  const oldFetch=window.fetch,oldTimer=window.setTimeout;
  window.fetch=(url,opts)=>{window.__requests.push({redirect:opts.redirect,credentials:opts.credentials,cache:opts.cache,referrerPolicy:opts.referrerPolicy});return oldFetch(url,opts);};
  window.setTimeout=(fn,ms,...a)=>{if(ms===20000)window.__timers.push(fn);return oldTimer(fn,ms,...a);};
 });
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async x=>{window.__init=x;${opt.initFail?'throw Error("PRIVATE_EXCEPTION")':''}},isInClient:()=>${!opt.outside},isLoggedIn:()=>${!opt.loggedOut},getIDToken:()=>{window.__tokens++;return ${opt.noToken?'null':'"PRIVATE_TOKEN_"+window.__tokens'};}};`});
  if(u.hostname==='test.example'){
   const name=u.pathname.split('/').pop()||'index.html';assert(['index.html','client.js'].includes(name));
   if(name==='client.js')assert.equal(u.search,'?v=t4-recovery-original-1');
   return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(root,name))});
  }
  assert.equal(u.origin,'https://employee-identity-transport-t1.baifu6276.workers.dev');assert.equal(u.search,'');assert.equal(request.headers().cookie,undefined);assert.equal(request.headers().referer,undefined);
  assert.equal(request.method(),'POST');assert.equal(request.headers()['content-type'],'text/plain;charset=utf-8');
  const data=request.postDataJSON(),n=calls.length;calls.push({data,path:u.pathname});
  let body=data.action==='identityBootstrap'?identity:data.action==='employeeLifecycleBaselineRequestStatus'?status:success;
  const reply=opt.reply?.({data,n})||{};if(Object.hasOwn(reply,'body'))body=reply.body;
  if(data.action==='employeeLifecycleBaselineMigrate')assert.deepEqual(data,payload(data.idToken));
  assert(['/identity','/employee-operation-status','/employee-baseline-migrate'].includes(u.pathname));
  if(reply.network)return route.abort();if(reply.pending)await new Promise(r=>pending.push(r));
  if(page.isClosed())return;
  return route.fulfill({status:reply.http||200,headers:{'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':Object.hasOwn(reply,'version')?reply.version:version},...(reply.nonJson?{body:'PRIVATE_RESPONSE'}:{json:body})}).catch(e=>{if(!page.isClosed())throw e;});
 });
 await page.goto('https://test.example/index.html?liffId=ATTACK&requestId=ATTACK&snapshot=ATTACK&reason=ATTACK#PRIVATE_QUERY');
 await page.waitForFunction(()=>document.getElementById('init').textContent!=='尚未開始');
 assert.deepEqual(await page.evaluate(()=>window.__init),{liffId:'2011467618-QZYsTwb9'});assert.equal(calls.length,0);
 const force=id=>page.evaluate(id=>{const el=document.getElementById(id);el.disabled=false;el.click();},id);
 const state=()=>page.locator('#state').textContent();
 const settle=()=>page.waitForFunction(()=>!['REVALIDATING','SUBMITTING','STATUS_CHECKING'].includes(document.getElementById('state').textContent));
 const precheck=async()=>{await force('precheck');await page.waitForFunction(()=>!document.getElementById('precheck').disabled);};
 const ready=async()=>{await precheck();assert.equal(await state(),'READY');await page.fill('#confirmation','RECOVER EMP001');};
 const locked=async()=>{const count=calls.length;await force('recover');await force('precheck');assert.equal(calls.length,count);assert(!['READY','PRECHECK'].includes(await state()));};
 const close=async()=>{
  pending.splice(0).forEach(r=>r());const dom=await page.content();assert(!/PRIVATE_|idToken|rawAudit/.test(dom+logs.join('')));assert.equal(await page.evaluate(()=>window.__consoleCalls),0);assert(logs.every(m=>m==='Failed to load resource: net::ERR_FAILED'));
  assert.equal(await page.evaluate(()=>window.__touches),0);assert.deepEqual(await context.cookies(),[]);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const opts of await page.evaluate(()=>window.__requests))assert.deepEqual(opts,{redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  await context.close();
 };return {page,calls,force,state,ready,precheck,settle,locked,close,pending,writes:()=>calls.filter(c=>c.path==='/employee-baseline-migrate')};
}
for(const opt of [{initFail:true},{outside:true},{loggedOut:true},{noToken:true}])scenario('init boundary '+JSON.stringify(opt),async b=>{const f=await fixture(b,opt);for(const id of ['precheck','recover','statusCheck'])await f.force(id);assert.equal(f.calls.length,0);await f.close();});
for(const permission of ['OWNER','ADMIN'])scenario('full sequence '+permission,async b=>{
 const f=await fixture(b,{reply:({data,n})=>data.action==='identityBootstrap'?{body:{...identity,employee:{employeeId:'EMP001',permission},sub:'PRIVATE_SUB'}}:n>=5?{body:{...status,requestStatus:'COMPLETED',historicalCompletion:true}}:{}});await f.ready();
 await f.page.evaluate(()=>{for(const id of ['requestId','snapshot','reason'])document.getElementById(id).textContent='ATTACK';});
 await f.force('recover');await f.settle();assert.equal(await f.state(),'SUCCESS');assert.equal(f.writes().length,1);assert.equal(f.calls.length,5);
 const tokens=f.calls.map(c=>c.data.idToken);assert.equal(new Set(tokens).size,5);await f.locked();await f.force('statusCheck');await f.settle();assert.equal(await f.state(),'STATUS_COMPLETED');await f.locked();await f.close();
});
for(const permission of ['SITE_MANAGER','EMPLOYEE'])scenario('role denial '+permission,async b=>{const f=await fixture(b,{reply:()=>({body:{...identity,employee:{employeeId:'EMP001',permission}}})});await f.precheck();await f.page.evaluate(()=>document.getElementById('confirmation').value='RECOVER EMP001');await f.force('recover');assert.equal(f.writes().length,0);await f.close();});
for(const [name,reply]of [
 ['fresh identity',{body:{...identity,state:'SUSPENDED'}}],['fresh status conflict',{body:{...status,requestStatus:'RECOVERY_REQUIRED',currentConsistency:'CONFLICT',historicalCompletion:null}}],['fresh completed',{body:{...status,requestStatus:'COMPLETED',historicalCompletion:true}}],['fresh network',{network:true}],['wrong version',{version:'t3-4-gas-read-diag'}]
])scenario(name,async b=>{const f=await fixture(b,{reply:({n})=>n===(name==='fresh identity'?2:3)?reply:{}});await f.ready();await f.force('recover');await f.settle();assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');assert.equal(f.writes().length,0);await f.locked();await f.close();});
for(const phrase of ['MIGRATE EMP001','RECOVER EMP001 ',' RECOVER EMP001'])scenario('exact phrase '+phrase,async b=>{const f=await fixture(b);await f.ready();await f.page.fill('#confirmation',phrase);assert(await f.page.locator('#recover').isDisabled());await f.force('recover');assert.equal(f.writes().length,0);await f.close();});
for(const [name,reply]of [['network',{network:true}],['json',{nonJson:true}],['extra',{body:{...success,sub:'PRIVATE_SUB'}}],['missing',{body:{success:true}}],['type',{body:{...success,version:'1'}}],...['PATH_DENIED','RECOVERY_APPROVAL_REQUIRED','CONTROLLED_MIGRATION_DENIED'].map(code=>[code,{body:{success:false,code,message:'PRIVATE_EXCEPTION'}}])])scenario('write error '+name,async b=>{const f=await fixture(b,{reply:({n})=>n===4?reply:{}});await f.ready();await f.force('recover');await f.settle();assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');assert.equal(f.writes().length,1);await f.locked();await f.close();});
for(const n of [2,3,4])scenario('pending/timeout/late n='+n,async b=>{const f=await fixture(b,{reply:({n:i})=>i===n?{pending:true}:{}});await f.ready();await f.force('recover');await f.page.waitForFunction(n=>window.__requests.length===n+1,n);
 await f.force('recover');await f.force('statusCheck');await f.force('precheck');assert.equal(f.calls.length,n+1);await f.page.evaluate(()=>window.__timers.at(-1)());await f.settle();assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');f.pending.splice(0).forEach(r=>r());await f.page.waitForTimeout(30);assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');await f.locked();await f.close();});
for(const [requestStatus,historicalCompletion,currentConsistency,next]of [['COMPLETED',true,'MATCHED','STATUS_COMPLETED'],['STARTED',false,'MATCHED','STATUS_STARTED'],['RECOVERY_REQUIRED',null,'CONFLICT','STATUS_RECOVERY_REQUIRED'],['NOT_OBSERVED',false,'UNKNOWN','WRITE_RESULT_UNKNOWN'],['UNKNOWN',null,'UNKNOWN','WRITE_RESULT_UNKNOWN'],['STARTED',false,'PARTIAL','WRITE_RESULT_UNKNOWN'],['STARTED',false,'ABSENT','WRITE_RESULT_UNKNOWN']])scenario('post status '+requestStatus+'/'+currentConsistency,async b=>{const f=await fixture(b,{reply:({n})=>n>=5?{body:{...status,requestStatus,historicalCompletion,currentConsistency}}:{}});await f.ready();await f.force('recover');await f.settle();await f.force('statusCheck');await f.settle();assert.equal(await f.state(),next);await f.locked();await f.close();});
scenario('known read metadata ignored; unknown fields rejected',async b=>{const f=await fixture(b,{reply:({n,data})=>data.action.endsWith('RequestStatus')?{body:{...status,...(n>=5?{rawAudit:'PRIVATE_AUDIT'}:{_gasReadDiagnostics:{value:'PRIVATE_META'}})}}:{}});await f.ready();await f.force('recover');await f.settle();await f.force('statusCheck');await f.settle();assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');await f.locked();await f.close();});
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{for(const t of tests){await t.fn(browser);passed++;console.log('PASS '+t.name);}console.log(`RECOVERY_BROWSER passed=${passed} failed=0 skipped=0`);}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

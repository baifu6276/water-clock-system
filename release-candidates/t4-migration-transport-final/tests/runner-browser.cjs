// Offline real-browser tests. Every URL is intercepted, including LIFF/relay.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'../../../transport-v2/t4-migration-runner');
const source=fs.readFileSync(path.join(root,'client.js'),'utf8');
const version='t4-safety-2-gas-read-diag',id='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab',snapshot='f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd';
const reason='建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。';
const identity={success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',permission:'ADMIN'}};
const preview={success:true,dryRun:true,employeeId:'EMP001',baselineState:'LEGACY_NOT_BASELINED',eligible:true,snapshotVersion:snapshot};
const success={success:true,employeeId:'EMP001',requestId:id,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED'};
const status={success:true,employeeId:'EMP001',requestId:id,action:'employeeLifecycleBaselineMigrate',requestStatus:'COMPLETED',historicalCompletion:true,currentConsistency:'MATCHED',recoveryAllowed:false,newRequestAllowed:false};
const expected={action:'employeeLifecycleBaselineMigrate',idToken:'PRIVATE_TOKEN',employeeId:'EMP001',requestId:id,expectedSnapshotVersion:snapshot,reason,confirmed:true};
assert(!/console\.|Logger|innerHTML|localStorage|sessionStorage|document\.cookie|indexedDB|script\.google|script\.googleusercontent|getUuid|randomUUID|location\.|URLSearchParams/.test(source));
assert(!/employeeBaselineControl|Recover|employeeApplication|fetch\([^)]*GAS/.test(source));
let passed=0;
async function fixture(browser,opt={}){
 const combined=opt.realWorker?await import(pathToFileURL(path.resolve(__dirname,'../worker/relay.mjs'))):null;
 const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),calls=[],logs=[],pending=[];
 page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
 await page.addInitScript(()=>{
  const original=window.setTimeout;window.__deadlines=[];
  window.setTimeout=(fn,ms,...args)=>{if(ms===20000)window.__deadlines.push(fn);return original(fn,ms,...args);};
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{${opt.initFail?'throw Error("PRIVATE_EXCEPTION")':''}},isInClient:()=>${!opt.outside},isLoggedIn:()=>true,getIDToken:()=>${opt.noToken?'null':'"PRIVATE_TOKEN"'}};`});
  if(url.hostname==='test.example'){
   const name=url.pathname.split('/').pop()||'index.html';assert(['index.html','client.js'].includes(name));
   return route.fulfill({contentType:name.endsWith('js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(root,name),'utf8')});
  }
  assert.equal(url.hostname,'employee-identity-transport-t1.baifu6276.workers.dev');
  assert.equal(request.method(),'POST');assert.equal(request.headers()['content-type'],'text/plain;charset=utf-8');assert.equal(request.headers()['cookie'],undefined);
  const data=request.postDataJSON();calls.push({path:url.pathname,data});
  let body,http=200,v=opt.version||version;
  if(url.pathname==='/identity'){assert.deepEqual(data,{action:'identityBootstrap',idToken:'PRIVATE_TOKEN'});body=opt.identity||identity;}
  else if(url.pathname==='/employee-read'){assert.deepEqual(data,{action:'employeeLifecycleBaselineDryRun',idToken:'PRIVATE_TOKEN',employeeId:'EMP001'});body=opt.preview||preview;}
  else if(url.pathname==='/employee-baseline-migrate'){
   assert.deepEqual(data,expected);
   if(opt.network)return route.abort();
   if(opt.pending)await new Promise(resolve=>pending.push(resolve));
   body=opt.write||success;http=opt.http||200;
  }else if(url.pathname==='/employee-operation-status'){
   assert.deepEqual(data,{action:'employeeLifecycleBaselineRequestStatus',idToken:'PRIVATE_TOKEN',employeeId:'EMP001',requestId:id});
   body=opt.status||status;v=opt.statusVersion||v;
  }else assert.fail('unexpected route');
  const headers={'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':v};
  if(combined){
   let upstreamCalls=0;
   const response=await combined.handle(new Request(url.href,{method:'POST',headers:{origin:'https://test.example','content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),{
    GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://test.example"]',ENVIRONMENT:'development',...(opt.flagOff?{}:{T4_CONTROLLED_MIGRATION_ENABLED:'true'})
   },{now:()=>0,fetchImpl:async(target,options)=>{
    upstreamCalls++;const forwarded=JSON.parse(options.body);
    if(url.pathname==='/employee-baseline-migrate')assert.deepEqual(forwarded,expected);
    else assert.deepEqual(forwarded,{...data,_transportDiagnostics:{version:1,traceId:forwarded._transportDiagnostics.traceId}});
    return Response.json(body);
   }});
   assert.equal(upstreamCalls,opt.flagOff&&url.pathname==='/employee-baseline-migrate'?0:1);
   if(opt.flagOff&&url.pathname==='/employee-baseline-migrate')assert.equal((await response.clone().json()).transportError,'PATH_DENIED');
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  }
  return route.fulfill({status:http,headers,...(opt.nonJson&&url.pathname==='/employee-baseline-migrate'?{body:'PRIVATE_RESPONSE PRIVATE_TOKEN'}:{json:body})});
 });
 await page.goto('https://test.example/index.html');
 await page.waitForFunction(()=>document.getElementById('init').textContent!=='尚未開始');
 assert.equal(calls.length,0);
 const force=async name=>page.evaluate(n=>{const b=document.getElementById(n);b.disabled=false;b.click();},name);
 const check=async()=>{await force('precheck');await page.waitForFunction(()=>!document.getElementById('precheck').disabled||document.getElementById('error').textContent!=='無');};
 const ready=async()=>{await check();assert.equal(await page.locator('#state').textContent(),'READY');await page.fill('#confirmation','MIGRATE EMP001');};
 const writes=()=>calls.filter(c=>c.path==='/employee-baseline-migrate');
 const settle=async()=>page.waitForFunction(()=>!['SUBMITTING','STATUS_CHECKING'].includes(document.getElementById('state').textContent));
 const safe=async()=>{
  const html=await page.content();assert(!/PRIVATE_TOKEN|PRIVATE_SUB|PRIVATE_EXCEPTION|PRIVATE_RESPONSE|PRIVATE_AUDIT|PRIVATE_HASH/.test(html+logs.join('')));
  assert(!html.includes('&quot;idToken&quot;'));assert.equal((await context.cookies()).length,0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 };
 const close=async()=>{pending.forEach(r=>r());await safe();await context.close();};
 return {page,context,calls,logs,force,check,ready,writes,settle,safe,close,pending};
}
async function scenario(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  for(const opt of [{initFail:true},{outside:true},{noToken:true}])await scenario('init guard '+JSON.stringify(opt),async()=>{
   const f=await fixture(browser,opt);await f.force('precheck');await f.force('migrate');await f.force('statusCheck');assert.equal(f.calls.length,0);await f.close();
  });
  const denies=[['auth fail',{identity:{success:false,code:'AUTH_ERROR',message:'PRIVATE_EXCEPTION'}}],['wrong employee',{identity:{...identity,employee:{employeeId:'EMP002',permission:'ADMIN'}}}],
   ...['EMPLOYEE','SITE_MANAGER','UNKNOWN'].map(permission=>[permission,{identity:{...identity,employee:{employeeId:'EMP001',permission}}}]),
   ...['SUSPENDED','LEAVE','TERMINATED','UNREGISTERED','APPLICATION_PENDING'].map(state=>[state,{identity:{...identity,state}}]),
   ['ineligible',{preview:{...preview,eligible:false}}],['already baselined',{preview:{...preview,baselineState:'ALREADY_BASELINED'}}],['changed snapshot',{preview:{...preview,snapshotVersion:'a'.repeat(64)}}],
   ...['t3-4-gas-read-diag','t4-safety-1','UNKNOWN',''].map(v=>['version '+v,{version:v||'PRIVATE_SUB'}])];
  for(const[name,opt]of denies)await scenario('precheck denied '+name,async()=>{
   const f=await fixture(browser,opt);await f.check();assert.notEqual(await f.page.locator('#state').textContent(),'READY');
   await f.page.evaluate(()=>{document.getElementById('confirmation').value='MIGRATE EMP001';});await f.force('migrate');assert.equal(f.writes().length,0);await f.close();
  });
  for(const permission of ['OWNER','ADMIN'])await scenario('authorized fixed payload '+permission,async()=>{
   const f=await fixture(browser,{identity:{...identity,employee:{employeeId:'EMP001',permission},sub:'PRIVATE_SUB',rawAudit:'PRIVATE_AUDIT'}});await f.ready();
   await f.page.evaluate(()=>{document.getElementById('requestId').textContent='ATTACK_ID';document.getElementById('snapshot').textContent='ATTACK_SNAPSHOT';document.getElementById('reason').textContent='ATTACK_REASON';});
   await f.force('migrate');await f.settle();assert.equal(await f.page.locator('#state').textContent(),'SUCCESS');assert.equal(f.writes().length,1);
   await f.force('migrate');await f.force('precheck');assert.equal(f.writes().length,1);assert.equal(f.calls.length,3);await f.close();
  });
  await scenario('wrong confirmation forced DOM denied',async()=>{const f=await fixture(browser);await f.ready();await f.page.fill('#confirmation','migrate EMP001');assert(await f.page.locator('#migrate').isDisabled());await f.force('migrate');assert.equal(f.writes().length,0);await f.close();});
  await scenario('double click while write pending',async()=>{const f=await fixture(browser,{pending:true});await f.ready();await f.force('migrate');await f.page.waitForFunction(()=>document.getElementById('state').textContent==='SUBMITTING');await f.force('migrate');await f.force('statusCheck');await f.force('precheck');assert.equal(f.writes().length,1);f.pending.forEach(r=>r());await f.settle();await f.close();});
  const failures=[['network',{network:true}],['worker timeout',{write:{success:false,transportError:'UPSTREAM_TIMEOUT'},http:504}],['business deny',{write:{success:false,code:'CONTROLLED_MIGRATION_DENIED',message:'PRIVATE_EXCEPTION'}}],['nonJSON',{nonJson:true}],['extra success field',{write:{...success,sub:'PRIVATE_SUB'}}],
   ...Object.keys(success).map(key=>{const write={...success};delete write[key];return['missing success '+key,{write}];}),
   ...[['employeeId','EMP002'],['requestId','wrong'],['baselineState','ALREADY_BASELINED'],['version','1'],['recoveryStatus','STARTED'],['success',false]].map(([key,value])=>['wrong success '+key,{write:{...success,[key]:value}}])];
  for(const[name,opt]of failures)await scenario('write terminal '+name,async()=>{
   const f=await fixture(browser,opt);await f.ready();await f.force('migrate');await f.settle();assert.equal(await f.page.locator('#state').textContent(),'WRITE_RESULT_UNKNOWN');assert((await f.page.locator('#message').textContent()).includes('結果未知，僅能查原請求狀態'));
   await f.force('migrate');await f.force('precheck');assert.equal(f.writes().length,1);assert.equal(f.calls.length,3);await f.close();
  });
  await scenario('local global deadline freezes late response',async()=>{
   const f=await fixture(browser,{pending:true});await f.ready();await f.force('migrate');await f.page.waitForTimeout(30);
   await f.page.evaluate(()=>window.__deadlines.at(-1)());await f.settle();assert.equal(await f.page.locator('#state').textContent(),'WRITE_RESULT_UNKNOWN');
   f.pending.forEach(r=>r());await f.page.waitForTimeout(30);assert.equal(await f.page.locator('#state').textContent(),'WRITE_RESULT_UNKNOWN');await f.force('migrate');assert.equal(f.writes().length,1);await f.close();
  });
  const statusCases=[['COMPLETED','MATCHED',true,'STATUS_COMPLETED'],['STARTED','PARTIAL',false,'STATUS_STARTED'],['STARTED','ABSENT',false,'STATUS_STARTED'],['NOT_OBSERVED','UNKNOWN',false,'STATUS_NOT_OBSERVED'],['UNKNOWN','UNKNOWN',null,'WRITE_RESULT_UNKNOWN'],['RECOVERY_REQUIRED','CONFLICT',null,'STATUS_RECOVERY_REQUIRED'],['CONFLICT','CONFLICT',null,'WRITE_RESULT_UNKNOWN']];
  for(const[requestStatus,currentConsistency,historicalCompletion,next]of statusCases)await scenario('status '+requestStatus+' '+currentConsistency,async()=>{
   const f=await fixture(browser,{write:{success:false,transportError:'UPSTREAM_TIMEOUT'},http:504,status:{...status,requestStatus,currentConsistency,historicalCompletion,rawAudit:'PRIVATE_AUDIT',sub:'PRIVATE_SUB'}});await f.ready();await f.force('migrate');await f.settle();await f.force('statusCheck');await f.settle();
   assert.equal(await f.page.locator('#state').textContent(),next);assert.equal(f.calls.at(-1).data.requestId,id);await f.force('migrate');await f.force('precheck');assert.equal(f.writes().length,1);await f.close();
  });
  for(const opt of [{status:{...status,recoveryAllowed:true,newRequestAllowed:true}},{status:{...status,requestId:'OTHER'}},{status:{...status,currentConsistency:'CONFLICT'}},{statusVersion:'PRIVATE_SUB'}])await scenario('unsafe status never grants write '+JSON.stringify(opt),async()=>{
   const f=await fixture(browser,opt);await f.ready();await f.force('migrate');await f.settle();await f.force('statusCheck');await f.settle();assert.equal(await f.page.locator('#state').textContent(),'WRITE_RESULT_UNKNOWN');await f.force('migrate');assert.equal(f.writes().length,1);await f.close();
  });
  await scenario('rollback permits only status read after attempt',async()=>{
   const f=await fixture(browser,{statusVersion:'t3-4-gas-read-diag'});await f.ready();await f.force('migrate');await f.settle();await f.force('statusCheck');await f.settle();assert.equal(await f.page.locator('#state').textContent(),'STATUS_COMPLETED');await f.force('migrate');assert.equal(f.writes().length,1);await f.close();
  });
  for(const flagOff of [true,false])await scenario('actual candidate Worker + runner; mock GAS flagOff='+flagOff,async()=>{
   const f=await fixture(browser,{realWorker:true,flagOff});await f.ready();await f.force('migrate');await f.settle();
   assert.equal(await f.page.locator('#state').textContent(),flagOff?'WRITE_RESULT_UNKNOWN':'SUCCESS');
   // Existing gate precedes CORS origin acceptance: no exposed version header.
   // Do not relax the Worker to manufacture a more convenient browser error.
   if(flagOff)assert.equal(await f.page.locator('#error').textContent(),'TRANSPORT_VERSION_REQUIRED');
   await f.force('statusCheck');await f.settle();assert.equal(await f.page.locator('#state').textContent(),'STATUS_COMPLETED');
   await f.force('migrate');assert.equal(f.writes().length,1);await f.close();
  });
  console.log(`RUNNER_BROWSER passed=${passed} failed=0 skipped=0`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

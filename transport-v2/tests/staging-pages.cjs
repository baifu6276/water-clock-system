// All browser requests (including the production-looking Pages URLs) are intercepted.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const f=require('./staging-fixture.cjs');globalThis.fetch=()=>assert.fail('REAL_NETWORK_FORBIDDEN');
const privateRe=/PRIVATE_(TOKEN|SUB|LINE_RESPONSE|GAS_BODY|COOKIE|URL|QUERY|STACK|AUDIT)/;
(async()=>{
 const worker=await import(pathToFileURL(path.join(f.repo,'transport-v2/worker/relay.mjs')));
 const rollback=await import('data:text/javascript;base64,'+f.rollback().toString('base64'));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 let count=0;const pass=name=>{count++;console.log('PASS '+name);};
 const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'}),calls=[],assets=[],logs=[];
 let flag=false,useRollback=false,writeMode='success';
 const pagesRoot='/water-clock-system/',pagesOrigin='https://baifu6276.github.io';
 await context.addInitScript(()=>{
  window.__liffInit=null;window.__storageTouches=0;
  for(const name of ['localStorage','sessionStorage'])Object.defineProperty(window,name,{get(){window.__storageTouches++;throw Error('STORAGE_DENIED');}});
 });
 await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  assert(!privateRe.test(request.url()));assert.equal(request.headers().cookie,undefined);
  if(u.origin===pagesOrigin){
   assert(u.pathname.startsWith(pagesRoot));const rel=u.pathname.slice(pagesRoot.length);
   assert(['transport-v2/live-test/index.html','transport-v2/live-test/client.js','transport-v2/live-test/config.js','transport-v2/t4-migration-runner/index.html','transport-v2/t4-migration-runner/client.js'].includes(rel));
   assets.push(rel);return route.fulfill({contentType:rel.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(f.repo,rel))});
  }
  if(u.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async x=>{window.__liffInit=x},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>"PRIVATE_TOKEN"};'});
  assert.equal(u.origin,'https://employee-identity-transport-t1.baifu6276.workers.dev');
  const data=request.postDataJSON();calls.push({path:u.pathname,data});
  const implementation=useRollback?rollback:worker;
  const response=await implementation.handle(new Request(u.href,{method:'POST',headers:{origin:pagesOrigin,'content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),{...f.env,...(flag?{T4_CONTROLLED_MIGRATION_ENABLED:'true'}:{})},{now:()=>0,fetchImpl:async(url,options)=>{
   assert.equal(url,f.env.GAS_UPSTREAM);const sent=JSON.parse(options.body);
   if(data.action===f.payload.action){
    assert.deepEqual(sent,f.payload);assert.equal(Object.keys(sent).length,7);
    return Response.json(writeMode==='success'?f.success:{success:false,code:'AUTH_ERROR',message:'PRIVATE_GAS_BODY',sub:'PRIVATE_SUB',stack:'PRIVATE_STACK'});
   }
   assert.deepEqual(sent,{...data,_transportDiagnostics:{version:1,traceId:sent._transportDiagnostics.traceId}});
   const result=data.action==='identityBootstrap'?f.identity:data.action==='employeeLifecycleBaselineDryRun'?f.preview:f.status();
   return Response.json({...result,_gasReadDiagnostics:{version:1,transportTraceId:sent._transportDiagnostics.traceId,total:'LT_100',stages:Object.fromEntries(['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'].map(k=>[k,'NOT_RUN']))}});
  }});
  assert(!privateRe.test(JSON.stringify([...response.headers])));
  return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 async function open(which,query=''){
  const page=await context.newPage();page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
  const start=assets.length;
  await page.goto(pagesOrigin+pagesRoot+'transport-v2/'+which+'/index.html'+query);
  await page.waitForFunction(()=>window.__liffInit!==null);
  assert.deepEqual(await page.evaluate(()=>window.__liffInit),{liffId:which==='live-test'?'2011467618-R76314It':'2011467618-QZYsTwb9'});
  await page.waitForFunction(()=>document.getElementById('check')?!document.getElementById('check').disabled:!document.getElementById('precheck').disabled);
  const loaded=assets.slice(start);assert(loaded.includes('transport-v2/'+which+'/client.js'));
  assert(!loaded.some(n=>n.includes(which==='live-test'?'t4-migration-runner/':'live-test/')));
  return page;
 }
 const click=async(page,id)=>{await page.click('#'+id);await page.waitForFunction(i=>!document.getElementById(i).disabled,id);};
 const precheck=async page=>{await click(page,'precheck');};
 const writes=()=>calls.filter(c=>c.data.action===f.payload.action).length;
 async function safe(page){
  assert(!privateRe.test(await page.content()+logs.join('')));assert.equal(await page.evaluate(()=>window.__storageTouches),0);
  assert.equal((await context.cookies()).length,0);assert.equal(context.serviceWorkers().length,0);
 }
 try{
  const read=await open('live-test','?liffId=evil&relayEndpoint=https%3A%2F%2Fevil.example');
  await click(read,'check');assert.equal(await read.locator('#state').textContent(),'ACTIVE_EMPLOYEE');pass('Pages read identity + query ignored');
  await click(read,'baselineCheck');assert((await read.locator('#baselineStatus').textContent()).includes('可進行'));pass('Pages baseline');
  await read.fill('#operationRequestId',f.payload.requestId);await click(read,'operationStatusCheck');assert((await read.locator('#operationStatusFields').textContent()).includes('COMPLETED'));pass('Pages status');
  const runnerOff=await open('t4-migration-runner','?requestId=evil&liffId=evil');await precheck(runnerOff);
  await runnerOff.fill('#confirmation','WRONG');await runnerOff.evaluate(()=>{const b=document.getElementById('migrate');b.disabled=false;b.click();});assert.equal(writes(),0);pass('wrong confirmation forced DOM denied');
  await runnerOff.fill('#confirmation','MIGRATE EMP001');await runnerOff.click('#migrate');await runnerOff.waitForFunction(()=>document.getElementById('state').textContent==='WRITE_RESULT_UNKNOWN');assert.equal(writes(),1);pass('flag OFF freezes runner');
  await safe(runnerOff);await runnerOff.close();
  flag=true;const runner=await open('t4-migration-runner');await precheck(runner);await runner.fill('#confirmation','MIGRATE EMP001');
  await runner.evaluate(()=>{const b=document.getElementById('migrate');b.click();b.disabled=false;b.click();document.getElementById('statusCheck').click();document.getElementById('precheck').click();});
  await runner.waitForFunction(()=>document.getElementById('state').textContent==='SUCCESS');assert.equal(writes(),2);pass('fresh offline document flag ON exactly one success');
  await click(runner,'statusCheck');assert.equal(await runner.locator('#state').textContent(),'STATUS_COMPLETED');pass('original request completed/matched');
  flag=false;useRollback=true;
  await click(runner,'statusCheck');assert.equal(await runner.locator('#state').textContent(),'STATUS_COMPLETED');
  await runner.evaluate(()=>{for(const id of ['migrate','precheck']){const b=document.getElementById(id);b.disabled=false;b.click();}});
  assert.equal(writes(),2);pass('after-attempt rollback status readable, no second write');
  await click(read,'check');await click(read,'baselineCheck');await click(read,'operationStatusCheck');assert.equal(await read.locator('#error').textContent(),'無');pass('rollback identity/dry-run/status all readable');
  const blocked=await open('t4-migration-runner');await precheck(blocked);assert.equal(await blocked.locator('#error').textContent(),'TRANSPORT_VERSION_REQUIRED');assert(await blocked.locator('#migrate').isDisabled());pass('rollback new runner precheck fail closed');
  await safe(blocked);await safe(read);await safe(runner);
  useRollback=false;flag=true;writeMode='business';const privatePage=await open('t4-migration-runner');await precheck(privatePage);await privatePage.fill('#confirmation','MIGRATE EMP001');await privatePage.click('#migrate');
  await privatePage.waitForFunction(()=>document.getElementById('state').textContent==='WRITE_RESULT_UNKNOWN');await safe(privatePage);pass('raw business response never rendered/logged');
  assert.equal(new Set(assets).size,5);assert(calls.every(c=>['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus',f.payload.action].includes(c.data.action)));
  pass('all five Pages paths, LIFF separation, no cookies/storage/service worker');
  console.log('STAGING_PAGES passed='+count+' failed=0 skipped=0');
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Patched read-only frontend + real candidate/rollback Worker, fake GAS only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
globalThis.fetch=()=>assert.fail('REAL_NETWORK_FORBIDDEN');
const root=path.resolve(__dirname,'..'),front=path.join(root,'live-test');
const identity={success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'操作員',permission:'ADMIN'}};
const preview={success:true,dryRun:true,employeeId:'EMP001',name:'操作員',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2200,systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:true,warnings:['HIRE_DATE_UNKNOWN'],snapshotVersion:'a'.repeat(64)};
const requestId='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';
(async()=>{
 const combined=await import(pathToFileURL(path.join(root,'worker/relay.mjs'))),rollback=await import(pathToFileURL(path.join(root,'evidence/t3-4-relay.mjs')));
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});let passed=0;
 try{
  for(const scenario of ['flag-off','flag-on','owner','rollback-before','rollback-between','malformed-timing','missing-timing','malformed-gas','missing-gas','unknown-version']){
   const context=await browser.newContext(),page=await context.newPage(),calls=[],logs=[];let readCount=0;
   page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>"PRIVATE_TOKEN"};'});
    if(url.hostname==='test.example'){
     const n=url.pathname.split('/').pop()||'index.html';assert(['index.html','config.js','client.js'].includes(n));
     return route.fulfill({contentType:n.endsWith('js')?'text/javascript':'text/html',body:n==='config.js'?'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(front,n),'utf8')});
    }
    assert.equal(url.hostname,'relay.example');const data=route.request().postDataJSON();calls.push(data);readCount++;
    const worker=scenario==='rollback-before'||scenario==='rollback-between'&&readCount>1?rollback:combined;
    const response=await worker.handle(new Request(url.href,{method:'POST',headers:{origin:'https://test.example','content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),{
     GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://test.example"]',ENVIRONMENT:'development',...(scenario==='flag-on'?{T4_CONTROLLED_MIGRATION_ENABLED:'true'}:{})
    },{now:()=>0,fetchImpl:async(target,options)=>{
     const p=JSON.parse(options.body);assert.deepEqual(p,{...data,_transportDiagnostics:{version:1,traceId:p._transportDiagnostics.traceId}});
     assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(p.action));
     const result=p.action==='identityBootstrap'?{...identity,employee:{...identity.employee,permission:scenario==='owner'?'OWNER':'ADMIN'}}:p.action==='employeeLifecycleBaselineDryRun'?preview:
      {success:true,employeeId:'EMP001',requestId,action:'employeeLifecycleBaselineMigrate',requestStatus:'NOT_OBSERVED',historicalCompletion:false,currentConsistency:'UNKNOWN',recoveryAllowed:false,newRequestAllowed:false};
     const d={version:1,transportTraceId:p._transportDiagnostics.traceId,total:'LT_100',stages:Object.fromEntries(['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'].map(k=>[k,'NOT_RUN']))};
     return Response.json({...result,...(scenario==='missing-gas'?{}:{_gasReadDiagnostics:scenario==='malformed-gas'?{...d,raw:'PRIVATE_AUDIT'}:d})});
    }});
    const headers=Object.fromEntries(response.headers);if(scenario==='malformed-timing')headers['x-transport-timing']='PRIVATE_TOKEN';
    if(scenario==='missing-timing')delete headers['x-transport-timing'];if(scenario==='unknown-version')headers['x-transport-version']='PRIVATE_SUB';
    return route.fulfill({status:response.status,headers,body:await response.text()});
   });
   await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);assert.equal(calls.length,0);
   await page.click('#check');await page.waitForFunction(()=>!document.getElementById('check').disabled);assert.equal(await page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');
   if(scenario==='unknown-version'){
    assert(await page.locator('#operationStatusCheck').isDisabled());await page.evaluate(()=>{document.getElementById('operationRequestId').value='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';const b=document.getElementById('operationStatusCheck');b.disabled=false;b.click();});assert.equal(calls.length,1);
   }else{
    await page.click('#baselineCheck');await page.waitForFunction(()=>!document.getElementById('baselineCheck').disabled);assert((await page.locator('#baselineStatus').textContent()).includes('可進行'));
    await page.fill('#operationRequestId',requestId);await page.click('#operationStatusCheck');await page.waitForFunction(()=>!document.getElementById('operationStatusCheck').disabled);
    assert.equal(calls.length,3);assert.equal(calls[2].requestId,requestId);assert((await page.locator('#operationStatusFields').textContent()).includes('NOT_OBSERVED'));
    assert.equal(await page.locator('#timingAvailability').textContent(),['missing-timing','malformed-timing'].includes(scenario)?'無法取得':'可用');
    assert.equal(await page.locator('#gasTimingAvailability').textContent(),['missing-gas','malformed-gas'].includes(scenario)?'無法取得':'可用');assert.equal(await page.locator('#error').textContent(),'無');
   }
   assert(!/PRIVATE_TOKEN|PRIVATE_SUB|PRIVATE_AUDIT/.test(await page.content()+logs.join('')));await context.close();passed++;console.log('PASS READ_COMPAT '+scenario);
  }
  console.log(`READ_COMPATIBILITY passed=${passed} failed=0 skipped=0`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

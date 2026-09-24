// Every request is intercepted; no Worker/LINE/GAS/Sheets network access.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../controlled-test'),KEY='water-clock:t4:EMP001:operation:v1';
const action='employeeLifecycleBaselineMigrate', secret='PRIVATE_TOKEN';
const statuses={COMPLETED:[true,'MATCHED'],STARTED:[false,'PARTIAL'],NOT_OBSERVED:[false,'UNKNOWN'],UNKNOWN:[null,'UNKNOWN'],RECOVERY_REQUIRED:[null,'CONFLICT']};
let count=0;
async function setup(browser,scenario,role='ADMIN',state='ACTIVE_EMPLOYEE'){
  const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),calls=[],logs=[];
  page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
  if(scenario==='storage-failure')await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('PRIVATE_STORAGE');};});
  if(scenario==='timeout')await context.addInitScript(()=>{const real=window.setTimeout;window.setTimeout=(fn,ms,...args)=>real(fn,ms===25000?30:ms,...args);});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,getIDToken:()=>"${secret}",login:()=>{}};`});
    if(url.hostname==='relay.example'){
      const p=route.request().postDataJSON();calls.push(p);assert.equal(route.request().method(),'POST');assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
      let body;
      if(p.action==='identityBootstrap')body={success:true,state,employee:{employeeId:'EMP001',permission:role},sub:'PRIVATE_SUB'};
      else if(p.action==='employeeLifecycleBaselineDryRun')body={success:true,dryRun:true,employeeId:'EMP001',name:scenario==='malicious'?'<img src=x onerror=alert(1)>':'測試',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2200,systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:true,warnings:['HIRE_DATE_UNKNOWN'],snapshotVersion:'a'.repeat(64),lineSub:'PRIVATE_SUB',requestHash:'PRIVATE_HASH',audit:'PRIVATE_AUDIT'};
      else if(p.action===action){
        assert.equal(url.pathname,'/employee-baseline-migrate');assert.deepEqual(Object.keys(p).sort(),['action','idToken','employeeId','requestId','expectedSnapshotVersion','reason','confirmed'].sort());assert.equal(p.employeeId,'EMP001');
        if(scenario==='network')return route.abort();
        if(scenario==='timeout'){await new Promise(r=>setTimeout(r,90));return route.fulfill({json:{success:true}}).catch(()=>{});}
        if(scenario==='non-json')return route.fulfill({body:'PRIVATE_BODY PRIVATE_EXCEPTION',headers:{'x-transport-version':'t4-safety-1'}});
        if(scenario==='duplicate-click')await new Promise(r=>setTimeout(r,60));
        body=scenario==='error'?{success:false,code:'PRIVATE_EXCEPTION',message:'PRIVATE_SUB',stack:'PRIVATE_STACK'}:
          {success:true,employeeId:'EMP001',requestId:p.requestId,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED',raw:'PRIVATE_BODY'};
        if(scenario==='wrong-id')body.requestId='wrong-response-0001';
      }else if(p.action==='employeeLifecycleBaselineRequestStatus'){
        assert.equal(url.pathname,'/employee-operation-status');const s=statuses[scenario]?scenario:'COMPLETED';const [historicalCompletion,currentConsistency]=statuses[s];
        body={success:true,employeeId:'EMP001',requestId:p.requestId,action,requestStatus:s,historicalCompletion,currentConsistency,recoveryAllowed:false,newRequestAllowed:false,raw:'PRIVATE_AUDIT'};
        if(scenario==='bad-status')body.recoveryAllowed=true;
      }else throw Error('Unexpected action');
      return route.fulfill({json:body,headers:{'x-transport-version':scenario==='old-version'?'t3-2-status-only':'t4-safety-1','access-control-allow-origin':'https://offline.example','access-control-expose-headers':'x-transport-version'}});
    }
    assert.equal(url.hostname,'offline.example','all external routes must be intercepted');
    if(url.pathname.endsWith('/config.js'))return route.fulfill({contentType:'text/javascript',body:"window.TransportT1Config={liffId:'offline',relayEndpoint:'https://relay.example/identity'};"});
    const file=url.pathname.split('/').pop();assert(['index.html','client.js'].includes(file));
    return route.fulfill({contentType:file.endsWith('js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(root,file),'utf8')});
  });
  await page.goto('https://offline.example/controlled-test/index.html');await page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);
  assert.equal(calls.length,0);await page.click('#identityCheck');await page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);
  return {context,page,calls,logs};
}
async function prepared(t){
  await t.page.click('#preview');await t.page.waitForFunction(()=>!document.getElementById('prepare').disabled);
  await t.page.fill('#reason','人工確認測試');await t.page.check('#confirmed');await t.page.click('#prepare');
}
async function privacy(t){
  const text=await t.page.locator('body').innerHTML(),stored=await t.page.evaluate(()=>JSON.stringify({...localStorage}));
  assert(!/PRIVATE_|a{64}/.test(text+stored+t.logs.join('')));assert(!stored.includes('人工確認測試'));
  assert.equal(await t.page.locator('img').count(),0);assert(await t.page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
}
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    for(const [role,state] of [['SITE_MANAGER','ACTIVE_EMPLOYEE'],['EMPLOYEE','ACTIVE_EMPLOYEE'],['ADMIN','TERMINATED'],['OWNER','SUSPENDED'],['ADMIN','LEAVE'],['ADMIN','UNREGISTERED']]){
      const t=await setup(browser,'gate',role,state);assert.equal(await t.page.locator('#management').isVisible(),false);
      await t.page.evaluate(()=>{for(const id of ['preview','prepare','submit','statusCheck']){const b=document.getElementById(id);b.disabled=false;b.click();}});
      assert.equal(t.calls.length,1);await privacy(t);await t.context.close();count++;
    }
    for(const scenario of ['ADMIN','OWNER','duplicate-click','network','timeout','non-json','error','wrong-id','malicious',...Object.keys(statuses),'bad-status']){
      const t=await setup(browser,scenario,scenario==='OWNER'?'OWNER':'ADMIN');await prepared(t);
      const id=await t.page.locator('#requestId').textContent();assert.match(id,/^t4-baseline-/);
      await t.page.click('#submit');
      if(scenario==='duplicate-click')await t.page.evaluate(()=>{const b=document.getElementById('submit');b.disabled=false;b.click();});
      await t.page.waitForFunction(()=>!document.getElementById('statusCheck').disabled);
      assert.equal(t.calls.filter(p=>p.action===action).length,1);
      if(['network','timeout','non-json','error','wrong-id'].includes(scenario))assert((await t.page.locator('#message').textContent()).includes('結果尚未確認'));
      await t.page.evaluate(()=>{for(const id of ['submit','prepare','preview']){const b=document.getElementById(id);b.disabled=false;b.click();}});
      assert.equal(t.calls.filter(p=>p.action===action).length,1);
      await t.page.click('#statusCheck');await t.page.waitForFunction(()=>!document.getElementById('statusCheck').disabled);
      assert.equal(t.calls.at(-1).requestId,id);assert.equal(t.calls.at(-1).action,'employeeLifecycleBaselineRequestStatus');
      if(scenario==='bad-status')assert.equal(await t.page.locator('#error').textContent(),'RESPONSE_INVALID');
      else assert((await t.page.locator('#statusFields').textContent()).includes(statuses[scenario]?scenario:'COMPLETED'));
      await privacy(t);
      await t.page.reload();await t.page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);await t.page.click('#identityCheck');await t.page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);
      assert.equal(await t.page.locator('#requestId').textContent(),id);assert.equal(await t.page.locator('#submit').isDisabled(),true);assert.equal(await t.page.locator('#prepare').isDisabled(),true);
      assert.equal(t.calls.filter(p=>p.action===action).length,1);await privacy(t);await t.context.close();count++;
    }
    for(const scenario of ['validation','storage-failure','old-version','storage-change','prepared-reload']){
      const t=await setup(browser,scenario);
      if(scenario==='old-version'){assert.equal(await t.page.locator('#management').isVisible(),false);assert.equal(t.calls.length,1);}
      else if(scenario==='validation'){
        await t.page.click('#preview');await t.page.waitForFunction(()=>!document.getElementById('prepare').disabled);await t.page.click('#prepare');
        assert.equal(await t.page.locator('#error').textContent(),'VALIDATION_ERROR');assert.equal(await t.page.locator('#submit').isDisabled(),true);
      }else{
        await prepared(t);
        if(scenario==='storage-failure')assert.equal(await t.page.locator('#error').textContent(),'STORAGE_ERROR');
        if(scenario==='storage-change')await t.page.evaluate(key=>{localStorage.removeItem(key);window.dispatchEvent(new StorageEvent('storage',{key}));},KEY);
        if(scenario==='prepared-reload'){await t.page.reload();await t.page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);await t.page.click('#identityCheck');await t.page.waitForFunction(()=>!document.getElementById('identityCheck').disabled);}
        await t.page.evaluate(()=>{const b=document.getElementById('submit');b.disabled=false;b.click();});
      }
      assert.equal(t.calls.filter(p=>p.action===action).length,0);await privacy(t);await t.context.close();count++;
    }
    console.log(`PASS: ${count} T4 browser scenarios; no real network or Sheets writes.`);
  }finally{await browser.close();}
})().catch(error=>{console.error('T4 offline browser failure',error);process.exitCode=1;});

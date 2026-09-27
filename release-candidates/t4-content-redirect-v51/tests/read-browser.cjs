// Browser requests are fulfilled locally; no route.continue().
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'../../../transport-v2/live-test');
const f=require('../../../transport-v2/tests/staging-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});let count=0;
 try{for(const version of ['t1-1','t3-1','t3-2-status-only','t3-3-timing-diag','t3-4-gas-read-diag','t4-safety-1','t4-safety-2-gas-read-diag','t4-safety-3-content-redirect']){
  const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'}),page=await context.newPage(),calls=[],logs=[];
  page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getIDToken:()=>"PRIVATE_TOKEN"};'});
   if(u.hostname==='test.example'){
    const n=u.pathname.split('/').pop();assert(['client.js','config.js','index.html'].includes(n));
    if(n==='client.js')assert.equal(u.search,'?v=t4-safety-3-content-redirect');
    return route.fulfill({contentType:n.endsWith('.js')?'text/javascript':'text/html',body:fs.readFileSync(path.join(root,n))});
   }
   assert.equal(u.hostname,'employee-identity-transport-t1.baifu6276.workers.dev');
   const data=req.postDataJSON();calls.push(data);assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(data.action));
   const body=data.action==='identityBootstrap'?f.identity:data.action.endsWith('DryRun')?f.preview:f.status();
   return route.fulfill({json:{...body,sub:'PRIVATE_SUB'},headers:{'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':version}});
  });
  await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
  const click=async id=>{await page.click('#'+id);await page.waitForFunction(()=>!document.getElementById('check').disabled);};
  await click('check');assert.equal(await page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');assert.equal(await page.locator('#version').textContent(),version);count++;
  await click('baselineCheck');assert((await page.locator('#baselineStatus').textContent()).includes('可進行'));count++;
  await page.evaluate(id=>{document.getElementById('operationRequestId').value=id;},f.payload.requestId);
  const before=calls.length;await page.evaluate(()=>{const b=document.getElementById('operationStatusCheck');b.disabled=false;b.click();});await page.waitForFunction(()=>!document.getElementById('check').disabled);
  if(['t1-1','t3-1'].includes(version))assert.equal(calls.length,before);else{assert.equal(calls.length,before+1);assert((await page.locator('#operationStatusFields').textContent()).includes('COMPLETED'));}count++;
  assert(!/PRIVATE_|idToken|rawAudit/.test(await page.content()+logs.join('')));assert.equal(logs.length,0);await context.close();
 }}finally{await browser.close();}
 console.log('READ_COMPAT passed='+count+' failed=0 skipped=0');
})().catch(e=>{console.error(e);process.exitCode=1;});

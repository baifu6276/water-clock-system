// Actual candidate GAS + actual read-only Worker + actual current-main frontend.
// Every URL is intercepted; no deployment client or real identity is used.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const {env}=require('./service-fixture.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
globalThis.fetch=()=>{throw Error('Unexpected real fetch');};
const frontend=process.env.FRONTEND_ROOT;
assert(frontend,'Set FRONTEND_ROOT to the reviewed frontend worktree');
const workerRoot=path.resolve(__dirname,'../../..');
const current=fs.readFileSync(path.join(workerRoot,'transport-v2/worker/relay.mjs'),'utf8');
const rollback=execFileSync('git',['show','c4ba55ca147da676759d7098f60ce4a4e31a77d3:transport-v2/worker/relay.mjs'],{cwd:workerRoot,encoding:'utf8'});
const scenarios=['identity-admin','identity-owner','identity-employee','all-three-reads','flag-off','malformed-diagnostics','trace-mismatch',
  'action-schema-error','lock-busy','locked-role-lost','worker-rollback','ordered-full-rollback','incorrect-rollback-order','timeout-after-gas','redirect-denied'];
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try {
    for(const scenario of scenarios){
      const e=env(),row=e.tables['員工資料表'].rows[1];
      Object.assign(row,{0:'EMP001',2:'操作員',3:'師傅',4:'日薪',5:2200,6:scenario==='identity-owner'?'OWNER':scenario==='identity-employee'?'EMPLOYEE':'ADMIN'});
      let clock=0,gasCalls=0,serialized=0,postCalls=0,getCalls=0;
      const oldGas=['ordered-full-rollback','incorrect-rollback-order'].includes(scenario);
      if(oldGas)for(const file of fs.readdirSync(path.join(__dirname,'../../gas-v44-read-diagnostics/evidence/v44-sources')).filter(f=>f.endsWith('.gs'))){
        vm.runInContext(fs.readFileSync(path.join(__dirname,'../../gas-v44-read-diagnostics/evidence/v44-sources',file),'utf8'),e.ctx,{filename:file});
      }
      e.ctx.PropertiesService.getScriptProperties=()=>({getProperty:key=>key==='READ_DIAGNOSTICS_ENABLED'?(scenario==='flag-off'?'false':'true'):'test-channel'});
      e.ctx.UrlFetchApp.fetch=(url,options)=>{
        assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');assert.equal(options.payload.id_token,'PRIVATE_TOKEN');assert.equal(e.locked,false);clock+=600;
        return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({iss:'https://access.line.me',aud:'test-channel',sub:'owner',exp:Date.now()/1000+600})};
      };
      const context=e.ctx.employeeContext_;e.ctx.employeeContext_=x=>{clock+=200;return context(x);};
      const handler=e.ctx.handleEmployeeFoundation_;e.ctx.handleEmployeeFoundation_=data=>handler(data,{now:()=>clock});
      const output=e.ctx.ContentService.createTextOutput;e.ctx.ContentService.createTextOutput=text=>{serialized++;return output(text);};
      if(scenario==='action-schema-error')e.ctx.employeeBaselinePreview_=()=>e.ctx.employeeFailure_('SCHEMA_ERROR','固定訊息');
      if(scenario==='lock-busy')e.ctx.LockService.getScriptLock=()=>({tryLock:ms=>{assert.equal(ms,1000);clock+=ms;return false;},releaseLock:()=>assert.fail('unowned')});
      if(scenario==='locked-role-lost')e.beforeLock(()=>{row[6]='EMPLOYEE';});
      const contextBrowser=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'}),page=await contextBrowser.newPage(),logs=[],pageErrors=[],requests=[];
      page.on('console',x=>logs.push(x.text()));page.on('pageerror',x=>pageErrors.push(x.message));
      await contextBrowser.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};'});
        if(url.hostname==='test.example'){
          const file=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(file));
          return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/html',body:file==='config.js'?
            'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(frontend,'transport-v2/live-test',file),'utf8')});
        }
        assert.equal(url.hostname,'relay.example');const data=route.request().postDataJSON();requests.push(data);
        assert(!Object.hasOwn(data,'_transportDiagnostics'));
        assert.deepEqual(Object.keys(data).sort(),(data.action==='identityBootstrap'?['action','idToken']:data.action==='employeeLifecycleBaselineDryRun'?['action','idToken','employeeId']:['action','idToken','employeeId','requestId']).sort());
        assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(data.action));
        if(data.action!=='identityBootstrap')assert.equal(data.employeeId,'EMP001');
        const useOldWorker=['worker-rollback','ordered-full-rollback'].includes(scenario);
        const source=useOldWorker?rollback:current;let deadline,payload,result,hop=0;
        const sandbox=vm.createContext({Request,Response,Headers,URL,AbortController,TextDecoder,Uint8Array,crypto:crypto.webcrypto,
          performance:{now:()=>clock},fetch:()=>assert.fail('real network'),setTimeout:(fn,ms)=>{assert.equal(ms,20000);deadline=fn;return 1;},clearTimeout:()=>{deadline=null;}});
        vm.runInContext(source.replace('export const VERSION','const VERSION').replace('export async function handle','async function handle')
          .replace('export default { fetch: (request, env) => handle(request, env) };','globalThis.relayHandle=handle;'),sandbox);
        const response=await sandbox.relayHandle(new Request(url.href,{method:'POST',headers:{origin:'https://test.example','content-type':'text/plain;charset=utf-8'},body:JSON.stringify(data)}),
          {GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://test.example"]',ENVIRONMENT:'development'},
          {now:()=>clock,fetchImpl:async(target,options)=>{
            assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
            if(hop++===0){
              postCalls++;assert.equal(options.method,'POST');payload=JSON.parse(options.body);
              if(useOldWorker)assert.deepEqual(payload,data);else{const meta=payload._transportDiagnostics;assert.equal(meta.version,1);assert.match(meta.traceId,/^[0-9a-f-]{36}$/);delete payload._transportDiagnostics;assert.deepEqual(payload,data);payload._transportDiagnostics=meta;}
              gasCalls++;result=e.ctx.doPost({postData:{contents:JSON.stringify(payload)}});
              if(scenario==='malformed-diagnostics'&&result._gasReadDiagnostics)result._gasReadDiagnostics.extra='PRIVATE_BODY';
              if(scenario==='trace-mismatch'&&result._gasReadDiagnostics)result._gasReadDiagnostics.transportTraceId='11111111-2222-4333-8444-555555555555';
              return new Response(null,{status:302,headers:{location:scenario==='redirect-denied'?'https://PRIVATE_HOST.example/?PRIVATE_QUERY':'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});
            }
            getCalls++;assert.equal(options.method,'GET');assert.equal(options.body,undefined);assert.equal(options.headers,undefined);
            if(scenario==='timeout-after-gas'){queueMicrotask(()=>{clock=20000;deadline();});return new Promise(()=>{});}
            return Response.json(result);
          }});
        assert.equal(deadline,null);
        const headers=Object.fromEntries(response.headers);return route.fulfill({status:response.status,headers,body:await response.text()});
      });
      await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
      const click=async id=>{await page.click('#'+id);await page.waitForFunction(()=>!document.getElementById('check').disabled);};
      await click('check');let expected=1;
      if(['timeout-after-gas','redirect-denied'].includes(scenario)){
        assert.equal(await page.locator('#error').textContent(),scenario==='timeout-after-gas'?'UPSTREAM_TIMEOUT':'UPSTREAM_REDIRECT_DENIED');
        assert.equal(await page.locator('#gasTimingAvailability').textContent(),'無法取得');
      }else{
        assert.equal(await page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');
        const noDiag=['identity-employee','flag-off','malformed-diagnostics','trace-mismatch','worker-rollback','ordered-full-rollback','incorrect-rollback-order'].includes(scenario);
        assert.equal(await page.locator('#gasTimingAvailability').textContent(),noDiag?'無法取得':'可用');
        if(scenario==='identity-employee'){
          await page.evaluate(()=>{const b=document.getElementById('baselineCheck');b.disabled=false;b.click();});assert.equal(requests.length,1);
        }else if(['all-three-reads','worker-rollback','ordered-full-rollback','incorrect-rollback-order'].includes(scenario)){
          await click('baselineCheck');assert.equal(await page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
          await page.fill('#operationRequestId','status-probe-offline-0001');await click('operationStatusCheck');expected=3;
          if(scenario==='incorrect-rollback-order')assert.equal(await page.locator('#error').textContent(),'VALIDATION_ERROR');
          else assert((await page.locator('#operationStatusFields').textContent()).includes('NOT_OBSERVED'));
        }else if(scenario==='action-schema-error'){
          await click('baselineCheck');expected=2;assert.equal(await page.locator('#error').textContent(),'BACKEND_SCHEMA_ERROR');assert.equal(await page.locator('#gasTimingAvailability').textContent(),'可用');
        }else if(['lock-busy','locked-role-lost'].includes(scenario)){
          await page.fill('#operationRequestId','status-probe-offline-0001');await click('operationStatusCheck');expected=2;
          assert.equal(await page.locator('#gasTimingAvailability').textContent(),scenario==='lock-busy'?'可用':'無法取得');
          if(scenario==='locked-role-lost')assert.equal(await page.locator('#error').textContent(),'FORBIDDEN');
          else assert((await page.locator('#operationStatusFields').textContent()).includes('UNKNOWN'));
        }
      }
      assert.equal(requests.length,expected);assert.equal(gasCalls,expected);assert.equal(serialized,expected);assert.equal(postCalls,expected);
      assert.equal(getCalls,scenario==='redirect-denied'?0:expected);assert.equal(e.writes,0);assert.equal(e.locked,false);assert.deepEqual(e.logs,[]);assert.deepEqual(pageErrors,[]);
      // Chromium itself emits these fixed resource-status notices; application logs remain forbidden.
      const browserNotice=scenario==='timeout-after-gas'?'Failed to load resource: the server responded with a status of 504 (Gateway Timeout)':
        scenario==='redirect-denied'?'Failed to load resource: the server responded with a status of 502 (Bad Gateway)':null;
      assert(logs.every(message=>message===browserNotice));assert(!/PRIVATE_/.test(logs.join('')));
      assert(!/PRIVATE_/.test(await page.content()));assert(!JSON.stringify(e.tables).includes('_transportDiagnostics'));
      assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
      await contextBrowser.close();console.log('PASS cross-artifact '+scenario);
    }
    console.log('CROSS_ARTIFACT passed='+scenarios.length+' failed=0 skipped=0');
  }finally{await browser.close();}
})().catch(error=>{console.error('Offline cross-artifact failure',error);process.exitCode=1;});

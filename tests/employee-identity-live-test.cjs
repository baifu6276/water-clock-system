// Offline browser checks: intercept every request, including LIFF and GAS.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'employee-identity-live-test/index.html'), 'utf8');
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
assert(!/employeeApplication(?:Approve|Reject|Submit|Cancel)|employeeLifecycle(?:BaselineMigrate|Suspend|Leave|Resume|Terminate)|employeeCreation|localStorage|sessionStorage|console\./.test(html));
assert(!html.includes('../js/identity.js'));
const allowed=['employeeApplicationAdminList','employeeLifecycleBaselineDryRun','identityBootstrap'];
assert.deepEqual([...html.matchAll(/await request\('([^']+)'\)/g)].map(m=>m[1]).sort(), allowed);
assert(html.includes("if (!['identityBootstrap', 'employeeApplicationAdminList', 'employeeLifecycleBaselineDryRun'].includes(action)) throw"));
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    for (const scenario of ['ACTIVE_EMPLOYEE','UNREGISTERED','APPLICATION_PENDING','AUTH_ERROR','unsafe-error','no-token','logged-out','outside-line','init-error','network-error','http-error','non-json','invalid-json','diagnostic','fetch-permission',
      'role-EMPLOYEE','role-SITE_MANAGER','role-suspended','LEAVE','TERMINATED','admin-owner','admin-empty','admin-items','admin-forbidden','admin-diagnostic','admin-unsafe','admin-network','admin-http','admin-malformed',
      'baseline-owner','baseline-admin','baseline-ineligible','baseline-forbidden','baseline-unsafe','baseline-malformed','baseline-network']) {
      const adminScenario=scenario.startsWith('admin-');
      const baselineScenario=scenario.startsWith('baseline-');
      const roleScenario=scenario.startsWith('role-');
      const identityState=adminScenario||roleScenario||baselineScenario ? (scenario==='role-suspended'?'SUSPENDED':'ACTIVE_EMPLOYEE') : scenario==='outside-line'?'UNREGISTERED':scenario;
      const context = await browser.newContext({viewport:{width:360,height:800}});
      const page = await context.newPage(); const calls = [], logs = [], scripts = [];
      page.on('console', msg => logs.push(msg.text())); page.on('pageerror', e => logs.push(e.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'static.line-scdn.net') return route.fulfill({contentType:'text/javascript', body:`
          window.liff={init:async()=>{${scenario==='init-error'?'throw new Error("mock-secret-token")':''}},
            isInClient:()=>${scenario!=='outside-line'},isLoggedIn:()=>${scenario!=='logged-out'},
            getIDToken:()=>${scenario==='no-token'?'null':'"mock-secret-token"'},login:()=>{}};`});
        if (url.hostname === 'script.google.com') {
          const body = route.request().postDataJSON(); calls.push(body);
          assert(allowed.includes(body.action));
          assert.deepEqual(Object.keys(body).sort(),body.action==='employeeLifecycleBaselineDryRun'?['action','employeeId','idToken']:['action','idToken']);
          assert.equal(body.idToken, 'mock-secret-token');
          assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
          assert.equal(route.request().method(),'POST');
          if(body.action==='employeeLifecycleBaselineDryRun') {
            assert(baselineScenario);assert.equal(body.employeeId,'EMP001');
            if(scenario==='baseline-network')return route.abort();
            if(scenario==='baseline-forbidden')return route.fulfill({json:{success:false,code:'FORBIDDEN',message:'mock-secret-token'}});
            if(scenario==='baseline-unsafe')return route.fulfill({json:{success:false,code:'private-sub-sentinel',message:'mock-secret-token',stack:'private-audit'}});
            return route.fulfill({json:{success:true,employeeId:scenario==='baseline-malformed'?'OTHER':'EMP001',name:'<img src=x onerror=alert(1)>',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2000,systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:scenario!=='baseline-ineligible',warnings:['HIRE_DATE_UNKNOWN','<script>private-sub-sentinel</script>'],snapshotVersion:'a'.repeat(64),lineUid:'private-uid',sub:'private-sub-sentinel',idToken:'mock-secret-token',requestHash:'private-hash',beforeJson:'private-audit',afterJson:'private-audit'}});
          }
          if(body.action==='employeeApplicationAdminList') {
            assert(adminScenario);
            if(scenario==='admin-network')return route.abort();
            if(scenario==='admin-http')return route.fulfill({status:503,body:'mock-secret-token'});
            if(scenario==='admin-forbidden')return route.fulfill({json:{success:false,code:'FORBIDDEN',message:'mock-secret-token'}});
            if(scenario==='admin-diagnostic')return route.fulfill({json:{success:false,code:'AUTH_ERROR',diagnosticCode:'LINE_TOKEN_EXPIRED',message:'mock-secret-token'}});
            if(scenario==='admin-unsafe')return route.fulfill({json:{success:false,code:'mock-secret-token',message:'mock-secret-token',stack:'secret'}});
            if(scenario==='admin-malformed')return route.fulfill({json:{success:true,applications:{lineSub:'mock-secret-token'}}});
            return route.fulfill({json:{success:true,applications:scenario==='admin-items'?[{
              name:'<img src=x onerror=alert(1)>',status:'待審核',phone:'0900000000',note:'<script>unsafe</script>',version:3,
              lineSub:'private-sub-sentinel',requestHash:'mock-secret-token',applicationId:'do-not-display'
            }, {name:'第二位申請人',phone:'0911111111',note:'',status:'待審核',version:1,lineSub:'private-sub-sentinel'}]:[]}});
          }
          if (scenario==='network-error') return route.abort();
          if (scenario==='http-error') return route.fulfill({status:503,body:'mock-secret-token'});
          if (scenario==='non-json') return route.fulfill({body:'mock-secret-token'});
          if (scenario==='invalid-json') return route.fulfill({json:{message:'mock-secret-token'}});
          if (scenario==='fetch-permission') return route.fulfill({json:{success:false,code:'AUTH_ERROR',diagnosticCode:'LINE_VERIFY_PERMISSION_ERROR',message:'mock-secret-token'}});
          if (scenario==='diagnostic') return route.fulfill({json:{success:false,code:'AUTH_ERROR',diagnosticCode:'LINE_AUDIENCE_MISMATCH',message:'mock-secret-token'}});
          const result = scenario==='unsafe-error' ? {success:false,code:'mock-secret-token',message:'mock-secret-token'} :
            scenario==='AUTH_ERROR' ? {success:false,code:'AUTH_ERROR',message:'mock-secret-token'} :
            {success:true,state:identityState,employee:{employeeId:'TEST-EMPLOYEE',name:'<b>測試姓名</b>',permission:adminScenario||baselineScenario?(['admin-owner','baseline-owner'].includes(scenario)?'OWNER':'ADMIN'):scenario==='role-suspended'?'ADMIN':roleScenario?scenario.slice(5):undefined}};
          return route.fulfill({json:result});
        }
        assert.equal(url.hostname,'identity.test','Unexpected external request');
        const file = url.pathname==='/' ? 'employee-identity-live-test/index.html' : url.pathname.slice(1);
        scripts.push(file);
        return route.fulfill({contentType:file.endsWith('.html')?'text/html;charset=utf-8':'text/javascript;charset=utf-8',body:fs.readFileSync(path.join(root,file),'utf8')});
      });
      // Inspect Fetch options without changing production identity code.
      await page.addInitScript(() => {
        const original=window.fetch;
        window.fetch=(input,options)=>{if(options?.method==='POST') window.lastRedirect=options.redirect;return original(input,options);};
      });
      await page.goto('https://identity.test/employee-identity-live-test/index.html');
      await page.waitForFunction(()=>!document.getElementById('retry').disabled);
      assert(!(await page.locator('body').innerText()).includes('mock-secret-token'));
      assert(!logs.join('\n').includes('mock-secret-token'));
      assert(!scripts.some(s=>/identity\.js|auth\.js|app\.js|daily-report|attendance|progress|payroll|employee-management/.test(s)));
      if (['no-token','logged-out','init-error'].includes(scenario)) assert.equal(calls.length,0);
      else {assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>window.lastRedirect),'follow');}
      if (identityState==='ACTIVE_EMPLOYEE') {
        assert.equal(await page.locator('#employeeId').innerText(),'TEST-EMPLOYEE');
        assert.equal(await page.locator('#employeeName b').count(),0);
      } else assert.equal(await page.locator('#employeeId').innerText(),'—');
      const expected = {'AUTH_ERROR':'AUTH_ERROR','unsafe-error':'OPERATION_ERROR','no-token':'TOKEN_UNAVAILABLE','logged-out':'LOGIN_REQUIRED','init-error':'LIFF_INIT_ERROR','network-error':'GAS_NETWORK_ERROR','http-error':'GAS_HTTP_ERROR','non-json':'GAS_NON_JSON_RESPONSE','invalid-json':'GAS_RESPONSE_INVALID','diagnostic':'LINE_AUDIENCE_MISMATCH','fetch-permission':'LINE_VERIFY_PERMISSION_ERROR'}[scenario];
      if(expected) assert.equal(await page.locator('#code').innerText(),expected);
      else assert((await page.locator('#state').innerText()).includes(identityState));
      assert.equal(await page.locator('#adminTest').isVisible(),adminScenario||baselineScenario);
      assert.equal(await page.locator('#baselineTest').isVisible(),adminScenario||baselineScenario);
      if(!adminScenario&&!baselineScenario) {
        await page.evaluate(()=>{const b=document.getElementById('adminCheck');b.disabled=false;b.click();});
        await page.evaluate(()=>{document.getElementById('baselineTest').hidden=false;const b=document.getElementById('baselineCheck');b.disabled=false;b.click();});
        assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,0);
        assert.equal(calls.filter(c=>c.action==='employeeLifecycleBaselineDryRun').length,0);
      }
      if(scenario==='outside-line') assert((await page.locator('#inLine').innerText()).startsWith('否'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('button',{name:'重新檢查身分'}).click();
      await page.waitForFunction(()=>!document.getElementById('retry').disabled);
      assert.equal(calls.length,['no-token','logged-out','init-error'].includes(scenario)?0:2);
      if(baselineScenario) {
        assert.equal(calls.filter(c=>c.action==='employeeLifecycleBaselineDryRun').length,0);
        await page.evaluate(()=>{document.getElementById('baselineCheck').click();document.getElementById('baselineCheck').click();});
        await page.waitForFunction(()=>!document.getElementById('retry').disabled);
        assert.equal(calls.filter(c=>c.action==='employeeLifecycleBaselineDryRun').length,1);
        assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,0);
        assert.equal(await page.evaluate(()=>window.lastRedirect),'follow');
        const expected={'baseline-forbidden':'FORBIDDEN','baseline-unsafe':'OPERATION_ERROR','baseline-malformed':'GAS_RESPONSE_INVALID','baseline-network':'GAS_NETWORK_ERROR'}[scenario];
        if(expected)assert((await page.locator('body').innerText()).includes(expected));
        else {
          assert.equal(await page.locator('#baselineMessage').innerText(),scenario==='baseline-ineligible'?'目前不可自動建立 Legacy Baseline':'此員工可進行 Legacy Baseline');
          const text=await page.locator('#baselineDetails').innerText();
          for(const field of ['employeeId','name','employeeStatus','grade','salaryType','salaryAmount','systemRole','hireDate','bindingSource','baselineState','eligible','warnings','snapshotVersion','EMP001','<img src=x onerror=alert(1)>','2000','HIRE_DATE_UNKNOWN','a'.repeat(64)])assert(text.includes(field));
          assert.equal(await page.locator('#baselineDetails img, #baselineDetails script').count(),0);
        }
        for(const secret of ['mock-secret-token','private-sub-sentinel','private-uid','private-hash','private-audit']){assert(!(await page.content()).includes(secret));assert(!logs.join('\n').includes(secret));}
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.getByRole('button',{name:'重新檢查身分'}).click();await page.waitForFunction(()=>!document.getElementById('retry').disabled);
        assert.equal(await page.locator('#baselineDetails').innerText(),'');
      }
      if(adminScenario) {
        assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,0,'never auto-load admin data');
        await page.evaluate(()=>{document.getElementById('adminCheck').click();document.getElementById('adminCheck').click();});
        await page.waitForFunction(()=>!document.getElementById('retry').disabled);
        assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,1,'double click guarded');
        assert.equal(await page.evaluate(()=>window.lastRedirect),'follow');
        const codes={'admin-forbidden':'FORBIDDEN','admin-diagnostic':'LINE_TOKEN_EXPIRED','admin-unsafe':'OPERATION_ERROR',
          'admin-network':'GAS_NETWORK_ERROR','admin-http':'GAS_HTTP_ERROR','admin-malformed':'GAS_RESPONSE_INVALID'};
        assert.equal(await page.locator('#adminCode').innerText(),codes[scenario]||'—');
        assert.equal(await page.locator('#adminCount').innerText(),scenario==='admin-items'?'2':['admin-empty','admin-owner'].includes(scenario)?'0':'—');
        assert.equal(await page.locator('#adminApplications img, #adminApplications script').count(),0);
        if(scenario==='admin-items') {
          assert.equal(await page.locator('#adminApplications li').count(),2);
          const details=await page.locator('#adminApplications li').first().innerText();
          for(const text of ['姓名','電話','申請說明','申請狀態','version','0900000000','<script>unsafe</script>','3'])assert(details.includes(text));
        }
        if(['admin-empty','admin-owner'].includes(scenario))assert.equal(await page.locator('#adminMessage').innerText(),'目前沒有待審申請');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert(!(await page.locator('body').innerText()).includes('private-sub-sentinel'));
        assert(!logs.join('\n').includes('private-sub-sentinel'));
        assert(!(await page.locator('body').innerText()).includes('mock-secret-token'));
        assert(!(await page.locator('body').innerText()).includes('do-not-display'));
        assert(!logs.join('\n').includes('mock-secret-token'));
        await page.getByRole('button',{name:'重新檢查身分'}).click();
        await page.waitForFunction(()=>!document.getElementById('retry').disabled);
        assert.equal(await page.locator('#adminCount').innerText(),'—');
        assert.equal(await page.locator('#adminApplications li').count(),0);
      }
      console.log('PASS isolated identity page:',scenario); await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Offline browser checks: intercept every request, including LIFF and GAS.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'employee-identity-live-test/index.html'), 'utf8');
for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    for (const scenario of ['ACTIVE_EMPLOYEE','UNREGISTERED','APPLICATION_PENDING','AUTH_ERROR','unsafe-error','no-token','logged-out','outside-line','init-error','network-error','http-error','non-json','invalid-json','diagnostic']) {
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
          assert.equal(body.action, 'identityBootstrap');
          assert.equal(body.idToken, 'mock-secret-token');
          assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
          if (scenario==='network-error') return route.abort();
          if (scenario==='http-error') return route.fulfill({status:503,body:'mock-secret-token'});
          if (scenario==='non-json') return route.fulfill({body:'mock-secret-token'});
          if (scenario==='invalid-json') return route.fulfill({json:{message:'mock-secret-token'}});
          if (scenario==='diagnostic') return route.fulfill({json:{success:false,code:'AUTH_ERROR',diagnosticCode:'LINE_AUDIENCE_MISMATCH',message:'mock-secret-token'}});
          const result = scenario==='unsafe-error' ? {success:false,code:'mock-secret-token',message:'mock-secret-token'} :
            scenario==='AUTH_ERROR' ? {success:false,code:'AUTH_ERROR',message:'mock-secret-token'} :
            {success:true,state:scenario==='outside-line'?'UNREGISTERED':scenario,employee:{employeeId:'TEST-EMPLOYEE',name:'<b>測試姓名</b>'}};
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
      assert(!scripts.some(s=>/auth\.js|app\.js|daily-report|attendance|progress|payroll|employee-management/.test(s)));
      if (['no-token','logged-out','init-error'].includes(scenario)) assert.equal(calls.length,0);
      else {assert.equal(calls.length,1);assert.equal(await page.evaluate(()=>window.lastRedirect),'follow');}
      if (scenario==='ACTIVE_EMPLOYEE') {
        assert.equal(await page.locator('#employeeId').innerText(),'TEST-EMPLOYEE');
        assert.equal(await page.locator('#employeeName b').count(),0);
      } else assert.equal(await page.locator('#employeeId').innerText(),'—');
      const expected = {'AUTH_ERROR':'AUTH_ERROR','unsafe-error':'OPERATION_ERROR','no-token':'TOKEN_UNAVAILABLE','logged-out':'LOGIN_REQUIRED','init-error':'LIFF_INIT_ERROR','network-error':'GAS_NETWORK_ERROR','http-error':'GAS_HTTP_ERROR','non-json':'GAS_NON_JSON_RESPONSE','invalid-json':'GAS_RESPONSE_INVALID','diagnostic':'LINE_AUDIENCE_MISMATCH'}[scenario];
      if(expected) assert.equal(await page.locator('#code').innerText(),expected);
      else assert((await page.locator('#state').innerText()).includes(scenario==='outside-line'?'UNREGISTERED':scenario));
      if(scenario==='outside-line') assert((await page.locator('#inLine').innerText()).startsWith('否'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.getByRole('button',{name:'重新檢查身分'}).click();
      await page.waitForFunction(()=>!document.getElementById('retry').disabled);
      assert.equal(calls.length,['no-token','logged-out','init-error'].includes(scenario)?0:2);
      console.log('PASS isolated identity page:',scenario); await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

// Fully intercepted browser test. No LINE/GAS requests leave this process.
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH}: {})});
  let passed=0;
  try {
    for(const initial of ['ACTIVE_EMPLOYEE','UNREGISTERED','RETRY','APPLICATION_PENDING','AUTH_ERROR','SUSPENDED','LEAVE','TERMINATED']) {
      const context=await browser.newContext({viewport:{width:360,height:800}});
      const page=await context.newPage(), calls=[], errors=[];
      let state=initial==='RETRY'?'UNREGISTERED':initial, submitted=false, firstPayload;
      const app={applicationId:'mock-app',version:1,status:'待審核',name:'模擬申請人',note:'<img src=x onerror=alert(1)>'};
      page.on('pageerror',e=>errors.push(e.message));
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='mock-gas.invalid') {
          const data=route.request().postDataJSON(); calls.push(data.action);
          assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
          assert.equal(data.idToken,'browser-mock-token');
          let response={success:true};
          if(data.action==='identityBootstrap') response=state==='AUTH_ERROR' ? {success:false,code:'AUTH_ERROR'} : {success:true,state,employee:state==='ACTIVE_EMPLOYEE'?{employeeId:'mock-employee'}:null};
          if(data.action==='employeeApplicationListOwn') response.applications=state==='APPLICATION_PENDING'?[app]:[];
          if(data.action==='employeeApplicationSubmit') {
            submitted=true; state='APPLICATION_PENDING';response.application=app;
            await new Promise(r=>setTimeout(r,100));
            if(initial==='RETRY') {
              if(!firstPayload) {firstPayload=data;return route.abort();}
              assert.deepEqual(data,firstPayload);
            }
          }
          if(data.action==='employeeApplicationCancel') {state='UNREGISTERED';response.application={...app,status:'已取消',version:2};}
          return route.fulfill({json:response});
        }
        if(url.hostname!=='employee.test') throw Error('Unexpected external request');
        if(url.pathname==='/') return route.fulfill({contentType:'text/html;charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"></head><body>
          <div id="displayName"></div><img id="pictureUrl"><div id="employeeInfo"></div>
          <section id="employeeIdentityPanel" hidden></section><div id="legacyEmployeeContent"><select id="siteSelect"></select><button id="locationBtn"></button></div>
          <script>var GAS_URL='https://mock-gas.invalid/', LIFF_ID='unchanged-mock', userId='', userName='', employee, sites, settings;
          window.legacyCalls=0;window.gpsCalls=0;window.lastStatus='';
          window.liff={init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getProfile:async()=>({userId:'mock-profile',displayName:'測試'}),getIDToken:()=> 'browser-mock-token'};
          window.setButtons=()=>{};window.showStatus=s=>{window.lastStatus=s};window.callApi=async()=>{window.legacyCalls++;return {success:true,employee:{grade:'測試',permission:'EMPLOYEE'},sites:[{}]}};
          window.updateAdminEntry=window.renderSites=window.renderDailyReportSites=window.setDefaultDailyReportDate=()=>{};window.refreshLocation=async()=>{window.gpsCalls++};
          </script><script src="js/identity.js"></script><script src="js/auth.js"></script></body></html>`});
        const file=path.join(root,url.pathname.slice(1));
        return route.fulfill({contentType:'text/javascript;charset=utf-8',body:fs.readFileSync(file,'utf8')});
      });
      await page.goto('https://employee.test/');
      if(initial==='ACTIVE_EMPLOYEE') {
        await page.waitForFunction(()=>window.gpsCalls===1);
        assert.equal(await page.evaluate(()=>window.legacyCalls),1);
        assert.equal(await page.locator('#employeeIdentityPanel').isVisible(),false);
        assert.equal(await page.locator('script[src="js/employee-management.js"]').count(),0);
      } else if(initial==='AUTH_ERROR') {
        await page.waitForFunction(()=>window.lastStatus.includes('驗證失敗'));
        assert.equal(await page.locator('#employeeIdentityPanel').isVisible(),false);
        assert.equal(await page.locator('#legacyEmployeeContent').isVisible(),false);
      } else {
        await page.locator('#employeeIdentityPanel').waitFor({state:'visible'});
        assert.equal(await page.evaluate(()=>window.legacyCalls),0);
        assert.equal(await page.evaluate(()=>window.gpsCalls),0);
        assert.equal(await page.locator('#legacyEmployeeContent').isVisible(),false);
        if(initial==='UNREGISTERED'||initial==='RETRY') {
          await page.locator('input[name=name]').fill('測試姓名');
          await page.locator('input[name=phone]').fill('0900000000');
          await page.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
          if(initial==='RETRY') {
            await page.getByRole('button',{name:'重試前次操作'}).waitFor();
            await page.waitForTimeout(250);
            assert.equal(calls.filter(a=>a==='employeeApplicationSubmit').length,1,'no automatic write retry');
            await page.getByRole('button',{name:'重試前次操作'}).click();
          }
          await page.getByRole('button',{name:'取消申請',exact:true}).waitFor();
          assert(submitted);assert.equal(calls.filter(a=>a==='employeeApplicationSubmit').length,initial==='RETRY'?2:1);
          assert.equal(await page.locator('#employeeIdentityPanel img').count(),0);
          page.on('dialog',d=>d.accept());
          await page.getByRole('button',{name:'取消申請',exact:true}).click();
          await page.getByRole('button',{name:'送出加入申請'}).waitFor();
          assert.equal(calls.filter(a=>a==='employeeApplicationCancel').length,1);
          assert.equal(await page.evaluate(()=>JSON.stringify(sessionStorage).includes('browser-mock-token')),false);
        } else if(initial==='APPLICATION_PENDING') {
          await page.getByRole('button',{name:'取消申請',exact:true}).waitFor();
          assert.equal(await page.getByRole('button',{name:'送出加入申請'}).isVisible(),false);
        } else assert.equal(await page.locator('form').isVisible(),false);
      }
      assert.equal(errors.length,0,errors.join('\n'));
      if(!['UNREGISTERED','RETRY'].includes(initial)) assert(!calls.some(a=>/Submit|Cancel/.test(a)));
      console.log('PASS browser',initial);passed++;await context.close();
    }
    console.log(`${passed} browser scenarios passed, all network mocked.`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

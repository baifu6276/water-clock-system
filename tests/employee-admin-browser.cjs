// Actual production HTML/scripts; every network request is intercepted. No real GAS writes.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  let passed=0;
  try {
    for(const scenario of ['OWNER','ADMIN','SITE_MANAGER','EMPLOYEE','reject','validation','version','recovery','retry',
      'malformed','refresh-failure','revoked','storage','empty','load-retry','pending-recovery','desktop','account-change']) {
      const role=['OWNER','SITE_MANAGER','EMPLOYEE'].includes(scenario)?scenario:'ADMIN';
      const context=await browser.newContext({viewport:{width:scenario==='desktop'?1280:360,height:800}}),page=await context.newPage();
      const calls=[],logs=[],pageErrors=[],scripts=[];
      let completed=false,writeAttempts=0,listCount=0,failedScript=false,currentRole=role,currentEmployeeId='manager-test';
      const app={applicationId:'app-private-id',type:'NEW_EMPLOYEE',version:3,status:'待審核',name:'<b>測試新人</b>',
        phone:'0900000000',note:'<img src=x onerror=alert(1)>',createdAt:'2026-09-16T00:00:00.000Z',
        lineSub:'private-sub-sentinel',requestHash:'private-sub-sentinel',recoveryRequired:scenario==='pending-recovery'};
      page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>pageErrors.push(e.message));page.on('dialog',d=>d.accept());
      await context.route('**/*',async route=>{
        const url=new URL(route.request().url());
        if(url.hostname==='static.line-scdn.net') return route.fulfill({contentType:'text/javascript',body:`window.liff={
          init:async()=>{},isInClient:()=>true,isLoggedIn:()=>true,getProfile:async()=>({userId:'profile-test',displayName:'管理測試'}),
          getIDToken:()=> 'private-token-sentinel'};`});
        if(url.hostname==='script.google.com') {
          const data=route.request().postDataJSON();calls.push(data);
          assert.equal(route.request().method(),'POST');assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
          if(data.action==='bootstrap')return route.fulfill({json:{success:true,employee:{employeeId:'manager-test',name:'管理員',permission:role,grade:'師傅'},sites:[{siteId:'mock-site',name:'測試工地'}],settings:{}}});
          if(data.action==='dailyReportProgressOptions')return route.fulfill({json:{success:true,locations:[],items:[],progress:[]}});
          assert.equal(data.idToken,'private-token-sentinel');
          if(data.action==='identityBootstrap')return route.fulfill({json:{success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:currentEmployeeId,name:'管理員',permission:currentRole}}});
          if(data.action==='employeeApplicationAdminList') {
            listCount++;
            if(scenario==='refresh-failure'&&completed)return route.abort();
            return route.fulfill({json:{success:true,applications:completed||scenario==='empty'?[]:[app]}});
          }
          assert(['employeeApplicationApprove','employeeApplicationReject'].includes(data.action),'unexpected business action '+data.action);
          writeAttempts++;await new Promise(r=>setTimeout(r,100));
          assert(!('name' in data));assert(!('phone' in data));assert(!('employeeId' in data));assert(!('lineSub' in data));
          assert.equal(data.expectedVersion,3);assert.equal(data.applicationId,app.applicationId);
          if(scenario==='version')return route.fulfill({json:{success:false,code:'VERSION_CONFLICT',message:'private-token-sentinel'}});
          if(scenario==='recovery')return route.fulfill({json:{success:false,code:'RECOVERY_REQUIRED',message:'private-sub-sentinel',stack:'private-token-sentinel'}});
          if(scenario==='malformed')return route.fulfill({json:{success:true,application:{name:'private-token-sentinel'}}});
          if(scenario==='retry'&&writeAttempts===1){app.recoveryRequired=true;return route.abort();}
          completed=true;
          return route.fulfill({json:{success:true,application:{...app,status:data.action==='employeeApplicationApprove'?'已核准':'已拒絕',version:4},employeeId:'not-for-display'}});
        }
        assert.equal(url.hostname,'employee-admin.test','external request must not escape');
        const file=url.pathname==='/'?'index.html':url.pathname.slice(1);scripts.push(file);
        if(scenario==='load-retry'&&file==='js/employee-management.js'&&!failedScript){failedScript=true;return route.abort();}
        const contentType=file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.css')?'text/css':'text/javascript';
        return route.fulfill({contentType,body:fs.readFileSync(path.join(root,file),'utf8')});
      });
      await page.addInitScript(()=>{
        const original=window.fetch;window.fetch=(url,options)=>{
          if(options?.method==='POST'&&options.redirect!=='follow')throw Error('redirect changed');return original(url,options);
        };
        navigator.geolocation.getCurrentPosition=(_,fail)=>fail({message:'測試不使用 GPS'});
      });
      await page.goto('https://employee-admin.test/');
      await page.waitForFunction(()=>document.getElementById('employeeInfo').textContent.includes('師傅'));
      assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,0);
      assert.equal(scripts.filter(s=>s==='js/employee-management.js').length,0,'lazy module');
      for(const id of ['dailyReportSection','siteDailyReportSection','payrollSection','progressV1','btnIn','btnOut'])assert.equal(await page.locator('#'+id).count(),1);
      if(['SITE_MANAGER','EMPLOYEE'].includes(role)) {
        assert.equal(await page.locator('#employeeAdminEntry').isVisible(),false);
        await page.evaluate(()=>document.getElementById('employeeAdminOpen').click());
        assert.equal(scripts.filter(s=>s==='js/employee-management.js').length,0);
        // Force-load and invoke the module: it still verifies the real server identity.
        await page.addScriptTag({url:'/js/employee-management.js'});
        await page.evaluate(()=>EmployeeManagement.openAdmin());
        assert.equal(calls.filter(c=>c.action==='employeeApplicationAdminList').length,0);
        assert.equal(writeAttempts,0);
      } else {
        await page.getByRole('button',{name:'人員管理：待審申請',exact:true}).click();
        if(scenario==='load-retry') {
          await page.waitForFunction(()=>!document.getElementById('employeeAdminOpen').disabled);
          assert((await page.locator('#employeeAdminEntryMessage').innerText()).includes('載入失敗'));
          await page.getByRole('button',{name:'人員管理：待審申請',exact:true}).click();
        }
        await page.waitForFunction(()=>document.getElementById('employeeAdminStatus')?.textContent.includes('請選擇'));
        assert.equal(listCount,1);
        if(scenario==='empty')assert((await page.locator('#employeeAdminPanel').innerText()).includes('目前沒有待審申請'));
        else if(scenario==='pending-recovery') {
          assert.equal(await page.getByRole('button',{name:'審核申請',exact:true}).count(),0);
          assert((await page.locator('#employeeAdminPanel').innerText()).includes('未完成操作'));assert.equal(writeAttempts,0);
        }
        else {
          await page.getByRole('button',{name:'審核申請',exact:true}).click();
          const panel=page.locator('#employeeAdminPanel'),form=panel.locator('form').first();
          assert.equal(await panel.locator('input[name=name]').inputValue(),app.name);
          assert.equal(await panel.locator('input[name=name]').getAttribute('readonly'),'');
          assert.equal(await panel.locator('input[name=phone]').getAttribute('readonly'),'');
          assert.equal(await panel.locator('select[name=systemRole] option[value=OWNER]').count(),role==='OWNER'?1:0);
          assert.deepEqual(await panel.locator('select[name=grade] option').allTextContents(),['請選擇','老闆','領班','師傅','半技','學徒']);
          assert.equal(await panel.locator('img,b').count(),0);
          if(scenario==='reject') {
            await panel.getByRole('button',{name:'拒絕申請',exact:true}).click();assert.equal(writeAttempts,0);
            assert((await panel.locator('#employeeAdminStatus').innerText()).includes('必須填寫原因'));
            await panel.locator('[name=rejectionReason]').fill('資料需要補充');
            await panel.getByRole('button',{name:'拒絕申請',exact:true}).click();
          } else {
            if(scenario==='validation') {
              await form.evaluate(f=>f.requestSubmit());assert.equal(writeAttempts,0);
              await panel.locator('select[name=systemRole]').evaluate(s=>s.append(new Option('非法擁有者','OWNER')));
            }
            await panel.locator('[name=grade]').selectOption('師傅');await panel.locator('[name=salaryType]').selectOption('日薪');
            await panel.locator('[name=salaryAmount]').fill('2000');await panel.locator('[name=hireDate]').fill('2026-09-16');
            await panel.locator('[name=systemRole]').selectOption(scenario==='validation'||role==='OWNER'?'OWNER':'EMPLOYEE');
            if(scenario==='validation') {await form.evaluate(f=>f.requestSubmit());assert.equal(writeAttempts,0);await panel.locator('[name=systemRole]').selectOption('EMPLOYEE');}
            if(scenario==='revoked')currentRole='EMPLOYEE';
            if(scenario==='account-change')currentEmployeeId='another-manager';
            if(scenario==='storage')await page.evaluate(()=>{Storage.prototype.setItem=()=>{throw Error('private-token-sentinel')};});
            await form.evaluate(f=>{f.requestSubmit();f.requestSubmit();});
          }
          await page.waitForFunction(()=>!document.querySelector('#employeeAdminPanel fieldset').disabled ||
            document.getElementById('employeeAdminStatus').textContent.includes('沒有在職'));
          if(['revoked','storage','account-change'].includes(scenario)) assert.equal(writeAttempts,0);
          else assert.equal(writeAttempts,1,'duplicate click must not duplicate write');
          if(scenario==='retry') {
            const original=calls.find(c=>c.action==='employeeApplicationApprove');
            await page.reload();await page.waitForFunction(()=>document.getElementById('employeeInfo').textContent.includes('師傅'));
            await page.getByRole('button',{name:'人員管理：待審申請',exact:true}).click();
            await page.getByRole('button',{name:'重試原審核操作'}).waitFor();
            assert.equal(writeAttempts,1,'reload must not retry writes automatically');
            await page.getByRole('button',{name:'重試原審核操作'}).click();
            await page.waitForFunction(()=>document.getElementById('employeeAdminStatus').textContent.includes('審核已完成'));
            assert.equal(writeAttempts,2);assert.deepEqual(calls.filter(c=>c.action==='employeeApplicationApprove')[1],original);
          }
          if(['version','recovery','malformed'].includes(scenario)) {
            const text=await panel.locator('#employeeAdminStatus').innerText();
            assert(text.includes({version:'申請已被更新',recovery:'操作尚待確認',malformed:'回應格式不符'}[scenario]));
            assert.equal(await page.getByRole('button',{name:'重試原審核操作'}).isVisible(),scenario!=='version');
          } else if(!['revoked','storage','account-change'].includes(scenario)) {
            assert((await panel.locator('#employeeAdminStatus').innerText()).includes('審核已完成'));
            assert.equal(await panel.locator('form').first().isVisible(),false);
            assert(listCount>=2,'reload list after success');
          }
          if(scenario==='refresh-failure')assert((await panel.locator('#employeeAdminStatus').innerText()).includes('不要重新送出'));
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'360px overflow');
      }
      const text=await page.locator('body').innerText();
      for(const secret of ['private-token-sentinel','private-sub-sentinel','app-private-id','not-for-display'])assert(!text.includes(secret));
      assert(!logs.join('\n').includes('private-token-sentinel'));assert(!logs.join('\n').includes('private-sub-sentinel'));
      assert.equal(await page.evaluate(()=>JSON.stringify(sessionStorage).includes('private-token-sentinel')),false);
      assert.equal(pageErrors.length,0,pageErrors.join('\n'));
      console.log('PASS admin UI',scenario);passed++;await context.close();
    }
    console.log(`${passed} admin UI scenarios passed; all network mocked.`);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

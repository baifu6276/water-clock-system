// All URLs are intercepted. No actual LIFF, relay, GAS or Sheet requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../live-test');
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert(!/console\.|innerHTML|localStorage\s*[.\[]|sessionStorage\s*[.\[]|indexedDB|document\.cookie|employeeApplication|employeeLifecycle(?:Suspend|Leave|Resume|Terminate)|callApi/.test(client));
assert.deepEqual([...client.matchAll(/await request\('([^']+)'/g)].map(m => m[1]), ['identityBootstrap', 'employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus']);
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const scenarios = ['active', 'unregistered', 'pending', 'inactive', 'malicious', 'backend-error', 'transport-error',
    'unknown-error', 'network-error', 'non-json', 'missing-token', 'init-error', 'unconfigured', 'duplicate-click'];
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage(); const calls = [], logs = [];
      page.on('console', message => logs.push(message.text())); page.on('pageerror', error => logs.push(error.message));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'static.line-scdn.net') return route.fulfill({ contentType: 'text/javascript', body: `window.liff={
          init:async()=>{${scenario === 'init-error' ? 'throw Error("PRIVATE_TOKEN")' : ''}},isLoggedIn:()=>true,isInClient:()=>true,
          getIDToken:()=>${scenario === 'missing-token' ? 'null' : '"PRIVATE_TOKEN"'},login:()=>{}};` });
        if (url.hostname === 'relay.example') {
          calls.push(route.request().postDataJSON());
          assert.deepEqual(calls.at(-1), { action: 'identityBootstrap', idToken: 'PRIVATE_TOKEN' });
          assert.equal(route.request().method(), 'POST'); assert.equal(route.request().headers()['content-type'], 'text/plain;charset=utf-8');
          if (scenario === 'network-error') return route.abort();
          if (scenario === 'non-json') return route.fulfill({ body: 'PRIVATE_TOKEN PRIVATE_SUB' });
          if (scenario === 'duplicate-click') await new Promise(resolve => setTimeout(resolve, 100));
          const body = scenario === 'backend-error' ? { success: false, code: 'AUTH_ERROR', message: 'PRIVATE_TOKEN PRIVATE_SUB' } :
            scenario === 'unknown-error' ? { success: false, code: 'PRIVATE_TOKEN', message: 'PRIVATE_SUB' } :
            scenario === 'transport-error' ? { success: false, transportError: 'UPSTREAM_TIMEOUT' } : {
              success: true, state: ({ unregistered: 'UNREGISTERED', pending: 'APPLICATION_PENDING', inactive: 'TERMINATED' })[scenario] || 'ACTIVE_EMPLOYEE',
              employee: { employeeId: 'EMP001', name: scenario === 'malicious' ? '<img src=x onerror=alert(1)>' : '測試員工' },
              sub: 'PRIVATE_SUB', idToken: 'PRIVATE_TOKEN', raw: 'PRIVATE_AUDIT' };
          return route.fulfill({ status: scenario === 'transport-error' ? 504 : 200, json: body, headers: {
            'x-transport-version': 't1-1', 'x-correlation-id': '12345678-1234-4123-8123-123456789abc',
            'access-control-allow-origin': 'https://test.example', 'access-control-expose-headers': 'x-transport-version,x-correlation-id' } });
        }
        if (url.hostname === 'test.example') {
          const name = url.pathname.split('/').pop() || 'index.html';
          assert(['index.html', 'config.js', 'client.js'].includes(name));
          return route.fulfill({ contentType: name.endsWith('js') ? 'text/javascript' : 'text/html', body: name === 'config.js' ?
            `window.TransportT1Config={liffId:'offline',relayEndpoint:'${scenario === 'unconfigured' ? '' : 'https://relay.example/identity'}'};` : fs.readFileSync(path.join(root, name), 'utf8') });
        }
        throw Error('Unexpected network');
      });
      await page.goto('https://test.example/index.html');
      await page.waitForFunction(() => document.getElementById('init').textContent !== '尚未開始');
      assert.equal(calls.length, 0, 'no auto request');
      if (scenario !== 'init-error') {
        await page.click('#check');
        if (scenario === 'duplicate-click') await page.evaluate(() => {
          const b = document.getElementById('check'); b.disabled = false; b.click();
        });
        await page.waitForFunction(() => !document.getElementById('check').disabled && document.getElementById('http').textContent !== '處理中' || document.getElementById('error').textContent !== '無');
      }
      const text = await page.locator('body').innerText();
      assert(!/PRIVATE_TOKEN|PRIVATE_SUB|PRIVATE_AUDIT/.test(text + logs.join('')));
      assert.equal(calls.length, ['init-error', 'missing-token', 'unconfigured'].includes(scenario) ? 0 : 1);
      if (['active', 'duplicate-click'].includes(scenario)) assert(text.includes('EMP001 / 測試員工'));
      if (scenario === 'malicious') { assert(text.includes('<img src=x onerror=alert(1)>')); assert.equal(await page.locator('img').count(), 0); }
      if (['unregistered', 'pending', 'inactive'].includes(scenario)) assert(!text.includes('EMP001'));
      if (scenario === 'backend-error') assert(text.includes('AUTH_ERROR'));
      if (scenario === 'transport-error') assert(text.includes('UPSTREAM_TIMEOUT'));
      await context.close();
    }
    console.log('PASS: ' + scenarios.length + ' T1 browser scenarios');
    await runT3(browser);
    await runInitDiagnostics(browser);
    await runTimeoutStages(browser);
    await runRequestStatus(browser);
    await runRedirectDiagnostics(browser);
  } finally { await browser.close(); }
})().catch(() => { console.error('Isolated browser test failed'); process.exitCode = 1; });

async function runInitDiagnostics(browser) {
  const codes = ['INIT_FAILED', 'INVALID_ARGUMENT', 'INVALID_CONFIG', 'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_ID_TOKEN', 'UNKNOWN'];
  for (const code of [...codes, 'PRIVATE_CODE', null]) {
    const context = await browser.newContext(); const page = await context.newPage(); const logs = []; let unexpected = 0;
    page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push(e.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'static.line-scdn.net') return route.fulfill({ contentType: 'text/javascript', body:
        `window.liff={init:async()=>{const e={code:${JSON.stringify(code)}};for(const k of ['message','cause','stack'])Object.defineProperty(e,k,{get(){throw Error('PRIVATE_DETAIL')}});throw e;}};` });
      if (url.hostname !== 'test.example') { unexpected++; return route.abort(); }
      const file = url.pathname.slice(1); assert(['index.html', 'client.js', 'config.js'].includes(file));
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: fs.readFileSync(path.join(root, file), 'utf8') });
    });
    await page.goto('https://test.example/index.html');
    await page.waitForFunction(() => document.getElementById('init').textContent === '失敗');
    assert.equal(await page.locator('#error').textContent(), codes.includes(code) ? code : 'LIFF_INIT_ERROR');
    await page.evaluate(() => { for (const id of ['check', 'baselineCheck', 'operationStatusCheck']) { const b = document.getElementById(id); b.disabled = false; b.click(); } });
    assert.equal(unexpected, 0); assert.equal(logs.length, 0);
    assert(!/PRIVATE_/.test(await page.locator('body').innerHTML()));
    await context.close();
  }
  console.log('PASS: 9 permanent LIFF init diagnostic scenarios');
}

async function runT3(browser) {
  const hash = 'abcdef0123456789'.repeat(4);
  const safe = { success: true, dryRun: true, employeeId: 'EMP001', name: '測試員工', employeeStatus: '在職',
    grade: '師傅', salaryType: '日薪', salaryAmount: 2200, systemRole: 'ADMIN', hireDate: '', bindingSource: 'PRESENT',
    baselineState: 'LEGACY_NOT_BASELINED', eligible: true, warnings: ['HIRE_DATE_UNKNOWN'], snapshotVersion: hash };
  const cases = {
    owner: {}, admin: {}, employee: {}, manager: {}, inactive: {}, unregistered: {}, double: {}, revoked: {},
    ineligible: { eligible: false, baselineState: 'CONFLICT', bindingSource: 'CONFLICT', warnings: ['RECOVERY_REQUIRED'] },
    salaryString: { salaryAmount: '2200' }, salaryEmpty: { salaryAmount: '' }, salaryText: { salaryAmount: '<b>待確認</b>', eligible: false },
    salaryObject: { salaryAmount: {} }, salaryArray: { salaryAmount: [] },
    warningsType: { warnings: 'bad' }, warningsObject: { warnings: [{}] },
    warningsKnown: { warnings: ['BASELINE_MANUAL_REVIEW_REQUIRED', 'BASELINE_LINE_IDENTITY_REQUIRED'] },
    warningsUnknown: { warnings: ['PRIVATE_UNKNOWN_WARNING'] }, snapshotInvalid: { snapshotVersion: 'private-hash' },
    snapshotType: { snapshotVersion: 123 }, missingDryRun: { dryRun: undefined }, wrongTarget: { employeeId: 'EMP002' },
    bindingInvalid: { bindingSource: 'PRIVATE_BINDING' }, baselineInvalid: { baselineState: 'PRIVATE_BASELINE' },
    eligibleInvalid: { eligible: 'true' }, nameInvalid: { name: {} }, malicious: { name: '<img src=x onerror=alert(1)>' },
    network: {}, nonjson: {}, timeout: {},
    ...Object.fromEntries(['AUTH_ERROR', 'FORBIDDEN', 'VALIDATION_ERROR', 'NOT_FOUND', 'SCHEMA_ERROR', 'IDENTITY_CONFLICT', 'OPERATION_ERROR', 'PRIVATE_ERROR'].map(c => ['error-' + c, { success: false, code: c, message: 'PRIVATE_EXCEPTION', stack: 'PRIVATE_STACK' }]))
  };
  const invalid = new Set(['salaryObject', 'salaryArray', 'warningsType', 'warningsObject', 'snapshotInvalid', 'snapshotType', 'missingDryRun',
    'wrongTarget', 'bindingInvalid', 'baselineInvalid', 'eligibleInvalid', 'nameInvalid', 'network', 'nonjson', 'timeout']);
  const denied = new Set(['employee', 'manager', 'inactive', 'unregistered']);
  for (const [scenario, overrides] of Object.entries(cases)) {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 } }); const page = await context.newPage();
    const calls = [], logs = [];
    page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push(e.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'static.line-scdn.net') return route.fulfill({ contentType: 'text/javascript', body:
        'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};' });
      if (url.hostname === 'test.example') {
        const file = url.pathname.slice(1); assert(['index.html', 'client.js', 'config.js'].includes(file));
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: file === 'config.js' ?
          'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};' : fs.readFileSync(path.join(root, file), 'utf8') });
      }
      assert.equal(url.hostname, 'relay.example'); const data = route.request().postDataJSON(); calls.push(data);
      assert.equal(route.request().method(), 'POST'); assert.equal(route.request().headers()['content-type'], 'text/plain;charset=utf-8');
      let result;
      if (url.pathname === '/identity') {
        assert.deepEqual(data, { action: 'identityBootstrap', idToken: 'PRIVATE_TOKEN' });
        const permission = scenario === 'owner' ? 'OWNER' : scenario === 'employee' ? 'EMPLOYEE' : scenario === 'manager' ? 'SITE_MANAGER' : 'ADMIN';
        result = { success: true, state: scenario === 'inactive' ? 'SUSPENDED' : scenario === 'unregistered' ? 'UNREGISTERED' : 'ACTIVE_EMPLOYEE',
          employee: { employeeId: 'EMP001', name: '操作員', permission: scenario === 'revoked' && calls.length > 1 ? 'EMPLOYEE' : permission } };
      } else {
        assert.equal(url.pathname, '/employee-read'); assert.deepEqual(data, { action: 'employeeLifecycleBaselineDryRun', idToken: 'PRIVATE_TOKEN', employeeId: 'EMP001' });
        if (scenario === 'network') return route.abort();
        if (scenario === 'nonjson') return route.fulfill({ body: 'PRIVATE_EXCEPTION PRIVATE_TOKEN' });
        if (scenario === 'double') await new Promise(resolve => setTimeout(resolve, 100));
        result = scenario === 'timeout' ? { success: false, transportError: 'UPSTREAM_TIMEOUT' } :
          { ...safe, ...overrides, sub: 'PRIVATE_SUB', lineUid: 'PRIVATE_UID', requestHash: 'PRIVATE_HASH', beforeJson: 'PRIVATE_AUDIT' };
      }
      return route.fulfill({ json: result, headers: { 'access-control-allow-origin': 'https://test.example',
        'access-control-expose-headers': 'x-transport-version', 'x-transport-version': 't3-1' } });
    });
    await page.goto('https://test.example/index.html');
    await page.waitForFunction(() => !document.getElementById('check').disabled);
    assert(await page.locator('#baselineSection').isHidden()); assert(await page.locator('#baselineCheck').isDisabled());
    const force = () => page.evaluate(() => { const b = document.getElementById('baselineCheck'); b.disabled = false; b.click(); });
    await force(); assert.equal(calls.length, 0);
    await page.click('#check'); await page.waitForFunction(() => !document.getElementById('check').disabled);
    assert.equal(calls.length, 1, 'no automatic baseline request');
    if (scenario === 'revoked') {
      await page.click('#check'); await page.waitForFunction(() => !document.getElementById('check').disabled);
      await force(); assert.equal(calls.length, 2); assert(await page.locator('#baselineSection').isHidden());
    } else if (denied.has(scenario)) {
      assert(await page.locator('#baselineSection').isHidden()); await force(); assert.equal(calls.length, 1);
    } else {
      assert(await page.locator('#baselineSection').isVisible()); await page.click('#baselineCheck');
      if (scenario === 'double') await force();
      await page.waitForFunction(() => !document.getElementById('check').disabled);
      assert.equal(calls.length, 2, 'single baseline request, no retry');
      const fieldText = await page.locator('#baselineFields').textContent();
      if (invalid.has(scenario) || scenario.startsWith('error-')) {
        assert.equal(fieldText, '');
        assert.equal(await page.locator('#error').textContent(), scenario.startsWith('error-') && scenario !== 'error-PRIVATE_ERROR' ? scenario.slice(6) : scenario === 'timeout' ? 'UPSTREAM_TIMEOUT' : 'TRANSPORT_ERROR');
      } else {
        assert(fieldText.includes('快照版本格式有效'));
        assert.equal(await page.locator('#baselineFields dd').nth(5).textContent(), String(overrides.salaryAmount ?? safe.salaryAmount));
        assert.equal(await page.locator('#version').textContent(), 't3-1');
        assert.equal(await page.locator('#baselineStatus').textContent(), overrides.eligible === false ? '目前不可自動建立 Legacy Baseline' : '此員工可進行 Legacy Baseline');
        if (scenario === 'warningsUnknown') assert(fieldText.includes('未識別警告，請管理員核對。'));
        if (scenario === 'warningsKnown') assert(fieldText.includes('基線資料需要人工確認。') && fieldText.includes('LINE 綁定資料需要確認。'));
        if (scenario === 'admin') assert(fieldText.includes('到職日未知，基線保持空白。'));
        if (scenario === 'malicious') { assert(fieldText.includes(overrides.name)); assert.equal(await page.locator('img').count(), 0); }
      }
    }
    const dom = await page.content(); assert(!/PRIVATE_|private-hash/.test(dom + logs.join(''))); assert(!dom.includes(hash));
    assert(!logs.join('').includes(hash)); await context.close();
  }
  console.log('PASS: ' + Object.keys(cases).length + ' T3 browser scenarios');
}

async function runTimeoutStages(browser) {
  const stages = ['READ_REQUEST', 'POST_HEADERS', 'REDIRECT_GET_HEADERS', 'FINAL_BODY'];
  const cases = [...stages.map(stage => ({ stage, expected: stage })),
    { expected: 'UNKNOWN' }, { stage: 'PRIVATE_UNKNOWN', expected: 'UNKNOWN' },
    ...[null, 123, {}, ['FINAL_BODY']].map(stage => ({ stage, expected: 'UNKNOWN' })),
    { stage: 'FINAL_BODY', error: 'UPSTREAM_HTTP_ERROR', expected: '—' },
    { stage: 'FINAL_BODY', success: true, expected: '—' }];
  let count = 0;
  for (const target of ['identityBootstrap', 'employeeLifecycleBaselineDryRun']) for (const c of cases) {
    const context = await browser.newContext(); const page = await context.newPage();
    const calls = [], logs = []; let release, tested = false;
    page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push(e.message));
    const identity = { success: true, state: 'ACTIVE_EMPLOYEE', employee: { employeeId: 'EMP001', name: '操作員', permission: 'ADMIN' } };
    const baseline = { success: true, dryRun: true, employeeId: 'EMP001', name: '測試員工', employeeStatus: '在職',
      grade: '師傅', salaryType: '日薪', salaryAmount: 2200, systemRole: 'ADMIN', hireDate: '', bindingSource: 'PRESENT',
      baselineState: 'LEGACY_NOT_BASELINED', eligible: true, warnings: [], snapshotVersion: 'abcdef0123456789'.repeat(4) };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'static.line-scdn.net') return route.fulfill({ contentType: 'text/javascript', body:
        'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};' });
      if (url.hostname === 'test.example') {
        const file = url.pathname.slice(1); assert(['index.html', 'client.js', 'config.js'].includes(file));
        if (file === 'client.js') assert.equal(url.search, '?v=t3-2-redirect-diag1');
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : 'text/html', body: file === 'config.js' ?
          'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};' : fs.readFileSync(path.join(root, file), 'utf8') });
      }
      assert.equal(url.hostname, 'relay.example'); const data = route.request().postDataJSON(); calls.push(data);
      assert.deepEqual(data, data.action === 'identityBootstrap' ? { action: 'identityBootstrap', idToken: 'PRIVATE_TOKEN' } :
        { action: 'employeeLifecycleBaselineDryRun', employeeId: 'EMP001', idToken: 'PRIVATE_TOKEN' });
      assert.equal(url.pathname, data.action === 'identityBootstrap' ? '/identity' : '/employee-read');
      let result = identity, status = 200;
      if (!tested && data.action === target) {
        tested = true;
        result = c.success ? (target === 'identityBootstrap' ? identity : baseline) : { success: false, transportError: c.error || 'UPSTREAM_TIMEOUT' };
        result = { ...result, transportStage: c.stage, idToken: 'PRIVATE_TOKEN', sub: 'PRIVATE_SUB',
          body: 'PRIVATE_BODY', url: 'https://private.example/?secret=PRIVATE_URL', message: 'PRIVATE_EXCEPTION', stack: 'PRIVATE_STACK' };
        status = c.success ? 200 : c.error ? 502 : 504;
      } else if (tested) await new Promise(resolve => { release = resolve; });
      return route.fulfill({ status, json: result, headers: { 'access-control-allow-origin': 'https://test.example' } });
    });
    await page.goto('https://test.example/index.html');
    await page.waitForFunction(() => !document.getElementById('check').disabled);
    assert.equal(await page.locator('#transportStage').textContent(), '—');
    await page.click('#check'); await page.waitForFunction(() => !document.getElementById('check').disabled);
    if (target !== 'identityBootstrap') {
      assert.equal(await page.locator('#transportStage').textContent(), '—');
      await page.click('#baselineCheck'); await page.waitForFunction(() => !document.getElementById('check').disabled);
    }
    assert.equal(await page.locator('#transportStage').textContent(), c.expected);
    assert.equal(await page.locator('#error').textContent(), c.success ? '無' : c.error || 'UPSTREAM_TIMEOUT');
    assert.equal(calls.length, target === 'identityBootstrap' ? 1 : 2, 'no retry/fallback');
    assert(!/PRIVATE_|private\.example/.test(await page.content() + logs.join('')));
    // Keep the next fetch pending to prove reset happens before its response.
    await page.click('#check'); await page.waitForFunction(() => document.getElementById('http').textContent === '處理中');
    assert.equal(await page.locator('#transportStage').textContent(), '—');
    while (!release) await new Promise(resolve => setImmediate(resolve));
    release(); await page.waitForFunction(() => !document.getElementById('check').disabled);
    assert.equal(await page.locator('#transportStage').textContent(), '—');
    assert.equal(calls.length, target === 'identityBootstrap' ? 2 : 3);
    assert(!/PRIVATE_|private\.example/.test(await page.content() + logs.join('')));
    await context.close(); count++;
  }
  console.log('PASS: ' + count + ' timeout-stage browser scenarios');
}

// Adapted to PR #9's version-gated status UI; no feature-only UI is copied.
async function runRequestStatus(browser) {
  const id='status-request-0001', good={success:true,employeeId:'EMP001',requestId:id,action:'employeeLifecycleBaselineMigrate',requestStatus:'COMPLETED',historicalCompletion:true,currentConsistency:'MATCHED',recoveryAllowed:false,newRequestAllowed:false};
  const cases={owner:{},admin:{},employee:{},manager:{},inactive:{},unregistered:{},missingToken:{},invalidInput:{},double:{},oldVersion:{},missingVersion:{},probe:{},
    STARTED:{requestStatus:'STARTED',historicalCompletion:false,currentConsistency:'PARTIAL'},RECOVERY_REQUIRED:{requestStatus:'RECOVERY_REQUIRED',historicalCompletion:true,currentConsistency:'CONFLICT'},
    NOT_OBSERVED:{requestStatus:'NOT_OBSERVED',historicalCompletion:false,currentConsistency:'UNKNOWN'},UNKNOWN:{requestStatus:'UNKNOWN',historicalCompletion:null,currentConsistency:'UNKNOWN'},
    wrongId:{requestId:'different-request-0001'},wrongEmployee:{employeeId:'EMP002'},wrongAction:{action:'other'},recovery:{recoveryAllowed:true},newRequest:{newRequestAllowed:true},
    unknownStatus:{requestStatus:'PRIVATE_STATUS'},unknownConsistency:{currentConsistency:'PRIVATE_CONSISTENCY'},badHistory:{historicalCompletion:'false'},missingHistory:{historicalCompletion:undefined},
    missingPermission:{recoveryAllowed:undefined},objectStatus:{requestStatus:{}},nullResponse:{},timeout:{},backendError:{}};
  const denied=new Set(['employee','manager','inactive','unregistered','missingToken','oldVersion','missingVersion']);
  const invalid=new Set(['wrongId','wrongEmployee','wrongAction','recovery','newRequest','unknownStatus','unknownConsistency','badHistory','missingHistory','missingPermission','objectStatus','nullResponse']);
  for(const [name,patch] of Object.entries(cases)) {
    const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),calls=[],logs=[];
    page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>${name==='missingToken'?'null':'"PRIVATE_TOKEN"'},login:()=>{}};`});
      if(url.hostname==='test.example'){
        const f=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(f));
        return route.fulfill({contentType:f.endsWith('.js')?'text/javascript':'text/html',body:f==='config.js'?'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(root,f),'utf8')});
      }
      assert.equal(url.hostname,'relay.example');const data=route.request().postDataJSON();calls.push(data);
      const headers={'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':name==='oldVersion'?'t3-1':name==='missingVersion'?'':'t3-2-status-only'};
      if(url.pathname==='/identity')return route.fulfill({headers,json:{success:true,state:name==='inactive'?'TERMINATED':name==='unregistered'?'UNREGISTERED':'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'操作員',permission:name==='owner'?'OWNER':name==='employee'?'EMPLOYEE':name==='manager'?'SITE_MANAGER':'ADMIN'}}});
      assert.equal(url.pathname,'/employee-operation-status');assert.deepEqual(data,{action:'employeeLifecycleBaselineRequestStatus',idToken:'PRIVATE_TOKEN',employeeId:'EMP001',requestId:id});
      await new Promise(r=>setTimeout(r,80));
      const result=name==='nullResponse'?null:name==='timeout'?{success:false,transportError:'UPSTREAM_TIMEOUT',transportStage:'FINAL_BODY'}:name==='backendError'?{success:false,code:'FORBIDDEN',message:'PRIVATE_EXCEPTION'}:
        {...good,...patch,operatorSub:'PRIVATE_SUB',salary:'PRIVATE_SALARY',snapshotVersion:'PRIVATE_SNAPSHOT',requestHash:'PRIVATE_HASH',afterJson:'PRIVATE_AUDIT',idToken:'PRIVATE_TOKEN'};
      return route.fulfill({status:name==='timeout'?504:200,json:result,headers});
    });
    await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    const force=()=>page.evaluate(()=>{const b=document.getElementById('operationStatusCheck');b.disabled=false;b.click();});
    assert(await page.locator('#operationStatusCheck').isDisabled());await force();assert.equal(calls.length,0);
    await page.click('#check');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    if(denied.has(name)){const count=calls.length;assert(await page.locator('#operationStatusCheck').isDisabled());await force();assert.equal(calls.length,count);}
    else {
      if(name==='probe'){await page.click('#operationStatusProbe');assert.match(await page.locator('#operationRequestId').inputValue(),/^status-probe-/);assert.equal(calls.length,1);}
      await page.fill('#operationRequestId',name==='invalidInput'?'bad':id);
      if(name==='invalidInput'){assert(await page.locator('#operationStatusCheck').isDisabled());await force();assert.equal(calls.length,1);assert.equal(await page.locator('#error').textContent(),'REQUEST_ID_INVALID');}
      else {
        await page.click('#operationStatusCheck');if(name==='double')await force();await page.waitForFunction(()=>!document.getElementById('check').disabled);
        assert.equal(calls.length,2);const fields=await page.locator('#operationStatusFields').textContent();
        if(invalid.has(name)||['timeout','backendError'].includes(name)){
          assert.equal(fields,'');assert.equal(await page.locator('#error').textContent(),name==='timeout'?'UPSTREAM_TIMEOUT':name==='backendError'?'FORBIDDEN':name==='nullResponse'?'TRANSPORT_ERROR':'STATUS_RESPONSE_INVALID');
          if(name==='timeout')assert.equal(await page.locator('#transportStage').textContent(),'FINAL_BODY');
        } else {assert(fields.includes(id));assert.equal(await page.locator('#operationStatusFields dd').count(),7);assert.equal(await page.locator('#operationStatusFields dd').nth(5).textContent(),'否');assert.equal(await page.locator('#operationStatusFields dd').nth(6).textContent(),'否');}
      }
    }
    const count=calls.length;await page.waitForTimeout(100);assert.equal(calls.length,count);assert(!/PRIVATE_/.test(await page.content()+logs.join('')));
    assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);await context.close();
  }
  console.log('PASS: '+Object.keys(cases).length+' main status browser scenarios');
}

async function runRedirectDiagnostics(browser) {
  const allowed=['REDIRECT_STATUS_DENIED','REDIRECT_LOCATION_INVALID','REDIRECT_SCHEME_DENIED','REDIRECT_HOST_DENIED','REDIRECT_URL_COMPONENT_DENIED'];
  const cases=[...allowed.map(code=>({code,stage:'POST_HEADERS'})),{code:allowed[3],stage:'REDIRECT_GET_HEADERS'},
    {code:'PRIVATE_UNKNOWN',stage:'PRIVATE_STAGE'},{code:{},stage:[]},{}, {code:allowed[0],stage:'FINAL_BODY'},
    {success:true,code:allowed[0],stage:'POST_HEADERS'},{error:'UPSTREAM_HTTP_ERROR',code:allowed[0],stage:'POST_HEADERS'},
    {error:'UPSTREAM_REDIRECT_LIMIT',code:allowed[0],stage:'POST_HEADERS'}, {oldHtml:true,code:allowed[0],stage:'POST_HEADERS'}];
  let count=0;
  for(const target of ['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'])for(const c of cases){
    const context=await browser.newContext(),page=await context.newPage(),calls=[],logs=[];let tested=false,pageErrors=0;
    page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>{pageErrors++;logs.push(e.message);});
    const identity={success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'操作員',permission:'ADMIN'}};
    const baseline={success:true,dryRun:true,employeeId:'EMP001',name:'操作員',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2200,systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:true,warnings:[],snapshotVersion:'a'.repeat(64)};
    const status={success:true,employeeId:'EMP001',requestId:'status-request-0001',action:'employeeLifecycleBaselineMigrate',requestStatus:'NOT_OBSERVED',historicalCompletion:false,currentConsistency:'UNKNOWN',recoveryAllowed:false,newRequestAllowed:false};
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};'});
      if(url.hostname==='test.example'){
        const f=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(f));let body=f==='config.js'?'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(root,f),'utf8');
        if(c.oldHtml&&f==='index.html')body=body.replace(/<dt>Redirect 診斷<\/dt><dd id="redirectDiagnostic">—<\/dd>/,'');
        return route.fulfill({body,contentType:f.endsWith('.js')?'text/javascript':'text/html'});
      }
      assert.equal(url.hostname,'relay.example');const data=route.request().postDataJSON();calls.push(data);assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(data.action));
      assert.equal(route.request().method(),'POST');
      assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
      assert.equal(url.pathname,data.action==='identityBootstrap'?'/identity':data.action==='employeeLifecycleBaselineDryRun'?'/employee-read':'/employee-operation-status');
      assert.deepEqual(data,{action:data.action,idToken:'PRIVATE_TOKEN',...(data.action==='identityBootstrap'?{}:{employeeId:'EMP001'}),...(data.action==='employeeLifecycleBaselineRequestStatus'?{requestId:'status-request-0001'}:{})});
      let result=identity,http=200;
      if(data.action===target&&!tested){tested=true;http=c.success?200:502;
        result={...(c.success?(target==='identityBootstrap'?identity:target==='employeeLifecycleBaselineDryRun'?baseline:status):{success:false,transportError:c.error||'UPSTREAM_REDIRECT_DENIED'}),
          redirectDiagnostic:c.code,transportStage:c.stage,idToken:'PRIVATE_TOKEN',Location:'https://private.example/path?PRIVATE_QUERY#PRIVATE_HASH',headers:'PRIVATE_HEADER',body:'PRIVATE_BODY',message:'PRIVATE_EXCEPTION',stack:'PRIVATE_STACK',sub:'PRIVATE_SUB'};
      }
      return route.fulfill({status:http,json:result,headers:{'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':'t3-2-status-only'}});
    });
    await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    await page.click('#check');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    if(target!=='identityBootstrap'){
      if(target==='employeeLifecycleBaselineRequestStatus')await page.fill('#operationRequestId','status-request-0001');
      await page.click(target==='employeeLifecycleBaselineDryRun'?'#baselineCheck':'#operationStatusCheck');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    }
    const denied=!c.success&&!c.error;
    assert.equal(await page.locator('#error').textContent(),c.success?'無':c.error||'UPSTREAM_REDIRECT_DENIED');
    if(!c.oldHtml)assert.equal(await page.locator('#redirectDiagnostic').textContent(),denied?(allowed.includes(c.code)?c.code:'—'):'—');
    assert.equal(await page.locator('#transportStage').textContent(),denied?(['POST_HEADERS','REDIRECT_GET_HEADERS'].includes(c.stage)?c.stage:'—'):'—');
    // Chrome itself reports mock HTTP 502 resource failures; app exceptions must be absent.
    assert(!/PRIVATE_|private\.example/.test(await page.content()+logs.join('')));assert.equal(pageErrors,0);
    assert.equal(calls.length,target==='identityBootstrap'?1:2);
    await page.click('#check');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    if(!c.oldHtml)assert.equal(await page.locator('#redirectDiagnostic').textContent(),'—');assert.equal(await page.locator('#transportStage').textContent(),'—');
    assert.equal(calls.length,target==='identityBootstrap'?2:3);await context.close();count++;
  }
  console.log('PASS: '+count+' redirect diagnostic browser scenarios');
}

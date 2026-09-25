// All URLs are intercepted. No actual LIFF, relay, GAS or Sheet requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../live-test');
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
assert(!/console\.|innerHTML|localStorage\s*[.\[]|sessionStorage\s*[.\[]|indexedDB|document\.cookie|employeeApplication|employeeLifecycle(?:Suspend|Leave|Resume|Terminate)|callApi/.test(client));
assert.deepEqual([...client.matchAll(/await request\('([^']+)'/g)].map(m => m[1]), ['identityBootstrap', 'employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus']);
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const scenarios = ['active', 'unregistered', 'pending', 'inactive', 'malicious', 'backend-error', 'transport-error',
    'unknown-error', 'network-error', 'non-json', 'missing-token', 'init-error', 'unconfigured', 'duplicate-click'];
  try {
    for (const scenario of scenarios) {
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage(); const calls = [], logs = [], duplicateGate = deferred();
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
          if (scenario === 'duplicate-click') await duplicateGate.promise;
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
        duplicateGate.resolve();
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
    await runTimingDiagnostics(browser);
    await runTimingCompatibility(browser);
    if (process.env.TRANSPORT_CONTRACT_RELAY) await runCrossBranchContract(browser);
  } finally { await browser.close(); }
})().catch(error => { console.error('Offline isolated browser test failed', error); process.exitCode = 1; });

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
    const calls = [], logs = [], duplicateGate = deferred();
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
        if (scenario === 'double') await duplicateGate.promise;
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
      duplicateGate.resolve();
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
        if (file === 'client.js') assert.equal(url.search, '?v=t3-3-timing-diag');
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
  const cases={owner:{},admin:{},t4Version:{},employee:{},manager:{},inactive:{},unregistered:{},missingToken:{},invalidInput:{},double:{},oldVersion:{},missingVersion:{},probe:{},
    STARTED:{requestStatus:'STARTED',historicalCompletion:false,currentConsistency:'PARTIAL'},RECOVERY_REQUIRED:{requestStatus:'RECOVERY_REQUIRED',historicalCompletion:true,currentConsistency:'CONFLICT'},
    NOT_OBSERVED:{requestStatus:'NOT_OBSERVED',historicalCompletion:false,currentConsistency:'UNKNOWN'},UNKNOWN:{requestStatus:'UNKNOWN',historicalCompletion:null,currentConsistency:'UNKNOWN'},
    wrongId:{requestId:'different-request-0001'},wrongEmployee:{employeeId:'EMP002'},wrongAction:{action:'other'},recovery:{recoveryAllowed:true},newRequest:{newRequestAllowed:true},
    unknownStatus:{requestStatus:'PRIVATE_STATUS'},unknownConsistency:{currentConsistency:'PRIVATE_CONSISTENCY'},badHistory:{historicalCompletion:'false'},missingHistory:{historicalCompletion:undefined},
    missingPermission:{recoveryAllowed:undefined},objectStatus:{requestStatus:{}},nullResponse:{},timeout:{},backendError:{}};
  const denied=new Set(['employee','manager','inactive','unregistered','missingToken','oldVersion','missingVersion']);
  const invalid=new Set(['wrongId','wrongEmployee','wrongAction','recovery','newRequest','unknownStatus','unknownConsistency','badHistory','missingHistory','missingPermission','objectStatus','nullResponse']);
  for(const [name,patch] of Object.entries(cases)) {
    const context=await browser.newContext({viewport:{width:360,height:800}}),page=await context.newPage(),calls=[],logs=[],duplicateGate=deferred();
    page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>logs.push(e.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>${name==='missingToken'?'null':'"PRIVATE_TOKEN"'},login:()=>{}};`});
      if(url.hostname==='test.example'){
        const f=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(f));
        return route.fulfill({contentType:f.endsWith('.js')?'text/javascript':'text/html',body:f==='config.js'?'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(root,f),'utf8')});
      }
      assert.equal(url.hostname,'relay.example');const data=route.request().postDataJSON();calls.push(data);
      const headers={'access-control-allow-origin':'https://test.example','access-control-expose-headers':'x-transport-version','x-transport-version':name==='oldVersion'?'t3-1':name==='missingVersion'?'':name==='t4Version'?'t4-safety-1':'t3-2-status-only'};
      if(url.pathname==='/identity')return route.fulfill({headers,json:{success:true,state:name==='inactive'?'TERMINATED':name==='unregistered'?'UNREGISTERED':'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'操作員',permission:name==='owner'?'OWNER':name==='employee'?'EMPLOYEE':name==='manager'?'SITE_MANAGER':'ADMIN'}}});
      assert.equal(url.pathname,'/employee-operation-status');assert.deepEqual(data,{action:'employeeLifecycleBaselineRequestStatus',idToken:'PRIVATE_TOKEN',employeeId:'EMP001',requestId:id});
      if(name==='double')await duplicateGate.promise;
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
        await page.click('#operationStatusCheck');if(name==='double')await force();duplicateGate.resolve();await page.waitForFunction(()=>!document.getElementById('check').disabled);
        assert.equal(calls.length,2);const fields=await page.locator('#operationStatusFields').textContent();
        if(invalid.has(name)||['timeout','backendError'].includes(name)){
          assert.equal(fields,'');assert.equal(await page.locator('#error').textContent(),name==='timeout'?'UPSTREAM_TIMEOUT':name==='backendError'?'FORBIDDEN':name==='nullResponse'?'TRANSPORT_ERROR':'STATUS_RESPONSE_INVALID');
          if(name==='timeout')assert.equal(await page.locator('#transportStage').textContent(),'FINAL_BODY');
        } else {assert(fields.includes(id));assert.equal(await page.locator('#operationStatusFields dd').count(),7);assert.equal(await page.locator('#operationStatusFields dd').nth(5).textContent(),'否');assert.equal(await page.locator('#operationStatusFields dd').nth(6).textContent(),'否');}
      }
    }
    const count=calls.length;await page.evaluate(()=>Promise.resolve());assert.equal(calls.length,count);assert(!/PRIVATE_/.test(await page.content()+logs.join('')));
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

const timingOrder = ['v','rr','ph','g1','g2','g3','fb','tot','cur','hops'];
const timingHeader = patch => {
  const value = {v:'1',rr:'LT_100',ph:'MS_500_1999',g1:'NOT_RUN',g2:'NOT_RUN',g3:'NOT_RUN',fb:'LT_100',tot:'MS_500_1999',cur:'DONE',hops:'0',...patch};
  return timingOrder.map(key => key + '=' + value[key]).join(';');
};
const timingLabels = {LT_100:'未滿 0.1 秒',MS_100_499:'0.1 秒至未滿 0.5 秒',MS_500_1999:'0.5 秒至未滿 2 秒',
  MS_2000_4999:'2 秒至未滿 5 秒',MS_5000_9999:'5 秒至未滿 10 秒',MS_10000_19999:'10 秒至未滿 20 秒',MS_GE_20000:'20 秒以上',
  TIMEOUT:'逾時（共用 20 秒期限）',NOT_RUN:'未執行'};
const timingIdentity = {success:true,state:'ACTIVE_EMPLOYEE',employee:{employeeId:'EMP001',name:'操作員',permission:'ADMIN'}};
const timingBaseline = {success:true,dryRun:true,employeeId:'EMP001',name:'操作員',employeeStatus:'在職',grade:'師傅',salaryType:'日薪',salaryAmount:2200,
  systemRole:'ADMIN',hireDate:'',bindingSource:'PRESENT',baselineState:'LEGACY_NOT_BASELINED',eligible:true,warnings:[],snapshotVersion:'a'.repeat(64)};
const timingStatus = {success:true,employeeId:'EMP001',requestId:'status-request-0001',action:'employeeLifecycleBaselineMigrate',requestStatus:'NOT_OBSERVED',
  historicalCompletion:false,currentConsistency:'UNKNOWN',recoveryAllowed:false,newRequestAllowed:false};
async function timingPage(browser, plans, {script=client,html,identity=timingIdentity}={}) {
  const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'}),page=await context.newPage(),calls=[],logs=[],pageErrors=[];
  page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>pageErrors.push(e.message));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};'});
    if(url.hostname==='test.example'){
      const file=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(file));
      return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/html',body:file==='client.js'?script:file==='config.js'?
        'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':html||fs.readFileSync(path.join(root,'index.html'),'utf8')});
    }
    assert.equal(url.hostname,'relay.example');assert(plans.length,'Unexpected retry or fallback');
    const data=route.request().postDataJSON();calls.push(data);
    assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(data.action));
    assert.equal(url.pathname,data.action==='identityBootstrap'?'/identity':data.action==='employeeLifecycleBaselineDryRun'?'/employee-read':'/employee-operation-status');
    assert.deepEqual(data,{action:data.action,idToken:'PRIVATE_TOKEN',...(data.action==='identityBootstrap'?{}:{employeeId:'EMP001'}),
      ...(data.action==='employeeLifecycleBaselineRequestStatus'?{requestId:'status-request-0001'}:{})});
    assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');assert.equal(route.request().method(),'POST');
    const plan=plans.shift();if(plan.gate)await plan.gate.promise;
    const headers={'access-control-allow-origin':'https://test.example',
      'access-control-expose-headers':'X-Transport-Version, X-Correlation-Id, X-Transport-Timing',
      'x-transport-version':plan.version||'t3-3-timing-diag','x-correlation-id':'12345678-1234-4123-8123-123456789abc'};
    if(plan.header!==undefined)headers['x-transport-timing']=plan.header;
    const body=plan.body|| (data.action==='identityBootstrap'?identity:data.action==='employeeLifecycleBaselineDryRun'?timingBaseline:timingStatus);
    return route.fulfill({status:plan.status||200,headers,json:{...body,sub:'PRIVATE_SUB',lineUid:'PRIVATE_UID',idToken:'PRIVATE_TOKEN',
      requestHash:'PRIVATE_HASH',beforeJson:'PRIVATE_AUDIT',body:'PRIVATE_BODY',url:'https://PRIVATE_HOST.example/path?PRIVATE_QUERY',message:'PRIVATE_EXCEPTION',stack:'PRIVATE_STACK'}});
  });
  await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
  return {page,calls,async click(id){await page.click('#'+id);await page.waitForFunction(()=>!document.getElementById('check').disabled);},
    async close(){assert.equal(pageErrors.length,0);assert(!/PRIVATE_|PRIVATE_HOST/.test(await page.content()+logs.join('')));
      assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);await context.close();}};
}
async function runTimingDiagnostics(browser) {
  const basic=timingHeader({});
  const valid=[
    {name:'success',patch:{}},
    ...Object.keys(timingLabels).filter(k=>!['TIMEOUT','NOT_RUN'].includes(k)).map(bucket=>({name:'bucket-'+bucket,patch:{ph:bucket,tot:bucket}})),
    {name:'get1',patch:{g1:'MS_100_499',hops:'1'}},
    {name:'get2',patch:{g1:'LT_100',g2:'MS_500_1999',hops:'2'}},
    {name:'get3',patch:{g1:'LT_100',g2:'LT_100',g3:'MS_100_499',hops:'3'}},
    {name:'request-timeout',timeout:true,patch:{rr:'TIMEOUT',ph:'NOT_RUN',fb:'NOT_RUN',tot:'TIMEOUT',cur:'READ_REQUEST'}},
    {name:'post-timeout',timeout:true,patch:{ph:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT',cur:'POST_HEADERS'}},
    {name:'get1-timeout',timeout:true,patch:{g1:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT',cur:'REDIRECT_GET_HEADERS',hops:'1'}},
    {name:'get2-timeout',timeout:true,patch:{g1:'LT_100',g2:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT',cur:'REDIRECT_GET_HEADERS',hops:'2'}},
    {name:'get3-timeout',timeout:true,patch:{g1:'LT_100',g2:'LT_100',g3:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT',cur:'REDIRECT_GET_HEADERS',hops:'3'}},
    {name:'body-timeout',timeout:true,patch:{fb:'TIMEOUT',tot:'TIMEOUT',cur:'FINAL_BODY'}},
    {name:'business-error',businessError:true,patch:{}},
    {name:'redirect-denied',redirect:true,patch:{fb:'NOT_RUN',cur:'POST_HEADERS'}},
    {name:'get-redirect-denied',redirect:true,patch:{g1:'LT_100',fb:'NOT_RUN',cur:'REDIRECT_GET_HEADERS',hops:'1'}}
  ];
  const invalid=[undefined,'','PRIVATE_HEADER',basic+';extra=PRIVATE_BODY',basic.replace('v=1','v=2'),basic.replace('rr=LT_100','rr=100'),
    basic.replace('rr=LT_100','rr=PRIVATE_TOKEN'),basic.replace(';ph=', '; ph='),basic.replace('v=1;rr=LT_100','rr=LT_100;v=1'),
    basic+';rr=LT_100',basic+', '+basic,basic.replace('hops=0','hops=4'),basic.replace('hops=0','hops=01'),basic.replace('hops=0','hops=-1'),
    basic.replace('cur=DONE','cur=PRIVATE_EXCEPTION'),basic.replace('cur=DONE','cur=REDIRECT_GET_1'),basic.replace('tot=MS_500_1999','tot=NOT_RUN'),
    basic.replace('tot=MS_500_1999','tot=TIMEOUT'),timingHeader({ph:'TIMEOUT'}),timingHeader({g1:'LT_100'}),timingHeader({hops:'1'}),
    timingHeader({cur:'POST_HEADERS',hops:'1',g1:'LT_100',fb:'NOT_RUN'}),timingHeader({cur:'REDIRECT_GET_HEADERS',fb:'NOT_RUN'}),
    timingHeader({cur:'READ_REQUEST',ph:'NOT_RUN',fb:'LT_100'}),timingHeader({cur:'FINAL_BODY',fb:'NOT_RUN'}),
    timingHeader({cur:'POST_HEADERS',ph:'TIMEOUT',rr:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT'}),
    '<img src=x onerror=PRIVATE_EXCEPTION>', 'https://PRIVATE_HOST.example/PRIVATE_PATH?PRIVATE_QUERY#PRIVATE_HASH', 'X'.repeat(257)];
  const cases=[...valid,...invalid.map((header,i)=>({name:'malformed-'+i,invalid:true,header}))];
  for(const c of cases){
    const patch=c.patch||{},header=c.invalid?c.header:timingHeader(patch);
    const body=c.timeout?{success:false,transportError:'UPSTREAM_TIMEOUT',transportStage:patch.cur}:
      c.businessError?{success:false,code:'FORBIDDEN'}:c.redirect?{success:false,transportError:'UPSTREAM_REDIRECT_DENIED',redirectDiagnostic:'REDIRECT_HOST_DENIED',transportStage:patch.cur}:undefined;
    const p=await timingPage(browser,[{header,body,status:c.timeout?504:c.redirect?502:200}]);
    assert.equal(await p.page.locator('#timingAvailability').textContent(),'尚未取得');await p.click('check');
    assert.equal(await p.page.locator('#timingAvailability').textContent(),c.invalid?'無法取得':'可用',c.name);
    assert.equal(await p.page.locator('#error').textContent(),c.timeout?'UPSTREAM_TIMEOUT':c.businessError?'FORBIDDEN':c.redirect?'UPSTREAM_REDIRECT_DENIED':'無',c.name);
    if(c.invalid){for(const id of ['timingTotal','timingCurrentStage','timingHops','timingPostHeaders','timingLastGet'])assert.equal(await p.page.locator('#'+id).textContent(),'—',c.name);}
    else {
      const values=Object.fromEntries(header.split(';').map(s=>s.split('=')));
      assert.equal(await p.page.locator('#timingTotal').textContent(),timingLabels[values.tot],c.name);
      assert.equal(await p.page.locator('#timingPostHeaders').textContent(),timingLabels[values.ph],c.name);
      assert.equal(await p.page.locator('#timingCurrentStage').textContent(),values.cur,c.name);
      assert.equal(await p.page.locator('#timingHops').textContent(),values.hops,c.name);
      assert.equal(await p.page.locator('#timingLastGet').textContent(),values.hops==='0'?'未執行':'GET'+values.hops+'：'+timingLabels[values['g'+values.hops]],c.name);
    }
    if(!body)assert.equal(await p.page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');
    assert.equal(p.calls.length,1);assert.equal(await p.page.locator('img').count(),0);
    if(c.name==='success'){
      const markup=await p.page.evaluate(()=>({doctype:document.doctype.name,lang:document.documentElement.lang,
        ids:[...document.querySelectorAll('[id]')].map(e=>e.id),scripts:[...document.scripts].map(s=>s.getAttribute('src')),
        fits:document.documentElement.scrollWidth<=innerWidth}));
      assert.equal(markup.doctype,'html');assert.equal(markup.lang,'zh-Hant');assert.equal(new Set(markup.ids).size,markup.ids.length);assert(markup.fits);
      assert.deepEqual(markup.scripts,['https://static.line-scdn.net/liff/edge/2/sdk.js','config.js','client.js?v=t3-3-timing-diag']);
    }
    await p.close();
  }
  // A pending next response must not leave the previous timing visible.
  const gate=deferred(),p=await timingPage(browser,[{header:timingHeader({ph:'TIMEOUT',fb:'NOT_RUN',tot:'TIMEOUT',cur:'POST_HEADERS'}),status:504,
    body:{success:false,transportError:'UPSTREAM_TIMEOUT',transportStage:'POST_HEADERS'}},{header:basic,gate}]);
  await p.click('check');await p.page.click('#check');
  assert.equal(await p.page.locator('#timingAvailability').textContent(),'尚未取得');
  for(const id of ['timingTotal','timingCurrentStage','timingHops','timingPostHeaders','timingLastGet'])assert.equal(await p.page.locator('#'+id).textContent(),'—');
  gate.resolve();await p.page.waitForFunction(()=>!document.getElementById('check').disabled);assert.equal(await p.page.locator('#timingAvailability').textContent(),'可用');
  assert.equal(p.calls.length,2);await p.close();
  console.log('PASS: '+(cases.length+1)+' timing diagnostic browser scenarios (HTML/static included)');
}
async function runTimingCompatibility(browser) {
  const {execFileSync}=require('node:child_process');
  const baseline='4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4:';
  const oldClient=execFileSync('git',['show',baseline+'transport-v2/live-test/client.js'],{encoding:'utf8'});
  const oldHtml=execFileSync('git',['show',baseline+'transport-v2/live-test/index.html'],{encoding:'utf8'});
  let count=0;
  // Approved test #21A: no crash/raw header; old exact-version gate may deny status.
  for(const version of ['t3-2-status-only','t3-3-timing-diag']){
    const p=await timingPage(browser,[{version,header:'PRIVATE_HEADER'},{version,header:'PRIVATE_HEADER'}],{script:oldClient,html:oldHtml});
    await p.click('check');assert.equal(await p.page.locator('#employee').textContent(),'EMP001 / 操作員');
    await p.click('baselineCheck');assert.equal(await p.page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
    if(version==='t3-3-timing-diag'){
      await p.page.evaluate(()=>{document.getElementById('operationRequestId').value='status-request-0001';const b=document.getElementById('operationStatusCheck');b.disabled=false;b.click();});
      assert.equal(p.calls.length,2);
    }
    assert.equal(await p.page.locator('#error').textContent(),'無');await p.close();count++;
  }
  // Approved #21B: all three reads work on old/new versions, including rollback.
  const scenarios=[{versions:['t3-2-status-only']},{versions:['t3-3-timing-diag']},
    {versions:['t4-safety-1']},{versions:['t4-safety-1'],owner:true},
    {versions:['t4-safety-1'],malformed:true},
    {versions:['t3-3-timing-diag','t3-2-status-only']},{versions:['t3-3-timing-diag'],malformed:true},
    {versions:['t3-3-timing-diag'],oldHtml:true},{versions:['t3-2-status-only'],owner:true},{versions:['t3-3-timing-diag'],owner:true}];
  for(const c of scenarios){
    const plans=c.versions.flatMap(version=>Array.from({length:3},()=>({version,header:c.malformed?'PRIVATE_HEADER':version!=='t3-3-timing-diag'?undefined:timingHeader({})})));
    const p=await timingPage(browser,plans,{html:c.oldHtml?oldHtml:undefined,identity:c.owner?{...timingIdentity,employee:{...timingIdentity.employee,permission:'OWNER'}}:timingIdentity});
    for(const version of c.versions){
      await p.click('check');assert.equal(await p.page.locator('#version').textContent(),version);
      await p.click('baselineCheck');assert.equal(await p.page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
      await p.page.fill('#operationRequestId','status-request-0001');await p.click('operationStatusCheck');
      assert((await p.page.locator('#operationStatusFields').textContent()).includes('NOT_OBSERVED'));
      assert.equal(await p.page.locator('#error').textContent(),'無');
      if(!c.oldHtml)assert.equal(await p.page.locator('#timingAvailability').textContent(),c.malformed||version!=='t3-3-timing-diag'?'無法取得':'可用');
    }
    assert.equal(p.calls.length,c.versions.length*3);await p.close();count++;
  }
  // Preserve main's older identity/dry-run support; status stays fail closed.
  for(const version of ['t1-1','t3-1']){
    const p=await timingPage(browser,[{version},{version}]);
    await p.click('check');assert.equal(await p.page.locator('#version').textContent(),version);
    await p.click('baselineCheck');assert.equal(await p.page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
    await p.page.evaluate(()=>{document.getElementById('operationRequestId').value='status-request-0001';const b=document.getElementById('operationStatusCheck');b.disabled=false;b.click();});
    assert.equal(p.calls.length,2);assert.equal(await p.page.locator('#timingAvailability').textContent(),'無法取得');
    await p.close();count++;
  }
  for(const [state,permission] of [['ACTIVE_EMPLOYEE','SITE_MANAGER'],['ACTIVE_EMPLOYEE','EMPLOYEE'],['SUSPENDED','ADMIN'],['LEAVE','OWNER'],['TERMINATED','ADMIN'],['UNREGISTERED','ADMIN']]){
    const p=await timingPage(browser,[{header:timingHeader({})}],{identity:{...timingIdentity,state,employee:{...timingIdentity.employee,permission}}});
    await p.click('check');
    assert(await p.page.locator('#baselineSection').isHidden());assert(await p.page.locator('#operationStatusSection').isHidden());
    await p.page.evaluate(()=>{document.getElementById('operationRequestId').value='status-request-0001';for(const id of ['baselineCheck','operationStatusCheck']){const b=document.getElementById(id);b.disabled=false;b.click();}});
    assert.equal(p.calls.length,1);await p.close();count++;
  }
  console.log('PASS: '+count+' timing/version compatibility and permission browser scenarios');
}


// Optional composition run. Normal frontend tests never require the release worktree.
// This path runs its actual source in a VM with only mocked upstream fetch/timers.
async function runCrossBranchContract(browser) {
  const vm=require('node:vm'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
  const artifact=fs.readFileSync(path.resolve(process.env.TRANSPORT_CONTRACT_RELAY),'utf8');
  const rollback=execFileSync('git',['show','b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5:transport-v2/worker/relay.mjs'],{encoding:'utf8'});
  const digest=crypto.createHash('sha256').update(fs.readFileSync(path.resolve(process.env.TRANSPORT_CONTRACT_RELAY))).digest('hex');
  assert(artifact.includes("export const VERSION = 't3-3-timing-diag'"));
  assert(rollback.includes("export const VERSION = 't3-2-status-only'"));
  for(const source of [artifact,rollback]){
    assert(!/employee-baseline-migrate|T4_CONTROLLED_MIGRATION_ENABLED/.test(source));
    assert.deepEqual([...source.matchAll(/^  '(\/[^']+)':/gm)].map(m=>m[1]),['/identity','/employee-read','/employee-operation-status']);
  }
  const cases=['identity','dry-run','status','timing-multihop','malformed-timing','timeout','redirect-denied','rollback'];
  for(const scenario of cases){
    const context=await browser.newContext({viewport:{width:360,height:800},serviceWorkers:'block'});
    const page=await context.newPage(),calls=[],upstreamCalls=[],logs=[],errors=[],headersSeen=[];
    let rollbackActive=false;
    page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:'window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getIDToken:()=>"PRIVATE_TOKEN",login:()=>{}};'});
      if(url.hostname==='test.example'){
        const file=url.pathname.slice(1);assert(['index.html','client.js','config.js'].includes(file));
        return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':'text/html',body:file==='config.js'?
          'window.TransportT1Config={liffId:"offline",relayEndpoint:"https://relay.example/identity"};':fs.readFileSync(path.join(root,file),'utf8')});
      }
      assert.equal(url.hostname,'relay.example');
      assert.equal(route.request().method(),'POST');
      assert.equal(route.request().headers()['content-type'],'text/plain;charset=utf-8');
      const data=route.request().postDataJSON();calls.push(data);
      assert(['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus'].includes(data.action));
      assert.equal(url.pathname,data.action==='identityBootstrap'?'/identity':data.action==='employeeLifecycleBaselineDryRun'?'/employee-read':'/employee-operation-status');
      assert.deepEqual(data,{action:data.action,idToken:'PRIVATE_TOKEN',...(data.action==='identityBootstrap'?{}:{employeeId:'EMP001'}),
        ...(data.action==='employeeLifecycleBaselineRequestStatus'?{requestId:'status-request-0001'}:{})});
      let deadline,clock=0,hop=0;
      const source=rollbackActive?rollback:artifact;
      // Export syntax only is adapted for a private VM; the artifact logic is unchanged.
      assert.equal((source.match(/export default \{ fetch: \(request, env\) => handle\(request, env\) \};/g)||[]).length,1);
      const executable=source.replace('export const VERSION','const VERSION').replace('export async function handle','async function handle')
        .replace('export default { fetch: (request, env) => handle(request, env) };','globalThis.relayHandle=handle;');
      const sandbox=vm.createContext({Request,Response,Headers,URL,AbortController,TextDecoder,Uint8Array,crypto:crypto.webcrypto,
        performance:{now:()=>clock},fetch:()=>{throw Error('Unexpected real fetch');},
        setTimeout:(fn,ms)=>{assert.equal(ms,20000);deadline=fn;return 1;},clearTimeout:()=>{deadline=null;}});
      new vm.Script(executable,{filename:'offline-release-artifact.mjs'}).runInContext(sandbox);
      const fault=data.action==='employeeLifecycleBaselineDryRun'&&['timeout','redirect-denied'].includes(scenario)?scenario:null;
      const body=data.action==='identityBootstrap'?timingIdentity:data.action==='employeeLifecycleBaselineDryRun'?timingBaseline:timingStatus;
      const upstream=async(target,options)=>{
        upstreamCalls.push(options.method);assert.equal(options.redirect,'manual');assert.equal(options.credentials,'omit');
        const step=hop++;clock+=600;
        if(step===0){
          assert.equal(target,'https://script.google.com/macros/s/OFFLINE/exec');assert.equal(options.method,'POST');
          assert.deepEqual(JSON.parse(options.body),data);
          return new Response(null,{status:302,headers:{location:fault==='redirect-denied'?
            'https://PRIVATE_HOST.example/PRIVATE_PATH?PRIVATE_QUERY':'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});
        }
        assert.equal(new URL(target).hostname,'script.googleusercontent.com');assert.equal(options.method,'GET');
        assert.equal(options.body,undefined);assert.equal(options.headers,undefined);
        if(fault==='timeout'){
          queueMicrotask(()=>{clock=20000;assert(deadline);deadline();});
          return new Promise(()=>{});
        }
        if(scenario==='timing-multihop'&&step===1)return new Response(null,{status:303,headers:{location:'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY_2'}});
        return Response.json({...body,sub:'PRIVATE_SUB',lineUid:'PRIVATE_UID',idToken:'PRIVATE_TOKEN',requestHash:'PRIVATE_HASH',
          beforeJson:'PRIVATE_AUDIT',body:'PRIVATE_BODY',url:'https://PRIVATE_HOST.example/?PRIVATE_QUERY',message:'PRIVATE_EXCEPTION'});
      };
      const response=await sandbox.relayHandle(new Request(url.href,{method:'POST',headers:{origin:'https://test.example','content-type':'text/plain;charset=utf-8'},
        body:JSON.stringify(data)}),{GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://test.example"]',ENVIRONMENT:'development'},
        {fetchImpl:upstream,now:()=>clock});
      assert.equal(deadline,null);assert.equal(hop,fault==='redirect-denied'?1:scenario==='timing-multihop'?3:2);
      const headers=Object.fromEntries(response.headers);
      assert.equal(headers['x-transport-version'],rollbackActive?'t3-2-status-only':'t3-3-timing-diag');
      if(rollbackActive)assert.equal(headers['x-transport-timing'],undefined);
      else assert.match(headers['x-transport-timing'],/^v=1;rr=/);
      assert(!/PRIVATE_|https:/.test(headers['x-transport-timing']||''));
      headersSeen.push(headers['x-transport-timing']);
      // Corrupt only the optional header to prove business result independence.
      if(scenario==='malformed-timing')headers['x-transport-timing']='PRIVATE_TOKEN;url=https://PRIVATE_HOST.example/?PRIVATE_QUERY';
      return route.fulfill({status:response.status,headers,body:await response.text()});
    });
    await page.goto('https://test.example/index.html');await page.waitForFunction(()=>!document.getElementById('check').disabled);
    const click=async id=>{await page.click('#'+id);await page.waitForFunction(()=>!document.getElementById('check').disabled);};
    const allReads=async()=>{
      await click('check');assert.equal(await page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');
      await click('baselineCheck');assert.equal(await page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
      await page.fill('#operationRequestId','status-request-0001');await click('operationStatusCheck');
      assert((await page.locator('#operationStatusFields').textContent()).includes('NOT_OBSERVED'));
      assert.equal(await page.locator('#error').textContent(),'無');
    };
    let expectedCalls=1;
    if(scenario==='rollback'){
      await allReads();assert.equal(await page.locator('#timingAvailability').textContent(),'可用');
      rollbackActive=true;await allReads();expectedCalls=6;
      assert.equal(await page.locator('#version').textContent(),'t3-2-status-only');assert.equal(await page.locator('#timingAvailability').textContent(),'無法取得');
    }else{
      await click('check');assert.equal(await page.locator('#state').textContent(),'ACTIVE_EMPLOYEE');
      if(['dry-run','timeout','redirect-denied','malformed-timing'].includes(scenario)){await click('baselineCheck');expectedCalls=2;}
      if(scenario==='status'){await page.fill('#operationRequestId','status-request-0001');await click('operationStatusCheck');expectedCalls=2;}
      const error=await page.locator('#error').textContent();
      if(scenario==='timeout'){
        assert.equal(error,'UPSTREAM_TIMEOUT');assert.equal(await page.locator('#http').textContent(),'504');
        assert.equal(await page.locator('#transportStage').textContent(),'REDIRECT_GET_HEADERS');
        assert.equal(await page.locator('#timingCurrentStage').textContent(),'REDIRECT_GET_HEADERS');
        assert.equal(await page.locator('#timingTotal').textContent(),timingLabels.TIMEOUT);
        assert.equal(await page.locator('#timingLastGet').textContent(),'GET1：'+timingLabels.TIMEOUT);
      }else if(scenario==='redirect-denied'){
        assert.equal(error,'UPSTREAM_REDIRECT_DENIED');assert.equal(await page.locator('#redirectDiagnostic').textContent(),'REDIRECT_HOST_DENIED');
        assert.equal(await page.locator('#timingCurrentStage').textContent(),'POST_HEADERS');
      }else{
        assert.equal(error,'無');
        if(['dry-run','malformed-timing'].includes(scenario))assert.equal(await page.locator('#baselineStatus').textContent(),'此員工可進行 Legacy Baseline');
        if(scenario==='status')assert((await page.locator('#operationStatusFields').textContent()).includes('NOT_OBSERVED'));
        assert.equal(await page.locator('#timingAvailability').textContent(),scenario==='malformed-timing'?'無法取得':'可用');
        if(scenario==='timing-multihop'){
          assert.equal(await page.locator('#timingHops').textContent(),'2');assert.equal(await page.locator('#timingLastGet').textContent(),'GET2：'+timingLabels.MS_500_1999);
        }
      }
    }
    await page.evaluate(()=>Promise.resolve());assert.equal(calls.length,expectedCalls);
    assert.equal(headersSeen.length,expectedCalls);assert.equal(upstreamCalls.filter(m=>m==='POST').length,expectedCalls);
    assert.equal(upstreamCalls.length,scenario==='redirect-denied'?3:scenario==='timing-multihop'?3:expectedCalls*2);
    assert.equal(errors.length,0);assert(!/PRIVATE_/.test(await page.content()+logs.join('')));
    assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
    await context.close();
    console.log('PASS: offline cross-branch '+scenario);
  }
  console.log('PASS: '+cases.length+' cross-branch contract scenarios; Worker SHA-256 '+digest);
}

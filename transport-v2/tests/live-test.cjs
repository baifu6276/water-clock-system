// All URLs are intercepted. No actual LIFF, relay, GAS or Sheet requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../live-test');
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert(!/console\.|innerHTML|localStorage|sessionStorage|employeeApplication|employeeLifecycle(?:BaselineMigrate|Suspend|Leave|Resume|Terminate)|callApi/.test(client));
assert.deepEqual([...client.matchAll(/await request\('([^']+)'\)/g)].map(m => m[1]), ['identityBootstrap', 'employeeLifecycleBaselineDryRun']);
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
    await page.evaluate(() => { for (const id of ['check', 'baselineCheck']) { const b = document.getElementById(id); b.disabled = false; b.click(); } });
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

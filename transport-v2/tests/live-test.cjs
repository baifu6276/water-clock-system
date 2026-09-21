// All URLs are intercepted. No actual LIFF, relay, GAS or Sheet requests.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../live-test');
const client = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
assert(!/console\.|innerHTML|localStorage|sessionStorage|employeeApplication|employeeLifecycle|callApi/.test(client));
assert.deepEqual([...client.matchAll(/action:\s*'([^']+)'/g)].map(m => m[1]), ['identityBootstrap']);
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
    console.log('PASS: ' + scenarios.length + ' isolated browser scenarios');
  } finally { await browser.close(); }
})().catch(() => { console.error('Isolated browser test failed'); process.exitCode = 1; });

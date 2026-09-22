import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../worker/relay.mjs';
const env = { GAS_UPSTREAM: 'https://script.google.com/macros/s/OFFLINE/exec', ALLOWED_ORIGINS: '["https://baifu6276.github.io"]' };
const token = 'PRIVATE_TOKEN_SENTINEL';
const good = { success: true, state: 'ACTIVE_EMPLOYEE', employee: { employeeId: 'EMP001', name: '測試' } };
const input = { action: 'identityBootstrap', idToken: token };
function request(body = input, options = {}, route = '/identity') {
  return new Request('https://relay.example' + route, { method: 'POST',
    headers: { origin: 'https://baifu6276.github.io', 'content-type': 'text/plain;charset=utf-8' },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options });
}
const json = (body = good) => Response.json(body);
async function run(req = request(), responses = [json()], config = env, timeoutMs = 200) {
  const calls = [];
  const result = await handle(req, config, { timeoutMs, fetchImpl: async (...args) => {
    calls.push(args); const response = responses.shift();
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(...args);
    assert(response, 'Unexpected retry'); return response;
  } });
  const body = await result.json();
  if (body.transportError !== 'UPSTREAM_TIMEOUT') assert.equal(Object.hasOwn(body, 'transportStage'), false);
  return { result, calls, body };
}
test('success semantics, fixed upstream POST, no credentials/cache, UUID', async () => {
  const { result, calls, body } = await run();
  assert.deepEqual(body, good); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], env.GAS_UPSTREAM);
  const options = calls[0][1];
  assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(options.body), input); assert.equal(options.redirect, 'manual');
  assert.equal(options.credentials, 'omit'); assert.equal(options.cache, 'no-store');
  assert.match(result.headers.get('x-correlation-id'), /^[0-9a-f-]{36}$/);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), 'https://baifu6276.github.io');
  assert.equal(result.headers.get('location'), null);
});
for (const action of ['employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineMigrate', 'employeeApplicationApprove',
  'employeeApplicationReject', 'employeeApplicationSubmit', 'employeeApplicationCancel', 'employeeLifecycleTerminate',
  'clockIn', 'adminPayrollRefresh', 'dailyReportSubmit', 'adminProgressUpsert', 'unknown', '', null]) {
  test('deny action ' + action, async () => {
    const r = await run(request({ ...input, action }), []);
    assert.equal(r.body.transportError, 'ACTION_DENIED'); assert.equal(r.calls.length, 0);
  });
}
for (const [name, body, code] of [
  ['malformed', '{', 'REQUEST_INVALID'], ['array', [], 'REQUEST_INVALID'], ['null', null, 'REQUEST_INVALID'],
  ['no token', { action: input.action }, 'TOKEN_REQUIRED'], ['blank token', { ...input, idToken: ' ' }, 'TOKEN_REQUIRED'],
  ['object token', { ...input, idToken: {} }, 'TOKEN_REQUIRED'],
  ['override upstream', { ...input, upstream: 'https://evil.example' }, 'REQUEST_INVALID'],
  ['override identity', { ...input, userId: 'fake' }, 'REQUEST_INVALID'],
  ['large request', 'x'.repeat(16385), 'REQUEST_TOO_LARGE']]) {
  test(name, async () => { const r = await run(request(body), []); assert.equal(r.body.transportError, code); assert.equal(r.calls.length, 0); });
}
for (const status of [302, 303]) test('follow ' + status + ' without token', async () => {
  const r = await run(request(), [new Response(null, { status, headers: { location: 'https://script.googleusercontent.com/macros/echo?oneTime=private' } }), json()]);
  assert.deepEqual(r.body, good); assert.equal(r.calls.length, 2);
  assert.equal(r.calls[1][1].method, 'GET'); assert.equal(r.calls[1][1].body, undefined);
  assert.equal(r.calls[1][1].headers, undefined); assert(!JSON.stringify(r.body).includes('oneTime'));
});
for (const location of ['https://evil.example/', 'http://script.googleusercontent.com/', 'https://script.googleusercontent.com.evil.example/',
  'https://user:pass@script.googleusercontent.com/', 'https://script.googleusercontent.com:444/', 'https://script.google.com/', 'bad']) {
  test('reject redirect ' + location, async () => {
    const r = await run(request(), [new Response(null, { status: 302, headers: { location } })]);
    assert.equal(r.body.transportError, 'UPSTREAM_REDIRECT_DENIED'); assert.equal(r.calls.length, 1);
  });
}
test('307 refuses token replay', async () => {
  const r = await run(request(), [new Response(null, { status: 307, headers: { location: 'https://script.googleusercontent.com/' } })]);
  assert.equal(r.body.transportError, 'UPSTREAM_REDIRECT_DENIED'); assert.equal(r.calls.length, 1);
});
test('bounded redirects', async () => {
  const r = await run(request(), Array.from({ length: 4 }, () => new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/' } })));
  assert.equal(r.body.transportError, 'UPSTREAM_REDIRECT_LIMIT'); assert.equal(r.calls.length, 4);
});
test('timeout including fetch, no retry', async () => {
  const r = await run(request(), [() => new Promise(() => {})], env, 5);
  assert.equal(r.body.transportError, 'UPSTREAM_TIMEOUT'); assert.equal(r.result.status, 504); assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0][1].signal.aborted, true);
});
test('body read deadline', async () => {
  const r = await run(request(), [new Response(new ReadableStream({ start() {} }))], env, 5);
  assert.equal(r.body.transportError, 'UPSTREAM_TIMEOUT');
});
for (const status of [400, 401, 403, 404, 500]) test('upstream HTTP ' + status, async () => {
  const r = await run(request(), [new Response(token, { status })]);
  assert.deepEqual(r.body, { success: false, transportError: 'UPSTREAM_HTTP_ERROR' }); assert.equal(r.calls.length, 1);
});
for (const body of ['<html>' + token, 'null', '[]', '{"success":"true"}']) test('invalid upstream JSON ' + body.slice(0, 8), async () => {
  const r = await run(request(), [new Response(body)]); assert.equal(r.body.transportError, 'UPSTREAM_JSON_INVALID');
});
test('oversized streamed response', async () => {
  const r = await run(request(), [new Response('x'.repeat(65537))]); assert.equal(r.body.transportError, 'UPSTREAM_RESPONSE_TOO_LARGE');
});
test('network error privacy and no retry', async () => {
  const r = await run(request(), [new Error(token + ' PRIVATE_SUB https://secret/')]);
  assert.deepEqual(r.body, { success: false, transportError: 'UPSTREAM_NETWORK_ERROR' }); assert.equal(r.calls.length, 1);
});
test('business error preserved, not reinterpreted', async () => {
  const value = { success: false, code: 'AUTH_ERROR', diagnosticCode: 'LINE_TOKEN_EXPIRED', state: 'AUTH_ERROR' };
  assert.deepEqual((await run(request(), [json(value)])).body, value);
});
test('deny origin, absent origin, no wildcard', async () => {
  for (const origin of ['https://evil.example', 'null', 'http://localhost:8000', '']) {
    const r = await run(request(input, { headers: { origin } }), []);
    assert.equal(r.body.transportError, 'ORIGIN_DENIED'); assert.equal(r.calls.length, 0);
    assert.equal(r.result.headers.get('access-control-allow-origin'), null);
  }
});
test('OPTIONS only POST and content-type, no upstream', async () => {
  let called = false;
  const response = await handle(request('', { method: 'OPTIONS', body: undefined, headers: { origin: 'https://baifu6276.github.io',
    'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } }), env, { fetchImpl: () => { called = true; } });
  assert.equal(response.status, 204); assert.equal(called, false);
  const r = await run(request('', { method: 'OPTIONS', body: undefined, headers: { origin: 'https://baifu6276.github.io', 'access-control-request-method': 'DELETE' } }), []);
  assert.equal(r.body.transportError, 'METHOD_DENIED');
});
test('invalid fixed config fails closed', async () => {
  for (const GAS_UPSTREAM of ['https://evil.example/exec', 'http://script.google.com/macros/s/X/exec', env.GAS_UPSTREAM + '?secret=x']) {
    const r = await run(request(), [], { ...env, GAS_UPSTREAM }); assert.equal(r.body.transportError, 'CONFIG_ERROR'); assert.equal(r.calls.length, 0);
  }
});
test('production rejects wildcard/local origins; separate dev configuration permits localhost', async () => {
  for (const origin of ['*', 'https://localhost', 'https://demo.test', 'https://127.0.0.1']) {
    const r = await run(request(), [], { ...env, ALLOWED_ORIGINS: JSON.stringify([origin]) });
    assert.equal(r.body.transportError, 'CONFIG_ERROR'); assert.equal(r.calls.length, 0);
  }
  const r = await run(request(input, { headers: { origin: 'http://localhost:8000', 'content-type': 'application/json' } }), [json()],
    { ...env, ENVIRONMENT: 'development', ALLOWED_ORIGINS: '["http://localhost:8000"]' });
  assert.deepEqual(r.body, good);
});
test('correlation IDs are generated independently per request', async () => {
  const a = await run(), b = await run();
  assert.notEqual(a.result.headers.get('x-correlation-id'), b.result.headers.get('x-correlation-id'));
});
test('HTTPS, path, method, content-type guards', async () => {
  for (const [req, code] of [
    [new Request('http://relay.example/identity'), 'HTTPS_REQUIRED'],
    [new Request('https://relay.example/identity?token=private'), 'PATH_DENIED'],
    [request('', { method: 'GET', body: undefined }), 'METHOD_DENIED'],
    [request(input, { headers: { origin: 'https://baifu6276.github.io', 'content-type': 'multipart/form-data' } }), 'CONTENT_TYPE_INVALID']]) {
    assert.equal((await run(req, [])).body.transportError, code);
  }
});
test('no logging/storage APIs in relay source or client', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const path of ['../worker/relay.mjs', '../live-test/client.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert(!/console\.|localStorage|sessionStorage|caches\.|\.put\(/.test(source));
  }
});
const baseline = { action: 'employeeLifecycleBaselineDryRun', idToken: token, employeeId: 'EMP001' };
test('T3 exact request forwards to fixed GAS, business rejection preserved', async () => {
  for (const result of [{ success: true, dryRun: true }, { success: false, code: 'FORBIDDEN' }]) {
    const r = await run(request(baseline, {}, '/employee-read'), [json(result)]);
    assert.deepEqual(r.body, result); assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0][0], env.GAS_UPSTREAM);
    assert.deepEqual(JSON.parse(r.calls[0][1].body), baseline);
    assert.equal(r.calls[0][1].headers['Content-Type'], 'text/plain;charset=utf-8');
  }
});
for (const action of ['identityBootstrap', 'employeeLifecycleBaselineMigrate', 'employeeLifecycleSuspend',
  'employeeLifecycleLeave', 'employeeLifecycleResume', 'employeeLifecycleTerminate', 'employeeApplicationApprove',
  'employeeApplicationReject', 'employeeApplicationSubmit', 'employeeApplicationCancel', 'clockIn',
  'adminPayrollRefresh', 'dailyReportSubmit', 'adminProgressUpsert', 'unknown']) {
  test('T3 rejects action ' + action, async () => {
    const r = await run(request({ ...baseline, action }, {}, '/employee-read'), []);
    assert.equal(r.body.transportError, 'ACTION_DENIED'); assert.equal(r.calls.length, 0);
  });
}
for (const employeeId of [undefined, null, 1, {}, [], '', 'EMP002', ' EMP001']) test('T3 target rejects ' + JSON.stringify(employeeId), async () => {
  const r = await run(request({ ...baseline, employeeId }, {}, '/employee-read'), []);
  assert.equal(r.body.transportError, 'REQUEST_INVALID'); assert.equal(r.calls.length, 0);
});
for (const key of ['userId', 'lineUid', 'sub', 'role', 'permission', 'authorized', 'requestId', 'snapshotVersion', 'upstream']) {
  test('T3 rejects extra ' + key, async () => {
    const r = await run(request({ ...baseline, [key]: 'PRIVATE' }, {}, '/employee-read'), []);
    assert.equal(r.body.transportError, 'REQUEST_INVALID'); assert.equal(r.calls.length, 0);
  });
}
test('T3 uses unchanged redirect/timeout/size/no-retry guards', async () => {
  const req = () => request(baseline, {}, '/employee-read');
  const ok = await run(req(), [new Response(null, { status: 303, headers: { location: 'https://script.googleusercontent.com/echo' } }), json()]);
  assert.equal(ok.calls.length, 2); assert.equal(ok.calls[1][1].method, 'GET'); assert.equal(ok.calls[1][1].body, undefined);
  const bad = await run(req(), [new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })]);
  assert.equal(bad.body.transportError, 'UPSTREAM_REDIRECT_DENIED'); assert.equal(bad.calls.length, 1);
  const timeout = await run(req(), [() => new Promise(() => {})], env, 5);
  assert.equal(timeout.body.transportError, 'UPSTREAM_TIMEOUT'); assert.equal(timeout.calls.length, 1);
  const large = await run(req(), [new Response('x'.repeat(65537))]);
  assert.equal(large.body.transportError, 'UPSTREAM_RESPONSE_TOO_LARGE'); assert.equal(large.calls.length, 1);
});
test('real GAS dry-run dispatcher with existing mocks: every Sheet mutation throws', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createRequire } = await import('node:module');
  const { fileURLToPath } = await import('node:url');
  const vm = await import('node:vm');
  const fixtureURL = new URL('../../tests/employee-foundation.test.cjs', import.meta.url);
  const fixture = await readFile(fixtureURL, 'utf8');
  // Reuse only the existing mock factory, before any foundation test executes.
  const boundary = fixture.indexOf('\nconst payload ='); assert(boundary > 0);
  const sandbox = { require: createRequire(fixtureURL), __dirname: fileURLToPath(new URL('.', fixtureURL)) };
  vm.runInNewContext(fixture.slice(0, boundary) + '\nglobalThis.makeEnv = env;', sandbox);
  for (const role of ['OWNER', 'ADMIN', 'SITE_MANAGER', 'EMPLOYEE']) {
    const e = sandbox.makeEnv();
    const master = e.tables['員工資料表'].rows;
    master[1] = ['EMP001', 'owner', '測試', '師傅', '日薪', 2200, role, '', '', '在職', '', ''];
    let attemptedWrites = 0;
    const deny = () => { attemptedWrites++; throw Error('Sheet writes forbidden'); };
    const readonly = object => new Proxy(object, { get(target, key) {
      return Object.hasOwn(target, key) ? target[key] : deny;
    } });
    const spreadsheet = readonly({ getSheetByName: name => {
      const sheet = e.tables[name];
      if (!sheet) return null;
      return readonly({ getLastRow: sheet.getLastRow, getLastColumn: sheet.getLastColumn,
        getDataRange: () => readonly({ getValues: () => sheet.rows.map(r => [...r]) }),
        getRange: (...args) => readonly({ getValues: sheet.getRange(...args).getValues }) });
    } });
    e.ctx.SpreadsheetApp = readonly({ getActiveSpreadsheet: () => spreadsheet });
    const before = JSON.stringify(e.tables);
    const result = e.call('employeeLifecycleBaselineDryRun', { employeeId: 'EMP001' }, 'owner');
    assert.equal(result.success, ['OWNER', 'ADMIN'].includes(role));
    if (result.success) { assert.equal(result.dryRun, true); assert.equal(result.employeeId, 'EMP001'); }
    else assert.equal(result.code, 'FORBIDDEN');
    assert.equal(attemptedWrites, 0); assert.equal(e.writes, 0); assert.equal(JSON.stringify(e.tables), before);
  }
});

const turn = () => new Promise(resolve => setImmediate(resolve));
function assertTimeout(r, stage, count) {
  assert.equal(r.result.status, 504);
  assert.deepEqual(r.body, { success: false, transportError: 'UPSTREAM_TIMEOUT', transportStage: stage });
  assert.equal(r.calls.length, count);
  assert(!JSON.stringify(r.body).includes(token));
}
for (const route of ['/identity', '/employee-read']) {
  const req = () => request(route === '/identity' ? input : baseline, {}, route);
  const redirect = status => new Response(null, { status, headers: {
    location: 'https://script.googleusercontent.com/private?secret=PRIVATE_LOCATION' } });
  test(route + ' stalled inbound body', async () => {
    const r = await run(request('', { body: new ReadableStream({ start() {} }), duplex: 'half' }, route), [], env, 5);
    assertTimeout(r, 'READ_REQUEST', 0);
  });
  test(route + ' stalled initial POST', async () => {
    assertTimeout(await run(req(), [() => new Promise(() => {})], env, 5), 'POST_HEADERS', 1);
  });
  for (const status of [302, 303]) test(route + ' quick ' + status + ' then GET headers stall', async () => {
    const r = await run(req(), [redirect(status), () => new Promise(() => {})], env, 5);
    assertTimeout(r, 'REDIRECT_GET_HEADERS', 2);
    assert.equal(r.calls[1][1].method, 'GET'); assert.equal(r.calls[1][1].body, undefined);
  });
  for (const partial of [false, true]) test(route + ' GET body stalls, partial=' + partial, async () => {
    const stream = new ReadableStream({ start(controller) {
      if (partial) controller.enqueue(new TextEncoder().encode('{"private":"' + token));
    } });
    assertTimeout(await run(req(), [redirect(302), new Response(stream)], env, 5), 'FINAL_BODY', 2);
  });
  for (const cancel of ['pending', 'rejected']) test(route + ' redirect cancellation ' + cancel + ' is nonblocking', async () => {
    const response = new Response(new ReadableStream({ cancel() {
      return cancel === 'pending' ? new Promise(() => {}) : Promise.reject(new Error('PRIVATE_CANCEL_EXCEPTION'));
    } }), { status: 302, headers: { location: 'https://script.googleusercontent.com/private' } });
    const r = await run(req(), [response, json()]);
    assert.deepEqual(r.body, good); assert.equal(r.calls.length, 2);
  });
  test(route + ' fetch ignoring abort resolves late: no further request', async () => {
    let release;
    const r = await run(req(), [() => new Promise(resolve => { release = resolve; })], env, 5);
    assertTimeout(r, 'POST_HEADERS', 1);
    release(redirect(302)); await turn(); await turn();
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0][1].signal.aborted, true);
  });
  test(route + ' shared default 20s deadline across multiple redirects', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let first, second;
    const pending = run(req(), [() => new Promise(resolve => { first = resolve; }),
      () => new Promise(resolve => { second = resolve; }), () => new Promise(() => {})], env, 20000);
    await turn(); t.mock.timers.tick(9000); first(redirect(302)); await turn();
    t.mock.timers.tick(9000); second(redirect(303)); await turn();
    t.mock.timers.tick(2000);
    const r = await pending;
    assertTimeout(r, 'REDIRECT_GET_HEADERS', 3);
    assert(r.calls.every(([, options]) => options.signal === r.calls[0][1].signal && options.signal.aborted));
  });
}

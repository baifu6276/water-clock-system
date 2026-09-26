import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { handle, VERSION } from '../worker/relay.mjs';
import { readFileSync } from 'node:fs';
// No test can accidentally reach a real service, even if injection is forgotten.
globalThis.fetch = () => { throw new Error('Unexpected real network'); };
const env = { GAS_UPSTREAM: 'https://script.google.com/macros/s/OFFLINE/exec', ALLOWED_ORIGINS: '["https://baifu6276.github.io"]' };
const token = 'PRIVATE_TOKEN_SENTINEL';
const good = { success: true, state: 'ACTIVE_EMPLOYEE', employee: { employeeId: 'EMP001', name: '測試' } };
const gasStages = ['VERIFY_LINE','EMPLOYEE_CONTEXT','ACTION_READ','LOCK_WAIT','RESPONSE_PREP'];
const gasValue = trace => ({version:1,transportTraceId:trace,total:'MS_500_1999',
  stages:Object.fromEntries(gasStages.map(k=>[k,k==='LOCK_WAIT'?'NOT_RUN':'LT_100']))});
const input = { action: 'identityBootstrap', idToken: token };
function request(body = input, options = {}, route = '/identity') {
  return new Request('https://relay.example' + route, { method: 'POST',
    headers: { origin: 'https://baifu6276.github.io', 'content-type': 'text/plain;charset=utf-8' },
    body: typeof body === 'string' ? body : JSON.stringify(body), ...options });
}
const json = (body = good) => Response.json(body);
async function run(req = request(), responses = [json()], config = env, timeoutMs = 200) {
  const calls = [];
  // Legacy stalled-I/O cases used a real 5 ms sleep. Advance a fake timer instead.
  const fakeDeadline = timeoutMs === 5;
  if (fakeDeadline) mock.timers.enable({ apis: ['setTimeout'] });
  let result;
  try {
  const pending = handle(req, config, { timeoutMs, now: () => 0, fetchImpl: async (...args) => {
    calls.push(args); const response = responses.shift();
    if (response instanceof Error) throw response;
    if (typeof response === 'function') return response(...args);
    assert(response, 'Unexpected retry'); return response;
  } });
  if (fakeDeadline) { await new Promise(resolve => setImmediate(resolve)); mock.timers.tick(timeoutMs); }
  result = await pending;
  } finally { if (fakeDeadline) mock.timers.reset(); }
  const body = await result.json();
  if (!['UPSTREAM_TIMEOUT', 'UPSTREAM_REDIRECT_DENIED'].includes(body.transportError)) assert.equal(Object.hasOwn(body, 'transportStage'), false);
  return { result, calls, body };
}
test('success semantics, fixed upstream POST, no credentials/cache, UUID', async () => {
  const { result, calls, body } = await run();
  assert.deepEqual(body, good); assert.equal(calls.length, 1);
  assert.equal(calls[0][0], env.GAS_UPSTREAM);
  const options = calls[0][1];
  assert.equal(options.method, 'POST'); assert.equal(options.headers['Content-Type'], 'text/plain;charset=utf-8');
  assert.deepEqual(JSON.parse(options.body), {...input, _transportDiagnostics: {version:1, traceId:result.headers.get('x-correlation-id')}}); assert.equal(options.redirect, 'manual');
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
for (const [index, location] of ['https://evil.example/', 'http://script.googleusercontent.com/', 'https://script.googleusercontent.com.evil.example/',
  'https://user:pass@script.googleusercontent.com/', 'https://script.googleusercontent.com:444/', 'https://script.google.com/', 'bad'].entries()) {
  test('reject synthetic redirect case ' + index, async () => {
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
for (const [index, body] of ['<html>' + token, 'null', '[]', '{"success":"true"}'].entries()) test('invalid upstream JSON case ' + index, async () => {
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
    assert(!/console\.|localStorage\s*[.\[]|sessionStorage\s*[.\[]|caches\.|\.put\(/.test(source));
  }
});
const baseline = { action: 'employeeLifecycleBaselineDryRun', idToken: token, employeeId: 'EMP001' };
test('T3 exact request forwards to fixed GAS, business rejection preserved', async () => {
  for (const result of [{ success: true, dryRun: true }, { success: false, code: 'FORBIDDEN' }]) {
    const r = await run(request(baseline, {}, '/employee-read'), [json(result)]);
    assert.deepEqual(r.body, result); assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0][0], env.GAS_UPSTREAM);
    assert.deepEqual(JSON.parse(r.calls[0][1].body), {...baseline, _transportDiagnostics:{version:1,traceId:r.result.headers.get('x-correlation-id')}});
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
test('pinned committed GAS read-only fixture: every Sheet mutation throws', async () => {
  // This baseline predates GAS source control. Read immutable Git objects, never
  // another worktree or its uncommitted files; no checkout/network is required.
  const { execFileSync } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const vm = await import('node:vm');
  const require = createRequire(import.meta.url);
  const path = require('node:path');
  const revision = 'c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd';
  const committed = file => execFileSync('git', ['show', revision + ':' + file], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const fixture = committed('tests/employee-foundation.test.cjs');
  // Reuse only the existing mock factory, before any foundation test executes.
  const boundary = fixture.indexOf('\nconst payload ='); assert(boundary > 0);
  const virtualRoot = path.resolve('pinned-offline-gas-fixture');
  const sandbox = { __dirname: path.join(virtualRoot, 'tests'), require: name => {
    if (name === 'node:fs') return { readFileSync: filename => {
      const relative = path.relative(virtualRoot, filename).replace(/\\/g, '/');
      assert.match(relative, /^gas\/[A-Za-z]+\.gs$/);
      return committed(relative);
    } };
    assert(['node:assert/strict', 'node:vm', 'node:crypto', 'node:path'].includes(name));
    return require(name);
  } };

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
    for (const action of ['employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus']) {
    const result = e.call(action, { employeeId: 'EMP001', ...(action === 'employeeLifecycleBaselineRequestStatus' ? { requestId: 'status-request-0001' } : {}) }, 'owner');
    assert.equal(result.success, ['OWNER', 'ADMIN'].includes(role));
    if (result.success) { if (action === 'employeeLifecycleBaselineDryRun') assert.equal(result.dryRun, true);
      else assert.equal(result.requestStatus, 'NOT_OBSERVED'); assert.equal(result.employeeId, 'EMP001'); }
    else assert.equal(result.code, 'FORBIDDEN');
    assert.equal(attemptedWrites, 0); assert.equal(e.writes, 0); assert.equal(JSON.stringify(e.tables), before);
    }
  }
});

const statusInput = { action: 'employeeLifecycleBaselineRequestStatus', idToken: token, employeeId: 'EMP001', requestId: 'status-request-0001' };
const turn = () => new Promise(resolve => setImmediate(resolve));
function assertTimeout(r, stage, count) {
  assert.equal(r.result.status, 504);
  assert.deepEqual(r.body, { success: false, transportError: 'UPSTREAM_TIMEOUT', transportStage: stage });
  assert.equal(r.calls.length, count);
  assert(!JSON.stringify(r.body).includes(token));
}
for (const route of ['/identity', '/employee-read', '/employee-operation-status']) {
  const req = () => request(route === '/identity' ? input : route === '/employee-read' ? baseline : statusInput, {}, route);
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

test('status route forwards exact read-only request and safe result', async () => {
  const receipt = { success: true, employeeId: 'EMP001', requestId: statusInput.requestId, action: 'employeeLifecycleBaselineMigrate',
    requestStatus: 'NOT_OBSERVED', historicalCompletion: false, currentConsistency: 'UNKNOWN', recoveryAllowed: false, newRequestAllowed: false };
  const r = await run(request(statusInput, {}, '/employee-operation-status'), [json(receipt)]);
  assert.deepEqual(r.body, receipt); assert.deepEqual(JSON.parse(r.calls[0][1].body), {...statusInput, _transportDiagnostics:{version:1,traceId:r.result.headers.get('x-correlation-id')}}); assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0][1].headers['Content-Type'], 'text/plain;charset=utf-8');
});
for (const [label, patch] of [['wrong employee', {employeeId:'EMP002'}], ['missing request', {requestId:undefined}],
  ['short request', {requestId:'short'}], ['object request', {requestId:{}}], ['long request', {requestId:'a'.repeat(101)}],
  ['extra role', {role:'OWNER'}], ['extra snapshot', {snapshotVersion:'private'}]]) {
  test('status rejects '+label, async () => {
    const r=await run(request({...statusInput,...patch},{},'/employee-operation-status'),[]);
    assert.equal(r.body.transportError,'REQUEST_INVALID');assert.equal(r.calls.length,0);
  });
}
for(const [route, action] of [
  ['/identity',statusInput.action],['/employee-read',statusInput.action],
  ['/employee-operation-status','identityBootstrap'],['/employee-operation-status','employeeLifecycleBaselineDryRun'],
  ...['/identity','/employee-read','/employee-operation-status','/employee-write'].map(route=>[route,'employeeLifecycleBaselineMigrate'])]) {
  test('status route/action fail closed '+route+' '+action,async()=>{
    const r=await run(request({...statusInput,action},{},route),[]);
    assert.equal(r.body.transportError,route==='/employee-write'?'PATH_DENIED':'ACTION_DENIED');assert.equal(r.calls.length,0);
  });
}
test('status preserves redirect allowlist, size limits and safe failures without fallback',async()=>{
  for(const [response,code] of [[new Response(null,{status:302,headers:{location:'https://evil.example/private'}}),'UPSTREAM_REDIRECT_DENIED'],
    [new Response('PRIVATE_BODY',{status:500}),'UPSTREAM_HTTP_ERROR'],[new Response('x'.repeat(65537)),'UPSTREAM_RESPONSE_TOO_LARGE'],
    [new Error('PRIVATE_EXCEPTION '+token),'UPSTREAM_NETWORK_ERROR']]) {
    const r=await run(request(statusInput,{},'/employee-operation-status'),[response]);
    assert.deepEqual(r.body,{success:false,transportError:code,...(code==='UPSTREAM_REDIRECT_DENIED'?{redirectDiagnostic:'REDIRECT_HOST_DENIED',transportStage:'POST_HEADERS'}:{})});assert.equal(r.calls.length,1);
  }
});

// Synthetic values only. Test names/results never include redirect URL data.
const redirectCases = [
  ...[300,301,304,305,307,308].map(status => ({status,location:'not a URL',diagnostic:'REDIRECT_STATUS_DENIED'})),
  ...[null,'','not a URL','/macros/echo','//script.googleusercontent.com/echo','https://[broken'].map(location => ({status:302,location,diagnostic:'REDIRECT_LOCATION_INVALID'})),
  {status:302,location:'http://user:private@wrong.example:8443/path?private=SECRET#PRIVATE',diagnostic:'REDIRECT_SCHEME_DENIED'},
  ...['https://wrong.example/','https://script.googleusercontent.com.attacker.example/','https://user:private@wrong.example:8443/path?private=SECRET#PRIVATE','https://script.googleusercontent.com./'].map(location=>({status:302,location,diagnostic:'REDIRECT_HOST_DENIED'})),
  ...['https://script.googleusercontent.com:8443/path?private=SECRET', 'https://user@script.googleusercontent.com/path',
    'https://:private@script.googleusercontent.com/path', 'https://script.googleusercontent.com/path#PRIVATE',
    'https://user:private@script.googleusercontent.com:8443/path?private=SECRET#PRIVATE'].map(location=>({status:303,location,diagnostic:'REDIRECT_URL_COMPONENT_DENIED'}))
];
for(const [i,c] of redirectCases.entries()) for(const hop of [0,1]) test('fixed redirect diagnostic case '+i+' hop '+hop,async()=>{
  const valid = () => new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?private=SECRET'}});
  // 304 cannot have a body in the Fetch constructor.
  const response = new Response(c.status===304?null:'PRIVATE_UPSTREAM_BODY',{status:c.status,headers:c.location===null?{}:{location:c.location,'set-cookie':'PRIVATE_COOKIE'}});
  const r=await run(request(),[...(hop?[valid()]:[]),response]);
  assert.equal(r.result.status,502);
  assert.deepEqual(r.body,{success:false,transportError:'UPSTREAM_REDIRECT_DENIED',redirectDiagnostic:c.diagnostic,transportStage:hop?'REDIRECT_GET_HEADERS':'POST_HEADERS'});
  assert.equal(r.calls.length,hop+1);assert.equal(r.result.headers.get('location'),null);assert.equal(r.result.headers.get('set-cookie'),null);
  for(const [,o] of r.calls){assert.equal(o.credentials,'omit');assert.equal(o.redirect,'manual');}
  if(hop){assert.equal(r.calls[1][1].method,'GET');assert.equal(r.calls[1][1].body,undefined);assert.equal(r.calls[1][1].headers,undefined);}
});
for(const [i,location] of ['https://script.googleusercontent.com/macros/echo?private=SECRET','https://script.googleusercontent.com:443/','https://SCRIPT.GOOGLEUSERCONTENT.COM/','https://script.googleusercontent.com/#'].entries())
 for(const status of [302,303]) test('unchanged URL normalization '+i+' status '+status,async()=>{
  const r=await run(request(),[new Response(null,{status,headers:{location}}),json()]);
  assert.deepEqual(r.body,good);assert.equal(r.calls.length,2);const o=r.calls[1][1];
  assert.equal(o.method,'GET');assert.equal(o.body,undefined);assert.equal(o.headers,undefined);assert.equal(o.credentials,'omit');assert.equal(o.redirect,'manual');
});
for(const n of [1,2,3,4])test('redirect limit precedence chain '+n,async()=>{
  const responses=Array.from({length:n},(_,i)=>new Response(null,{status:i===3?307:302,headers:{location:i===3?'not a URL':'https://script.googleusercontent.com/echo?private=SECRET'}}));
  const r=await run(request(),[...responses,json()]);assert.equal(r.calls.length,n===4?4:n+1);
  assert.deepEqual(r.body,n===4?{success:false,transportError:'UPSTREAM_REDIRECT_LIMIT'}:good);
});

// Contract v1: deferred I/O + injected monotonic clock + fake global deadline.
function timed(t, { req = request(), clock, config = env } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 0, clockCalls = 0;
  const calls = [], waiting = [];
  const pending = handle(req, config, {
    now: () => { clockCalls++; return clock ? clock(clockCalls, time) : time; },
    fetchImpl: (...args) => {
      calls.push(args);
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    }
  });
  return {
    calls, pending, clockCalls: () => clockCalls,
    async advance(ms) { time += ms; t.mock.timers.tick(ms); await turn(); },
    // Simulate clock observation before a delayed timer callback; not a new budget.
    observe(ms) { time += ms; },
    async respond(response) { await turn(); assert(waiting.length, 'No pending fetch'); waiting.shift().resolve(response); await turn(); },
    async reject(error) { await turn(); assert(waiting.length); waiting.shift().reject(error); await turn(); },
    async finish() { const result = await pending; return { result, body: await result.json(), calls }; }
  };
}
const hopResponse = (status = 302) => new Response(null, { status, headers: {
  location: 'https://script.googleusercontent.com/PRIVATE_PATH?secret=PRIVATE_QUERY', 'set-cookie': 'PRIVATE_COOKIE'
} });
const durationBuckets = ['LT_100', 'MS_100_499', 'MS_500_1999', 'MS_2000_4999', 'MS_5000_9999', 'MS_10000_19999', 'MS_GE_20000'];
function timingOf(result) {
  const header = result.headers.get('x-transport-timing');
  assert(header && header.length <= 256);
  const pairs = header.split(';').map(part => part.split('='));
  assert.deepEqual(pairs.map(p => p[0]), ['v', 'rr', 'ph', 'g1', 'g2', 'g3', 'fb', 'tot', 'cur', 'hops']);
  assert(pairs.every(p => p.length === 2));
  const value = Object.fromEntries(pairs);
  assert.equal(value.v, '1'); assert.match(value.hops, /^[0-3]$/);
  for (const key of ['rr', 'ph', 'g1', 'g2', 'g3', 'fb']) assert([...durationBuckets, 'TIMEOUT', 'NOT_RUN'].includes(value[key]));
  assert([...durationBuckets, 'TIMEOUT'].includes(value.tot));
  assert(['READ_REQUEST', 'POST_HEADERS', 'REDIRECT_GET_HEADERS', 'FINAL_BODY', 'DONE'].includes(value.cur));
  assert(!/PRIVATE|EMP001|https|google|uuid|exception/i.test(header));
  return value;
}
test('timing fast success / success header / CORS / unchanged JSON', async t => {
  const h = timed(t); await h.respond(json()); const r = await h.finish();
  assert.deepEqual(r.body, good);
  assert.deepEqual(timingOf(r.result), { v:'1', rr:'LT_100', ph:'LT_100', g1:'NOT_RUN', g2:'NOT_RUN', g3:'NOT_RUN', fb:'LT_100', tot:'LT_100', cur:'DONE', hops:'0' });
  assert.equal(r.result.headers.get('x-transport-version'), 't4-safety-2-gas-read-diag');
  assert.equal(r.result.headers.get('access-control-expose-headers'), 'X-Transport-Version, X-Correlation-Id, X-Transport-Timing');
  assert.equal(r.result.headers.get('timing-allow-origin'), null);
});
test('timing request body slow', async t => {
  let stream;
  const h = timed(t, { req: request('', { body: new ReadableStream({ start(c) { stream = c; } }), duplex:'half' }) });
  await h.advance(600); assert.equal(h.calls.length, 0);
  stream.enqueue(new TextEncoder().encode(JSON.stringify(input))); stream.close();
  await h.respond(json()); const r = await h.finish();
  assert.equal(timingOf(r.result).rr, 'MS_500_1999'); assert.deepEqual(r.body, good);
});
test('timing POST slow', async t => {
  const h = timed(t); await turn(); await h.advance(2500); await h.respond(json());
  assert.equal(timingOf((await h.finish()).result).ph, 'MS_2000_4999');
});
test('timing POST timeout / default global 20000 / no retry', async t => {
  const h = timed(t); await turn(); let settled = false; h.pending.then(() => { settled = true; });
  await h.advance(19999); assert.equal(settled, false);
  await h.advance(1); const r = await h.finish(); assertTimeout(r, 'POST_HEADERS', 1);
  const v = timingOf(r.result); assert.equal(v.ph, 'TIMEOUT'); assert.equal(v.tot, 'TIMEOUT'); assert.equal(v.hops, '0');
  assert.equal(v.fb, 'NOT_RUN'); assert.equal(h.calls[0][1].signal.aborted, true);
});
test('timing POST near deadline then redirect uses only remaining budget', async t => {
  const h = timed(t); await turn(); await h.advance(19500); await h.respond(hopResponse());
  await h.advance(500); const r = await h.finish(); assertTimeout(r, 'REDIRECT_GET_HEADERS', 2);
  const v = timingOf(r.result); assert.equal(v.ph, 'MS_10000_19999'); assert.equal(v.g1, 'TIMEOUT'); assert.equal(v.g2, 'NOT_RUN');
});
test('timing GET1 slow', async t => {
  const h = timed(t); await h.respond(hopResponse()); await h.advance(600); await h.respond(json());
  const v = timingOf((await h.finish()).result); assert.equal(v.g1, 'MS_500_1999'); assert.equal(v.hops, '1'); assert.equal(v.g2, 'NOT_RUN');
});
for (const stalledHop of [1, 2]) test('timing GET' + stalledHop + ' timeout', async t => {
  const h = timed(t); await h.respond(hopResponse());
  if (stalledHop === 2) { await h.advance(50); await h.respond(hopResponse(303)); }
  await h.advance(20000 - (stalledHop === 2 ? 50 : 0)); const r = await h.finish();
  assertTimeout(r, 'REDIRECT_GET_HEADERS', stalledHop + 1);
  const v = timingOf(r.result); assert.equal(v['g' + stalledHop], 'TIMEOUT'); assert.equal(v.g3, 'NOT_RUN');
  if (stalledHop === 2) assert.equal(v.g1, 'LT_100');
});
test('timing GET1 fast GET2 slow', async t => {
  const h = timed(t); await h.respond(hopResponse()); await h.advance(50); await h.respond(hopResponse());
  await h.advance(700); await h.respond(json()); const v = timingOf((await h.finish()).result);
  assert.equal(v.g1, 'LT_100'); assert.equal(v.g2, 'MS_500_1999'); assert.equal(v.g3, 'NOT_RUN'); assert.equal(v.hops, '2');
});
test('timing three redirect hops / POST to GET has no token, body or cookies', async t => {
  const h = timed(t);
  for (let i = 0; i < 3; i++) { await turn(); await h.advance(100); await h.respond(hopResponse(i === 1 ? 303 : 302)); }
  await h.advance(100); await h.respond(json()); const r = await h.finish(), v = timingOf(r.result);
  assert.equal(r.calls.length, 4); assert.equal(v.hops, '3');
  for (const key of ['ph','g1','g2','g3']) assert.equal(v[key], 'MS_100_499');
  for (const [,options] of r.calls.slice(1)) {
    assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); assert.equal(options.headers, undefined);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'manual');
  }
});
test('timing cumulative global timeout is not a per-stage budget', async t => {
  const h = timed(t); await turn(); await h.advance(9000); await h.respond(hopResponse());
  await h.advance(9000); await h.respond(hopResponse()); await h.advance(2000);
  const r = await h.finish(), v = timingOf(r.result); assertTimeout(r, 'REDIRECT_GET_HEADERS', 3);
  assert.equal(v.ph, 'MS_5000_9999'); assert.equal(v.g1, 'MS_5000_9999'); assert.equal(v.g2, 'TIMEOUT');
});
for (const timeout of [false, true]) test('timing final body ' + (timeout ? 'timeout and late reader immutable' : 'slow'), async t => {
  let stream;
  const h = timed(t); await h.respond(hopResponse());
  await h.respond(new Response(new ReadableStream({ start(c) { stream = c; } })));
  await h.advance(timeout ? 20000 : 800);
  if (!timeout) { stream.enqueue(new TextEncoder().encode(JSON.stringify(good))); stream.close(); }
  const r = await h.finish(), header = r.result.headers.get('x-transport-timing'), v = timingOf(r.result);
  assert.equal(v.fb, timeout ? 'TIMEOUT' : 'MS_500_1999');
  if (timeout) {
    assertTimeout(r, 'FINAL_BODY', 2); const calls = h.clockCalls();
    stream.enqueue(new TextEncoder().encode('PRIVATE_BODY')); stream.close(); await turn();
    assert.equal(r.result.headers.get('x-transport-timing'), header); assert.equal(h.clockCalls(), calls); assert.equal(h.calls.length, 2);
  }
});
test('timing timeout snapshot immutable / late fetch cannot mutate or follow redirect', async t => {
  const h = timed(t); await turn(); await h.advance(20000); const r = await h.finish();
  const header = r.result.headers.get('x-transport-timing'), count = h.clockCalls();
  await h.advance(5000); await h.respond(hopResponse());
  assert.equal(h.calls.length, 1); assert.equal(h.clockCalls(), count); assert.equal(r.result.headers.get('x-transport-timing'), header);
  assert.equal(timingOf(r.result).ph, 'TIMEOUT');
});
test('timing inbound timeout / late reader cannot start POST', async t => {
  let stream;
  const h = timed(t, { req: request('', { body: new ReadableStream({ start(c) { stream = c; } }), duplex:'half' }) });
  await h.advance(20000); const r = await h.finish(), header = r.result.headers.get('x-transport-timing');
  assertTimeout(r, 'READ_REQUEST', 0); assert.equal(timingOf(r.result).rr, 'TIMEOUT');
  stream.enqueue(new TextEncoder().encode(JSON.stringify(input))); stream.close(); await turn();
  assert.equal(h.calls.length, 0); assert.equal(r.result.headers.get('x-transport-timing'), header);
});
test('timing unrelated AbortError remains network error, not deadline', async t => {
  const h = timed(t); await turn(); await h.advance(100);
  await h.reject(new DOMException('PRIVATE_EXCEPTION PRIVATE_STACK', 'AbortError')); const r = await h.finish();
  assert.equal(r.body.transportError, 'UPSTREAM_NETWORK_ERROR'); assert.equal(r.result.status, 502);
  const v = timingOf(r.result); assert.equal(v.ph, 'MS_100_499'); assert.equal(v.cur, 'POST_HEADERS'); assert.equal(v.tot, 'MS_100_499');
});
test('timing business-error header preserves HTTP 200 and exact business JSON', async t => {
  const h = timed(t), value = { success:false, code:'FORBIDDEN' }; await h.respond(json(value));
  const r = await h.finish(); assert.deepEqual(r.body, value); assert.equal(r.result.status, 200); assert.equal(timingOf(r.result).cur, 'DONE');
});
for (const get of [false, true]) test('timing redirect-denied header / completed stages ' + get, async t => {
  const h = timed(t); if (get) await h.respond(hopResponse()); await turn(); await h.advance(150);
  await h.respond(new Response(null, { status:302, headers:{ location:'https://PRIVATE_HOST.example/PRIVATE_PATH?PRIVATE_QUERY#PRIVATE_HASH' } }));
  const r = await h.finish(), v = timingOf(r.result);
  assert.equal(r.body.redirectDiagnostic, 'REDIRECT_HOST_DENIED'); assert.equal(v[get ? 'g1' : 'ph'], 'MS_100_499');
  assert.equal(v.g2, 'NOT_RUN'); assert.equal(v.fb, 'NOT_RUN'); assert.equal(v.hops, get ? '1' : '0');
});
for (const [ms, expected] of [[0,'LT_100'],[99.999,'LT_100'],[100,'MS_100_499'],[499.999,'MS_100_499'],
  [500,'MS_500_1999'],[1999.999,'MS_500_1999'],[2000,'MS_2000_4999'],[4999.999,'MS_2000_4999'],
  [5000,'MS_5000_9999'],[9999.999,'MS_5000_9999'],[10000,'MS_10000_19999'],[19999.999,'MS_10000_19999'],
  [20000,'MS_GE_20000'],[25000,'MS_GE_20000']]) test('timing bucket boundary ' + ms, async t => {
  const h = timed(t); await turn(); h.observe(ms); await h.respond(json());
  const r = await h.finish(), v = timingOf(r.result); assert.equal(v.ph, expected); assert.equal(v.tot, expected);
  assert.equal(r.result.status, 200); assert.deepEqual(r.body, good);
});
const badClocks = {
  throws: () => { throw new Error('PRIVATE_CLOCK_EXCEPTION'); }, nan: () => NaN, infinity: () => Infinity,
  negative: () => -1, string: () => 'PRIVATE_CLOCK', backwards: n => n === 1 ? 10 : 9,
  lateFailure: n => n < 4 ? 0 : NaN
};
for (const [name, clock] of Object.entries(badClocks)) test('timing invalid clock ' + name + ' cannot change result', async t => {
  const h = timed(t, { clock }); await h.respond(json()); const r = await h.finish();
  assert.deepEqual(r.body, good); assert.equal(r.result.status, 200); assert.equal(r.result.headers.get('x-transport-timing'), null);
});
test('timing failed clock cannot mask timeout', async t => {
  const h = timed(t, { clock: () => NaN }); await turn(); await h.advance(20000); const r = await h.finish();
  assertTimeout(r, 'POST_HEADERS', 1); assert.equal(r.result.headers.get('x-transport-timing'), null);
});
test('timing snapshot failure omits diagnostics, not business result', async t => {
  const h = timed(t); await turn(); t.mock.method(Object, 'freeze', () => { throw new Error('PRIVATE_FORMAT_EXCEPTION'); });
  await h.respond(json()); const r = await h.finish(); assert.deepEqual(r.body, good); assert.equal(r.result.headers.get('x-transport-timing'), null);
});
test('timing early rejection and OPTIONS have no header and do not read clock', async () => {
  for (const req of [request(input, { method:'GET', body:undefined }), request('', { method:'OPTIONS', body:undefined,
    headers:{origin:'https://baifu6276.github.io','access-control-request-method':'POST'} })]) {
    let clockCalls = 0;
    const r = await handle(req, env, { now: () => { clockCalls++; return 0; }, fetchImpl: () => assert.fail('Unexpected fetch') });
    assert.equal(clockCalls, 0); assert.equal(r.headers.get('x-transport-timing'), null);
  }
});
for (const sentinel of ['PRIVATE_TOKEN_SENTINEL','PRIVATE_BODY','https://private.example/','PRIVATE_HOST','PRIVATE_QUERY','PRIVATE_EXCEPTION']) {
  test('timing privacy sentinel category ' + ['PRIVATE_TOKEN_SENTINEL','PRIVATE_BODY','https://private.example/','PRIVATE_HOST','PRIVATE_QUERY','PRIVATE_EXCEPTION'].indexOf(sentinel), async t => {
    const h = timed(t); await h.reject(new Error(sentinel)); const r = await h.finish();
    timingOf(r.result); assert(!JSON.stringify(r.body).includes(sentinel));
    assert(![...r.result.headers].flat().join('').includes(sentinel)); assert.equal(h.calls.length, 1);
  });
}
test('timing combined routes / opt-in default deny / config unchanged', async () => {
  const source = readFileSync(new URL('../worker/relay.mjs', import.meta.url), 'utf8');
  assert.equal(VERSION, 't4-safety-2-gas-read-diag');
  assert.deepEqual([...source.matchAll(/'(\/[^']+)'\s*:\s*\{ action:/g)].map(m => m[1]), ['/identity','/employee-read','/employee-operation-status','/employee-baseline-migrate']);
  assert(!/Date\.now|console\./.test(source));
  assert(source.includes('timeoutMs = 20000, now = () => performance.now()'));
  assert(source.includes('fetch: (request, env) => handle(request, env)'));
  const r = await run(request(input, {}, '/employee-baseline-migrate'), []);
  assert.equal(r.body.transportError, 'PATH_DENIED'); assert.equal(r.calls.length, 0);
  for (const key of ['now','timeoutMs']) {
    const bad = await run(request({...input,[key]:1}), []);
    assert.equal(bad.body.transportError, 'REQUEST_INVALID'); assert.equal(bad.calls.length, 0);
  }
  const { execFileSync } = await import('node:child_process');
  const config = readFileSync(new URL('../live-test/config.js', import.meta.url), 'utf8').replace(/\r\n/g,'\n');
  const original = execFileSync('git',['show','b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5:transport-v2/live-test/config.js'],{encoding:'utf8'});
  assert.equal(config, original.replace(/\r\n/g,'\n'));
});

for (const path of ['/identity','/employee-read','/employee-operation-status']) {
  test('GAS metadata injection after validation '+path, async()=>{
    const data=path==='/identity'?input:path==='/employee-read'?{action:'employeeLifecycleBaselineDryRun',idToken:token,employeeId:'EMP001'}:
      {action:'employeeLifecycleBaselineRequestStatus',idToken:token,employeeId:'EMP001',requestId:'status-probe-offline-0001'};
    const bad=await run(request({...data,_transportDiagnostics:{version:1,traceId:'PRIVATE'}},{},path),[]);
    assert.equal(bad.body.transportError,'REQUEST_INVALID');assert.equal(bad.calls.length,0);
    let injected;
    const r=await run(request(data,{},path),[(url,options)=>{injected=JSON.parse(options.body);return json({...good,_gasReadDiagnostics:gasValue(injected._transportDiagnostics.traceId)});}]);
    const trace=r.result.headers.get('x-correlation-id');assert.match(trace,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.deepEqual(injected,{...data,_transportDiagnostics:{version:1,traceId:trace}});
    assert.deepEqual(r.body,{...good,_gasReadDiagnostics:gasValue(trace)});assert.equal(r.calls.length,1);
  });
}
const invalidGas = [
  v=>null,v=>[],v=>'PRIVATE_TOKEN_SENTINEL',v=>({...v,extra:'PRIVATE_BODY'}),v=>({...v,version:'1'}),
  v=>({...v,total:'NOT_RUN'}),v=>({...v,total:'TIMEOUT'}),v=>({...v,total:{secret:'PRIVATE'}}),
  v=>({...v,transportTraceId:'PRIVATE_SUB'}),v=>({...v,transportTraceId:'11111111-2222-4333-8444-555555555555'}),
  v=>({...v,stages:{...v.stages,extra:'PRIVATE_HEADER'}}),v=>({...v,stages:{}}),v=>({...v,stages:[]}),
  v=>({...v,stages:{...v.stages.ACTION_READ,PRIVATE:'PRIVATE_AUDIT'}}),
  v=>({...v,stages:{...v.stages,ACTION_READ:'TIMEOUT'}}),v=>({...v,stages:{...v.stages,ACTION_READ:['LT_100']}}),
  v=>{delete v.version;return v;},v=>{delete v.stages.VERIFY_LINE;return v;}
];
invalidGas.forEach((change,i)=>test('unsafe GAS diagnostics stripped '+i,async()=>{
  const business={success:false,code:'FORBIDDEN',message:'固定訊息'};
  const r=await run(request(),[(url,options)=>json({...business,_gasReadDiagnostics:change(gasValue(JSON.parse(options.body)._transportDiagnostics.traceId))})]);
  assert.deepEqual(r.body,business);assert(!JSON.stringify(r.body).includes('PRIVATE'));assert.equal(r.calls.length,1);
}));
for(const bucket of ['LT_100','MS_100_499','MS_500_1999','MS_2000_4999','MS_5000_9999','MS_10000_19999','MS_GE_20000'])test('GAS allowed bucket '+bucket,async()=>{
  const r=await run(request(),[(url,options)=>{const d=gasValue(JSON.parse(options.body)._transportDiagnostics.traceId);d.total=bucket;d.stages.ACTION_READ=bucket;return json({...good,_gasReadDiagnostics:d});}]);
  assert.equal(r.body._gasReadDiagnostics.total,bucket);
});
test('GAS metadata diagnostics absent on old response; no retries',async()=>{const r=await run();assert.deepEqual(r.body,good);assert.equal(r.calls.length,1);});

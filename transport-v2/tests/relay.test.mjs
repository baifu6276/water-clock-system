import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../worker/relay.mjs';
const env = { GAS_UPSTREAM: 'https://script.google.com/macros/s/OFFLINE/exec', ALLOWED_ORIGINS: '["https://baifu6276.github.io"]' };
const token = 'PRIVATE_TOKEN_SENTINEL';
const good = { success: true, state: 'ACTIVE_EMPLOYEE', employee: { employeeId: 'EMP001', name: '測試' } };
const input = { action: 'identityBootstrap', idToken: token };
function request(body = input, options = {}) {
  return new Request('https://relay.example/identity', { method: 'POST',
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
  return { result, calls, body: await result.json() };
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

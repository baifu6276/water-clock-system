import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { handle } from '../worker/relay.mjs';
const { makeEnv } = createRequire(import.meta.url)('./foundation-fixture.cjs');
const env = { GAS_UPSTREAM: 'https://script.google.com/macros/s/TEST_ONLY/exec', ALLOWED_ORIGINS: '["https://offline.example"]', ENVIRONMENT: 'development', T4_CONTROLLED_MIGRATION_ENABLED: 'true' };
const action = 'employeeLifecycleBaselineMigrate';
const payload = { action, idToken: 'PRIVATE_TOKEN', employeeId: 'EMP001', requestId: 't4-baseline-request-0001', expectedSnapshotVersion: 'a'.repeat(64), reason: '離線測試', confirmed: true };
const request = (p = payload, route = '/employee-baseline-migrate') => new Request('https://relay.example' + route, { method: 'POST', headers: { Origin: 'https://offline.example', 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(p) });
async function run(p = payload, opts = {}) {
  const calls = [];
  const r = await handle(request(p, opts.route), { ...env, ...opts.env }, { timeoutMs: opts.timeoutMs || 50, fetchImpl: opts.fetchImpl || (async (url, init) => { calls.push({url,init}); return new Response('{"success":true}'); }) });
  return { r, body: await r.json(), calls };
}
test('default-off route denies with zero upstream requests', async () => {
  for (const value of [undefined, '', 'false', true]) { const r = await run(payload, { env: { T4_CONTROLLED_MIGRATION_ENABLED: value } }); assert.equal(r.body.transportError,'PATH_DENIED'); assert.equal(r.calls.length,0); }
});
test('enabled exact route forwards only seven known keys, text/plain and manual redirect', async () => {
  const r = await run(); assert.equal(r.r.status,200); assert.equal(r.r.headers.get('x-transport-version'),'t4-safety-1'); assert.equal(r.calls.length,1);
  assert.deepEqual(JSON.parse(r.calls[0].init.body),payload); assert.equal(r.calls[0].init.redirect,'manual'); assert.equal(r.calls[0].init.credentials,'omit');
});
const invalid = [
  ['unknown key',{ permission:'OWNER' }], ['wrong action',{action:'employeeLifecycleSuspend'}], ['scope',{employeeId:'EMP002'}],
  ['employee type',{employeeId:{}}], ['snapshot alias',{snapshotVersion:'a'.repeat(64)}], ['snapshot type',{expectedSnapshotVersion:1}],
  ['snapshot malformed',{expectedSnapshotVersion:'A'.repeat(64)}], ['reason type',{reason:[]}], ['empty reason',{reason:' '}],
  ['long reason',{reason:'a'.repeat(1001)}], ['confirmation',{confirmed:'true'}], ['probe',{requestId:'status-probe-123456789'}],
  ['short id',{requestId:'x'}], ['id type',{requestId:1}], ['missing token',{idToken:undefined}],
  ...Object.keys(payload).map(key => ['missing '+key,{[key]:undefined}])
];
for(const [name, patch] of invalid)test('Worker strict '+name,async()=>{const r=await run({...payload,...patch});assert.equal(r.calls.length,0);assert.equal(r.body.success,false);});
for(const route of ['/identity','/employee-read','/employee-operation-status','/employee-write'])test('never exposes migration on '+route,async()=>{const r=await run(payload,{route});assert.equal(r.calls.length,0);assert.equal(r.body.success,false);});
for(const other of ['employeeLifecycleLeave','employeeLifecycleResume','employeeLifecycleTerminate','employeeApplicationApprove','employeeApplicationReject','payroll','rehire','rebinding','bulkMigration'])test('no generic proxy '+other,async()=>{const r=await run({...payload,action:other});assert.equal(r.calls.length,0);});
test('POST to GAS then allowed GET never replays token/body; no retry', async () => {
  let count=0;
  const r=await run(payload,{fetchImpl:async(url,init)=>{
    count++;
    if(count===1){assert.equal(init.method,'POST');return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});}
    assert.equal(init.method,'GET');assert.equal(init.body,undefined);assert.equal(init.headers,undefined);assert.equal(init.credentials,'omit');return new Response('{"success":true}');
  }});assert.equal(count,2);assert.equal(r.body.success,true);
});
test('timeout before observation never retries; delayed original can still complete once',async()=>{
  const e=makeEnv(),p=e.input();e.prepare(p);let count=0,send;
  const result=await run({action,idToken:'token:owner',...p},{timeoutMs:5,fetchImpl:()=>{count++;return new Promise(resolve=>{send=()=>resolve(new Response(JSON.stringify(e.migrate(p))));});}});
  assert.equal(result.body.transportError,'UPSTREAM_TIMEOUT');assert.equal(e.status(p).requestStatus,'NOT_OBSERVED');assert.equal(count,1);
  send(); await new Promise(resolve=>setImmediate(resolve));assert.equal(e.status(p).requestStatus,'COMPLETED');assert.equal(count,1);
});
for(const stage of ['POST_HEADERS','REDIRECT_GET_HEADERS','FINAL_BODY'])test('GAS completed but transport stalled at '+stage,async()=>{
  const e=makeEnv(),p=e.input();e.prepare(p);let count=0;
  const r=await run({action,idToken:'token:owner',...p},{timeoutMs:5,fetchImpl:async(url,init)=>{
    count++;
    if(init.method==='POST'){
      assert.equal(e.migrate(p).success,true);
      if(stage==='POST_HEADERS')return new Promise(()=>{});
      return new Response(null,{status:303,headers:{Location:'https://script.googleusercontent.com/macros/echo?PRIVATE_QUERY'}});
    }
    if(stage==='REDIRECT_GET_HEADERS')return new Promise(()=>{});
    return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"PRIVATE_BODY":'));}}));
  }});
  assert.equal(r.body.transportError,'UPSTREAM_TIMEOUT');assert.equal(r.body.transportStage,stage);
  assert.equal(e.status(p).requestStatus,'COMPLETED');assert.equal(e.rows('employments').length,1);assert.equal(count,stage==='POST_HEADERS'?1:2);
  assert(!/PRIVATE_|token:/.test(JSON.stringify(r.body)));
});

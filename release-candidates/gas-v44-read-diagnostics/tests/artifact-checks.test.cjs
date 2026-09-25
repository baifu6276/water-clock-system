const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {manifest}=require('./package-candidate.cjs');
const root=path.resolve(__dirname,'..'),workerRoot=path.resolve(root,'../..');
const read=file=>fs.readFileSync(path.join(root,'sources',file),'utf8');
for(const file of fs.readdirSync(path.join(root,'sources')).filter(f=>f.endsWith('.gs')))
  test('syntax V44 candidate '+file,()=>{new vm.Script(read(file),{filename:file});});
test('manifest exact 10-file matrix and both deterministic bundle hashes',()=>{
  assert.deepEqual(manifest(),JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json'),'utf8')));
  assert.equal(manifest().matrix.filter(f=>f.status==='MODIFIED').length,2);
  assert.equal(manifest().matrix.filter(f=>f.status==='UNCHANGED').length,8);
});
test('manifest and webapp settings unchanged byte-for-byte',()=>{
  const a=fs.readFileSync(path.join(root,'sources/appsscript.json')),b=fs.readFileSync(path.join(root,'evidence/v44-sources/appsscript.json'));
  assert(a.equals(b));assert.deepEqual(JSON.parse(a).webapp,{executeAs:'USER_DEPLOYING',access:'ANYONE_ANONYMOUS'});
});
test('no T4 source imported; original mutation and migration functions preserved',()=>{
  assert(!fs.existsSync(path.join(root,'sources/EmployeeBaselineControl.gs')));
  const source=read('EmployeeLifecycleBaseline.gs'),base=fs.readFileSync(path.join(root,'evidence/v44-sources/EmployeeLifecycleBaseline.gs'),'utf8');
  assert.equal(source.slice(0,source.indexOf('function employeeBaselineRequestStatus_')),base.slice(0,base.indexOf('function employeeBaselineRequestStatus_')));
  assert(!/T4_EMP001_BASELINE_CONTROL|employeeBaselineStrictInput_|employeeBaselineDenied_/.test(source));
});
test('new diagnostics do not serialize response or use log/store/URL services',()=>{
  const source=read('EmployeeApplication.gs');
  const helpers=source.slice(source.indexOf('function employeeReadDiagnosticInput_'),source.indexOf('function employeeOwnApplications_'));
  assert(!/JSON\s*\.\s*stringify\s*\(|(?:ContentService|Logger|console|SpreadsheetApp|CacheService|UrlFetchApp)\s*\.|setProperty\s*\(/.test(helpers));
  assert(helpers.includes("getProperty('READ_DIAGNOSTICS_ENABLED') === 'true'"));
  assert(!/TIMEOUT|RESPONSE_BUILD/.test(helpers));
});
test('read-only Worker default deadline and redirect security remain fixed',()=>{
  const source=fs.readFileSync(path.join(workerRoot,'transport-v2/worker/relay.mjs'),'utf8');
  assert.deepEqual([...source.matchAll(/^  '(\/[^']+)':/gm)].map(m=>m[1]),['/identity','/employee-read','/employee-operation-status']);
  assert(source.includes("timeoutMs = 20000, now = () => performance.now()"));
  assert(source.includes("if (![302, 303].includes(response.status))"));
  assert(source.includes("if (next.hostname !== 'script.googleusercontent.com')"));
  assert(source.includes('if (next.port || next.username || next.password || next.hash)'));
  assert(source.includes("options = { method: 'GET' }"));
  assert(!/console\.|T4_CONTROLLED|employee-baseline-migrate/.test(source));
});
test('current-main frontend syntax/static/config isolation',()=>{
  assert(process.env.FRONTEND_ROOT,'FRONTEND_ROOT required, never silently skip frontend validation');
  const dir=path.join(process.env.FRONTEND_ROOT,'transport-v2/live-test'),source=fs.readFileSync(path.join(dir,'client.js'),'utf8');
  new vm.Script(source);new vm.Script(fs.readFileSync(path.join(dir,'config.js'),'utf8'));
  assert(!/console\.|innerHTML|(?:localStorage|sessionStorage)\s*[.\[]|document\.cookie/.test(source));
  // The existing status receipt legitimately names the operation being queried.
  // Assert outgoing actions, not that harmless response validation string.
  assert.deepEqual([...source.matchAll(/await request\('([^']+)'/g)].map(m=>m[1]),
    ['identityBootstrap','employeeLifecycleBaselineDryRun','employeeLifecycleBaselineRequestStatus']);
  assert(source.includes("const GAS_TIMING_VERSION = 't3-4-gas-read-diag'"));
  assert(source.includes("[STATUS_VERSION, 't4-safety-1', TIMING_VERSION, GAS_TIMING_VERSION]"));
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  assert(html.includes('client.js?v=t3-4-gas-read-diag'));assert.equal((html.match(/id="gasTimingTitle"/g)||[]).length,1);
});

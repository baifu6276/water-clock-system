"""Offline assembly from immutable Git blobs; never reads deployed services."""
from pathlib import Path
import subprocess,json,hashlib,difflib
ROOT=Path(__file__).resolve().parents[1]; REPO=ROOT.parents[1]
WORKER='6f3921f2bbea6d175c8bcac3888b09e231f44774'
FRONT='e6078e4fd12811ed42d48840656c721765c2ede7'
REFERENCE='4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4'
VERSION='t4-safety-2-gas-read-diag'
def blob(ref,name):return subprocess.check_output(['git','show',ref+':'+name],cwd=REPO)
def write(name,data):
 p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data if isinstance(data,bytes) else data.encode())
def replace(text,before,after):
 assert text.count(before)==1,(before,text.count(before));return text.replace(before,after)
def patch(name,before,after):write('evidence/'+name,''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),'before/'+name,'after/'+name)))
original=blob(WORKER,'transport-v2/worker/relay.mjs');source=original.decode()
write('evidence/t3-4-relay.mjs',original)
write('evidence/t4-reference-relay.mjs',blob(REFERENCE,'transport-v2/worker/relay.mjs'))
source=replace(source,'// Isolated T1/T3 reads only. No logging, storage, retries, or business authorization.', '// T3-4 reads plus one opt-in EMP001 operation. GAS remains the write authority.')
source=replace(source,"export const VERSION = 't3-4-gas-read-diag';", "export const VERSION = '"+VERSION+"';")
anchor="  '/employee-operation-status': { action: 'employeeLifecycleBaselineRequestStatus', keys: ['action', 'idToken', 'employeeId', 'requestId'] }"
source=replace(source,anchor,anchor+",\n  '/employee-baseline-migrate': { action: 'employeeLifecycleBaselineMigrate', keys: ['action', 'idToken', 'employeeId', 'requestId', 'expectedSnapshotVersion', 'reason', 'confirmed'] }")
source=replace(source,"    const route = routes[url.pathname];", "    const route = routes[url.pathname];\n    const controlled = url.pathname === '/employee-baseline-migrate';\n    if (controlled && env.T4_CONTROLLED_MIGRATION_ENABLED !== 'true') fail('PATH_DENIED');")
source=replace(source,"      if (data.action !== route.action) fail('ACTION_DENIED');", """      if (controlled && (Object.keys(data).length !== route.keys.length || route.keys.some(key => !Object.hasOwn(data, key)) ||
          data.action !== route.action || data.employeeId !== 'EMP001' ||
          data.requestId !== 'c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab' ||
          data.expectedSnapshotVersion !== 'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd' ||
          data.reason !== '建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。' ||
          data.confirmed !== true)) fail('REQUEST_INVALID');
      if (data.action !== route.action) fail('ACTION_DENIED');""")
source=replace(source,"        body: JSON.stringify({ ...(url.pathname", "        body: JSON.stringify(controlled ? { action: route.action, idToken: data.idToken, employeeId: 'EMP001',\n          requestId: data.requestId, expectedSnapshotVersion: data.expectedSnapshotVersion, reason: data.reason, confirmed: true } : { ...(url.pathname")
source=replace(source,'const safeDiagnostics = gasReadDiagnostics(result._gasReadDiagnostics, correlationId);','const safeDiagnostics = controlled ? undefined : gasReadDiagnostics(result._gasReadDiagnostics, correlationId);')
write('worker/relay.mjs',source);patch('worker.patch',original.decode(),source)
for file in ['client.js','index.html','config.js']:
 b=blob(FRONT,'transport-v2/live-test/'+file);text=b.decode();write('evidence/frontend-'+file,b)
 if file=='client.js':
  text=replace(text,"  const GAS_TIMING_VERSION = 't3-4-gas-read-diag';", "  const GAS_TIMING_VERSION = 't3-4-gas-read-diag';\n  const T4_TIMING_VERSION = '"+VERSION+"';")
  assert text.count('TIMING_VERSION, GAS_TIMING_VERSION].includes(version)')==2
  text=text.replace('TIMING_VERSION, GAS_TIMING_VERSION].includes(version)','TIMING_VERSION, GAS_TIMING_VERSION, T4_TIMING_VERSION].includes(version)')
 if file=='index.html':text=replace(text,'client.js?v=t3-4-gas-read-diag','client.js?v=t4-safety-2-read-compat')
 write('live-test/'+file,text);patch('frontend-'+file+'.patch',b.decode(),text)
tests=blob(WORKER,'transport-v2/tests/relay.test.mjs').decode()
write('evidence/relay-test.before.mjs',tests)
tests=tests.replace("'t3-4-gas-read-diag'",repr(VERSION))
tests=replace(tests,"['/identity','/employee-read','/employee-operation-status']);", "['/identity','/employee-read','/employee-operation-status','/employee-baseline-migrate']);")
tests=replace(tests,'assert(!/T4_|employee-baseline-migrate|employeeLifecycleBaselineMigrate|Date\\.now|console\\./.test(source));','assert(!/Date\\.now|console\\./.test(source));')
tests=replace(tests,"timing exact readonly release routes / no T4 artifact / config unchanged","timing combined routes / opt-in default deny / config unchanged")
write('tests/relay-regression.test.mjs',tests);patch('relay-test-adapter.patch',blob(WORKER,'transport-v2/tests/relay.test.mjs').decode(),tests)
browser=blob(FRONT,'transport-v2/tests/live-test.cjs').decode()
adapted=browser.replace('?v=t3-4-gas-read-diag','?v=t4-safety-2-read-compat')
assert browser.count('?v=t3-4-gas-read-diag')==2
write('tests/read-browser.cjs',adapted);patch('browser-test-adapter.patch',browser,adapted)
write('tests/deny-network.cjs',blob('08359639eda194a2c6183e715d6d5bb44878c086','release-candidates/gas-t4-control-no-flush/tests/deny-network.cjs'))
write('.gitattributes','worker/** -text\nevidence/** -text\nlive-test/** -text\n')
write('provenance.json',json.dumps({'baseCommit':'08359639eda194a2c6183e715d6d5bb44878c086','workerSourceCommit':WORKER,'t4DesignReferenceCommit':REFERENCE,'frontendSourceCommit':FRONT,'version':VERSION,'gasCandidateSha256':'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5','workerBaseSha256':hashlib.sha256(original).hexdigest(),'offlineOnly':True,'migration':'HOLD'},indent=2)+'\n')
print('ASSEMBLED pinned Worker + narrow read compatibility; GAS unchanged')

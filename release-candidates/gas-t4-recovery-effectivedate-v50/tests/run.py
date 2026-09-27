"""Offline V48/V49/V50 validation; never rewrites runtime or prior forensic evidence.
Run from any cwd: python release-candidates/gas-t4-recovery-effectivedate-v50/tests/run.py
The complete evidence seal can be reproduced: TAP durations/temporary paths are removed
from output digests. Counts and exit codes are from actual commands, not copied results.
"""
from pathlib import Path
import subprocess, hashlib, json, re, os, shutil, tempfile, difflib
ROOT=Path(__file__).resolve().parents[1]; REPO=ROOT.parents[1]
REF='0f3b154cff1e4788afb61c9684d792b2fb02531c'
V48='release-candidates/gas-t4-control-no-flush/'
V49='release-candidates/gas-t4-recovery-channelid-v49/'
EVID=ROOT/'evidence/v50'; EVID.mkdir(exist_ok=True)
NODE=shutil.which('node'); assert NODE

def git(*a):return subprocess.check_output(['git',*a],cwd=REPO)
def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(d):return sha(b''.join(n.encode()+b'\0'+str(len(b)).encode()+b'\0'+b for n,b in sorted(d.items())))
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')

names=sorted(p.name for p in (ROOT/'sources').iterdir());assert len(names)==11
old={n:git('show',REF+':'+V49+'sources/'+n) for n in names}
v48={n:git('show',REF+':'+V48+'sources/'+n) for n in names}
current={n:(ROOT/'sources'/n).read_bytes() for n in names}
assert bundle(old)=='57e8a16ec0088d1bd4c024a453b60f3365b70c4c47247ec925c933117ba49cc0'
assert bundle(v48)=='df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5'
assert [n for n in names if old[n]!=current[n]]==['EmployeeLifecycleBaseline.gs']
manifest={'baseCommit':REF,'basePath':V49+'sources/','bundleAlgorithm':'SHA256(sorted UTF8 relative filename + NUL + ASCII byte length + NUL + bytes)',
 'baseBundleSha256':bundle(old),'candidateBundleSha256':bundle(current),'files':[{'file':n,'baseSha256':sha(old[n]),'candidateSha256':sha(current[n]),'bytes':len(current[n]),'status':'UNCHANGED' if old[n]==current[n] else 'MODIFIED'} for n in names]}
save(ROOT/'source-manifest.json',manifest)
(EVID/'runtime.patch').write_text(''.join(difflib.unified_diff(old['EmployeeLifecycleBaseline.gs'].decode().splitlines(True),current['EmployeeLifecycleBaseline.gs'].decode().splitlines(True),fromfile='V49/EmployeeLifecycleBaseline.gs',tofile='V50/EmployeeLifecycleBaseline.gs',n=0)),encoding='utf8',newline='\n')
paths=git('ls-tree','-r','-z','--name-only',REF).decode().strip('\0').split('\0');deps={}
for p in paths:
 scope=p.startswith(tuple('release-candidates/'+n+'/' for n in ['gas-t4-control-no-flush','gas-t4-read-diagnostics','gas-v44-read-diagnostics','gas-t4-recovery-channelid-v49']))
 if (scope and ('/sources/' in p or ('/tests/' in p and p.endswith('.cjs')) or '/evidence/v44-sources/' in p or p.endswith('/evidence/t4/EmployeeLifecycleBaseline.gs') or p==V48+'source-manifest.json')) or p in ['experiments/t4-initial-prepare-wrapper/TEMP_T4_PREPARE.gs','experiments/t4-initial-prepare-wrapper/wrapper.test.cjs']:
  deps[p]=git('show',REF+':'+p)
inputs={'baseCommit':REF,'sourceManifestSha256':sha((ROOT/'source-manifest.json').read_bytes()),'candidateBundleSha256':bundle(current),
 'pinnedDependencies':[{'path':p,'sha256':sha(b)} for p,b in sorted(deps.items())],
 'localTests':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p.read_bytes())} for p in sorted((ROOT/'tests').iterdir()) if p.is_file()],
 'originalForensicEvidenceSha256':'469531b65e4ed463b8359d7aca40f35605f22ab3fe57014140ba835d2ab5e1ad'}
save(EVID/'test-inputs.json',inputs);results=[]

def run(name,args,cwd,env,kind='tap'):
 p=subprocess.run(args,cwd=cwd,env=env,capture_output=True,encoding='utf8',errors='replace',timeout=120)
 output=p.stdout+p.stderr
 if kind=='tap':
  counts={k:int(m[1]) for k in ['tests','pass','fail','skipped','cancelled'] if (m:=re.search(r'^# '+k+r' (\d+)$',output,re.M))}
 elif kind=='groups':
  m=re.search(r'(\d+) total foundation groups passed',output);counts={'pass':int(m[1]),'fail':0,'skipped':0} if m else {}
 else:counts={'checks':'PASS' if p.returncode==0 else 'FAIL'}
 normalized='\n'.join(x for x in output.replace('\r\n','\n').splitlines() if not re.match(r'\s*(?:# )?duration_ms(?::|\s)',x))+'\n'
 normalized=normalized.replace(str(temp),'${PINNED_TEMP_ROOT}').replace(str(REPO),'${REPO}')
 record={'suite':name,'command':['node' if str(a)==NODE else str(a).replace(str(temp),'${PINNED_TEMP_ROOT}').replace(str(REPO),'${REPO}') for a in args],
 'cwd':'${REPO}' if cwd==REPO else '${PINNED_TEMP_ROOT}','exitCode':p.returncode,'counts':counts,'normalizedOutputSha256':sha(normalized.encode())}
 if kind=='check' and p.returncode==0:record['result']=json.loads(p.stdout)
 results.append(record);print(name,'exit='+str(p.returncode),json.dumps(counts),flush=True)
 if p.returncode or counts.get('fail',0) or counts.get('skipped',0) or counts.get('cancelled',0) or (kind in ['tap','groups'] and not counts.get('pass')):
  save(EVID/'last-failure.json',record);print(output[-12000:],flush=True);raise SystemExit('STOP: offline suite failed')

with tempfile.TemporaryDirectory(prefix='v50-offline-') as td:
 temp=Path(td)
 for p,b in deps.items():q=temp/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
 guard=temp/V48/'tests/deny-network.cjs';testdir=temp/V48/'tests';env=dict(os.environ,V48_SERVICE_FIXTURE=str(testdir/'service-fixture.cjs'))
 def node(p,tap=True):return [NODE,'--require',str(guard)]+(['--test','--test-reporter=tap'] if tap else [])+[str(p)]
 run('V44-reference',node(testdir/'v44-foundation.cjs',False),temp,env,'groups')
 run('V48-wrapper',node(temp/'experiments/t4-initial-prepare-wrapper/wrapper.test.cjs'),temp,env)
 for label,sources in [('V48',v48),('V49',old),('V50',current)]:
  for n,b in sources.items():(temp/V48/'sources'/n).write_bytes(b)
  for suite in ['foundation.test.cjs','gas-diagnostics.test.cjs','t4-gas.test.cjs','combined-contract.test.cjs','maintenance.test.cjs']:
   group=suite=='foundation.test.cjs';run(label+'-'+suite,node(testdir/suite,not group),temp,env,'groups' if group else 'tap')
 # Old partial-state producer remains real V48 for both unchanged 69-case suites.
 for n,b in v48.items():(temp/V48/'sources'/n).write_bytes(b)
 for label,sources in [('V49',old),('V50',current)]:
  for n,b in sources.items():(temp/V49/'sources'/n).write_bytes(b)
  run(label+'-channel-recovery-regression',node(temp/V49/'tests/recovery.test.cjs'),temp,env)
 for n,b in old.items():(temp/V49/'sources'/n).write_bytes(b)
 for test in ['forensic.test.cjs','v50.test.cjs']:run(test,node(ROOT/'tests'/test),REPO,env)
 run('safe-forensic-recovery-report',node(ROOT/'tests/report.cjs',False),REPO,env,'check')
 run('candidate-static',node(ROOT/'tests/static.cjs',False),REPO,env,'check')

for x in inputs['localTests']:assert sha((ROOT/x['path']).read_bytes())==x['sha256']
assert current=={n:(ROOT/'sources'/n).read_bytes() for n in names}
totals={'pass':sum(x['counts'].get('pass',0) for x in results),'fail':0,'skipped':0}
report={'offlineOnly':True,'productionByteReplay':False,'baseCommit':REF,'sourceBundleSha256':bundle(old),'candidateBundleSha256':bundle(current),
 'testInputsSha256':sha((EVID/'test-inputs.json').read_bytes()),'counting':'Executed suites/groups; original versions and candidate versions listed separately; imported reference groups not counted twice in TAP.',
 'outputDigestPolicy':'Drop TAP duration_ms lines and replace temp/repo paths only. Retain statuses/counts/assertions.', 'totals':totals,'runs':results}
save(EVID/'test-results.json',report);save(ROOT/'TEST_RESULTS.json',report)
# Preserve old evidence/seal.json. This new seal binds both original evidence and V50 results.
evidence={p.relative_to(ROOT/'evidence').as_posix():p.read_bytes() for p in sorted((ROOT/'evidence').rglob('*')) if p.is_file()}
assert 'v50/last-failure.json' not in evidence,'Unresolved failure artifact: stop for review'
save(ROOT/'MANIFEST.json',{'sourceManifestSha256':sha((ROOT/'source-manifest.json').read_bytes()),'candidateBundleSha256':bundle(current),'baselineSha256':sha(current['EmployeeLifecycleBaseline.gs']),
 'evidenceAlgorithm':manifest['bundleAlgorithm'],'evidenceSha256':bundle(evidence),'evidenceFiles':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b in sorted(evidence.items())]})
print('TOTAL',json.dumps(totals),flush=True);print('V50_SHA',bundle(current),flush=True);print('EVIDENCE_SHA',bundle(evidence),flush=True)

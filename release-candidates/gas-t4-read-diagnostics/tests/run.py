"""Offline regression driver; only writes this candidate's test evidence/results.
Requires Node, Python, a reviewed frontend worktree, Playwright and local Chrome.
No network calls/deployment clients. Browser suites intercept every URL.
"""
from pathlib import Path
import subprocess,os,re,json,hashlib,sys,shutil
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
FRONT=Path(os.environ['FRONTEND_ROOT'])
NODE=shutil.which('node')
T='release-candidates/gas-t4-read-diagnostics/tests/'
def git(cwd,*args):return subprocess.check_output(['git',*args],cwd=cwd,text=True).strip()
assert git(REPO,'rev-parse','HEAD')=='6f3921f2bbea6d175c8bcac3888b09e231f44774'
assert git(FRONT,'rev-parse','HEAD')=='e6078e4fd12811ed42d48840656c721765c2ede7'
assert not git(FRONT,'status','--porcelain'), 'frontend must remain clean'
env=dict(os.environ)
env['TRANSPORT_CONTRACT_RELAY']=str(REPO/'transport-v2/worker/relay.mjs')
# Existing browser rollback contract needs the t3-3 artifact it was authored for.
assert 'ROLLBACK_RELAY' in env
commands=[
 ('v44-foundation',[NODE,'--require','./'+T+'deny-network.cjs',T+'v44-foundation.cjs'],REPO),
 ('combined-foundation',[NODE,'--require','./'+T+'deny-network.cjs',T+'foundation.test.cjs'],REPO),
 ('gas-diagnostics',[NODE,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'gas-diagnostics.test.cjs'],REPO),
 ('t4-safety-fixtures',[NODE,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'t4-gas.test.cjs'],REPO),
 ('combined-contract',[NODE,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'combined-contract.test.cjs'],REPO),
 ('worker-t3-4',[NODE,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap','transport-v2/tests/relay.test.mjs'],REPO),
 ('browser',[NODE,'transport-v2/tests/live-test.cjs'],FRONT),
 ('cross-artifact',[NODE,T+'cross-artifact.cjs'],REPO),
 ('static',[NODE,T+'static.cjs'],REPO),
 ('diff-check',['git','diff','--check'],REPO),
]
selected=set(sys.argv[1:])
assert not selected or selected.issubset({c[0] for c in commands})
previous=json.loads((ROOT/'TEST_RESULTS.json').read_text(encoding='utf8')) if selected and (ROOT/'TEST_RESULTS.json').exists() else {}
results=[r for r in previous.get('runs',[]) if r['suite'] not in selected] if selected else []
for name,command,cwd in commands:
 if selected and name not in selected:continue
 run_env=dict(env)
 if name=='browser':run_env['TRANSPORT_CONTRACT_RELAY']=env['ROLLBACK_RELAY']
 proc=subprocess.run(command,cwd=cwd,env=run_env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=240)
 output=proc.stdout+proc.stderr
 counts={}
 for key in ['tests','pass','fail','skipped','cancelled']:
  m=re.search(r'^# '+key+r' (\d+)$',output,re.M)
  if m:counts[key]=int(m[1])
 if 'total foundation groups passed.' in output:
  counts={'pass':int(re.search(r'(\d+) total foundation groups passed',output)[1]),'fail':0,'skipped':0}
 if name in ['browser','cross-artifact']:
  counts['passLines']=len(re.findall(r'^PASS\b',output,re.M))
  counts['summaries']=[line for line in output.splitlines() if re.search(r'passed|failed|skipped|^PASS:',line,re.I)]
  if name=='browser':
   counts['browserPass']=sum(int(m[1]) for line in output.splitlines() if 'cross-branch' not in line for m in [re.match(r'PASS: (\d+)',line)] if m)
   counts['crossBranchPass']=sum(int(m[1]) for line in output.splitlines() if 'cross-branch contract scenarios' in line for m in [re.match(r'PASS: (\d+)',line)] if m)
   counts['fail']=0 if proc.returncode==0 else None
   counts['skipped']=0 if proc.returncode==0 else None
 result={'suite':name,'cwd':str(cwd),'command':subprocess.list2cmdline(command),'exitCode':proc.returncode,'counts':counts,'outputSha256':hashlib.sha256(output.encode()).hexdigest()}
 if proc.returncode:result['failureOutput']=output[-16000:]
 results.append(result)
 (ROOT/'TEST_RESULTS.json').write_text(json.dumps({'offlineOnly':True,'frontendCommit':git(FRONT,'rev-parse','HEAD'),'workerCommit':git(REPO,'rev-parse','HEAD'),
   'environment':{k:run_env[k] for k in ['FRONTEND_ROOT','PLAYWRIGHT_MODULE','CHROME_PATH','ROLLBACK_RELAY'] if k in run_env},'runs':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(name,'exit='+str(proc.returncode),json.dumps(counts,ensure_ascii=False),flush=True)
 if proc.returncode:
  print(output[-16000:],flush=True);sys.exit(proc.returncode)
print('ALL OFFLINE SUITES PASS',flush=True)

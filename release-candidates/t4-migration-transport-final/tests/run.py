"""Offline runner. Browser intercepts all URLs; GAS/relay services are mocks."""
from pathlib import Path
import subprocess,os,json,sys,hashlib,re,shutil
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1];T='release-candidates/t4-migration-transport-final/tests/'
node=shutil.which('node');env=dict(os.environ)
env['TRANSPORT_CONTRACT_RELAY']=env['ROLLBACK_RELAY']
commands=[
 ('relay-regression',[node,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'relay-regression.test.mjs']),
 ('migration-relay',[node,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'migration-relay.test.mjs']),
 ('read-browser',[node,T+'read-browser.cjs']),
 ('runner-browser',[node,T+'runner-browser.cjs']),
 ('read-compatibility',[node,T+'read-compatibility.cjs']),
 ('gas-contract',[node,'--require','./'+T+'deny-network.cjs','--test','--test-reporter=tap',T+'gas-contract.test.cjs']),
]
selected=set(sys.argv[1:]);assert not selected or selected.issubset({n for n,_ in commands})
prior=json.loads((ROOT/'TEST_RESULTS.json').read_text(encoding='utf8')) if selected and (ROOT/'TEST_RESULTS.json').exists() else {}
results=[r for r in prior.get('runs',[]) if r['suite'] not in selected] if selected else []
for name,command in commands:
 if selected and name not in selected:continue
 run=subprocess.run(command,cwd=REPO,env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=420)
 output=run.stdout+run.stderr;counts={}
 for key in ['tests','pass','fail','skipped','cancelled']:
  m=re.search(r'^# '+key+r' (\d+)$',output,re.M)
  if m:counts[key]=int(m[1])
 if name=='read-browser':
  counts={'pass':sum(int(m[1]) for m in re.finditer(r'^PASS: (\d+)',output,re.M)),'fail':0 if run.returncode==0 else None,'skipped':0}
 elif name in ['runner-browser','read-compatibility']:
  m=re.search(r'passed=(\d+) failed=(\d+) skipped=(\d+)',output)
  if m:counts=dict(zip(['pass','fail','skipped'],map(int,m.groups())))
 results.append({'suite':name,'command':subprocess.list2cmdline(command),'cwd':str(REPO),'exitCode':run.returncode,'counts':counts,'outputSha256':hashlib.sha256(output.encode()).hexdigest()})
 (ROOT/'TEST_RESULTS.json').write_text(json.dumps({'offlineOnly':True,'environment':{k:env[k] for k in ['PLAYWRIGHT_MODULE','CHROME_PATH','ROLLBACK_RELAY']},'runs':results},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
 print(name,'exit='+str(run.returncode),counts,flush=True)
 if run.returncode:print(output[-16000:],flush=True);sys.exit(run.returncode)
print('SELECTED OFFLINE SUITES PASS',flush=True)

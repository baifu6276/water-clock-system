"""Fully offline rerun/evidence builder. Never changes runtime or existing files."""
from pathlib import Path
import subprocess,os,shutil,json,hashlib,re,difflib,tempfile,atexit
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1];E=ROOT/'evidence';E.mkdir(exist_ok=True)
BASE='16bf1e13c6afc86d0701e0d3441ca1cdd9fcf57b';V50='7bb207e6e14c1471198bc06a596b4d4805346b04'
NODE=shutil.which('node');assert NODE

def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(d):return sha(b''.join(n.encode()+b'\0'+str(len(b)).encode()+b'\0'+b for n,b in sorted(d.items())))
def git(*a):return subprocess.check_output(['git',*a],cwd=REPO)
def save(p,obj):p.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')

runtime=['transport-v2/worker/relay.mjs',*[f'transport-v2/live-test/{n}' for n in ['client.js','index.html']],*[f'transport-v2/t4-recovery-runner/{n}' for n in ['client.js','index.html']]]
existing=['transport-v2/worker/relay.mjs',*[f'transport-v2/t4-migration-runner/{n}' for n in ['client.js','index.html']],*[f'transport-v2/live-test/{n}' for n in ['client.js','index.html','config.js']]]
oldtests=[f'transport-v2/tests/{n}' for n in ['relay.test.mjs','live-test.cjs','staging-fixture.cjs','staging-worker.test.mjs','staging-model.test.cjs','staging-pages.cjs']]
localtests=[p.relative_to(REPO).as_posix() for p in sorted((ROOT/'tests').iterdir()) if p.is_file()]
localtests += [p.relative_to(REPO).as_posix() for p in sorted((REPO/'release-candidates/t4-recovery-runner-final/tests').iterdir()) if p.is_file()]
inputs={p:sha((REPO/p).read_bytes()) for p in runtime+existing+oldtests+localtests}
pinned=[]
for ref,prefix in [(V50,'release-candidates/gas-t4-recovery-effectivedate-v50/sources/'),(BASE,'transport-v2/worker/'),(BASE,'gas/')]:
 for p in git('ls-tree','-rz','--name-only',ref,prefix).decode().split('\0'):
  if p:pinned.append({'ref':ref,'path':p,'sha256':sha(git('show',ref+':'+p))})
for ref,p in [('6f3921f2bbea6d175c8bcac3888b09e231f44774','transport-v2/worker/relay.mjs')]:pinned.append({'ref':ref,'path':p,'sha256':sha(git('show',ref+':'+p))})
# Pinned prior regression harnesses exported to a disposable local directory.
TMP=tempfile.TemporaryDirectory(prefix='recovery-regression-');atexit.register(TMP.cleanup);temp=Path(TMP.name)
REF='53c60bdb2e0bc89d49ab02fd2221725e76f38adf';P='release-candidates/t4-migration-transport-final/'
def export(ref,p):
 b=git('show',ref+':'+p);q=temp/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);pinned.append({'ref':ref,'path':p,'sha256':sha(b)})
for n in ['migration-relay.test.mjs','runner-browser.cjs','read-compatibility.cjs','gas-contract.test.cjs','deny-network.cjs']:export(REF,P+'tests/'+n)
for n in ['t3-4-relay.mjs','frontend-config.js']:export(REF,P+'evidence/'+n)
for sub,files in [('worker',['relay.mjs']),('live-test',['client.js','index.html','config.js'])]:
 for n in files:
  sourcePath='transport-v2/'+sub+'/'+n;b=git('show',BASE+':'+sourcePath);q=temp/(P+sub+'/'+n);q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);pinned.append({'ref':BASE,'path':sourcePath,'sha256':sha(b)})
for n in ['client.js','index.html']:
 sourcePath='transport-v2/t4-migration-runner/'+n;b=git('show',BASE+':'+sourcePath);q=temp/sourcePath;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b);pinned.append({'ref':BASE,'path':sourcePath,'sha256':sha(b)})
gasPrefix='release-candidates/gas-t4-control-no-flush/'
for pth in git('ls-tree','-rz','--name-only',REF,gasPrefix+'sources/').decode().split('\0'):
 if pth:export(REF,pth)
for n in ['foundation-fixture.cjs','service-fixture.cjs']:export(REF,gasPrefix+'tests/'+n)
t33ref='c4ba55ca147da676759d7098f60ce4a4e31a77d3';t33path='transport-v2/worker/relay.mjs'
b=git('show',t33ref+':'+t33path);(temp/'t3-3-relay.mjs').write_bytes(b);pinned.append({'ref':t33ref,'path':t33path,'sha256':sha(b)})

# Disposable mirror: exact current artifacts; adaptations below affect test text only.
mirror=temp/'candidate'; old=temp/'prior-pages'; adaptations=[]
for d in [mirror,old]:
 d.mkdir();(d/'.git').write_text('gitdir: '+git('rev-parse','--absolute-git-dir').decode().strip()+'\n',encoding='utf8')
def put(d,p,b):
 q=d/p;q.parent.mkdir(parents=True,exist_ok=True);q.write_bytes(b)
def adapt(p,s):
 before=s
 if p.endswith('/relay.test.mjs'):
  # Synthetic positive-path fixtures, not observed Google evidence. Keep all assertions.
  s=s.replace('t4-safety-2-gas-read-diag','t4-safety-3-content-redirect')
  for a,b in [('https://script.googleusercontent.com/echo','https://script.googleusercontent.com/macros/echo'),('https://script.googleusercontent.com/private','https://script.googleusercontent.com/macros/echo'),('https://script.googleusercontent.com/PRIVATE_PATH','https://script.googleusercontent.com/macros/echo'),("https://script.googleusercontent.com/'","https://script.googleusercontent.com/macros/echo'"),('https://script.googleusercontent.com:443/','https://script.googleusercontent.com:443/macros/echo'),('https://SCRIPT.GOOGLEUSERCONTENT.COM/','https://SCRIPT.GOOGLEUSERCONTENT.COM/macros/echo'),('https://script.googleusercontent.com/#','https://script.googleusercontent.com/macros/echo#')]:s=s.replace(a,b)
 if p.endswith('/live-test.cjs'):
  s=s.replace('client.js?v=t4-safety-2-read-compat','client.js?v=t4-safety-3-content-redirect').replace('?v=t4-safety-2-read-compat','?v=t4-safety-3-content-redirect')
 if '/t4-recovery-runner-final/' in p:
  if p.endswith('/harness.cjs'):s=s.replace("const version='t4-safety-2-gas-read-diag'","const version='t4-safety-3-content-redirect'")
  if p.endswith('/runner.test.cjs'):
   lines=s.splitlines(True)
   for i,line in enumerate(lines):
    if "assert.equal(h.writes().length,0);await h.locked();" in line and 'fresh' in line:
     lines[i]=line.replace("assert.equal(h.state(),'WRITE_RESULT_UNKNOWN')","assert.equal(h.state(),'PREWRITE_STOP')")
    elif "stage==='SUBMITTING'?1:0" in line:
     lines[i]=line.replace("assert.equal(h.state(),'WRITE_RESULT_UNKNOWN')","assert.equal(h.state(),stage==='SUBMITTING'?'WRITE_RESULT_UNKNOWN':'PREWRITE_STOP')")
   s=''.join(lines)
  if p.endswith('/browser.cjs'):
   s=s.replace('t4-recovery-original-1','t4-recovery-content-redirect-1')
   s=s.replace("assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');assert.equal(f.writes().length,0)","assert.equal(await f.state(),'PREWRITE_STOP');assert.equal(f.writes().length,0)")
   s=s.replace("await f.settle();assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN');f.pending", "await f.settle();assert.equal(await f.state(),n===4?'WRITE_RESULT_UNKNOWN':'PREWRITE_STOP');f.pending")
   s=s.replace("await f.page.waitForTimeout(30);assert.equal(await f.state(),'WRITE_RESULT_UNKNOWN')", "await f.page.waitForTimeout(30);assert.equal(await f.state(),n===4?'WRITE_RESULT_UNKNOWN':'PREWRITE_STOP')")
 if s!=before:
  adaptations.append({'path':p,'sourceSha256':sha(before.encode()),'adaptedSha256':sha(s.encode()),'diff':''.join(difflib.unified_diff(before.splitlines(True),s.splitlines(True),fromfile=p,tofile='fixture-adaptation/'+p))})
 return s
mirrorFiles=list(dict.fromkeys(runtime+existing+oldtests+[p for p in localtests if '/t4-recovery-runner-final/' in p]))
for p in mirrorFiles:put(mirror,p,adapt(p,(REPO/p).read_text(encoding='utf8')).encode())
for p in existing+oldtests:put(old,p,baseBytes:=git('show',BASE+':'+p))
save(E/'adaptations.json',adaptations)
save(E/'inputs.json',{'base':BASE,'v50':V50,'localInputs':inputs,'pinned':pinned,'adaptationsSha256':sha((E/'adaptations.json').read_bytes()),'network':'All fetch mocked/intercepted; no Production requests','modelSeed':'0x52560001','hostFuzzSeed':'0x51510001'})

env=dict(os.environ)
packages=Path(NODE).parent.parent/'node_modules'
env.setdefault('PLAYWRIGHT_MODULE',str(packages/'playwright'))
if os.name=='nt':env.setdefault('CHROME_PATH',r'C:\Program Files\Google\Chrome\Application\chrome.exe')
env['TRANSPORT_CONTRACT_RELAY']=str(temp/'t3-3-relay.mjs')
runs=[]
def run(name,path,kind):
 args=[NODE,'--require',str(temp/(P+'tests/deny-network.cjs'))]+(['--test','--test-reporter=tap'] if kind=='tap' else [])+[path]
 p=subprocess.run(args,cwd=REPO,env=env,capture_output=True,encoding='utf8',errors='replace',timeout=600)
 output=p.stdout+p.stderr
 if kind=='tap':
  if not re.search(r'^# pass (\d+)$',output,re.M):print(output[-14000:]);raise SystemExit('NO_TAP '+name)
  counts={k:int(re.search(r'^# '+k+r' (\d+)$',output,re.M)[1]) for k in ['pass','fail','skipped','cancelled']}
 elif kind=='read':counts={'pass':sum(map(int,re.findall(r'^PASS: (\d+)',output,re.M))),'fail':int(p.returncode!=0),'skipped':0}
 elif kind=='static':counts={'checks':'PASS' if p.returncode==0 else 'FAIL'}
 else:
  m=re.search(r'passed=(\d+) failed=(\d+) skipped=(\d+)',output);counts=dict(zip(['pass','fail','skipped'],map(int,m.groups()))) if m else {'pass':0,'fail':1,'skipped':0}
 if p.returncode or counts.get('fail') or counts.get('skipped') or counts.get('cancelled') or (kind!='static' and not counts.get('pass')):
  print(output[-14000:]);raise SystemExit('STOP '+name)
 normalized='\n'.join(x for x in output.replace('\r\n','\n').splitlines() if not re.match(r'\s*(?:# )?duration_ms(?::|\s)',x) and not (x.startswith('warning: in the working copy of ') and 'LF will be replaced by CRLF' in x))+'\n'
 normalized=normalized.replace(str(REPO),'${REPO}').replace(str(temp),'${PINNED_TEMP}');normalized=re.sub(r'\(node:\d+\)','(node:PID)',normalized)
 runs.append({'suite':name,'command':['node']+[str(a).replace(str(temp),'${PINNED_TEMP}') for a in args[1:]],'exitCode':p.returncode,'counts':counts,'normalizedOutputSha256':sha(normalized.encode())})
 if kind=='static':save(E/'static.json',json.loads(p.stdout))
 print(name,counts,flush=True)

prefix='release-candidates/t4-content-redirect-v51/tests/'
for name,file,kind in [('New redirect + host fuzz','redirect.test.mjs','tap'),('New prewrite states','prewrite.test.cjs','tap'),('All read versions browser','read-browser.cjs','browser'),('Static/provenance','static.cjs','static')]:run(name,prefix+file,kind)
for name,file,kind in [('Recovery unit adapted','runner.test.cjs','tap'),('Recovery model','model.test.cjs','tap'),('Current Worker recovery contract','contract.test.mjs','tap'),('Recovery Chromium adapted','browser.cjs','browser')]:run(name,str(mirror/('release-candidates/t4-recovery-runner-final/tests/'+file)),kind)
run('Existing Relay adapted positive paths/version',str(mirror/'transport-v2/tests/relay.test.mjs'),'tap')
run('Existing read browser adapted cache-buster',str(mirror/'transport-v2/tests/live-test.cjs'),'read')
for name,file,kind in [('Current Worker hardening','staging-worker.test.mjs','tap'),('Unchanged migration runner model','staging-model.test.cjs','tap')]:run(name,'transport-v2/tests/'+file,kind)
run('Pinned prior Pages/rollback (old runner/old Worker)',str(old/'transport-v2/tests/staging-pages.cjs'),'browser')
for n,kind in [('migration-relay.test.mjs','tap'),('runner-browser.cjs','browser'),('read-compatibility.cjs','browser'),('gas-contract.test.cjs','tap')]:run('Pinned existing '+n,str(temp/(P+'tests/'+n)),kind)
assert all(sha((REPO/p).read_bytes())==h for p,h in inputs.items())
totals={k:sum(r['counts'].get(k,0) for r in runs) for k in ['pass','fail','skipped']}
report={'offlineOnly':True,'baseCommit':BASE,'v50Provenance':V50,'inputSha256':sha((E/'inputs.json').read_bytes()),'modelSeed':'0x52560001','hostFuzzSeed':'0x51510001','counting':'Executed cases/groups across explicitly named independent suites. Static not added to case count.','outputDigest':'Remove only TAP durations, Node PID, checkout prefix and Git line-ending notices. Preserve statuses/assertions.','totals':totals,'runs':runs}
save(E/'results.json',report);save(ROOT/'TEST_RESULTS.json',report)
patch=''.join(''.join(difflib.unified_diff(git('show',BASE+':'+p).decode('utf8').splitlines(True), (REPO/p).read_text(encoding='utf8').splitlines(True),fromfile='base/'+p,tofile=p,n=0)) for p in runtime)
(E/'runtime.patch').write_text(patch,encoding='utf8',newline='\n')
static=json.loads((E/'static.json').read_text(encoding='utf8'));evidence={p.relative_to(E).as_posix():p.read_bytes() for p in E.rglob('*') if p.is_file()}
manifest={'baseCommit':BASE,'v50Provenance':V50,'artifactHashBasis':static['hashBasis'],'hashes':static['hashes'],'algorithm':'SHA256(sorted UTF8 name + NUL + ASCII length + NUL + bytes)','runtimeFiles':[{'path':p,'bytes':len((REPO/p).read_bytes()),'sha256':sha((REPO/p).read_bytes())} for p in runtime],'inputSha256':report['inputSha256'],'evidenceSha256':bundle(evidence),'evidenceFiles':[{'path':n,'bytes':len(b),'sha256':sha(b)} for n,b in sorted(evidence.items())]}
save(ROOT/'MANIFEST.json',manifest)
(ROOT/'HASHES.md').write_text('# Offline V51 redirect/recovery hashes\n\nExisting release hashes use exact pinned Git blobs; checkout bytes are separately verified (Windows CRLF filters). Changed runtime hashes are exact LF bytes.\n\n'+''.join('- '+k+': `'+v+'`\n' for k,v in manifest['hashes'].items())+'- evidence: `'+manifest['evidenceSha256']+'`\n\nNo deployment or Production verification. Recovery HOLD.\n',encoding='utf8',newline='\n')
print('TOTAL',totals,flush=True);print('EVIDENCE_SHA',manifest['evidenceSha256'],flush=True)

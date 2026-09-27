"""Offline only. Git object reads + intercepted browsers; no deploy tools."""
from pathlib import Path
import subprocess,os,json,hashlib,tempfile,shutil,re,sys,argparse
ROOT=Path(__file__).resolve().parents[2];OUT=Path(__file__).resolve().parent
REF='53c60bdb2e0bc89d49ab02fd2221725e76f38adf'
PREFIX='release-candidates/t4-migration-transport-final/'
def blob(ref,name):return subprocess.check_output(['git','show',ref+':'+name],cwd=ROOT)
def write(root,name,data):
 p=root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
def sha(b):return hashlib.sha256(b).hexdigest()
def inputs():
 names=['transport-v2/worker/relay.mjs',*['transport-v2/live-test/'+n for n in ['client.js','index.html','config.js']],*['transport-v2/t4-migration-runner/'+n for n in ['client.js','index.html']]]
 names+=['transport-v2/tests/relay.test.mjs','transport-v2/tests/live-test.cjs']
 names+=['transport-v2/tests/'+p.name for p in (ROOT/'transport-v2/tests').glob('staging-*')]
 names+=['release-candidates/t4-release-staging/'+n for n in ['run.py','preflight.cjs'] if (OUT/n).exists()]
 return {n:sha((ROOT/n).read_bytes()) for n in sorted(names)}
BASE='b9ad9f57f435e6780d465f5480b71dc24354d991'
TEMP_BRANCH='codex/t4-preflight-verify-local'
def git_at(root,*args):
 return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.PIPE)
def save_report(report):
 (OUT/'TEST_RESULTS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
def preflight_at(root):
 p=subprocess.run([shutil.which('node'),str(root/'release-candidates/t4-release-staging/preflight.cjs')],cwd=root,capture_output=True,text=True,encoding='utf8')
 r=json.loads(p.stdout)
 assert p.returncode==(0 if r['success'] else 1),(p.returncode,p.stdout,p.stderr)
 return r

def compatibility(verification,report):
 # The caller creates a disposable worktree. Never stage/commit the actual root.
 verification=Path(verification).resolve()
 assert verification!=ROOT.resolve() and not verification.is_relative_to(ROOT.resolve())
 assert git_at(ROOT,'rev-parse','HEAD').decode().strip()==BASE
 assert not git_at(ROOT,'diff','--cached','--name-only')
 assert git_at(verification,'rev-parse','HEAD').decode().strip()==BASE
 assert not git_at(verification,'status','--porcelain')
 assert git_at(verification,'rev-parse','--git-common-dir')
 inventory=json.loads((OUT/'FILES.json').read_text(encoding='utf8'))
 names=inventory['runtime']+inventory['permanentTests']+inventory['reviewPackage']
 assert len(names)==len(set(names))==23
 cases=[]
 def passed(name):cases.append({'name':name,'pass':True});print('PREFLIGHT_COMPAT PASS '+name,flush=True)
 before=preflight_at(ROOT);assert before['success'] and before['snapshotMode']=='UNCOMMITTED_OVERLAY'
 passed('actual pre-commit snapshot')
 git_at(verification,'switch','-c',TEMP_BRANCH)
 for n in names+['transport-v2/live-test/config.js']:write(verification,n,(ROOT/n).read_bytes())
 git_at(verification,'add','--',*names,'transport-v2/live-test/config.js')
 # Hooks and signing are disabled only for this disposable fixture commit.
 git_at(verification,'-c','core.hooksPath='+str(verification.parent/'absent-offline-hooks'),'-c','commit.gpgSign=false','-c','user.name=Offline Verification','-c','user.email=offline@example.invalid','commit','-m','test: disposable preflight compatibility fixture')
 temp_head=git_at(verification,'rev-parse','HEAD').decode().strip()
 assert temp_head!=BASE
 assert not git_at(verification,'diff','--name-only')
 assert not git_at(verification,'diff','--cached','--name-only')
 git_at(verification,'add','--',*names,'transport-v2/live-test/config.js')
 assert not git_at(verification,'diff','--cached','--name-only')
 assert not git_at(verification,'status','--porcelain')
 after=preflight_at(verification)
 assert after['success'] and after['snapshotMode']=='COMMITTED_DESCENDANT' and after['baseIsAncestor']
 for k in ['runtimeFiles','testFiles','reviewFiles','changedFileCount','hashes','configUnchanged']:assert before[k]==after[k],k
 passed('clean committed descendant exact same scope/runtime/hashes')
 def change(name,edits,expected_check,positive=False,stage=False):
  originals={n:(verification/n).read_bytes() if (verification/n).exists() else None for n in edits}
  try:
   for n,value in edits.items():
    target=verification/n;assert target.resolve().is_relative_to(verification)
    if value is None:target.unlink()
    else:write(verification,n,value)
   if stage:git_at(verification,'add','--',*edits)
   result=preflight_at(verification)
   assert result['success'] is positive,(name,result)
   if positive:assert result['snapshotMode']=='COMMITTED_WITH_OVERLAY'
   else:assert any(c['name']==expected_check and not c['pass'] for c in result.get('checks',[])),(name,result)
   passed(name)
  finally:
   if stage:git_at(verification,'reset','--quiet','HEAD','--',*edits)
   for n,value in originals.items():
    target=verification/n
    if value is None:
     if target.exists():target.unlink()
    else:write(verification,n,value)
 R='release-candidates/t4-release-staging/'
 review=R+'REVIEW.md';review_bytes=(verification/review).read_bytes()
 change('committed descendant with working overlay',{review:review_bytes+b'Offline overlay fixture.\n'},None,positive=True)
 change('committed descendant with staged overlay',{review:review_bytes+b'Offline overlay fixture.\n'},None,positive=True,stage=True)
 tree=git_at(verification,'rev-parse','HEAD^{tree}').decode().strip()
 orphan=git_at(verification,'-c','user.name=Offline Verification','-c','user.email=offline@example.invalid','commit-tree',tree,'-m','offline unrelated ancestry negative fixture').decode().strip()
 try:
  git_at(verification,'update-ref','refs/heads/'+TEMP_BRANCH,orphan,temp_head)
  result=preflight_at(verification)
  assert not result['success'] and not result['baseIsAncestor'];passed('HEAD not descendant denied')
 finally:git_at(verification,'update-ref','refs/heads/'+TEMP_BRANCH,temp_head,orphan)
 cfg='transport-v2/live-test/config.js';worker='transport-v2/worker/relay.mjs';client='transport-v2/t4-migration-runner/client.js';index='transport-v2/t4-migration-runner/index.html'
 c=(verification/cfg).read_bytes();w=(verification/worker).read_bytes();rc=(verification/client).read_bytes()
 change('sixth runtime denied',{'transport-v2/unapproved-runtime.js':b'void 0;\n'},'exact snapshot scope')
 change('config content change denied',{cfg:c+b'\n'},'config unchanged and exact')
 change('missing runner client denied',{client:None},'exact five reviewed runtime blobs')
 change('missing runner index denied',{index:None},'exact five reviewed runtime blobs')
 bad=json.loads(json.dumps(inventory));bad['runtime'].append('js/app.js')
 change('inventory cannot authorize production runtime',{R+'FILES.json':json.dumps(bad).encode()},'exact snapshot scope')
 change('runtime byte drift denied',{worker:w+b'\n'},'runtime hash gates')
 change('wrong dedicated LIFF denied',{client:rc.replace(b'2011467618-QZYsTwb9',b'2011467618-WRONG')},'LIFF separation')
 change('wrong read-only LIFF denied',{cfg:c.replace(b'2011467618-R76314It',b'2011467618-WRONG')},'LIFF separation')
 change('default write flag true denied',{worker:w+b'\nconst T4_CONTROLLED_MIGRATION_ENABLED = "true";\n'},'four routes and default deny')
 bad=json.loads(json.dumps(inventory));bad['reviewPackage'][0]=bad['reviewPackage'][1]
 change('duplicate inventory denied',{R+'FILES.json':json.dumps(bad).encode()},'exact snapshot scope')
 change('24th review file denied',{R+'UNAPPROVED.txt':b'offline fixture\n'},'exact snapshot scope')
 evidence=json.loads((verification/(R+'TEST_RESULTS.json')).read_text(encoding='utf8'));evidence['inputs'][client]='0'*64
 change('stale test input hash denied',{R+'TEST_RESULTS.json':json.dumps(evidence).encode()},'all tests PASS and match inputs')
 try:
  write(verification,cfg,c+b'\n');git_at(verification,'add','--',cfg);write(verification,cfg,c)
  result=preflight_at(verification);assert not result['success'] and any(x['name']=='exact snapshot scope' and not x['pass'] for x in result['checks'])
  passed('hidden staged config drift denied')
 finally:git_at(verification,'reset','--quiet','HEAD','--',cfg);write(verification,cfg,c)
 # Refresh stat data in the disposable index only; no content stage.
 assert not git_at(verification,'diff','--name-only')
 assert not git_at(verification,'diff','--cached','--name-only')
 git_at(verification,'add','--',*names,'transport-v2/live-test/config.js')
 assert not git_at(verification,'diff','--cached','--name-only')
 assert not git_at(verification,'status','--porcelain')
 assert preflight_at(verification)['success']
 assert git_at(ROOT,'rev-parse','HEAD').decode().strip()==BASE and not git_at(ROOT,'diff','--cached','--name-only')
 report['compatibility']={'completed':True,'disposableRemoved':False,'temporaryBranch':TEMP_BRANCH,'temporaryWorktree':str(verification),'temporaryCommit':temp_head,'inputHashes':report['inputs'],'cases':cases,'preCommit':before,'postCommit':after}
 report['totals']={'pass':2954+len(cases),'fail':0,'skipped':0}
 save_report(report)
 print('COMPATIBILITY PASS',len(cases),'cases; disposable must now be removed before --finalize',flush=True)

def finalize():
 report=json.loads((OUT/'TEST_RESULTS.json').read_text(encoding='utf8'));c=report['compatibility']
 assert c['completed'] and all(t['pass'] for t in c['cases'])
 assert inputs()==report['inputs']==c['inputHashes']
 assert not Path(c['temporaryWorktree']).exists(),'Archive the disposable worktree first'
 branches=git_at(ROOT,'for-each-ref','--format=%(refname)','refs/heads/'+c['temporaryBranch']).decode().strip()
 assert not branches,'Remove the disposable local branch first'
 c['disposableRemoved']=True;save_report(report)
 result=preflight_at(ROOT);assert result['success'],result
 (OUT/'PREFLIGHT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 manifest=json.loads((OUT/'MANIFEST.json').read_text(encoding='utf8'));assert manifest['hashes']==result['hashes']
 manifest['tests']=report['totals'];manifest['preflightCompatibility']={'preCommit':True,'postCommit':True,'cases':len(c['cases']),'disposableRemoved':True}
 (OUT/'MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
 print('FINALIZE PASS',report['totals'],flush=True)

parser=argparse.ArgumentParser();parser.add_argument('--verification-worktree');parser.add_argument('--finalize',action='store_true');parser.add_argument('suites',nargs='*');args=parser.parse_args()
if args.finalize:finalize();sys.exit(0)
selected=set(args.suites);initial=inputs();results=[];evidence=[]

env=dict(os.environ);node=shutil.which('node')
with tempfile.TemporaryDirectory(prefix='t4-staging-offline-') as folder:
 temp=Path(folder);candidate=temp/PREFIX
 tests=['relay-regression.test.mjs','migration-relay.test.mjs','read-browser.cjs','runner-browser.cjs','read-compatibility.cjs','gas-contract.test.cjs','deny-network.cjs']
 for n in tests:
  b=(ROOT/({'relay-regression.test.mjs':'transport-v2/tests/relay.test.mjs','read-browser.cjs':'transport-v2/tests/live-test.cjs'}[n])).read_bytes() if n in ['relay-regression.test.mjs','read-browser.cjs'] else blob(REF,PREFIX+'tests/'+n);write(temp,PREFIX+'tests/'+n,b);evidence.append({'ref':REF,'path':PREFIX+'tests/'+n,'sha256':sha(b)})
 for n in ['t3-4-relay.mjs','frontend-config.js']:
  write(temp,PREFIX+'evidence/'+n,blob(REF,PREFIX+'evidence/'+n))
 for n in ['worker/relay.mjs','live-test/client.js','live-test/index.html','live-test/config.js']:
  write(temp,PREFIX+n,(ROOT/'transport-v2'/n).read_bytes())
 for n in ['client.js','index.html']:
  write(temp,'transport-v2/t4-migration-runner/'+n,(ROOT/'transport-v2/t4-migration-runner'/n).read_bytes())
 gas='release-candidates/gas-t4-control-no-flush/'
 names=subprocess.check_output(['git','ls-tree','-rz','--name-only',REF,gas+'sources/'],cwd=ROOT).decode('utf8').strip('\0').split('\0')
 for n in names+[gas+'tests/foundation-fixture.cjs',gas+'tests/service-fixture.cjs']:write(temp,n,blob(REF,n))
 t33=temp/'t3-3-relay.mjs';t33.write_bytes(blob('c4ba55ca147da676759d7098f60ce4a4e31a77d3','transport-v2/worker/relay.mjs'))
 env['TRANSPORT_CONTRACT_RELAY']=str(t33)
 guard=str(candidate/'tests/deny-network.cjs')
 jobs=[]
 for n in tests:
  if n=='deny-network.cjs':continue
  cmd=[node,'--require',guard]+(['--test','--test-reporter=tap'] if '.test.' in n else [])+[str(candidate/'tests'/n)]
  jobs.append(('reviewed-'+n,cmd))
 for n in ['staging-worker.test.mjs','staging-model.test.cjs','staging-pages.cjs']:
  jobs.append((n,[node,'--require',guard]+(['--test','--test-reporter=tap'] if '.test.' in n else [])+[str(ROOT/'transport-v2/tests'/n)]))
 assert not selected or selected.issubset({n for n,_ in jobs})
 for name,cmd in jobs:
  if selected and name not in selected:continue
  result=subprocess.run(cmd,cwd=ROOT,env=env,capture_output=True,text=True,encoding='utf8',errors='replace',timeout=600)
  output=result.stdout+result.stderr
  counts={}
  for key in ['pass','fail','skipped','cancelled']:
   m=re.search(r'^# '+key+r' (\d+)$',output,re.M)
   if m:counts[key]=int(m[1])
  if 'read-browser' in name:counts={'pass':sum(map(int,re.findall(r'^PASS: (\d+)',output,re.M))),'fail':int(result.returncode!=0),'skipped':0}
  elif not counts:
   m=re.search(r'passed=(\d+) failed=(\d+) skipped=(\d+)',output)
   counts=dict(zip(['pass','fail','skipped'],map(int,m.groups()))) if m else {'pass':0,'fail':1,'skipped':0}
  assert inputs()==initial,'Inputs changed during test run'
  results.append({'suite':name,'command':subprocess.list2cmdline(cmd),'exitCode':result.returncode,'counts':counts,'outputSha256':sha(output.encode())})
  totals={k:sum(r['counts'].get(k,0) for r in results) for k in ['pass','fail','skipped']}
  report={'offlineOnly':True,'fullRun':not selected,'reviewedCommit':REF,'inputs':initial,'reviewedTests':evidence,'runs':results,'totals':totals,'seeds':{'model':'0x54740002','fuzz':'0x54740001'}}
  (OUT/'TEST_RESULTS.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8',newline='\n')
  print(name,'exit',result.returncode,counts,flush=True)
  if result.returncode:
   print(output[-24000:],flush=True);sys.exit(result.returncode)
 print('OFFLINE PASS',totals,flush=True)

if args.verification_worktree:
 assert not selected,"Compatibility requires full rerun"
 compatibility(args.verification_worktree,report)

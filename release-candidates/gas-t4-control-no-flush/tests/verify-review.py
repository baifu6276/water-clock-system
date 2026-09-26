"""Read-only validation of final local source/evidence/scope; no live requests."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(files):return sha(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
def git(*args):return subprocess.check_output(['git',*args],cwd=REPO)
m=json.loads((ROOT/'source-manifest.json').read_text(encoding='utf8'))
assert git('rev-parse','HEAD').decode().strip()==m['baseCommit']
assert git('branch','--show-current').decode().strip()=='codex/t4-control-no-flush'
assert not git('diff','--name-only') and not git('diff','--cached','--name-only')
git('diff','--check')
paths=[s.decode('utf8') for s in git('ls-files','--others','--exclude-standard','-z').split(b'\0') if s]
assert paths and all(p.startswith('release-candidates/gas-t4-control-no-flush/') or p.startswith('experiments/t4-initial-prepare-wrapper/') for p in paths)
current={p.name:p.read_bytes() for p in (ROOT/'sources').iterdir()}
old={n:git('show',m['baseCommit']+':release-candidates/gas-t4-read-diagnostics/sources/'+n) for n in current}
assert len(current)==11 and bundle(current)==m['candidateSha256'] and bundle(old)==m['baseCandidateSha256']
assert [n for n in current if current[n]!=old[n]]==['EmployeeBaselineControl.gs']
for n,b in old.items():assert (REPO/'release-candidates/gas-t4-read-diagnostics/sources'/n).read_bytes()==b
for row in m['matrix']:
 assert sha(current[row['file']])==row['candidateSha256'] and sha(old[row['file']])==row['baseSha256']
ev={str(p.relative_to(ROOT/'evidence')).replace('\\','/'):p.read_bytes() for p in (ROOT/'evidence').rglob('*') if p.is_file()}
assert set(ev)==set(m['evidenceFiles']) and bundle(ev)==m['evidenceSha256']
for n,b in ev.items():assert sha(b)==m['evidenceFiles'][n]['sha256']
inputs=json.loads((ROOT/'evidence/test-inputs.json').read_text(encoding='utf8'))
for n,v in inputs.items():assert sha((REPO/n).read_bytes())==v['sha256'],n
results=json.loads((ROOT/'TEST_RESULTS.json').read_text(encoding='utf8'))
assert results==json.loads((ROOT/'evidence/test-results.json').read_text(encoding='utf8'))
assert results['artifact']['candidateSha256']==m['candidateSha256']
assert results['totals']==m['testTotals']=={'pass':1024,'fail':0,'skipped':0,'existingRegression':948,'maintenance':29,'wrapper':47}
for r in results['runs']:assert r['exitCode']==0
# Check untracked text as well: ordinary git diff --check cannot see it.
for n in paths:
 p=REPO/n
 if '/sources/' in n or '/evidence/' in n:continue # exact retained bytes may have legacy whitespace
 text=p.read_text(encoding='utf8')
 for i,line in enumerate(text.splitlines(),1):assert line==line.rstrip(' \t'),(n,i)
 assert not text.endswith('\n\n'),n
for p in (ROOT/'tests').glob('*.py'):compile(p.read_bytes(),str(p),'exec')
print(json.dumps({'result':'PASS','deployableFiles':11,'unchanged':10,'modified':['EmployeeBaselineControl.gs'],'candidateSha256':m['candidateSha256'],'evidenceSha256':m['evidenceSha256'],'untrackedFiles':len(paths),'trackedChanges':0,'stagedFiles':0,'totals':m['testTotals'],'migration':'HOLD'}))

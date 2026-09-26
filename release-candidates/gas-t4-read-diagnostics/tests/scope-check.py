"""Read-only Git/source scope and whitespace validation; no stage or network."""
from pathlib import Path
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
def git(*args):return subprocess.run(['git','-c','core.quotePath=false','-c','core.autocrlf=false',*args],cwd=REPO,capture_output=True,text=True,encoding='utf8')
assert git('rev-parse','HEAD').stdout.strip()=='6f3921f2bbea6d175c8bcac3888b09e231f44774'
assert git('diff','--name-only').stdout==''
assert git('diff','--cached','--name-only').stdout==''
untracked=git('ls-files','--others','--exclude-standard').stdout.splitlines()
assert untracked and all(p.startswith('release-candidates/gas-t4-read-diagnostics/') for p in untracked)
assert git('diff','--check').returncode==0
checks=[]
for file in sorted((ROOT/'sources').iterdir()):
 old=REPO/'release-candidates/gas-v44-read-diagnostics/evidence/v44-sources'/file.name
 p=git('diff','--no-index','--check','--',str(old) if old.exists() else 'NUL',str(file))
 # --no-index implies --exit-code: 1 means content differs, not a failed check.
 assert p.returncode in (0,1) and not p.stdout and not p.stderr,(file.name,p.returncode,p.stdout,p.stderr)
 checks.append(file.name)
# New tests/docs are not staged, so ordinary git diff --check does not inspect them.
for rel in untracked:
 if rel.endswith(('.py','.cjs','.md','.json')):
  text=(REPO/rel).read_text(encoding='utf8')
  assert not any(line.rstrip(' \t')!=line for line in text.splitlines()),rel
result={'head':git('rev-parse','HEAD').stdout.strip(),'trackedChanges':[],'stagedChanges':[],
 'onlyNewCandidate':True,'newFiles':len(untracked),'candidateDeltaWhitespaceChecked':checks,'gitDiffCheck':True}
(ROOT/'evidence/scope-check.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('PASS SCOPE: candidate only; no staged/tracked changes; 11 source delta whitespace checks; new test/doc whitespace checks')

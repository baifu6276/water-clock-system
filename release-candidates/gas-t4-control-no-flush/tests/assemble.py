"""LOCAL ONLY: exact pinned V47 bytes plus the approved control-lock micro-patch."""
from pathlib import Path
import subprocess,hashlib,json,difflib
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
REF='5e272d981617d5940c88332aa7ba3bdead949b6a'
PREFIX='release-candidates/gas-t4-read-diagnostics/'
def blob(p):return subprocess.check_output(['git','show',REF+':'+PREFIX+p],cwd=REPO)
def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(files):return sha(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
def write(p,b):
 target=ROOT/p;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b)
m=json.loads(blob('source-manifest.json'))
base={x['file']:blob('sources/'+x['file']) for x in m['matrices']['V44']}
assert len(base)==11 and bundle(base)=='279af27a24eeeffebc7114cea795bdf9a0bef682cf2c2721d18ad94e50817449'
for x in m['matrices']['V44']:
 assert sha(base[x['file']])==x['candidateSha256']
 assert (REPO/PREFIX/'sources'/x['file']).read_bytes()==base[x['file']]
old=base['EmployeeBaselineControl.gs'].decode()
assert old.count('return employeeWithLock_(function() {')==2
helper="""// Script-property maintenance only; migration keeps its existing flush/checkpoints.
function employeeBaselineControlWithLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) employeeFailure_('BUSY', '目前忙碌中，請稍後重試。');
  try { return work(); }
  finally { lock.releaseLock(); }
}
"""
anchor='// Editor-only operational authorization.'
assert old.count(anchor)==1
changed=old.replace('return employeeWithLock_(function() {','return employeeBaselineControlWithLock_(function() {').replace(anchor,helper+anchor)
candidate=dict(base);candidate['EmployeeBaselineControl.gs']=changed.encode()
assert sum(base[n]!=candidate[n] for n in base)==1
for n,b in candidate.items():write('sources/'+n,b)
write('.gitattributes',b'sources/** -text\nevidence/** -text\n')
write('evidence/EmployeeBaselineControl.before.gs',base['EmployeeBaselineControl.gs'])
write('evidence/control.patch',''.join(difflib.unified_diff(old.splitlines(True),changed.splitlines(True),'V47/EmployeeBaselineControl.gs','V48/EmployeeBaselineControl.gs')).encode())
manifest={'status':'OFFLINE_MICRO_PATCH_CANDIDATE','migration':'HOLD','baseCommit':REF,'baseCandidateSha256':bundle(base),'candidateSha256':bundle(candidate),
 'controlSha256':sha(candidate['EmployeeBaselineControl.gs']),
 'algorithm':'SHA-256 of sorted UTF-8 relative filename + NUL + ASCII byteLength + NUL + exact bytes. Candidate covers exactly sources/11 files. Evidence is sealed after tests.',
 'matrix':[{'file':n,'status':'UNCHANGED' if candidate[n]==base[n] else 'MODIFIED','baseSha256':sha(base[n]),'candidateSha256':sha(candidate[n]),'size':len(candidate[n]),'lines':len(candidate[n].splitlines())} for n in sorted(candidate)]}
write('source-manifest.json',(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n').encode())
print(json.dumps({'controlSha256':manifest['controlSha256'],'candidateSha256':manifest['candidateSha256'],'unchanged':10,'modified':1}))

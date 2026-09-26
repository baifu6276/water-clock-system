"""Reproducible LOCAL assembly from fixed Git objects; no network/deployment."""
from pathlib import Path
import hashlib, json, subprocess, difflib, sys

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
READ_REF = '6f3921f2bbea6d175c8bcac3888b09e231f44774'
T4_REF = '4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4'
OLD = 'release-candidates/gas-v44-read-diagnostics/'
HASHES = {
    'read-app': 'aea7cfecb4ec247ba8b14aaa1d356014bf1066633598f392a01024ae0d31b0fb',
    'read-baseline': 'e3de0e08e83383df62c81e7046c2ba4169581ff9df309345204df538b4cc0a17',
    't4-baseline': '51693ec22f9d319bdcb67d5753e9f723d80fdab58fc440a46f2a4c4895d34787',
    't4-control': '413e7834b104793a6534ea52fb56d445c9046b0e62e65c90a79ccca781a3ad9e',
}
def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)
def digest(value): return hashlib.sha256(value).hexdigest()
def bundle(files):
    return digest(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
def read(ref, name): return git('show', ref+':'+name)
def write(name, data):
    target=ROOT/name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
def json_bytes(value): return (json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode()
def diff(before, after, left, right):
    return ''.join(difflib.unified_diff(before.decode().splitlines(True), after.decode().splitlines(True), left, right)).encode()

original_manifest=json.loads(read(READ_REF, OLD+'source-manifest.json'))
names=sorted(x['file'] for x in original_manifest['matrix'])
base={n:read(READ_REF,OLD+'evidence/v44-sources/'+n) for n in names}
diag={n:read(READ_REF,OLD+'sources/'+n) for n in names}
t4=dict(base)
for n in ['EmployeeLifecycleBaseline.gs','EmployeeBaselineControl.gs']: t4[n]=read(T4_REF,'gas/'+n)
assert digest(diag['EmployeeApplication.gs']) == HASHES['read-app']
assert digest(diag['EmployeeLifecycleBaseline.gs']) == HASHES['read-baseline']
assert digest(t4['EmployeeLifecycleBaseline.gs']) == HASHES['t4-baseline']
assert digest(t4['EmployeeBaselineControl.gs']) == HASHES['t4-control']
assert bundle(diag)=='ce7295e11cef5b381519920323470f60825394ed61466125f0ebe785e59dbdaa'
assert bundle(base)=='22b66c3b9b31dd27b6eafa3b1d960995ee6e42becb199168cef09fb5c3e6a334'
for x in original_manifest['matrix']:
    assert digest(base[x['file']])==x['baseSha256']
    assert digest(diag[x['file']])==x['candidateSha256']
    # Existing accepted candidate/evidence must not drift in this worktree.
    assert (REPO/OLD/'sources'/x['file']).read_bytes()==diag[x['file']]
    assert (REPO/OLD/'evidence/v44-sources'/x['file']).read_bytes()==base[x['file']]

# Minimal input evidence; remaining ten-file layers are reproducible from pinned Git.
evidence={
    'base/EmployeeLifecycleBaseline.gs':base['EmployeeLifecycleBaseline.gs'],
    'read/EmployeeLifecycleBaseline.gs':diag['EmployeeLifecycleBaseline.gs'],
    'read/EmployeeApplication.gs':diag['EmployeeApplication.gs'],
    't4/EmployeeLifecycleBaseline.gs':t4['EmployeeLifecycleBaseline.gs'],
    't4/EmployeeBaselineControl.gs':t4['EmployeeBaselineControl.gs']}
for n,b in evidence.items(): write('evidence/'+n,b)
merged=subprocess.run(['git','merge-file','--diff3','-p',
    str(ROOT/'evidence/read/EmployeeLifecycleBaseline.gs'),str(ROOT/'evidence/base/EmployeeLifecycleBaseline.gs'),
    str(ROOT/'evidence/t4/EmployeeLifecycleBaseline.gs')],capture_output=True,cwd=REPO)
assert merged.returncode==0, 'STOP: baseline three-way conflict; no candidate written'
assert b'<<<<<<<' not in merged.stdout
combined=dict(diag); combined['EmployeeBaselineControl.gs']=t4['EmployeeBaselineControl.gs']; combined['EmployeeLifecycleBaseline.gs']=merged.stdout
# Prove each layer applies in a disjoint region: T4 never changes RequestStatus.
def fn(text,name):
    text=text.decode(); start=text.index('function '+name+'('); end=text.find('\nfunction ',start+1)
    return text[start:end if end>=0 else len(text)].strip()
assert fn(base['EmployeeLifecycleBaseline.gs'],'employeeBaselineRequestStatus_')==fn(t4['EmployeeLifecycleBaseline.gs'],'employeeBaselineRequestStatus_')
assert fn(combined['EmployeeLifecycleBaseline.gs'],'employeeBaselineRequestStatus_')==fn(diag['EmployeeLifecycleBaseline.gs'],'employeeBaselineRequestStatus_')
for n,b in combined.items(): write('sources/'+n,b)
write('.gitattributes',b'sources/** -text\nevidence/** -text\n')
for label,left,right in [('base-read',base,diag),('base-t4',base,t4),('t4-combined',t4,combined),('read-combined',diag,combined)]:
    write('evidence/'+label+'.diff',diff(left['EmployeeLifecycleBaseline.gs'],right['EmployeeLifecycleBaseline.gs'],label+'-before',label+'-after'))

matrices={}
for label,layer in [('V44',base),('V45_T4',t4),('V46_READ_DIAGNOSTICS',diag)]:
    matrices[label]=[{ 'file':n,'status':'ADDED' if n not in layer else 'UNCHANGED' if layer[n]==combined[n] else 'MODIFIED',
        'baseSha256':digest(layer[n]) if n in layer else None,'candidateSha256':digest(combined[n]),'size':len(combined[n]),'lines':len(combined[n].splitlines()) } for n in sorted(combined)]
assert [x['file'] for x in matrices['V45_T4'] if x['status']!='UNCHANGED']==['EmployeeApplication.gs','EmployeeLifecycleBaseline.gs']
assert [x['file'] for x in matrices['V46_READ_DIAGNOSTICS'] if x['status']!='UNCHANGED']==['EmployeeBaselineControl.gs','EmployeeLifecycleBaseline.gs']
assert sum(x['status']=='UNCHANGED' for x in matrices['V44'])==8
manifest={'status':'OFFLINE_REVIEW_CANDIDATE','migration':'HOLD','readRef':READ_REF,'t4Ref':T4_REF,
    'algorithm':'SHA-256 of sorted UTF-8 relative filename + NUL + ASCII byteLength + NUL + exact file bytes; sources covers 11 deployable files; evidence covers the five pinned input files listed below, excludes derived diffs/reports',
    'candidateSha256':bundle(combined),'evidenceBundleSha256':bundle(evidence),'sourceLayers':{'V44':bundle(base),'V45_T4':bundle(t4),'V46_READ_DIAGNOSTICS':bundle(diag)},
    'evidence':[{'path':n,'sha256':digest(b),'size':len(b)} for n,b in sorted(evidence.items())],
    'matrices':matrices,'removedFiles':[],'threeWayMerge':{'tool':'git merge-file --diff3 -p READ BASE T4','exitCode':0,'conflicts':0,'manualResolutions':0}}
write('source-manifest.json',json_bytes(manifest))
print(json.dumps({'candidateSha256':manifest['candidateSha256'],'evidenceBundleSha256':manifest['evidenceBundleSha256'],'files':len(combined),'conflicts':0}))

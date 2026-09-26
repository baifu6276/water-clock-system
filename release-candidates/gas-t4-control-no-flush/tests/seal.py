"""Seal local review evidence AFTER all offline suites pass; no deployment."""
from pathlib import Path
import hashlib,json,subprocess
ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(files):return sha(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
manifest=json.loads((ROOT/'source-manifest.json').read_text(encoding='utf8'))
sources={p.name:p.read_bytes() for p in (ROOT/'sources').iterdir()}
assert len(sources)==11 and bundle(sources)==manifest['candidateSha256']
assert manifest['candidateSha256']=='df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5'
results=json.loads((ROOT/'TEST_RESULTS.json').read_text(encoding='utf8'))
expected={'v44-foundation':89,'combined-foundation':82,'gas-diagnostics':69,'t4-safety-fixtures':77,'combined-contract':74,'worker-t3-4':273,'browser':269,'cross-artifact':15,'maintenance':29,'wrapper':47,'static':0,'diff-check':0}
assert {r['suite'] for r in results['runs']}==set(expected)
for r in results['runs']:
 assert r['exitCode']==0
 c=r['counts']
 count=(c['browserPass']+c['crossBranchPass']) if r['suite']=='browser' else c.get('pass',c.get('passLines',0))
 assert count==expected[r['suite']],(r['suite'],count)
 assert c.get('fail',0)==0 and c.get('skipped',0)==0 and c.get('cancelled',0)==0
results['artifact']={k:manifest[k] for k in ['baseCommit','baseCandidateSha256','candidateSha256','controlSha256']}
results['totals']={'pass':sum(expected.values()),'fail':0,'skipped':0,'existingRegression':948,'maintenance':29,'wrapper':47}
results['developmentCorrections']=[
 'New BUSY assertion corrected to actual employeeCode field; runtime unchanged.',
 'New migration differential assertion corrected to all existing checkpoint flushes plus shared finally, not one flush. Exact old/new trace, result, data and property comparison passes.',
 'Worker static artifact check compares unchanged Git LF bytes; Windows CRLF checkout is not a runtime change.'
]
write(ROOT/'TEST_RESULTS.json',results)
write(ROOT/'evidence/test-results.json',results)
paths=list((ROOT/'tests').glob('*'))+list((REPO/'experiments/t4-initial-prepare-wrapper').glob('*.cjs'))+list((REPO/'experiments/t4-initial-prepare-wrapper').glob('*.gs'))
inventory={str(p.relative_to(REPO)).replace('\\','/'):{'sha256':sha(p.read_bytes()),'size':p.stat().st_size} for p in sorted(paths) if p.is_file()}
write(ROOT/'evidence/test-inputs.json',inventory)
provenance=json.loads((ROOT/'evidence/test-provenance.json').read_text(encoding='utf8'))
for item in provenance:assert sha((ROOT/'tests'/item['file']).read_bytes())==item['candidateTestSha256']
evidence={str(p.relative_to(ROOT/'evidence')).replace('\\','/'):p.read_bytes() for p in (ROOT/'evidence').rglob('*') if p.is_file()}
manifest['evidenceSha256']=bundle(evidence)
manifest['evidenceFiles']={name:{'sha256':sha(data),'size':len(data)} for name,data in sorted(evidence.items())}
manifest['algorithm']='SHA-256(sorted UTF-8 relative filename + NUL + ASCII byteLength + NUL + exact bytes). Candidate covers sources/11 files; evidence covers exactly evidenceFiles under evidence/. No circular self-hash.'
manifest['testTotals']=results['totals']
write(ROOT/'source-manifest.json',manifest)
print(json.dumps({'candidate':manifest['candidateSha256'],'evidence':manifest['evidenceSha256'],'totals':results['totals']}))

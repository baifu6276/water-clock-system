"""Seal derived review evidence after static/scope checks. Not a deployment tool."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def digest(b):return hashlib.sha256(b).hexdigest()
def bundle(files):return digest(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
m=json.loads((ROOT/'source-manifest.json').read_text(encoding='utf8'))
sources={p.name:p.read_bytes() for p in (ROOT/'sources').iterdir()}
assert len(sources)==11 and bundle(sources)==m['candidateSha256']
inputs={x['path']:(ROOT/'evidence'/x['path']).read_bytes() for x in m['evidence']}
assert bundle(inputs)==m['evidenceBundleSha256']
evidence={p.relative_to(ROOT/'evidence').as_posix():p.read_bytes() for p in (ROOT/'evidence').rglob('*') if p.is_file()}
m['reviewEvidenceBundleSha256']=bundle(evidence)
m['reviewEvidenceFiles']=[{'path':n,'size':len(b),'sha256':digest(b)} for n,b in sorted(evidence.items())]
m['reviewEvidenceAlgorithm']='Same filename/NUL/byteLength/NUL/bytes algorithm; every file recursively under evidence/, including derived diffs, provenance, dependency and scope reports. Excludes source-manifest.json, MERGE_REVIEW.md, TEST_RESULTS.json and tests/.'
(ROOT/'source-manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print('PASS final evidence:',len(evidence),'files',m['reviewEvidenceBundleSha256'])

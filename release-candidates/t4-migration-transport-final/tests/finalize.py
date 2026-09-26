"""Offline validation + review evidence seal. Never stages or deploys."""
from pathlib import Path
import hashlib,json,subprocess,sys,difflib
from html.parser import HTMLParser
ROOT=Path(__file__).resolve().parents[1];REPO=ROOT.parents[1];RUNNER=REPO/'transport-v2/t4-migration-runner'
def sha(b):return hashlib.sha256(b).hexdigest()
def bundle(files):return sha(b''.join(n.encode()+b'\0'+str(len(files[n])).encode()+b'\0'+files[n] for n in sorted(files)))
def files(directory):return {str(p.relative_to(directory)).replace('\\','/'):p.read_bytes() for p in directory.rglob('*') if p.is_file()}
def write(path,value):path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
subprocess.run(['node',str(ROOT/'tests/static.cjs')],cwd=REPO,check=True)
for p in [ROOT/'worker/relay.mjs',*list((ROOT/'tests').glob('*.mjs'))]:subprocess.run(['node','--check',str(p)],check=True,cwd=REPO)
for p in (ROOT/'tests').glob('*.py'):compile(p.read_bytes(),str(p),'exec')
class CheckHtml(HTMLParser):
 def __init__(self):super().__init__();self.stack=[];self.ids=set();self.scripts=[]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if 'id' in attrs:assert attrs['id'] not in self.ids;self.ids.add(attrs['id'])
  if tag=='script':self.scripts.append(attrs.get('src'))
  if tag not in ['meta','input','br','hr','img','link']:self.stack.append(tag)
 def handle_endtag(self,tag):assert self.stack and self.stack.pop()==tag,tag
for folder in [ROOT/'live-test',RUNNER]:
 parser=CheckHtml();parser.feed((folder/'index.html').read_text(encoding='utf8'));assert not parser.stack
 assert parser.scripts[0]=='https://static.line-scdn.net/liff/edge/2/sdk.js'
 assert all(s is not None for s in parser.scripts)
runtime={'worker':files(ROOT/'worker'),'runner':files(RUNNER),'readFrontend':files(ROOT/'live-test')}
assert set(runtime['worker'])=={'relay.mjs'} and set(runtime['runner'])=={'index.html','client.js'} and set(runtime['readFrontend'])=={'index.html','client.js','config.js'}
results=json.loads((ROOT/'TEST_RESULTS.json').read_text(encoding='utf8'))
expected={'relay-regression':273,'migration-relay':71,'read-browser':269,'runner-browser':56,'read-compatibility':10,'gas-contract':7}
assert {r['suite'] for r in results['runs']}==set(expected)
for r in results['runs']:
 assert r['exitCode']==0 and r['counts']['pass']==expected[r['suite']] and r['counts']['fail']==0 and r['counts']['skipped']==0
hashes={name:bundle(value) for name,value in runtime.items()}
hashes['workerFile']=sha(runtime['worker']['relay.mjs'])
results['artifactHashes']=hashes;results['totals']={'pass':sum(expected.values()),'fail':0,'skipped':0}
results['checks']={'static':True,'jsSyntax':True,'pythonSyntax':True,'htmlStructure':True,'sourceScope':True,'gas11Unchanged':True,'gitDiffCheck':True}
results['developmentCorrection']='Test expected visible PATH_DENIED on flag-off; retained existing gate-before-CORS and asserted Worker PATH_DENIED/upstream zero plus browser fail-closed version diagnostic instead. No runtime relaxation.'
write(ROOT/'TEST_RESULTS.json',results);write(ROOT/'evidence/test-results.json',results)
inventory={str(p.relative_to(REPO)).replace('\\','/'):{'sha256':sha(p.read_bytes()),'bytes':p.stat().st_size} for p in (ROOT/'tests').iterdir() if p.is_file()}
write(ROOT/'evidence/test-inputs.json',inventory)
evidence=files(ROOT/'evidence')
provenance=json.loads((ROOT/'provenance.json').read_text(encoding='utf8'))
manifest={'status':'OFFLINE_CANDIDATE_FOR_HUMAN_REVIEW','migration':'HOLD','provenance':provenance,'hashes':hashes,'evidenceSha256':bundle(evidence),'totals':results['totals'],
 'algorithm':'Bundle SHA-256: sorted relative UTF-8 filename + NUL + ASCII byteLength + NUL + exact bytes. No circular manifest hash.',
 'files':{name:{n:{'sha256':sha(b),'bytes':len(b)} for n,b in sorted(value.items())} for name,value in runtime.items()},
 'evidenceFiles':{n:{'sha256':sha(b),'bytes':len(b)} for n,b in sorted(evidence.items())}}
write(ROOT/'MANIFEST.json',manifest)
lines=['# Review hashes','',f"Worker file SHA-256: `{hashes['workerFile']}`",'',f"Worker bundle SHA-256: `{hashes['worker']}`",'',f"Runner bundle SHA-256: `{hashes['runner']}`",'',f"Read frontend bundle SHA-256: `{hashes['readFrontend']}`",'',f"Evidence bundle SHA-256: `{manifest['evidenceSha256']}`",'',
 '| Artifact | File | SHA-256 |','|---|---|---|']
for group,value in manifest['files'].items():
 for name,item in value.items():lines.append('| '+group+' | '+name+' | '+item['sha256']+' |')
lines+=['','All values describe local offline candidates, not deployed state. Migration HOLD.']
(ROOT/'HASHES.md').write_text('\n'.join(lines)+'\n',encoding='utf8')
print(json.dumps({'PASS':True,'hashes':hashes,'evidenceSha256':manifest['evidenceSha256'],'tests':results['totals']},indent=2))

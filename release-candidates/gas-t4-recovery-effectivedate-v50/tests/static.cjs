const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const ref='0f3b154cff1e4788afb61c9684d792b2fb02531c',prefix='release-candidates/gas-t4-recovery-channelid-v49/sources/';
const git=(...a)=>cp.execFileSync('git',a,{cwd:repo}),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['EmployeeApplication.gs','EmployeeApplicationAdmin.gs','EmployeeBaselineControl.gs','EmployeeIdentity.gs','EmployeeLifecycleBaseline.gs','EmployeeLifecycleMutation.gs','EmployeeLifecycleRead.gs','EmployeeLifecycleStore.gs','appsscript.json','index.html','程式碼.gs'].sort();
const old={},current={};assert.deepEqual(fs.readdirSync(path.join(root,'sources')).sort(),names);
for(const n of names){old[n]=git('show',ref+':'+prefix+n);current[n]=fs.readFileSync(path.join(root,'sources',n));}
const bundle=d=>sha(Buffer.concat(names.flatMap(n=>[Buffer.from(n+'\0'+d[n].length+'\0'),d[n]])));
assert.equal(bundle(old),'57e8a16ec0088d1bd4c024a453b60f3365b70c4c47247ec925c933117ba49cc0');
assert.deepEqual(names.filter(n=>!old[n].equals(current[n])),['EmployeeLifecycleBaseline.gs']);
const helper=`// T4 audit calendar image only. Never trim strings or normalize arbitrary instants.
function employeeBaselineAuditDate_(value) {
  if (typeof value !== 'string') return '';
  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return employeeLifecycleDate_(value) === value ? value : '';
  if (!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$/.test(value)) return '';
  var date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) return '';
  var local = Utilities.formatDate(date, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss.SSS");
  return /^\\d{4}-\\d{2}-\\d{2}T00:00:00\\.000$/.test(local) ? local.slice(0, 10) : '';
}
`;
let expected=old['EmployeeLifecycleBaseline.gs'].toString().replace('function employeeBaselineStatusEvidence_(',helper+'function employeeBaselineStatusEvidence_(');
expected=expected.replace('!validTime(intent.operatedAt) || !validTime(intent.effectiveAt) ||','!validTime(intent.operatedAt) || !validTime(intent.effectiveAt) ||\n        (bundle.format === 4 && intent.operatedAt !== intent.effectiveAt) ||');
expected=expected.replace('p.baselineDate !== intent.effectiveDate ||','p.baselineDate !== (bundle.format === 4 ? employeeBaselineAuditDate_(intent.effectiveDate) : intent.effectiveDate) ||');
assert.equal(current['EmployeeLifecycleBaseline.gs'].toString(),expected,'exact two approved changes only');
let gas=0,inline=0,tests=0;for(const n of names)if(n.endsWith('.gs')){new vm.Script(current[n].toString(),{filename:n});gas++;}
for(const m of current['index.html'].toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(m[1].trim()){new vm.Script(m[1]);inline++;}
for(const n of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs'))){new vm.Script(fs.readFileSync(path.join(__dirname,n),'utf8'),{filename:n});tests++;}
JSON.parse(current['appsscript.json']);
const pre=JSON.parse(fs.readFileSync(path.join(root,'evidence/seal.json'),'utf8'));
const sealed=pre.files;const bytes=Buffer.concat(Object.keys(sealed).sort().flatMap(n=>{const b=fs.readFileSync(path.join(root,'evidence',n));assert.equal(sha(b),sealed[n]);return[Buffer.from(n+'\0'+b.length+'\0'),b];}));
assert.equal(sha(bytes),'469531b65e4ed463b8359d7aca40f35605f22ab3fe57014140ba835d2ab5e1ad','original forensic evidence must remain unchanged');
const provenance=JSON.parse(fs.readFileSync(path.join(root,'evidence/provenance.json'),'utf8'));
for(const [n,h]of Object.entries(provenance.testInputs)){const target=n==='tests/forensic.test.cjs'?'evidence/pre-approval/forensic.test.cjs':n;assert.equal(sha(fs.readFileSync(path.join(root,target))),h);}
const manifest=JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json'),'utf8'));
assert.equal(manifest.baseCommit,ref);assert.equal(manifest.candidateBundleSha256,bundle(current));
for(const row of manifest.files){assert.equal(row.baseSha256,sha(old[row.file]));assert.equal(row.candidateSha256,sha(current[row.file]));}
assert.equal(git('branch','--show-current').toString().trim(),'codex/t4-recovery-effectivedate-v50');git('merge-base','--is-ancestor',ref,'HEAD');
assert.equal(git('diff','--cached','--name-only').toString().trim(),'');
for(const record of git('status','--porcelain=v1','--untracked-files=all','-z').toString().split('\0').filter(Boolean))assert(record.slice(3).startsWith('release-candidates/gas-t4-recovery-effectivedate-v50/'));
git('diff','--check');
function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(p=>p.isDirectory()?files(path.join(d,p.name)):[path.join(d,p.name)]);}
for(const f of files(root)){if(f.includes(path.sep+'sources'+path.sep))continue;const r=cp.spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--check','--','NUL',f],{cwd:repo,encoding:'utf8'});assert([0,1].includes(r.status),r.stdout+r.stderr);assert.equal(r.stdout,'');assert.equal(r.stderr,'');}
const diff=cp.spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--check','--',path.join(repo,prefix,'EmployeeLifecycleBaseline.gs'),path.join(root,'sources/EmployeeLifecycleBaseline.gs')],{cwd:repo,encoding:'utf8'});assert([0,1].includes(diff.status));assert.equal(diff.stdout,'');assert.equal(diff.stderr,'');
console.log(JSON.stringify({result:'PASS',sourceFiles:11,modified:['EmployeeLifecycleBaseline.gs'],gasSyntax:gas,htmlInlineSyntax:inline,testSyntax:tests,originalForensicEvidence:'UNCHANGED',exactPatch:'PASS',scope:'PASS',diffCheck:'PASS',candidateBundleSha256:bundle(current)}));

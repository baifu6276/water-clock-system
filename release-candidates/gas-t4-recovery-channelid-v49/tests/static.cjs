// Offline audit only. Pinned V48 provenance, exact narrow patch, syntax and scope.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..');
const ref='08359639eda194a2c6183e715d6d5bb44878c086',prefix='release-candidates/gas-t4-control-no-flush/sources/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...args)=>cp.execFileSync('git',args,{cwd:repo});
const names=['EmployeeApplication.gs','EmployeeApplicationAdmin.gs','EmployeeBaselineControl.gs','EmployeeIdentity.gs','EmployeeLifecycleBaseline.gs','EmployeeLifecycleMutation.gs','EmployeeLifecycleRead.gs','EmployeeLifecycleStore.gs','appsscript.json','index.html','程式碼.gs'].sort();
assert.deepEqual(fs.readdirSync(path.join(root,'sources')).sort(),names);
const old={},current={};
for(const n of names){old[n]=git('show',ref+':'+prefix+n);current[n]=fs.readFileSync(path.join(root,'sources',n));}
const bundle=files=>hash(Buffer.concat(names.flatMap(n=>[Buffer.from(n+'\0'+files[n].length+'\0'),files[n]])));
assert.equal(bundle(old),'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5');
assert.deepEqual(names.filter(n=>!old[n].equals(current[n])),['EmployeeLifecycleBaseline.gs']);
const before=old['EmployeeLifecycleBaseline.gs'].toString(),after=current['EmployeeLifecycleBaseline.gs'].toString();
const newline=before.includes('\r\n')?'\r\n':'\n';
const helper=[
 '// Comparison image only: preserve every field/type except a Sheets numeric channelId.',
 '// Do not trim/parse strings or mutate persisted rows or the audit intent.',
 'function employeeBaselineBindingImage_(binding) {',
 '  var image = Object.assign({}, binding);',
 "  if (typeof image.channelId === 'number' && Number.isSafeInteger(image.channelId) && image.channelId > 0) {",
 '    image.channelId = String(image.channelId);',
 '  }',
 '  return image;',
 '}',
 ''
].join(newline);
const needle='(b.length && !employeeReviewSame_(b[0], bundle.binding))';
const replacement=[
 '(b.length && !(bundle.format === 4',
 '        ? employeeReviewSame_(employeeBaselineBindingImage_(b[0]), employeeBaselineBindingImage_(bundle.binding))',
 '        : employeeReviewSame_(b[0], bundle.binding)))'
].join(newline);
assert.equal(before.split(needle).length,2);
assert.equal(before.split('function employeeBaselineInspect_(').length,2);
assert.equal(after,before.replace('function employeeBaselineInspect_(',helper+'function employeeBaselineInspect_(').replace(needle,replacement),'no additional runtime edit');
// Exact byte comparison above preserves generic comparators/store/write helpers,
// dispatcher, claim, locks, checkpoints, diagnostics and all other baseline functions.
let gas=0,inline=0,tests=0;
for(const n of names){if(n.endsWith('.gs')){new vm.Script(current[n].toString(),{filename:n});gas++;}}
for(const m of current['index.html'].toString().matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){if(m[1].trim()){new vm.Script(m[1]);inline++;}}
for(const n of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs'))){new vm.Script(fs.readFileSync(path.join(__dirname,n),'utf8'),{filename:n});tests++;}
JSON.parse(current['appsscript.json']);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'source-manifest.json'),'utf8'));
assert.equal(manifest.baseCommit,ref);assert.equal(manifest.baseBundleSha256,bundle(old));assert.equal(manifest.candidateBundleSha256,bundle(current));
assert.equal(manifest.files.length,11);
for(const row of manifest.files){assert.equal(row.baseSha256,hash(old[row.file]));assert.equal(row.candidateSha256,hash(current[row.file]));}
assert.equal(git('branch','--show-current').toString().trim(),'codex/t4-recovery-channelid-v49');
git('merge-base','--is-ancestor',ref,'HEAD');
assert.equal(git('diff','--cached','--name-only').toString().trim(),'','no staging');
const scope='release-candidates/gas-t4-recovery-channelid-v49/';
for(const record of git('status','--porcelain=v1','-z','--untracked-files=all').toString().split('\0').filter(Boolean))assert(record.slice(3).startsWith(scope),'unrelated working tree change');
git('diff','--check');
// Untracked files are absent from ordinary git diff: check their complete patch too.
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)]);}
for(const f of files(root)){
 if(f.includes(path.sep+'sources'+path.sep))continue; // fixed source bytes are separately diff-checked against V48
 const r=cp.spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--check','--','NUL',f],{cwd:repo,encoding:'utf8'});
 assert([0,1].includes(r.status),path.relative(root,f)+' '+r.status+' '+r.stdout+' '+r.stderr);assert.equal(r.stdout.trim(),'');assert.equal(r.stderr.trim(),'');
}
const sourceDiff=cp.spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--check','--',path.join(repo,prefix,'EmployeeLifecycleBaseline.gs'),path.join(root,'sources/EmployeeLifecycleBaseline.gs')],{cwd:repo,encoding:'utf8'});
assert([0,1].includes(sourceDiff.status));assert.equal(sourceDiff.stdout,'');assert.equal(sourceDiff.stderr,'');
console.log(JSON.stringify({result:'PASS',sourceFiles:11,unchangedFiles:10,modifiedFiles:['EmployeeLifecycleBaseline.gs'],gasSyntax:gas,htmlInlineSyntax:inline,testSyntax:tests,jsonSyntax:'PASS',scope:'PASS',diffCheck:'PASS',candidateBundleSha256:bundle(current)}));

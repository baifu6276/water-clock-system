// Read-only local checks. No service execution or external requests.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),repo=path.resolve(root,'../..'),runner=path.join(repo,'transport-v2/t4-migration-runner');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const git=(...a)=>execFileSync('git',a,{cwd:repo});
const blob=(ref,file)=>git('show',ref+':'+file);
const base='08359639eda194a2c6183e715d6d5bb44878c086';
// base is source provenance, not a requirement that HEAD remain uncommitted.
git('merge-base','--is-ancestor',base,'HEAD');
assert.equal(git('branch','--show-current').toString().trim(),'codex/t4-migration-transport-final');
const allowed=n=>n.startsWith('release-candidates/t4-migration-transport-final/')||n.startsWith('transport-v2/t4-migration-runner/');
const namesFrom=b=>b.toString().split('\0').filter(Boolean);
const untracked=namesFrom(git('ls-files','--others','--exclude-standard','-z'));
for(const n of [...namesFrom(git('diff','--name-only','-z',base)),...namesFrom(git('diff','--cached','--name-only','-z')), ...untracked])assert(allowed(n),'Unexpected drift: '+n);
const files=[...new Set([...namesFrom(git('ls-files','-z')), ...untracked])].filter(allowed);
const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'),'utf8'));
const pinned={workerFile:'7f5994d15bf732b53f4566c3594ebb7e3707d1a9cb2115a032c04cb6c61c7600',runner:'1f5e781a6a3f40df100a33926a97327ea60f571d15a9ee876a2009dda5e6ad1b',readFrontend:'fd9fc54d94f7154dc5d0ac8f2742a402cf48f4e8e8b05c5c48a832fee172f013'};
assert.equal(sha(fs.readFileSync(path.join(root,'worker/relay.mjs'))),pinned.workerFile);
for(const [group,dir] of [['worker',path.join(root,'worker')],['runner',runner],['readFrontend',path.join(root,'live-test')]]){
 const names=fs.readdirSync(dir).sort();assert.deepEqual(names,Object.keys(manifest.files[group]).sort());
 const bytes=Buffer.concat(names.flatMap(n=>{const b=fs.readFileSync(path.join(dir,n));assert.deepEqual({sha256:sha(b),bytes:b.length},manifest.files[group][n]);return[Buffer.from(n+'\0'+b.length+'\0'),b];}));
 assert.equal(sha(bytes),manifest.hashes[group]);if(pinned[group])assert.equal(sha(bytes),pinned[group]);
}
assert.equal(manifest.hashes.workerFile,pinned.workerFile);
for(const [local,ref,file]of [['evidence/t3-4-relay.mjs','6f3921f2bbea6d175c8bcac3888b09e231f44774','transport-v2/worker/relay.mjs'],['evidence/t4-reference-relay.mjs','4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4','transport-v2/worker/relay.mjs'],...['client.js','index.html','config.js'].map(n=>['evidence/frontend-'+n,'e6078e4fd12811ed42d48840656c721765c2ede7','transport-v2/live-test/'+n])])assert.deepEqual(fs.readFileSync(path.join(root,local)),blob(ref,file));
const oldClient=fs.readFileSync(path.join(root,'evidence/frontend-client.js'),'utf8');
const expected=oldClient.replace("  const GAS_TIMING_VERSION = 't3-4-gas-read-diag';","  const GAS_TIMING_VERSION = 't3-4-gas-read-diag';\n  const T4_TIMING_VERSION = 't4-safety-2-gas-read-diag';").replaceAll('TIMING_VERSION, GAS_TIMING_VERSION].includes(version)','TIMING_VERSION, GAS_TIMING_VERSION, T4_TIMING_VERSION].includes(version)');
assert.equal(fs.readFileSync(path.join(root,'live-test/client.js'),'utf8'),expected);
assert.equal(fs.readFileSync(path.join(root,'live-test/index.html'),'utf8'),fs.readFileSync(path.join(root,'evidence/frontend-index.html'),'utf8').replace('client.js?v=t3-4-gas-read-diag','client.js?v=t4-safety-2-read-compat'));
assert.deepEqual(fs.readFileSync(path.join(root,'live-test/config.js')),blob('e6078e4fd12811ed42d48840656c721765c2ede7','transport-v2/live-test/config.js'));
const run=fs.readFileSync(path.join(runner,'client.js'),'utf8');
assert(!/console\.|Logger|localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|location\.|URLSearchParams|script\.google|EmployeeBaselineControl|employeeBaselineControl/.test(run));
assert(run.includes("liff.init({ liffId: LIFF_ID })"));
assert(run.includes("const LIFF_ID = '2011467618-R76314It'"));
assert(run.includes("const RELAY = 'https://employee-identity-transport-t1.baifu6276.workers.dev'"));
assert.equal((run.match(/await request\('employeeLifecycleBaselineMigrate'\)/g)||[]).length,1);
assert.equal((run.match(/attempted = false/g)||[]).length,1);
assert(!/setInterval|requestAnimationFrame|randomUUID|setProperty|\.login\(/.test(run));
assert(run.includes("attempted = true; busy = true; preflight = false;"));
let syntax=0;
for(const file of files.filter(n=>n.endsWith('.cjs')||n.endsWith('.js'))){new vm.Script(fs.readFileSync(path.join(repo,file),'utf8'),{filename:file});syntax++;}
const gasDir=path.join(repo,'release-candidates/gas-t4-control-no-flush/sources');
const names=fs.readdirSync(gasDir).sort();assert.equal(names.length,11);
const bytes=Buffer.concat(names.flatMap(n=>{const b=fs.readFileSync(path.join(gasDir,n));assert.deepEqual(b,blob(base,'release-candidates/gas-t4-control-no-flush/sources/'+n));return[Buffer.from(n+'\0'+b.length+'\0'),b];}));
assert.equal(sha(bytes),'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5');
git('diff','--check');git('diff','--cached','--check');
console.log('STATIC PASS '+JSON.stringify({base,committedHeadSupported:true,runtimeHashesPinned:true,gasFilesUnchanged:11,jsSyntaxFiles:syntax,scope:files.length,privacy:true,exactFrontendPatch:true}));

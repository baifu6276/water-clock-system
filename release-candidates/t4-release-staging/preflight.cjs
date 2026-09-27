// OFFLINE ONLY: filesystem and git show/diff. No platform clients.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
function evaluate() {
const repo=path.resolve(__dirname,'../..'),report={offlineOnly:true,migration:'HOLD',checks:[],success:false,baseIsAncestor:false,snapshotMode:null,changedFileCount:0,runtimeFiles:[],testFiles:[],reviewFiles:[],configUnchanged:false,runtimeHashesPass:false,liffIsolationPass:false,fixedOperationPass:false,defaultDenySourcePass:false,testsEvidencePass:false,diffCheckPass:false},base='b9ad9f57f435e6780d465f5480b71dc24354d991',reviewed='53c60bdb2e0bc89d49ab02fd2221725e76f38adf';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),git=(...a)=>execFileSync('git',a,{cwd:repo,maxBuffer:8*1024*1024});
const read=n=>fs.readFileSync(path.join(repo,n)),blob=(ref,n)=>git('show',ref+':'+n);
const bundle=map=>sha(Buffer.concat(Object.keys(map).sort().flatMap(n=>[Buffer.from(n+'\0'+map[n].length+'\0'),map[n]])));
const check=(name,fn)=>{try{fn();report.checks.push({name,pass:true});}catch{report.checks.push({name,pass:false});}};
const prefix='release-candidates/t4-migration-transport-final/';
const mapping={'transport-v2/worker/relay.mjs':prefix+'worker/relay.mjs','transport-v2/live-test/client.js':prefix+'live-test/client.js','transport-v2/live-test/index.html':prefix+'live-test/index.html','transport-v2/t4-migration-runner/client.js':'transport-v2/t4-migration-runner/client.js','transport-v2/t4-migration-runner/index.html':'transport-v2/t4-migration-runner/index.html'};
const tests=['relay.test.mjs','live-test.cjs','staging-fixture.cjs','staging-worker.test.mjs','staging-model.test.cjs','staging-pages.cjs'].map(n=>'transport-v2/tests/'+n);
const reviewRoot='release-candidates/t4-release-staging/';
const split=b=>b.toString('utf8').split('\0').filter(Boolean);
report.baseSha=base;report.headSha=git('rev-parse','HEAD').toString().trim();
report.branch=git('branch','--show-current').toString().trim();
const dirty=git('status','--porcelain=v1','-z','--untracked-files=all').length>0;
report.snapshotMode=report.headSha===base?'UNCOMMITTED_OVERLAY':dirty?'COMMITTED_WITH_OVERLAY':'COMMITTED_DESCENDANT';
const snapshot=[...new Set([...split(git('diff','--name-only','-z',base,'--')),...split(git('ls-files','--others','--exclude-standard','-z'))])].sort();
report.changedFileCount=snapshot.length;
check('base ancestry',()=>{git('merge-base','--is-ancestor',base,report.headSha);report.baseIsAncestor=true;});
check('exact five reviewed runtime blobs',()=>{for(const[n,s]of Object.entries(mapping))assert.deepEqual(read(n),blob(reviewed,s));});
check('config unchanged and exact',()=>{assert.deepEqual(read('transport-v2/live-test/config.js'),blob(base,'transport-v2/live-test/config.js'));assert.equal(git('diff',base,'--','transport-v2/live-test/config.js').length,0);});
let hashes={};
check('runtime hash gates',()=>{
hashes={workerFile:sha(read('transport-v2/worker/relay.mjs')),workerBundle:bundle({'relay.mjs':read('transport-v2/worker/relay.mjs')}),readFrontend:bundle(Object.fromEntries(['client.js','index.html','config.js'].map(n=>[n,read('transport-v2/live-test/'+n)]))),runner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,read('transport-v2/t4-migration-runner/'+n)])))};
const gasPrefix='release-candidates/gas-t4-control-no-flush/sources/';
const gasNames=git('ls-tree','-rz','--name-only',reviewed,gasPrefix).toString().split('\0').filter(Boolean);
hashes.gas=bundle(Object.fromEntries(gasNames.map(n=>[n.slice(gasPrefix.length),blob(reviewed,n)])));
hashes.rollback=sha(blob('6f3921f2bbea6d175c8bcac3888b09e231f44774','transport-v2/worker/relay.mjs'));
report.hashes=hashes;
assert.equal(gasNames.length,11);
assert.deepEqual(hashes,{workerFile:'7f5994d15bf732b53f4566c3594ebb7e3707d1a9cb2115a032c04cb6c61c7600',workerBundle:'38e0dfaac30467bc829dcb75310e56518d34726aa7700549757fdbe42b217271',readFrontend:'fd9fc54d94f7154dc5d0ac8f2742a402cf48f4e8e8b05c5c48a832fee172f013',runner:'7a1d87607720c8f8c853a62aa8a6f3e9e19a28db0e11bc63bf98d07988ecf431',gas:'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5',rollback:'172353c88ff9ed6b41b0640f5536b3a792ba9f8f1fbb22e1ad69131eb696bf68'});
});
const optional=n=>{try{return read(n).toString();}catch{return '';}};
const runner=optional('transport-v2/t4-migration-runner/client.js'),worker=optional('transport-v2/worker/relay.mjs'),config=optional('transport-v2/live-test/config.js');
check('LIFF separation',()=>{const a=runner.match(/const LIFF_ID = '([^']+)'/)[1],b=config.match(/liffId: '([^']+)'/)[1];assert.equal(a,'2011467618-QZYsTwb9');assert.equal(b,'2011467618-R76314It');assert.notEqual(a,b);});
check('fixed operation/version and runner safety',()=>{for(const v of ['t4-safety-2-gas-read-diag','EMP001','c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab','f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd','建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。'])assert(runner.includes(v));assert(!/script\.google|localStorage|sessionStorage|document\.cookie|console\.|setInterval|randomUUID|serviceWorker/.test(runner));assert.equal((runner.match(/await request\('employeeLifecycleBaselineMigrate'\)/g)||[]).length,1);assert(runner.includes('attempted = true; busy = true; preflight = false;'));});
check('four routes and default deny',()=>{assert.deepEqual([...worker.matchAll(/^  '(\/[^']+)':/gm)].map(m=>m[1]),['/identity','/employee-read','/employee-operation-status','/employee-baseline-migrate']);assert(worker.includes("env.T4_CONTROLLED_MIGRATION_ENABLED !== 'true'"));assert(!/T4_CONTROLLED_MIGRATION_ENABLED\s*[:=]\s*["']true["']/.test(worker));});
check('no enabled committed deployment configuration',()=>{
 const names=[...new Set([...split(git('ls-files','-z')), ...snapshot])].filter(n=>/wrangler|config|\.toml$|\.ya?ml$|\.json$/.test(n)&&!n.includes('/tests/'));
 for(const n of names)assert(!/T4_CONTROLLED_MIGRATION_ENABLED\s*[:=]\s*["']?true/.test(read(n).toString()),n);
});
check('exact snapshot scope',()=>{
 const inventory=JSON.parse(read(reviewRoot+'FILES.json'));
 const categories=[inventory.runtime,inventory.permanentTests,inventory.reviewPackage];
 assert(categories.every(Array.isArray));
 const all=categories.flat();
 assert(all.every(n=>typeof n==='string'&&!n.includes('\\')&&!n.startsWith('/')&&!n.split('/').some(s=>s==='.'||s==='..'||s==='')));
 assert.equal(new Set(all).size,23);assert.equal(all.length,23);
 assert.deepEqual(inventory.counts,{runtime:5,tests:6,reviewPackage:12,total:23});
 assert.deepEqual([...inventory.runtime].sort(),Object.keys(mapping).sort());
 assert.deepEqual([...inventory.permanentTests].sort(),[...tests].sort());
 assert.equal(inventory.reviewPackage.length,12);
 assert(inventory.reviewPackage.every(n=>n.startsWith(reviewRoot)));
 assert.deepEqual(snapshot,[...all].sort());
 assert(snapshot.every(n=>Object.hasOwn(mapping,n)||tests.includes(n)||n.startsWith(reviewRoot)));
 report.runtimeFiles=snapshot.filter(n=>Object.hasOwn(mapping,n));
 report.testFiles=snapshot.filter(n=>tests.includes(n));
 report.reviewFiles=snapshot.filter(n=>n.startsWith(reviewRoot));
 assert.deepEqual(report.runtimeFiles,Object.keys(mapping).sort());
 assert.equal(report.testFiles.length,6);assert.equal(report.reviewFiles.length,12);
 for(const n of all){assert(fs.lstatSync(path.join(repo,n)).isFile());assert(!fs.lstatSync(path.join(repo,n)).isSymbolicLink());}
 // Do not hide staged bytes behind a different working copy.
 for(const n of split(git('diff','--cached','--name-only','-z'))){assert(all.includes(n));assert.deepEqual(git('show',':'+n),read(n));}
});
check('syntax',()=>{const vm=require('node:vm');for(const n of ['transport-v2/live-test/client.js','transport-v2/t4-migration-runner/client.js'])new vm.Script(read(n).toString());execFileSync(process.execPath,['--check',path.join(repo,'transport-v2/worker/relay.mjs')]);});
check('all tests PASS and match inputs',()=>{
 const r=JSON.parse(read(reviewRoot+'TEST_RESULTS.json'));assert(r.offlineOnly&&r.fullRun);
 const expected=[273,71,269,56,10,7,1256,1000,12];
 assert.equal(r.runs.length,9);assert(r.runs.every((x,i)=>x.exitCode===0&&x.counts.pass===expected[i]&&x.counts.fail===0&&x.counts.skipped===0&&!(x.counts.cancelled)));
 const inputs=[...Object.keys(mapping),'transport-v2/live-test/config.js',...tests,reviewRoot+'run.py',reviewRoot+'preflight.cjs'].sort();
 assert.deepEqual(Object.keys(r.inputs).sort(),inputs);
 for(const[n,h]of Object.entries(r.inputs))assert.equal(sha(read(n)),h);
 assert.deepEqual(r.seeds,{model:'0x54740002',fuzz:'0x54740001'});
 let extra=0;
 if(r.compatibility){
  assert(r.compatibility.completed&&r.compatibility.disposableRemoved);
  assert.deepEqual(r.compatibility.inputHashes,r.inputs);
  assert(r.compatibility.cases.length>=12&&r.compatibility.cases.every(c=>c.pass===true));
  extra=r.compatibility.cases.length;
 }
 assert.deepEqual(r.totals,{pass:2954+extra,fail:0,skipped:0});
 report.compatibilityEvidencePresent=Boolean(r.compatibility);
});
check('git diff check',()=>{git('diff','--check',base,'--');git('diff','--cached','--check');});
const passed=name=>report.checks.find(c=>c.name===name)?.pass===true;
report.configUnchanged=passed('config unchanged and exact');report.runtimeHashesPass=passed('runtime hash gates');
report.liffIsolationPass=passed('LIFF separation');report.fixedOperationPass=passed('fixed operation/version and runner safety');
report.defaultDenySourcePass=passed('four routes and default deny')&&passed('no enabled committed deployment configuration');
report.testsEvidencePass=passed('all tests PASS and match inputs');report.diffCheckPass=passed('git diff check');
report.success=report.checks.every(c=>c.pass);report.pass=report.success;report.base=base;report.reviewed=reviewed;
return report;
}
try { const report=evaluate();console.log(JSON.stringify(report,null,2));process.exitCode=report.success?0:1; }
catch { console.log(JSON.stringify({success:false,offlineOnly:true,error:'LOCAL_PREFLIGHT_FAILED'}));process.exitCode=1; }

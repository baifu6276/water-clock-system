// Static and Git object checks only. No fetch or GAS execution.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto'),cp=require('node:child_process');
const {repo,root,source,version}=require('./harness.cjs');
const BASE='34e1cb77a972b1a600d0ea5eed60927fcef15059',V50='7bb207e6e14c1471198bc06a596b4d4805346b04',gasPrefix='release-candidates/gas-t4-recovery-effectivedate-v50/sources/';
const git=(...a)=>cp.execFileSync('git',a,{cwd:repo,maxBuffer:20*1024*1024});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bundle=d=>sha(Buffer.concat(Object.keys(d).sort().flatMap(n=>[Buffer.from(n+'\0'+d[n].length+'\0'),d[n]])));
function validateClient(s){
 new vm.Script(s);assert(s.includes("const LIFF_ID = '2011467618-QZYsTwb9';"));assert(!s.includes('2011467618-R76314It'));
 assert(!/localStorage|sessionStorage|indexedDB|cookie|console\.|Logger|innerHTML|\.message|\.stack|\.cause|location\.|URLSearchParams|randomUUID|getUuid|script\.google|setInterval|XMLHttpRequest|WebSocket/.test(s));
 assert(!s.includes('employeeLifecycleBaselineDryRun'));assert.equal((s.match(/await request\('employeeLifecycleBaselineMigrate'\)/g)||[]).length,1);
 assert(s.includes('attempted = true; busy = true; preflight = false;'));assert(s.includes("if (attempted && (next === 'READY' || next === 'PRECHECK')) return;"));
 const handler=s.slice(s.indexOf("$('recover').addEventListener('click'"),s.indexOf('  function statusState('));
 assert(handler.indexOf('attempted = true')<handler.indexOf("request('identityBootstrap')"));assert(handler.indexOf("request('identityBootstrap')")<handler.indexOf("request('employeeLifecycleBaselineRequestStatus')"));assert(handler.indexOf("request('employeeLifecycleBaselineRequestStatus')")<handler.indexOf("request('employeeLifecycleBaselineMigrate')"));
 assert(s.includes('writeSent = true;'));assert(s.includes("$('confirmation').value !== 'RECOVER EMP001'"));assert(s.includes('}, 20000)'));assert(s.includes("redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'"));
}
function inspect(){
 validateClient(source);assert.throws(()=>validateClient(source.replace('2011467618-QZYsTwb9','2011467618-WRONG')));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(html.includes('client.js?v=t4-recovery-original-1'));assert(!/onclick=|onload=|<form|<iframe/i.test(html));assert(html.includes('no-referrer'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);for(const m of source.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(m[1]));
 const paths=git('ls-tree','-rz','--name-only',BASE).toString().split('\0').filter(Boolean);
 const protectedPaths=paths.filter(p=>p.startsWith('transport-v2/t4-migration-runner/')||p.startsWith('transport-v2/live-test/')||p.startsWith('transport-v2/worker/')||p.startsWith('gas/'));
 for(const p of protectedPaths)assert(fs.readFileSync(path.join(repo,p)).equals(git('cat-file','--filters',BASE+':'+p)),p);
 // No existing tracked file may be changed, even outside the specifically protected directories.
 assert.equal(git('diff',BASE,'--name-only','--diff-filter=MDR').toString().trim(),'');
 const allowed=p=>p==='transport-v2/t4-recovery-runner/client.js'||p==='transport-v2/t4-recovery-runner/index.html'||p.startsWith('release-candidates/t4-recovery-runner-final/');
 for(const p of git('diff',BASE,'--name-only','-z').toString().split('\0').filter(Boolean))assert(allowed(p),p);
 for(const p of git('ls-files','--others','--exclude-standard','-z').toString().split('\0').filter(Boolean))assert(allowed(p),p);
 assert.equal(git('branch','--show-current').toString().trim(),'codex/t4-recovery-runner-final');git('merge-base','--is-ancestor',BASE,'HEAD');git('diff','--check');
 const checkout=p=>fs.readFileSync(path.join(repo,p));
 const read=p=>p.startsWith('transport-v2/t4-recovery-runner/')?checkout(p):git('show',BASE+':'+p);
 const hashes={workerFile:sha(read('transport-v2/worker/relay.mjs')),migrationRunner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,read('transport-v2/t4-migration-runner/'+n)]))),liveTest:bundle(Object.fromEntries(['client.js','index.html','config.js'].map(n=>[n,read('transport-v2/live-test/'+n)]))),recoveryRunner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,read('transport-v2/t4-recovery-runner/'+n)])))};
 assert.equal(hashes.workerFile,'7f5994d15bf732b53f4566c3594ebb7e3707d1a9cb2115a032c04cb6c61c7600');assert.equal(hashes.migrationRunner,'7a1d87607720c8f8c853a62aa8a6f3e9e19a28db0e11bc63bf98d07988ecf431');assert.equal(hashes.liveTest,'fd9fc54d94f7154dc5d0ac8f2742a402cf48f4e8e8b05c5c48a832fee172f013');
 const gasNames=git('ls-tree','-rz','--name-only',V50,gasPrefix).toString().split('\0').filter(Boolean),gas=Object.fromEntries(gasNames.map(p=>[p.slice(gasPrefix.length),git('show',V50+':'+p)]));assert.equal(gasNames.length,11);
 hashes.v50=bundle(gas);assert.equal(hashes.v50,'05d7ecc706de930c262663e9dd8b33ce1988811f36186a96750331c01940e0f1');
 const b=gas['EmployeeLifecycleBaseline.gs'].toString(),c=gas['EmployeeBaselineControl.gs'].toString();
 assert.equal(sha(gas['EmployeeLifecycleBaseline.gs']),'5d47e0336cc2e57819cd8bda3b6be76f5d3905de3b4748e0776ecc75c9e8258b');
 const migration=b.slice(b.indexOf('function employeeBaselineMigrate_'),b.indexOf('// Pure status query:'));
 assert(migration.includes("if (status.requestStatus !== 'STARTED' || logs.length !== 1 || employeeBaselineDecode_(logs[0]).format !== 4) employeeReviewRecovery_();"));
 const claim=migration.indexOf("employeeBaselineClaim_(context, data, hash, 'RECOVER_ORIGINAL');");assert(claim>migration.indexOf('employeeBaselineStatusEvidence_'));assert(claim<migration.indexOf('return employeeBaselineFinish_(context, logs[0]);'));
 assert(c.includes("if (!c || c.state !== 'ARMED' || c.mode !== mode || c.requestId !== data.requestId ||"));assert(c.includes('c.requestHash !== hash || c.snapshotVersion !== data.expectedSnapshotVersion'));assert(c.includes("c.state = 'CLAIMED';"));assert(c.includes('employeeBaselineControlPersist_(c); // Durable claim/read-back BEFORE any Sheet write.'));
 assert(b.includes("baselineState: existing ? 'ALREADY_BASELINED' : 'RECORDED', version: 1, recoveryStatus: 'COMPLETED'"));
 const worker=read('transport-v2/worker/relay.mjs').toString();assert(worker.includes("env.T4_CONTROLLED_MIGRATION_ENABLED !== 'true'"));assert(worker.includes('timeoutMs = 20000'));assert(worker.includes('JSON.stringify(controlled ? {'));assert(worker.includes("const safeDiagnostics = controlled ? undefined :"));assert(!/T4_CONTROLLED_MIGRATION_ENABLED\s*[:=]\s*['"]true/.test(worker));
 for(const f of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')))new vm.Script(fs.readFileSync(path.join(__dirname,f),'utf8'));
 function files(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(d,e.name)):[path.join(d,e.name)]);}
 for(const p of [...files(path.resolve(__dirname,'..')),...files(root)]){const b=fs.readFileSync(p);assert(!b.includes(13),'New file LF only: '+p);assert(!/[ \t]+$/m.test(b.toString()),'New file trailing whitespace: '+p);}
 const checkoutHashes={workerFile:sha(checkout('transport-v2/worker/relay.mjs')),migrationRunner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,checkout('transport-v2/t4-migration-runner/'+n)]))),liveTest:bundle(Object.fromEntries(['client.js','index.html','config.js'].map(n=>[n,checkout('transport-v2/live-test/'+n)])))};
 return {result:'PASS',hashBasis:'Existing artifact hashes use pinned Git blobs; local checkout hashes separately recorded and match Git checkout filters.',checkoutHashes,base:BASE,v50Provenance:V50,protectedFiles:protectedPaths.length,hashes,scope:'PASS',backendContract:'PASS',workerContract:'PASS',syntax:'PASS',privacy:'PASS',htmlStatic:'PASS',diffCheck:'PASS'};
}
if(require.main===module)console.log(JSON.stringify(inspect()));module.exports={inspect,validateClient,sha,bundle,BASE,V50};

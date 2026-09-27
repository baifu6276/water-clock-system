// Read-only local source/provenance checks. Committed descendants are supported.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../../..'),BASE='16bf1e13c6afc86d0701e0d3441ca1cdd9fcf57b',V50='7bb207e6e14c1471198bc06a596b4d4805346b04';
const git=(...a)=>cp.execFileSync('git',a,{cwd:repo,maxBuffer:30*1024*1024});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const bundle=d=>sha(Buffer.concat(Object.keys(d).sort().flatMap(n=>[Buffer.from(n+'\0'+d[n].length+'\0'),d[n]])));
const read=p=>fs.readFileSync(path.join(repo,p)),text=p=>read(p).toString(),base=p=>git('show',BASE+':'+p);
const runtime=['transport-v2/worker/relay.mjs','transport-v2/live-test/client.js','transport-v2/live-test/index.html','transport-v2/t4-recovery-runner/client.js','transport-v2/t4-recovery-runner/index.html'];
const prefix='release-candidates/t4-content-redirect-v51/';
function inspect(){
 assert.equal(git('branch','--show-current').toString().trim(),'codex/t4-content-redirect-v51');git('merge-base','--is-ancestor',BASE,'HEAD');git('diff','--check');
 const allowed=p=>runtime.includes(p)||p.startsWith(prefix);
 for(const p of [...git('diff',BASE,'--name-only','-z').toString().split('\0'),...git('ls-files','--others','--exclude-standard','-z').toString().split('\0')].filter(Boolean))assert(allowed(p),p);
 for(const p of ['transport-v2/live-test/config.js','transport-v2/t4-migration-runner/client.js','transport-v2/t4-migration-runner/index.html'])assert(read(p).equals(git('cat-file','--filters',BASE+':'+p)),p);
 const worker=text(runtime[0]),client=text(runtime[1]),runner=text(runtime[3]);
 let expected=base(runtime[0]).toString().replace("export const VERSION = 't4-safety-2-gas-read-diag';","export const VERSION = 't4-safety-3-content-redirect';\n// Parsed hostname only; never trust arbitrary googleusercontent subdomains.\nfunction isContentServiceHost(hostname) {\n  return hostname === 'script.googleusercontent.com' || /^n-[a-z0-9-]+-script\\.googleusercontent\\.com$/.test(hostname);\n}").replace("if (next.hostname !== 'script.googleusercontent.com')","if (!isContentServiceHost(next.hostname))").replace('if (next.port || next.username || next.password || next.hash)',"if (next.port || next.username || next.password || next.hash || next.pathname !== '/macros/echo')");
 assert.equal(worker,expected,'exact Worker patch only');
 expected=base(runtime[1]).toString().replace('  const statusCapable',"  const T4_CONTENT_VERSION = 't4-safety-3-content-redirect';\n  const statusCapable").replaceAll('GAS_TIMING_VERSION, T4_TIMING_VERSION]','GAS_TIMING_VERSION, T4_TIMING_VERSION, T4_CONTENT_VERSION]');assert.equal(client,expected,'read capabilities only');
 expected=base(runtime[3]).toString().replace("'t4-safety-2-gas-read-diag'","'t4-safety-3-content-redirect'").replace("      transition('WRITE_RESULT_UNKNOWN', '結果未知，僅能查原請求狀態。不得重送；由人工決定並關閉 Worker flag。');","      if (!writeSent) transition('PREWRITE_STOP', '續作寫入尚未送出；本頁已鎖定，請停止並交由管理員核對。不得在本頁重送。');\n      else transition('WRITE_RESULT_UNKNOWN', '結果未知，僅能查原請求狀態。不得重送；由人工決定並關閉 Worker flag。');");assert.equal(runner,expected,'exact runner patch only');
 for(const [i,old,newValue]of [[2,'t4-safety-2-read-compat','t4-safety-3-content-redirect'],[4,'t4-recovery-original-1','t4-recovery-content-redirect-1']])assert.equal(text(runtime[i]),base(runtime[i]).toString().replace('client.js?v='+old,'client.js?v='+newValue));
 new vm.Script(client);new vm.Script(runner);cp.execFileSync(process.execPath,['--check',path.join(repo,runtime[0])]);
 assert(!/console\.|localStorage\s*[.\[]|sessionStorage\s*[.\[]|indexedDB|innerHTML|document\.cookie|\.stack|\.cause/.test(client+runner+worker));
 assert(!/T4_CONTROLLED_MIGRATION_ENABLED\s*[:=]\s*['"]true/.test(worker));
 assert(worker.includes("env.T4_CONTROLLED_MIGRATION_ENABLED !== 'true'"));assert(worker.includes('timeoutMs = 20000'));
 assert(runner.includes("const LIFF_ID = '2011467618-QZYsTwb9'"));assert(text('transport-v2/live-test/config.js').includes('2011467618-R76314It'));
 for(const [js,html]of [[client,text(runtime[2])],[runner,text(runtime[4])]]){
  assert(!/onclick=|onload=|<iframe|<form/i.test(html));const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
  if(js===runner)for(const m of js.matchAll(/\$\('([^']+)'\)/g))assert(ids.includes(m[1]));
 }
 const hashes={oldWorkerFile:sha(base(runtime[0])),workerFile:sha(read(runtime[0])),workerBundle:bundle({'relay.mjs':read(runtime[0])}),readFrontend:bundle(Object.fromEntries(['client.js','index.html','config.js'].map(n=>[n,n==='config.js'?base('transport-v2/live-test/'+n):read('transport-v2/live-test/'+n)]))),recoveryRunner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,read('transport-v2/t4-recovery-runner/'+n)]))),migrationRunner:bundle(Object.fromEntries(['client.js','index.html'].map(n=>[n,base('transport-v2/t4-migration-runner/'+n)])))};
 assert.equal(hashes.oldWorkerFile,'7f5994d15bf732b53f4566c3594ebb7e3707d1a9cb2115a032c04cb6c61c7600');assert.equal(hashes.migrationRunner,'7a1d87607720c8f8c853a62aa8a6f3e9e19a28db0e11bc63bf98d07988ecf431');
 const gp='release-candidates/gas-t4-recovery-effectivedate-v50/sources/',names=git('ls-tree','-rz','--name-only',V50,gp).toString().split('\0').filter(Boolean);assert.equal(names.length,11);hashes.v50=bundle(Object.fromEntries(names.map(n=>[n.slice(gp.length),git('show',V50+':'+n)])));assert.equal(hashes.v50,'05d7ecc706de930c262663e9dd8b33ce1988811f36186a96750331c01940e0f1');
 for(const n of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')))new vm.Script(fs.readFileSync(path.join(__dirname,n),'utf8'));
 return {result:'PASS',base:BASE,v50Provenance:V50,hashBasis:'Modified files: exact LF bytes. Untouched config/migration/V50: canonical pinned Git blobs; checkout filters verified.',hashes,scope:'PASS',syntax:'PASS',htmlStatic:'PASS',privacy:'PASS',exactPatch:'PASS',diffCheck:'PASS'};
}
if(require.main===module)console.log(JSON.stringify(inspect()));module.exports={inspect};

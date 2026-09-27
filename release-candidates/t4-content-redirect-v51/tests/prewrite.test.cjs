const test=require('node:test'),assert=require('node:assert/strict');
const {create,flush,status}=require('./harness.cjs');
const message='續作寫入尚未送出；本頁已鎖定，請停止並交由管理員核對。不得在本頁重送。';
const failures=[{network:true},{nonJson:true},{version:'t4-safety-2-gas-read-diag'},...['UPSTREAM_TIMEOUT','UPSTREAM_REDIRECT_DENIED','FORBIDDEN','PRIVATE_EXCEPTION'].map(transportError=>({http:502,body:{success:false,transportError,message:'PRIVATE_EXCEPTION',sub:'PRIVATE_SUB',redirectURL:'PRIVATE_URL'}})),{body:{...status,currentConsistency:'CONFLICT'}}];
for(const action of ['identityBootstrap','employeeLifecycleBaselineRequestStatus'])for(const [i,reply]of failures.entries())test('PREWRITE_STOP '+action+' '+i,async()=>{
 const h=create({reply:({stage,data})=>stage==='REVALIDATING'&&data.action===action?reply:{}});await h.ready();await h.click('recover');assert.equal(h.state(),'PREWRITE_STOP');assert.equal(h.el('message').textContent,message);assert.equal(h.writes().length,0);await h.locked();await h.click('statusCheck');assert.equal(h.state(),'STATUS_STARTED');await h.locked();assert.equal(h.writes().length,0);
});
for(const action of ['identityBootstrap','employeeLifecycleBaselineRequestStatus'])for(const bodyPending of [false,true])test('prewrite timeout + late body '+action+' '+bodyPending,async()=>{
 const h=create({reply:({stage,data})=>stage==='REVALIDATING'&&data.action===action?{[bodyPending?'bodyPending':'pending']:true}:{}});await h.ready();const p=h.click('recover');await flush();assert.equal(h.state(),'REVALIDATING');await h.click('recover');h.expire();await p;assert.equal(h.state(),'PREWRITE_STOP');assert.equal(h.writes().length,0);h.release();await flush();assert.equal(h.state(),'PREWRITE_STOP');await h.locked();
});
test('migration token failure is conservatively unknown; writeSent guards before token',async()=>{
 const h=create({onToken:({state})=>{if(state==='SUBMITTING')throw Error('PRIVATE_TOKEN_ERROR');}});await h.ready();await h.click('recover');assert.equal(h.state(),'WRITE_RESULT_UNKNOWN');assert.equal(h.writes().length,0);await h.locked();
});
for(const reply of [{network:true},{pending:true},{body:{success:false,transportError:'UPSTREAM_REDIRECT_DENIED'},http:502},{body:{success:true,sub:'PRIVATE_SUB'}}])test('after writeSent always unknown '+Object.keys(reply)[0],async()=>{
 const h=create({reply:({stage})=>stage==='SUBMITTING'?reply:{}});await h.ready();const p=h.click('recover');await flush();if(reply.pending)h.expire();await p;assert.equal(h.state(),'WRITE_RESULT_UNKNOWN');assert.equal(h.writes().length,1);h.release();await flush();await h.locked();
});
test('status failure after PREWRITE_STOP does not reopen write',async()=>{const h=create({reply:({stage})=>['REVALIDATING','STATUS_CHECKING'].includes(stage)?{network:true}:{}});await h.ready();await h.click('recover');assert.equal(h.state(),'PREWRITE_STOP');await h.click('statusCheck');await h.locked();assert.equal(h.writes().length,0);});

// The old migration runner is intentionally unchanged and must reject the new version.
test('unchanged legacy migration runner fails closed on V51',async()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const original=path.resolve(__dirname,'../../t4-recovery-runner-final/tests/harness.cjs');
 let source=fs.readFileSync(original,'utf8').replace("root=path.join(repo,'transport-v2/t4-recovery-runner')","root=path.join(repo,'transport-v2/t4-migration-runner')").replace("const version='t4-safety-2-gas-read-diag'","const version='t4-safety-3-content-redirect'");
 const m=new Module(original,module);m.filename=original;m.paths=Module._nodeModulePaths(path.dirname(original));m._compile(source,original);
 const h=m.exports.create();await flush();await h.click('precheck');assert.equal(h.el('error').textContent,'TRANSPORT_VERSION_REQUIRED');h.phrase('MIGRATE EMP001');h.el('migrate').disabled=false;await h.click('migrate');assert.equal(h.writes().length,0);h.safe();
});

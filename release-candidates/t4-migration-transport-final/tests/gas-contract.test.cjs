const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {makeEnv}=require('../../gas-t4-control-no-flush/tests/foundation-fixture.cjs');
const id='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';
const payload={action:'employeeLifecycleBaselineMigrate',idToken:'owner',employeeId:'EMP001',requestId:id,expectedSnapshotVersion:'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd',reason:'建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。',confirmed:true};
test('GAS V48 exact 11-file bytes remain pinned',()=>{
 const dir=path.resolve(__dirname,'../../gas-t4-control-no-flush/sources'),names=fs.readdirSync(dir).sort();assert.equal(names.length,11);
 const bytes=Buffer.concat(names.flatMap(n=>{const b=fs.readFileSync(path.join(dir,n));return[Buffer.from(n+'\0'+b.length+'\0'),b];}));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5');
});
test('real V48 strict input accepts seven fields; metadata rejected',()=>{
 const e=makeEnv();assert.doesNotThrow(()=>e.ctx.employeeBaselineStrictInput_(payload));assert.throws(()=>e.ctx.employeeBaselineStrictInput_({...payload,_transportDiagnostics:{version:1,traceId:'mock'}}));assert.equal(e.writes,0);
});
test('real V48 success schema is exact six approved fields',()=>{
 const e=makeEnv(),r=JSON.parse(JSON.stringify(e.ctx.employeeBaselineResult_('EMP001',false,id)));
 assert.deepEqual(r,{success:true,employeeId:'EMP001',requestId:id,baselineState:'RECORDED',version:1,recoveryStatus:'COMPLETED'});assert.equal(e.writes,0);
});
for(const role of ['ADMIN','OWNER','SITE_MANAGER','EMPLOYEE'])test('combined relay + actual V48 rejects nonmatching mock snapshot/unauthorized actor '+role,async()=>{
 const e=makeEnv(role);const p=e.input(id);
 // Only local fixtures. Production snapshot cannot be reconstructed from private
 // employee data; do NOT replace the real hash algorithm to fake a success.
 if(['ADMIN','OWNER'].includes(role))e.prepare(p);
 const before=JSON.stringify([...e.props]);let calls=0;
 const {handle}=await import(pathToFileURL(path.resolve(__dirname,'../worker/relay.mjs')));
 const response=await handle(new Request('https://relay.example/employee-baseline-migrate',{method:'POST',headers:{origin:'https://baifu6276.github.io','content-type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)}),{
  GAS_UPSTREAM:'https://script.google.com/macros/s/OFFLINE/exec',ALLOWED_ORIGINS:'["https://baifu6276.github.io"]',T4_CONTROLLED_MIGRATION_ENABLED:'true'
 },{now:()=>0,fetchImpl:async(url,options)=>{calls++;const data=JSON.parse(options.body);assert.deepEqual(data,payload);return Response.json(e.call(data.action,data,e.actor));}});
 const r=await response.json();assert.equal(r.success,false);assert.equal(r.code,['ADMIN','OWNER'].includes(role)?'VERSION_CONFLICT':'FORBIDDEN');assert.equal(calls,1);assert.equal(e.writes,0);assert.equal(JSON.stringify([...e.props]),before);assert.equal(e.locked,false);
});

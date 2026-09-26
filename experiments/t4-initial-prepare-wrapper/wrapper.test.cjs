// Fixed candidate runtime + in-memory GAS services. No live calls or real permits.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const candidate=path.resolve(__dirname,'../../release-candidates/gas-t4-control-no-flush');
const {makeEnv}=require(path.join(candidate,'tests/foundation-fixture.cjs'));
const source=fs.readFileSync(path.join(__dirname,'TEMP_T4_PREPARE.gs'),'utf8');
const key='T4_EMP001_BASELINE_CONTROL',id='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';
const reason='建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。';
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const e=makeEnv();e.props.set('READ_DIAGNOSTICS_ENABLED','true');
  vm.runInContext(source,e.ctx,{filename:'TEMP_T4_PREPARE.gs'});
  e.propertyWrites=0;e.prepareCalls=0;e.plans=[];e.results=[];e.blockedCalls=0;e.flushes=0;
  const service=e.ctx.PropertiesService.getScriptProperties;
  e.ctx.PropertiesService.getScriptProperties=()=>{const store=service();return {...store,setProperty:(k,v)=>{
    assert.equal(e.locked,true,'property persistence only inside Prepare lock');assert.equal(k,key);e.propertyWrites++;return store.setProperty(k,v);
  }};};
  const prepare=e.ctx.employeeBaselineControlPrepare_;
  e.ctx.employeeBaselineControlPrepare_=plan=>{e.prepareCalls++;e.plans.push(plain(plan));const result=prepare(plan);e.results.push(result);return result;};
  for(const name of ['employeeBaselineMigrate_','employeeBaselineClaim_','employeeBaselineControlClose_','employeeBaselineFinish_'])e.ctx[name]=()=>{e.blockedCalls++;assert.fail('forbidden '+name);};
  e.ctx.UrlFetchApp.fetch=()=>assert.fail('LINE/network forbidden');
  // Observe the patched maintenance path; every wrapper outcome must remain zero-flush.
  e.ctx.SpreadsheetApp.flush=()=>{assert.equal(e.locked,true);e.flushes++;};
  e.ctx.Utilities.getUuid=()=>assert.fail('new UUID forbidden');
  e.run=()=>e.ctx.employeeT4InitialPrepareOnce();
  e.preview=()=>e.ctx.employeeBaselinePreview_(e.ctx.employeeBaselineEditorActor_('EMP001','test-channel'),'EMP001');
  e.safe=()=>{assert.equal(e.flushes,0);assert.equal(e.writes,0);assert.equal(e.blockedCalls,0);assert.equal(e.locked,false);assert.equal(e.verifies,0);assert.deepEqual(e.logs,[]);assert.equal(e.props.get('READ_DIAGNOSTICS_ENABLED'),'true');};
  return e;
}
function denied(e){const before=JSON.stringify(e.tables);assert.throws(e.run);e.safe();assert.equal(JSON.stringify(e.tables),before);}
function row(e,table,values){const s=e.ctx.EMPLOYEE_TABLES_[table];e.tables[s.name].rows.push(s.keys.map(k=>values[k]??''));}
test('exact 11-file runtime hashes pinned; no candidate edits',()=>{
  const m=JSON.parse(fs.readFileSync(path.join(candidate,'source-manifest.json'))),names=fs.readdirSync(path.join(candidate,'sources')).sort();
  assert.equal(names.length,11);assert.deepEqual(names,m.matrix.map(x=>x.file).sort());
  const bytes=Buffer.concat(names.flatMap(n=>{const b=fs.readFileSync(path.join(candidate,'sources',n));assert.equal(crypto.createHash('sha256').update(b).digest('hex'),m.matrix.find(x=>x.file===n).candidateSha256);return[Buffer.from(n+'\0'+b.length+'\0'),b];}));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5');
});
test('syntax, no arguments, no browser route, no direct writes/logs/network',()=>{
  new vm.Script(source);const e=fixture();assert.equal(e.ctx.employeeT4InitialPrepareOnce.length,0);
  assert(!e.ctx.EMPLOYEE_ACTIONS_.includes('employeeT4InitialPrepareOnce'));
  assert(!/\b(?:setProperty|setValue|setValues|appendRow|flush|getUuid|employeeBaselineMigrate_|employeeBaselineClaim_|employeeBaselineControlClose_)\s*\(/.test(source));
  assert(!/\b(?:console|Logger|UrlFetchApp|CacheService)\s*\.|google\.script\.run|\bcatch\s*\(/.test(source));
  assert.throws(()=>e.ctx.employeeT4InitialPrepareOnce({operatorId:'OTHER'}));assert.equal(e.prepareCalls,0);e.safe();
});
test('ABSENT + valid state -> exactly one ARMED property, safe original result',()=>{
  const e=fixture(),tables=JSON.stringify(e.tables),expected=e.preview().snapshotVersion,r=e.run();
  assert.equal(r,e.results[0]);assert.deepEqual(plain(r),{success:true,employeeId:'EMP001',requestId:id,generation:1,state:'ARMED'});
  assert.deepEqual(e.plans[0],{operatorId:'EMP001',approvedBy:'EMP001',approvalReference:'T4_EMP001_20260926_01',requestId:id,expectedSnapshotVersion:expected,reason,mode:'INITIAL'});
  const c=JSON.parse(e.props.get(key));assert.equal(c.snapshotVersion,expected);assert.equal(c.requestId,id);assert.equal(c.state,'ARMED');assert.equal(c.history.length,1);
  assert.equal(e.propertyWrites,1);assert.equal(e.prepareCalls,1);assert.equal(JSON.stringify(e.tables),tables);assert.equal(e.tables['員工資料表'].rows[1][7],'');e.safe();
});
test('candidate strings satisfy exact runtime plan and request validation',()=>{
  const e=fixture();e.run();const p=e.plans[0];assert.equal(e.ctx.employeeBaselineApprovalRef_(p.approvalReference),true);
  assert.deepEqual(Object.keys(p).sort(),['operatorId','approvedBy','approvalReference','requestId','expectedSnapshotVersion','reason','mode'].sort());
  e.ctx.employeeBaselineStrictInput_({action:'employeeLifecycleBaselineMigrate',idToken:'DUMMY_EDITOR_VALIDATION',employeeId:'EMP001',requestId:id,expectedSnapshotVersion:p.expectedSnapshotVersion,reason:p.reason,confirmed:true});
  assert(p.reason.length<=1000);e.safe();
});
test('preview is current and Prepare receives that same snapshot; locked recheck rejects drift',()=>{
  const e=fixture();e.tables['員工資料表'].rows[1][5]=2300;const fresh=e.preview().snapshotVersion;
  e.beforeLock(()=>{e.tables['員工資料表'].rows[1][5]=2400;});assert.throws(e.run);assert.equal(e.plans[0].expectedSnapshotVersion,fresh);
  assert.equal(e.propertyWrites,0);assert.equal(e.props.has(key),false);e.safe();
});
for(const [name,column,value]of [['inactive',9,'停職'],['leave',9,'留停'],['terminated',9,'離職'],['role lost',6,'EMPLOYEE'],['site manager',6,'SITE_MANAGER'],['LINE rebound',1,'changed']]){
  if(name!=='LINE rebound')test(name+' initially denied',()=>{const e=fixture();e.tables['員工資料表'].rows[1][column]=value;denied(e);assert.equal(e.propertyWrites,0);});
  test(name+' while waiting for lock denied',()=>{const e=fixture();e.beforeLock(()=>{e.tables['員工資料表'].rows[1][column]=value;});assert.throws(e.run);assert.equal(e.propertyWrites,0);e.safe();});
}
for(const when of ['initial','before-lock'])for(const kind of ['duplicate employee','duplicate UID','duplicate binding','employment','binding','receipt'])test(kind+' '+when,()=>{
  const e=fixture();const alter=()=>{
    if(kind==='duplicate employee')e.tables['員工資料表'].rows.push(['EMP001','another','mock','','',0,'ADMIN','','','在職','','']);
    if(kind==='duplicate UID')e.tables['員工資料表'].rows.push(['EMP002','owner','mock','','',0,'ADMIN','','','在職','','']);
    if(kind==='employment')row(e,'employments',{employeeId:'EMP001',employmentId:'mock-period',sequence:1,status:'在職',version:1});
    if(kind==='binding'||kind==='duplicate binding'){
      row(e,'bindings',{employeeId:'EMP001',lineSub:'owner',channelId:'test-channel',bindingId:'mock-binding-1',status:'有效',version:1});
      if(kind==='duplicate binding')row(e,'bindings',{employeeId:'EMP001',lineSub:'owner',channelId:'test-channel',bindingId:'mock-binding-2',status:'有效',version:1});
    }
    if(kind==='receipt')row(e,'audit',{employeeId:'EMP001',operatorSub:'owner',requestId:id,action:'LEGACY_BASELINE',phase:'STARTED'});
  };
  if(when==='initial'){alter();denied(e);}else{e.beforeLock(alter);assert.throws(e.run);e.safe();}
  assert.equal(e.propertyWrites,0);assert.equal(e.props.has(key),false);
});
test('already ARMED rejected without overwrite',()=>{const e=fixture();e.run();const before=e.props.get(key),n=e.propertyWrites;denied(e);assert.equal(e.props.get(key),before);assert.equal(e.propertyWrites,n);});
test('response lost: second wrapper call keeps fixed id and original ARMED bytes',()=>{
  const e=fixture();e.run(); // deliberately discard the caller response
  const before=e.props.get(key),n=e.propertyWrites;denied(e);assert.deepEqual(e.plans.map(p=>p.requestId),[id,id]);assert.equal(e.props.get(key),before);assert.equal(e.propertyWrites,n);
});
test('CLOSED denied; offline seed only, never invokes Close helper',()=>{
  const e=fixture();e.run();const c=JSON.parse(e.props.get(key));c.state='CLOSED';c.history.push({...c.history[0],state:'CLOSED'});e.props.set(key,JSON.stringify(c));
  const before=e.props.get(key),n=e.propertyWrites;denied(e);assert.equal(e.props.get(key),before);assert.equal(e.propertyWrites,n);
});
for(const value of ['bad','{}','[]'])test('malformed existing property '+value,()=>{const e=fixture();e.props.set(key,value);denied(e);assert.equal(e.props.get(key),value);assert.equal(e.propertyWrites,0);});
for(const mode of ['before','after'])test('property exception '+mode+' persistence propagates; no rollback/retry',()=>{
  const e=fixture();e.propFailure=mode;assert.throws(e.run,/PRIVATE_PROPERTY_EXCEPTION/);e.safe();assert.equal(e.propertyWrites,1);assert.equal(e.prepareCalls,1);
  if(mode==='before')assert.equal(e.props.has(key),false);else{assert.equal(JSON.parse(e.props.get(key)).state,'ARMED');const before=e.props.get(key);denied(e);assert.equal(e.props.get(key),before);assert.equal(e.propertyWrites,1);}
});
test('readback mismatch denies, no retry',()=>{
  const e=fixture(),get=e.ctx.PropertiesService.getScriptProperties;e.ctx.PropertiesService.getScriptProperties=()=>({...get(),setProperty:()=>{e.propertyWrites++;}});
  denied(e);assert.equal(e.propertyWrites,1);assert.equal(e.props.has(key),false);
});
test('Prepare errors are not swallowed or wrapped',()=>{const e=fixture(),sentinel=Error('OFFLINE_SENTINEL');e.ctx.employeeBaselineControlPrepare_=()=>{throw sentinel;};assert.throws(e.run,err=>err===sentinel);assert.equal(e.propertyWrites,0);e.safe();});
for(const change of [p=>p.employeeId='EMP002',p=>p.baselineState='ALREADY_BASELINED',p=>p.eligible=false,p=>p.eligible='true',p=>p.success=false])test('wrapper preview guard denies invalid preview',()=>{
  const e=fixture(),preview=e.ctx.employeeBaselinePreview_;e.ctx.employeeBaselinePreview_=(...args)=>{const p=preview(...args);change(p);return p;};denied(e);assert.equal(e.prepareCalls,0);
});
test('lock busy cannot create permit',()=>{const e=fixture();e.ctx.LockService.getScriptLock=()=>({tryLock:()=>false,releaseLock:()=>assert.fail('release unowned lock')});denied(e);assert.equal(e.propertyWrites,0);});
test('missing channel denied before Prepare',()=>{const e=fixture();e.props.delete('LINE_LOGIN_CHANNEL_ID');denied(e);assert.equal(e.prepareCalls,0);});
test('REQUIRED END-TO-END NO-FLUSH CONTRACT (V48 maintenance lock)',()=>{
  const e=fixture();e.run();assert.equal(e.flushes,0,'maintenance wrapper must never reach the shared Sheet-write flush');
});
test('maintenance path never calls even a throwing flush service',()=>{
  const e=fixture();e.ctx.SpreadsheetApp.flush=()=>{e.flushes++;throw Error('OFFLINE_FLUSH_FAILURE');};
  assert.equal(e.run().state,'ARMED');assert.equal(e.propertyWrites,1);e.safe();
});

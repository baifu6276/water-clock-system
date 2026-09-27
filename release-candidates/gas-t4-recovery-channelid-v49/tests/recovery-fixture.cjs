// OFFLINE ONLY. Real V48/V49 functions; fake Google/LINE services and synthetic identity.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {env:oldEnv}=require(process.env.V48_SERVICE_FIXTURE);
const candidate=path.resolve(__dirname,'../sources');
const KEY='T4_EMP001_BASELINE_CONTROL',SUB='OFFLINE_SYNTHETIC_EMP001_SUB',CHANNEL='2011467618';
const REQUEST='c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';
const REASON='建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。';
const OBSERVED={snapshot:'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd',requestHash:'bd411d0a0d2816c427c4bb822fa68a67f5b342bdaf0191389c5bad007394a101'};
const EMPLOYMENT='5c78ca4f-f7ad-4dc5-a7cc-5d727113ef3e',BINDING='0c91b0d0-5cf9-4d06-9beb-2947f37698d0';
const ARMED='2026-09-26T17:34:45.017Z',CLAIMED='2026-09-27T07:56:38.038Z',STARTED='2026-09-27T07:56:38.143Z';
const plain=v=>JSON.parse(JSON.stringify(v));
function patch(e){vm.runInContext(fs.readFileSync(path.join(candidate,'EmployeeLifecycleBaseline.gs'),'utf8'),e.ctx,{filename:'V49/EmployeeLifecycleBaseline.gs'});}
function fixture({patched=false,roundTrip=true}={}){
 const e=oldEnv();e.props=new Map([['LINE_LOGIN_CHANNEL_ID',CHANNEL]]);e.events=[];e.flushes=0;e.propertyWrites=0;e.releases=0;
 e.tables['員工資料表'].rows[1]=['EMP001',SUB,'合成測試人員','師傅','日薪',2200,'ADMIN','','','在職','',''];
 e.setClock=value=>{e.now=Date.parse(value);e.ctx.OFFLINE_NOW=e.now;};e.setClock(ARMED);
 vm.runInContext('Date=class extends Date { constructor(...a){super(...(a.length?a:[OFFLINE_NOW]));} static now(){return OFFLINE_NOW;} };',e.ctx);
 let serial=0;const ids=[EMPLOYMENT,BINDING,'00000000-0000-4000-8000-000000000001'];
 e.ctx.Utilities.getUuid=()=>ids[serial++]||'00000000-0000-4000-8000-'+String(serial).padStart(12,'0');
 e.ctx.Utilities.newBlob=value=>({getBytes:()=>[...Buffer.from(value)]});
 e.ctx.PropertiesService={getScriptProperties:()=>({getProperty:k=>e.props.get(k)||null,setProperty:(k,v)=>{
  assert.equal(e.locked,true);assert.equal(k,KEY);e.propertyWrites++;e.props.set(k,v);
  const c=JSON.parse(v);e.events.push('permit:'+c.mode+':'+c.state+':'+c.generation);
  if(c.mode==='INITIAL'&&c.state==='CLAIMED')e.setClock(STARTED);
 }})};
 e.ctx.SpreadsheetApp.flush=()=>{e.flushes++;e.events.push('flush');};
 const getLock=e.ctx.LockService.getScriptLock;
 e.ctx.LockService.getScriptLock=()=>{const l=getLock();return {...l,releaseLock:()=>{e.releases++;e.events.push('release');return l.releaseLock();}};};
 e.ctx.UrlFetchApp.fetch=(url,options)=>{
  assert.equal(e.locked,false);assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');
  assert.equal(options.payload.client_id,CHANNEL);assert.equal(options.payload.id_token,'token:'+SUB);
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify({iss:'https://access.line.me',aud:CHANNEL,sub:SUB,exp:e.now/1000+600})};
 };
 for(const[name,s]of Object.entries(e.tables)){
  const range=s.getRange;s.getRange=(...args)=>{const r=range(...args);return {...r,setValues:values=>{
   assert.notEqual(name,'員工資料表','master must never be written');
   e.events.push('sheet:'+name);const result=r.setValues(values);
   if(roundTrip&&name==='員工LINE綁定紀錄')for(const row of s.rows.slice(1))if(row[3]===CHANNEL)row[3]=Number(CHANNEL);
   return result;
  }};};
 }
 e.rows=table=>plain(e.ctx.employeeStoreRows_(table));
 e.actor=()=>e.ctx.employeeContext_({sub:SUB,channelId:CHANNEL});
 e.preview=()=>e.call('employeeLifecycleBaselineDryRun',{employeeId:'EMP001'},SUB);
 e.input=()=>({employeeId:'EMP001',requestId:REQUEST,expectedSnapshotVersion:e.preview().snapshotVersion,reason:REASON,confirmed:true});
 e.plan=(p,mode='RECOVER_ORIGINAL')=>({operatorId:'EMP001',approvedBy:'EMP001',approvalReference:mode==='INITIAL'?'T4_EMP001_20260926_01':'OFFLINE_RECOVERY_APPROVAL_02',requestId:p.requestId,expectedSnapshotVersion:p.expectedSnapshotVersion,reason:p.reason,mode});
 e.prepare=(p,mode)=>e.ctx.employeeBaselineControlPrepare_(e.plan(p,mode));
 e.migrate=p=>e.call('employeeLifecycleBaselineMigrate',p,SUB);
 e.status=p=>e.call('employeeLifecycleBaselineRequestStatus',{employeeId:'EMP001',requestId:p.requestId},SUB);
 e.control=()=>JSON.parse(e.props.get(KEY));
 e.cell=(table,key,value)=>{const schema=e.ctx.EMPLOYEE_TABLES_[table];e.tables[schema.name].rows[1][schema.index[key]]=value;};
 e.safe=()=>{assert.equal(e.locked,false);assert.deepEqual(e.logs,[]);assert(!JSON.stringify([...e.props]).includes('token:'));assert(!JSON.stringify(e.tables).includes('token:'));};
 if(patched)patch(e);return e;
}
function partial(){
 const e=fixture(),master=JSON.stringify(e.tables['員工資料表'].rows),p=e.input();
 // Real SHA helper/crypto remains untouched. These are synthetic-data digests,
 // not the confidential Production hashes, whose complete preimage is unavailable.
 assert.notEqual(p.expectedSnapshotVersion,OBSERVED.snapshot);
 e.context=e.actor();e.prepare(p,'INITIAL');e.setClock(CLAIMED);
 const failed=e.migrate(p);assert.equal(failed.success,false);assert.equal(failed.code,'RECOVERY_REQUIRED');
 assert.equal(e.rows('employments').length,1);assert.equal(e.rows('bindings').length,1);
 const logs=e.rows('audit');assert.equal(logs.length,1);assert.equal(logs[0].phase,'STARTED');
 assert.equal(logs[0].operatedAt,STARTED);assert.notEqual(logs[0].requestHash,OBSERVED.requestHash);
 const bundle=JSON.parse(logs[0].afterJson),binding=e.rows('bindings')[0];
 assert.equal(bundle.binding.channelId,CHANNEL);assert.equal(binding.channelId,Number(CHANNEL));
 assert.deepEqual({...binding,channelId:CHANNEL},bundle.binding);
 assert.deepEqual(e.rows('employments')[0],bundle.employment);
 assert.equal(bundle.employment.employmentId,EMPLOYMENT);assert.equal(bundle.binding.bindingId,BINDING);
 assert.equal(bundle.employment.startDate,'');assert.equal(bundle.employment.baselineDate,'2026-09-27');
 const c=e.control();assert.equal(c.state,'CLAIMED');assert.equal(c.mode,'INITIAL');assert.equal(c.generation,1);
 assert.deepEqual(c.history.map(h=>h.time),[ARMED,CLAIMED]);
 assert.equal(JSON.stringify(e.tables['員工資料表'].rows),master);e.safe();return {e,p,master};
}
function evidence(e,p){
 const state=e.ctx.employeeBaselineState_(e.context,'EMP001');
 return plain(e.ctx.employeeBaselineStatusEvidence_(e.context,'EMP001',p.requestId,state,e.rows('audit').filter(a=>a.requestId===p.requestId)));
}
function statusEquals(r,status,historical,consistency){
 assert.equal(r.success,true);assert.equal(r.requestStatus,status);assert.equal(r.historicalCompletion,historical);
 assert.equal(r.currentConsistency,consistency);assert.equal(r.recoveryAllowed,false);assert.equal(r.newRequestAllowed,false);
}
module.exports={fixture,partial,patch,evidence,statusEquals,plain,KEY,SUB,CHANNEL,REQUEST,REASON,OBSERVED,STARTED,CLAIMED};

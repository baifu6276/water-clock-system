// Offline forensic fixture. No service requests: original fixtures supply in-memory services.
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const repo=path.resolve(__dirname,'../../..');
process.env.V48_SERVICE_FIXTURE ||= path.join(repo,'release-candidates/gas-t4-control-no-flush/tests/service-fixture.cjs');
const old=require(path.join(repo,'release-candidates/gas-t4-recovery-channelid-v49/tests/recovery-fixture.cjs'));
const v49=path.join(repo,'release-candidates/gas-t4-recovery-channelid-v49/sources/EmployeeLifecycleBaseline.gs');
const v50=path.resolve(__dirname,'../sources/EmployeeLifecycleBaseline.gs');
function load(e,version){if(version!==48)vm.runInContext(fs.readFileSync(version===49?v49:v50,'utf8'),e.ctx);}
function dateCell(e,value){
 if(typeof value!=='string')return value;
 const instant=/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00+08:00':value;
 e.ctx.__cellInstant=instant;const date=vm.runInContext('new Date(__cellInstant)',e.ctx);delete e.ctx.__cellInstant;
 assert(Number.isFinite(date.getTime()));return date;
}
function sheetDates(e){
 // Extend only the fake formatDate service to honor the formats used by runtime.
 e.ctx.Utilities.formatDate=(date,zone,format)=>{
  assert.equal(zone,'Asia/Taipei');
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(date.getTime())).map(p=>[p.type,p.value]));
  const day=parts.year+'-'+parts.month+'-'+parts.day;
  if(format==='yyyy-MM-dd')return day;
  assert.equal(format,"yyyy-MM-dd'T'HH:mm:ss.SSS");
  return day+'T'+parts.hour+':'+parts.minute+':'+parts.second+'.'+String(date.getUTCMilliseconds()).padStart(3,'0');
 };
 const slots=[['audit','effectiveDate'],['employments','baselineDate']];
 e.roundTrip=()=>{for(const [table,key] of slots){const s=e.ctx.EMPLOYEE_TABLES_[table];for(const row of e.tables[s.name].rows.slice(1)){const i=s.index[key];row[i]=dateCell(e,row[i]);}}};
 for(const [table] of slots){const s=e.ctx.EMPLOYEE_TABLES_[table],sheet=e.tables[s.name],range=sheet.getRange;
  sheet.getRange=(...a)=>{const r=range(...a);return {...r,setValues:v=>{const out=r.setValues(v);e.roundTrip();return out;}};};}
 return e;
}
function fixture(version=49){const e=sheetDates(old.fixture());load(e,version);return e;}
function partial(version=49){
 const e=fixture(48),p=e.input();e.context=e.actor();e.prepare(p,'INITIAL');e.setClock(old.CLAIMED);
 assert.equal(e.migrate(p).code,'RECOVERY_REQUIRED'); // V48 checkpoint failure, never a real service.
 assert.equal(e.rows('employments').length,1);assert.equal(e.rows('bindings').length,1);assert.equal(e.rows('audit').length,1);
 load(e,version);
 const a=e.rows('audit')[0],b=JSON.parse(a.afterJson),state=e.ctx.employeeBaselineState_(e.context,'EMP001');
 assert.equal(a.effectiveDate,'2026-09-26T16:00:00.000Z');assert.equal(b.employment.baselineDate,'2026-09-27');
 assert.equal(state.periods[0].baselineDate,a.effectiveDate);
 assert.deepEqual(old.plain(e.ctx.employeeLifecyclePeriodImage_(state.periods[0])),b.employment);
 assert.equal(state.bindings[0].channelId,2011467618);assert.equal(b.binding.channelId,'2011467618');
 e.ctx.__rawDate=e.tables['員工異動紀錄'].rows[1][e.ctx.EMPLOYEE_TABLES_.audit.index.effectiveDate];
 assert.equal(vm.runInContext('__rawDate instanceof Date',e.ctx),true);delete e.ctx.__rawDate;
 for(const t of [a.effectiveAt,a.operatedAt,state.periods[0].createdAt,state.bindings[0].validFrom,state.bindings[0].operatedAt]){assert.equal(typeof t,'string');assert.equal(t,old.STARTED);}
 assert.notEqual(p.expectedSnapshotVersion,old.OBSERVED.snapshot);assert.notEqual(a.requestHash,old.OBSERVED.requestHash);
 assert.equal(e.control().state,'CLAIMED');assert.equal(e.control().mode,'INITIAL');assert.equal(e.control().generation,1);
 assert.equal(new Date(Date.UTC(1899,11,30)+46292*86400000).toISOString().slice(0,10),'2026-09-27');
 return {e,p,state,intent:a,bundle:b};
}
module.exports={...old,fixture,partial,load,v49,v50,sheetDates,dateCell};

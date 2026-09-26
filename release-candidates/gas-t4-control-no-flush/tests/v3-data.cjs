// Synthetic historical ROW DATA only. No legacy migration algorithm is executed.
// Fixed mock master/receipt images exercise the current candidate's v3 reader.
const crypto=require('node:crypto');
function seedV3(e,p,checkpoint='complete') {
  if(checkpoint==='none')return;
  const m=e.tables['員工資料表'].rows.find(r=>r[0]===p.employeeId);
  const actor=e.tables['員工資料表'].rows.find(r=>r[1]==='owner');
  const now='2026-09-01T00:00:00.000Z',day='2026-09-01';
  const canonical=(table,value)=>Object.fromEntries(e.ctx.EMPLOYEE_TABLES_[table].keys.map(k=>[k,value[k]??'']));
  const append=(table,value)=>e.tables[e.ctx.EMPLOYEE_TABLES_[table].name].rows.push(e.ctx.EMPLOYEE_TABLES_[table].keys.map(k=>value[k]??''));
  const employment=canonical('employments',{employmentId:'mock-v3-employment',employeeId:m[0],sequence:1,startDate:m[7],
    status:'在職',grade:m[3],salaryType:m[4],salaryAmount:m[5],permission:m[6],baselineDate:day,sourceType:'LEGACY_BASELINE',
    createdBy:actor[0],createdAt:now,version:1,note:'Synthetic historical receipt'});
  const binding=canonical('bindings',{bindingId:'mock-v3-binding',employeeId:m[0],lineSub:m[1],channelId:'test-channel',
    status:'有效',validFrom:now,sourceType:'LEGACY_BASELINE',operatorId:actor[0],operatedAt:now,reason:'Synthetic historical receipt',version:1});
  const requestHash=crypto.createHash('sha256').update(JSON.stringify(['LEGACY_BASELINE','owner','test-channel',m[0],p.expectedSnapshotVersion,p.reason.trim(),true])).digest('hex');
  const intent={auditId:'mock-v3-start',requestId:p.requestId,requestHash,employeeId:m[0],employmentId:employment.employmentId,
    action:'LEGACY_BASELINE',effectiveDate:day,effectiveAt:now,beforeJson:JSON.stringify({format:3,baselineState:'LEGACY_NOT_BASELINED'}),
    afterJson:JSON.stringify({format:3,snapshotVersion:p.expectedSnapshotVersion,employment,binding}),reason:p.reason.trim(),
    operatorSub:'owner',operatorId:actor[0],operatedAt:now,phase:'STARTED',beforeVersion:0,afterVersion:1};
  append('audit',intent);
  if(checkpoint!=='start')append('employments',employment);
  if(['both','complete'].includes(checkpoint))append('bindings',binding);
  if(checkpoint==='complete')append('audit',{...intent,auditId:'mock-v3-completed',phase:'COMPLETED'});
}
module.exports={seedV3};

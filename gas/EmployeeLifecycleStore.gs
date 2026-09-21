// Schema only: never auto-create sheets and never mutate 員工資料表 A:L.
var EMPLOYEE_TABLES_ = {
  applications: {
    name: '員工加入申請',
    headers: '申請ID|請求ID|請求內容摘要|申請類型|申請LINE身分|驗證Channel ID|申請姓名|手機|申請說明|申請狀態|申請時間|核定員工ID|審核人員工ID|審核時間|審核原因|取消時間|資料版本'.split('|'),
    keys: 'applicationId|requestId|requestHash|type|lineSub|channelId|name|phone|note|status|createdAt|employeeId|reviewerId|reviewedAt|reviewReason|cancelledAt|version'.split('|')
  },
  employments: {
    name: '員工任職紀錄',
    headers: '任職ID|員工ID|任職序號|到職日|離職日|任職狀態|停權生效時間|級職基準快照|薪資制基準快照|薪資金額基準快照|系統權限基準快照|快照基準日|來源類型|來源申請ID|建立人員工ID|建立時間|離職原因|離職操作人員工ID|離職操作時間|備註|資料版本'.split('|'),
    keys: 'employmentId|employeeId|sequence|startDate|endDate|status|disabledAt|grade|salaryType|salaryAmount|permission|baselineDate|sourceType|applicationId|createdBy|createdAt|terminationReason|terminatedBy|terminatedAt|note|version'.split('|')
  },
  bindings: {
    name: '員工LINE綁定紀錄',
    headers: '綁定ID|員工ID|LINE身分|驗證Channel ID|綁定狀態|生效時間|失效時間|來源類型|來源申請ID|前一綁定ID|操作人員工ID|操作時間|原因|資料版本'.split('|'),
    keys: 'bindingId|employeeId|lineSub|channelId|status|validFrom|validTo|sourceType|applicationId|previousBindingId|operatorId|operatedAt|reason|version'.split('|')
  },
  audit: {
    name: '員工異動紀錄',
    headers: '異動ID|操作請求ID|請求內容摘要|員工ID|任職ID|申請ID|異動類型|生效日期|生效時間|異動前資料JSON|異動後資料JSON|原因|操作人LINE身分|操作人員工ID|操作時間|操作階段|操作前版本|操作後版本'.split('|'),
    keys: 'auditId|requestId|requestHash|employeeId|employmentId|applicationId|action|effectiveDate|effectiveAt|beforeJson|afterJson|reason|operatorSub|operatorId|operatedAt|phase|beforeVersion|afterVersion'.split('|')
  }
};
Object.keys(EMPLOYEE_TABLES_).forEach(function(name) {
  var schema = EMPLOYEE_TABLES_[name];
  schema.index = {};
  schema.keys.forEach(function(key, index) { schema.index[key] = index; });
});

function employeeText_(value) { return value == null ? '' : String(value).trim(); }
function employeeStoreSheet_(table, optional) {
  var schema = EMPLOYEE_TABLES_[table];
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(schema.name);
  if (!sheet && optional) return null;
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() !== schema.headers.length ||
      JSON.stringify(sheet.getRange(1, 1, 1, schema.headers.length).getValues()[0]) !== JSON.stringify(schema.headers)) {
    employeeFailure_('SCHEMA_ERROR', '人員資料表尚未設定完成，請聯絡管理員。');
  }
  return sheet;
}
function employeeRowObject_(table, row) {
  var object = {};
  EMPLOYEE_TABLES_[table].keys.forEach(function(key, i) {
    object[key] = row[i] instanceof Date ? row[i].toISOString() : row[i];
  });
  return object;
}
function employeeStoreRows_(table, optional) {
  var sheet = employeeStoreSheet_(table, optional);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, EMPLOYEE_TABLES_[table].keys.length).getValues()
    .filter(function(row) { return row.some(function(cell) { return employeeText_(cell) !== ''; }); })
    .map(function(row) { return employeeRowObject_(table, row); });
}
function employeeLegacyRows_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('員工資料表');
  if (!sheet) employeeFailure_('SCHEMA_ERROR', '找不到員工資料表。');
  if (sheet.getLastRow() < 2) return [];
  // Exact V3.4.3 mapping. K:L intentionally remain untouched/uninterpreted.
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().map(function(row, index) {
    return { row: index + 2, empty: row.every(function(v) { return employeeText_(v) === ''; }),
      employeeId: employeeText_(row[0]), lineUid: employeeText_(row[1]), name: employeeText_(row[2]),
      grade: employeeText_(row[3]), salaryType: employeeText_(row[4]), salaryAmount: row[5],
      permission: employeeText_(row[6]), startDate: row[7], endDate: row[8], status: employeeText_(row[9]) };
  }).filter(function(row) { return !row.empty; });
}
function employeeHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value), Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function employeeRequestId_(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) employeeFailure_('VALIDATION_ERROR', '請重新開啟申請畫面。');
  return value;
}
function employeeWithLock_(work) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) employeeFailure_('BUSY', '目前忙碌中，請稍後重試。');
  try { return work(); }
  finally { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } }
}
function employeeWriteRow_(table, object, rowNumber) {
  var schema = EMPLOYEE_TABLES_[table], sheet = employeeStoreSheet_(table);
  var values = schema.keys.map(function(key) {
    var value = object[key] == null ? '' : object[key];
    // Leading apostrophe is Sheets' literal-text escape, not part of displayed value.
    return typeof value === 'string' && /^[=+\-@']/.test(value) ? "'" + value : value;
  });
  sheet.getRange(rowNumber || sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
}
function employeeApplicationRowNumber_(applicationId) {
  var sheet = employeeStoreSheet_('applications');
  var rows = sheet.getDataRange().getValues();
  var found = [];
  rows.forEach(function(row, i) { if (i && row[0] === applicationId) found.push(i + 1); });
  if (found.length > 1) employeeFailure_('DATA_CONFLICT', '申請資料重複，請聯絡管理員。');
  return found[0] || 0;
}
function employeeAuditAppend_(record) {
  employeeWriteRow_('audit', record);
  SpreadsheetApp.flush();
}
// START is a durable intent. Retry applies the same after-image only if before-version still matches.
function employeeFinishIntent_(intent) {
  var after = JSON.parse(intent.afterJson);
  var rowNumber = employeeApplicationRowNumber_(after.applicationId);
  var current = rowNumber ? employeeRowObject_('applications', employeeStoreSheet_('applications').getRange(rowNumber, 1, 1, 17).getValues()[0]) : null;
  if (JSON.stringify(current) !== JSON.stringify(after)) {
    if ((current ? Number(current.version) : 0) !== Number(intent.beforeVersion) ||
        JSON.stringify(current) !== intent.beforeJson) employeeFailure_('VERSION_CONFLICT', '資料已變更，請重新讀取。');
    employeeWriteRow_('applications', after, rowNumber);
    SpreadsheetApp.flush();
  }
  var done = Object.assign({}, intent, { auditId: Utilities.getUuid(), phase: 'COMPLETED', operatedAt: new Date().toISOString() });
  employeeAuditAppend_(done);
  return after;
}
function employeeReplay_(context, requestId, hash) {
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.operatorSub === context.sub && a.requestId === requestId; });
  if (!logs.length) return null;
  if (logs.some(function(a) { return a.requestHash !== hash; })) employeeFailure_('REQUEST_CONFLICT', '相同請求編號的內容不同，請重新讀取。');
  var done = logs.find(function(a) { return a.phase === 'COMPLETED'; });
  if (done) {
    var current = employeeStoreRows_('applications').find(function(a) { return a.applicationId === done.applicationId; });
    if (!current || current.lineSub !== context.sub || String(current.channelId) !== context.channelId) employeeFailure_('DATA_CONFLICT', '找不到原申請，請聯絡管理員。');
    return current;
  }
  return employeeFinishIntent_(logs[0]);
}
function employeeEnsureNoPendingIntent_(context) {
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.operatorSub === context.sub; });
  if (logs.some(function(a) { return a.phase === 'STARTED' && !logs.some(function(b) { return b.requestId === a.requestId && b.phase === 'COMPLETED'; }); })) {
    employeeFailure_('OPERATION_PENDING', '前次操作尚未確認，請使用原操作重試。');
  }
}
function employeeMutateApplication_(context, requestId, hash, action, before, after) {
  // Canonical field order and explicit blanks keep retries equal to a Sheet round-trip.
  after = employeeRowObject_('applications', EMPLOYEE_TABLES_.applications.keys.map(function(k) { return after[k] == null ? '' : after[k]; }));
  var intent = { auditId: Utilities.getUuid(), requestId: requestId, requestHash: hash,
    employeeId: '', employmentId: '', applicationId: after.applicationId, action: action,
    effectiveDate: '', effectiveAt: new Date().toISOString(), beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after),
    reason: '', operatorSub: context.sub, operatorId: '', operatedAt: new Date().toISOString(), phase: 'STARTED',
    beforeVersion: before ? before.version : 0, afterVersion: after.version };
  employeeAuditAppend_(intent);
  return employeeFinishIntent_(intent);
}

function employeeLifecycleBaselineDryRun_(context, data) {
  if (employeeIdentityState_(context) !== 'ACTIVE_EMPLOYEE' || ['OWNER', 'ADMIN'].indexOf(context.employee.permission) < 0) {
    employeeFailure_('FORBIDDEN', '僅 OWNER／ADMIN 可執行基線檢查。');
  }
  if (data && data.employeeId != null) return employeeBaselinePreview_(context, data.employeeId);
  var employees = employeeLegacyRows_(), exceptions = [];
  var duplicateEmployeeIds = [], duplicateLineUids = [];
  var counts = { employeeId: Object.create(null), lineUid: Object.create(null) };
  employees.forEach(function(e) { ['employeeId', 'lineUid'].forEach(function(k) { if (e[k]) counts[k][e[k]] = (counts[k][e[k]] || 0) + 1; }); });
  Object.keys(counts.employeeId).forEach(function(id) { if (counts.employeeId[id] > 1) duplicateEmployeeIds.push(id); });
  Object.keys(counts.lineUid).forEach(function(id) { if (counts.lineUid[id] > 1) duplicateLineUids.push(id); });
  var employments = employeeStoreRows_('employments', true), bindings = employeeStoreRows_('bindings', true);
  var employmentCount = 0, bindingCount = 0, blankEmployeeId = 0, blankLineUid = 0, unknownStatus = 0;
  employees.forEach(function(e) {
    var reasons = [];
    if (!e.employeeId) { blankEmployeeId++; reasons.push('空白員工ID'); }
    if (!e.lineUid) { blankLineUid++; reasons.push('空白LINE身分'); }
    if (counts.employeeId[e.employeeId] > 1) reasons.push('重複員工ID');
    if (counts.lineUid[e.lineUid] > 1) reasons.push('重複LINE身分');
    if (['在職', '停職', '留停', '離職'].indexOf(e.status) < 0) { unknownStatus++; reasons.push('未知員工狀態'); }
    if (['OWNER', 'ADMIN', 'SITE_MANAGER', 'EMPLOYEE'].indexOf(e.permission) < 0) reasons.push('未知系統權限');
    if (!reasons.length) {
      if (!employments.some(function(r) { return r.employeeId === e.employeeId; })) employmentCount++;
      if (!bindings.some(function(r) { return r.employeeId === e.employeeId || r.lineSub === e.lineUid; })) bindingCount++;
    }
    if (!employeeText_(e.startDate)) reasons.push('到職日未知，基線保持空白');
    if (reasons.length) exceptions.push({ row: e.row, employeeId: e.employeeId, reasons: reasons });
  });
  return { success: true, dryRun: true, duplicateEmployeeIds: duplicateEmployeeIds, duplicateLineUidCount: duplicateLineUids.length,
    blankEmployeeId: blankEmployeeId, blankLineUid: blankLineUid, unknownStatus: unknownStatus,
    noOwner: !employees.some(function(e) { return e.permission === 'OWNER' && e.status === '在職'; }),
    eligibleEmploymentCount: employmentCount, eligibleBindingCount: bindingCount, exceptions: exceptions };
}

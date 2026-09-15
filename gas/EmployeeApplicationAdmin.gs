// Backend-only NEW_EMPLOYEE review. No rehire, rebinding, migration or payroll refresh.
function employeeRequireReviewer_(context) {
  if (employeeIdentityState_(context) !== 'ACTIVE_EMPLOYEE' ||
      ['OWNER', 'ADMIN'].indexOf(context.employee.permission) < 0) {
    employeeFailure_('FORBIDDEN', '僅在職 OWNER／ADMIN 可審核員工申請。');
  }
}
function employeeReviewRecovery_() {
  employeeFailure_('RECOVERY_REQUIRED', '此操作有未確認或衝突資料，請以原請求重試；仍失敗時交由管理員人工確認。');
}
function employeeReviewPending_(applicationId, lineSub) {
  var logs = employeeStoreRows_('audit', true);
  return logs.filter(function(a) {
    return a.phase === 'STARTED' && (a.applicationId === applicationId || (lineSub && a.operatorSub === lineSub)) &&
      !logs.some(function(b) { return b.phase === 'COMPLETED' && b.operatorSub === a.operatorSub && b.requestId === a.requestId; });
  });
}
function employeeApplicationAdminList_(context, data) {
  employeeRequireReviewer_(context);
  var status = data.status == null ? '待審核' : data.status;
  if (['待審核', '已核准', '已拒絕', '已取消'].indexOf(status) < 0) employeeFailure_('VALIDATION_ERROR', '申請狀態不正確。');
  return { success: true, applications: employeeStoreRows_('applications').filter(function(a) {
    return a.status === status;
  }).map(function(a) {
    return Object.assign(employeePublicApplication_(a), { reviewedAt: a.reviewedAt, reviewReason: a.reviewReason,
      recoveryRequired: employeeReviewPending_(a.applicationId).length > 0 });
  }) };
}
function employeeReviewText_(value, max, required) {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    employeeFailure_('INVALID_APPROVAL_DATA', '請檢查審核資料格式與必填欄位。');
  }
  return value.trim();
}
function employeeReviewInput_(context, data, approve) {
  var input = { applicationId: employeeReviewText_(data.applicationId, 100, true),
    expectedVersion: data.expectedVersion, adminNote: employeeReviewText_(data.adminNote, 1000, !approve) };
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) employeeFailure_('VALIDATION_ERROR', '請重新讀取申請版本。');
  if (approve) {
    input.grade = employeeReviewText_(data.grade, 80, true);
    input.salaryType = data.salaryType;
    input.salaryAmount = data.salaryAmount;
    input.systemRole = data.systemRole;
    input.hireDate = employeeReviewText_(data.hireDate, 10, true);
    if (['OWNER', 'ADMIN', 'SITE_MANAGER', 'EMPLOYEE'].indexOf(input.systemRole) < 0 ||
        (context.employee.permission === 'ADMIN' && input.systemRole === 'OWNER')) {
      employeeFailure_('INVALID_ROLE_ASSIGNMENT', '沒有授予此系統權限的資格。');
    }
    if (['日薪', '月薪'].indexOf(input.salaryType) < 0 || typeof input.salaryAmount !== 'number' ||
        !Number.isFinite(input.salaryAmount) || input.salaryAmount < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(input.hireDate) ||
        !Number.isFinite(new Date(input.hireDate + 'T00:00:00Z').getTime()) ||
        new Date(input.hireDate + 'T00:00:00Z').toISOString().slice(0, 10) !== input.hireDate) {
      employeeFailure_('INVALID_APPROVAL_DATA', '請提供日薪／月薪、有效非負金額及有效到職日期。');
    }
  }
  return input;
}
function employeeReviewMaster_() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('員工資料表');
  // A:L mapping is documented in the deployed Code.gs. Do not rewrite headers/old rows.
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 12) employeeFailure_('SCHEMA_ERROR', '員工主檔欄位不完整。');
  return sheet;
}
function employeeReviewMasterRows_() {
  var sheet = employeeReviewMaster_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 12).getValues().filter(function(row) {
    return row.some(function(v) { return employeeText_(v) !== ''; });
  }).map(function(row) {
    return row.map(function(v, i) {
      if ((i === 7 || i === 8) && v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
      return v;
    });
  });
}
function employeeNextId_() {
  // Include historical references and durable reservations, not just the current master.
  var ids = employeeLegacyRows_().map(function(e) { return e.employeeId; });
  ['applications', 'employments', 'bindings', 'audit'].forEach(function(table) {
    employeeStoreRows_(table).forEach(function(row) { if (row.employeeId) ids.push(employeeText_(row.employeeId)); });
  });
  var max = 0;
  ids.forEach(function(id) {
    var match = /^EMP(\d+)$/i.exec(id);
    if (match) {
      var number = Number(match[1]);
      if (!Number.isSafeInteger(number) || number >= Number.MAX_SAFE_INTEGER) employeeReviewRecovery_();
      max = Math.max(max, number);
    }
  });
  return 'EMP' + String(max + 1).padStart(3, '0');
}
function employeeReviewCanonical_(table, data) {
  return employeeRowObject_(table, EMPLOYEE_TABLES_[table].keys.map(function(k) { return data[k] == null ? '' : data[k]; }));
}
function employeeReviewBundle_(context, before, input, approve) {
  var now = new Date().toISOString(), id = approve ? employeeNextId_() : '';
  var after = employeeReviewCanonical_('applications', Object.assign({}, before, {
    status: approve ? '已核准' : '已拒絕', employeeId: id, reviewerId: context.employee.employeeId,
    reviewedAt: now, reviewReason: input.adminNote, version: input.expectedVersion + 1
  }));
  var bundle = { format: 1, application: after, employee: null, employment: null, binding: null,
    result: { success: true, application: employeePublicApplication_(after), employeeId: id } };
  if (!approve) return bundle;
  bundle.employee = [id, before.lineSub, before.name, input.grade, input.salaryType, input.salaryAmount,
    input.systemRole, input.hireDate, '', '在職', before.phone, input.adminNote];
  bundle.employment = employeeReviewCanonical_('employments', {
    employmentId: Utilities.getUuid(), employeeId: id, sequence: 1, startDate: input.hireDate, status: '在職',
    grade: input.grade, salaryType: input.salaryType, salaryAmount: input.salaryAmount, permission: input.systemRole,
    baselineDate: input.hireDate, sourceType: 'APPLICATION_APPROVAL', applicationId: before.applicationId,
    createdBy: context.employee.employeeId, createdAt: now, note: input.adminNote, version: 1
  });
  bundle.binding = employeeReviewCanonical_('bindings', {
    bindingId: Utilities.getUuid(), employeeId: id, lineSub: before.lineSub, channelId: String(before.channelId),
    status: '有效', validFrom: now, sourceType: 'APPLICATION_APPROVAL', applicationId: before.applicationId,
    operatorId: context.employee.employeeId, operatedAt: now, reason: input.adminNote, version: 1
  });
  return bundle;
}
function employeeReviewAssertNew_(application) {
  if (employeeLegacyRows_().some(function(e) { return e.lineUid === application.lineSub; }) || application.employeeId ||
      employeeStoreRows_('applications').some(function(a) {
        return a.lineSub === application.lineSub && (a.employeeId || a.status === '已核准');
      })) {
    employeeFailure_('IDENTITY_CONFLICT', 'LINE 已有員工歷史關聯，請人工確認回任或重綁。');
  }
  if (employeeStoreRows_('bindings').some(function(b) { return b.lineSub === application.lineSub || b.applicationId === application.applicationId; })) {
    employeeFailure_('LINE_BINDING_CONFLICT', 'LINE 已有綁定或歷史紀錄，請人工確認。');
  }
  if (employeeStoreRows_('employments').some(function(e) { return e.applicationId === application.applicationId; })) {
    employeeFailure_('EMPLOYMENT_CONFLICT', '此申請已有任職紀錄，請人工確認。');
  }
}
function employeeReviewSame_(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function employeeReviewInspect_(intent, bundle, before) {
  var apps = employeeStoreRows_('applications').filter(function(a) { return a.applicationId === intent.applicationId; });
  if (apps.length !== 1 || (!employeeReviewSame_(apps[0], before) && !employeeReviewSame_(apps[0], bundle.application))) employeeReviewRecovery_();
  var state = { applicationDone: employeeReviewSame_(apps[0], bundle.application) };
  // No other unresolved request may own this application, including applicant cancel.
  if (employeeReviewPending_(intent.applicationId, before.lineSub).some(function(a) {
    return a.operatorSub !== intent.operatorSub || a.requestId !== intent.requestId;
  })) employeeReviewRecovery_();
  if (!bundle.employee) return state;
  var id = intent.employeeId, sub = before.lineSub;
  var master = employeeReviewMasterRows_().filter(function(r) { return employeeText_(r[0]) === id || employeeText_(r[1]) === sub; });
  var periods = employeeStoreRows_('employments').filter(function(e) {
    return e.employmentId === bundle.employment.employmentId || e.employeeId === id || e.applicationId === intent.applicationId;
  }).map(function(e) {
    // Sheets may return date-formatted cells as Date (store converts these to ISO).
    // These three schema fields are calendar dates, not timestamps.
    ['startDate', 'endDate', 'baselineDate'].forEach(function(k) {
      if (typeof e[k] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(e[k]) && Number.isFinite(new Date(e[k]).getTime())) {
        e[k] = Utilities.formatDate(new Date(e[k]), 'Asia/Taipei', 'yyyy-MM-dd');
      }
    });
    return e;
  });
  var bindings = employeeStoreRows_('bindings').filter(function(b) {
    return b.bindingId === bundle.binding.bindingId || b.employeeId === id || b.lineSub === sub || b.applicationId === intent.applicationId;
  });
  [[master, bundle.employee], [periods, bundle.employment], [bindings, bundle.binding]].forEach(function(pair) {
    if (pair[0].length > 1 || (pair[0].length === 1 && !employeeReviewSame_(pair[0][0], pair[1]))) employeeReviewRecovery_();
  });
  // If later checkpoints exist, earlier ones cannot have disappeared.
  if ((bindings.length && !periods.length) || (state.applicationDone && !bindings.length) || (master.length && !state.applicationDone)) employeeReviewRecovery_();
  state.employeeDone = master.length === 1; state.employmentDone = periods.length === 1; state.bindingDone = bindings.length === 1;
  return state;
}
function employeeReviewFinish_(intent) {
  var bundle, before;
  try { bundle = JSON.parse(intent.afterJson); before = JSON.parse(intent.beforeJson); }
  catch (_) { employeeReviewRecovery_(); }
  if (!bundle || bundle.format !== 1 || !before || !bundle.application || !bundle.result ||
      bundle.application.applicationId !== intent.applicationId || before.applicationId !== intent.applicationId) employeeReviewRecovery_();
  if (intent.action === 'APPLICATION_APPROVE') {
    if (!Array.isArray(bundle.employee) || bundle.employee.length !== 12 || !bundle.employment || !bundle.binding ||
        !intent.employeeId || bundle.employee[0] !== intent.employeeId || bundle.employee[1] !== before.lineSub ||
        bundle.application.employeeId !== intent.employeeId || bundle.application.status !== '已核准' ||
        bundle.employment.employeeId !== intent.employeeId || bundle.binding.employeeId !== intent.employeeId ||
        bundle.employment.applicationId !== intent.applicationId || bundle.binding.applicationId !== intent.applicationId ||
        bundle.binding.lineSub !== before.lineSub || !bundle.employment.employmentId || !bundle.binding.bindingId) employeeReviewRecovery_();
  } else if (intent.action !== 'APPLICATION_REJECT' || bundle.employee || bundle.employment || bundle.binding ||
      bundle.application.status !== '已拒絕') employeeReviewRecovery_();
  var state = employeeReviewInspect_(intent, bundle, before);
  // Each table is a checkpoint: absent -> append; exact after-image -> skip;
  // anything else -> manual recovery. Never overwrite uncertain partial records.
  if (bundle.employee) {
    if (!state.employmentDone) { employeeWriteRow_('employments', bundle.employment); SpreadsheetApp.flush(); }
    if (!state.bindingDone) { employeeWriteRow_('bindings', bundle.binding); SpreadsheetApp.flush(); }
  }
  if (!state.applicationDone) {
    employeeWriteRow_('applications', bundle.application, employeeApplicationRowNumber_(intent.applicationId)); SpreadsheetApp.flush();
  }
  // Activate the legacy master last, after application, period, binding and START audit exist.
  if (bundle.employee && !state.employeeDone) {
    var sheet = employeeReviewMaster_();
    var values = bundle.employee.map(function(v) { return typeof v === 'string' && /^[=+\-@']/.test(v) ? "'" + v : v; });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, 12).setValues([values]); SpreadsheetApp.flush();
  }
  var done = employeeReviewInspect_(intent, bundle, before);
  if (!done.applicationDone || (bundle.employee && (!done.employeeDone || !done.employmentDone || !done.bindingDone))) employeeReviewRecovery_();
  employeeAuditAppend_(Object.assign({}, intent, { auditId: Utilities.getUuid(), phase: 'COMPLETED', operatedAt: new Date().toISOString() }));
  return bundle.result;
}
function employeeApplicationReview_(context, data, approve) {
  employeeRequireReviewer_(context); // Called again after lock, using current master state.
  var requestId = employeeRequestId_(data.requestId), input = employeeReviewInput_(context, data, approve);
  var action = approve ? 'APPLICATION_APPROVE' : 'APPLICATION_REJECT';
  var hash = employeeHash_([action, context.sub, context.channelId, input]);
  ['applications', 'employments', 'bindings', 'audit'].forEach(function(t) { employeeStoreSheet_(t); });
  employeeReviewMaster_();
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.operatorSub === context.sub && a.requestId === requestId; });
  if (logs.length) {
    if (logs.some(function(a) { return a.requestHash !== hash || a.action !== action; })) employeeFailure_('REQUEST_CONFLICT', '相同請求編號的內容不同。');
    var completed = logs.find(function(a) { return a.phase === 'COMPLETED'; });
    if (completed) {
      var saved;
      try { saved = JSON.parse(completed.afterJson); } catch (_) { employeeReviewRecovery_(); }
      if (!saved || saved.format !== 1 || !saved.result) employeeReviewRecovery_();
      return saved.result; // Original completed result, not a later mutable application.
    }
    if (logs.length !== 1 || logs[0].phase !== 'STARTED') employeeReviewRecovery_();
    return employeeReviewFinish_(logs[0]);
  }
  var applications = employeeStoreRows_('applications').filter(function(a) { return a.applicationId === input.applicationId; });
  if (applications.length !== 1) employeeFailure_('APPLICATION_NOT_FOUND', '找不到唯一的申請資料。');
  var before = applications[0];
  if (employeeReviewPending_(before.applicationId, before.lineSub).length) employeeReviewRecovery_();
  if (before.status !== '待審核') employeeFailure_('APPLICATION_NOT_PENDING', '申請已非待審核，不可重複處理。');
  if (Number(before.version) !== input.expectedVersion) employeeFailure_('VERSION_CONFLICT', '申請版本已變更，請重新讀取。');
  if (before.type !== 'NEW_EMPLOYEE' || typeof before.lineSub !== 'string' || !before.lineSub ||
      String(before.channelId) !== context.channelId || typeof before.name !== 'string' || !before.name.trim()) {
    employeeFailure_('INVALID_APPROVAL_DATA', '申請資料不完整或來源不符，請人工確認。');
  }
  if (approve) employeeReviewAssertNew_(before);
  var bundle = employeeReviewBundle_(context, before, input, approve);
  var intent = { auditId: Utilities.getUuid(), requestId: requestId, requestHash: hash,
    employeeId: bundle.result.employeeId, employmentId: bundle.employment ? bundle.employment.employmentId : '',
    applicationId: before.applicationId, action: action, effectiveDate: approve ? input.hireDate : '',
    effectiveAt: new Date().toISOString(), beforeJson: JSON.stringify(before), afterJson: JSON.stringify(bundle),
    reason: input.adminNote, operatorSub: context.sub, operatorId: context.employee.employeeId,
    operatedAt: new Date().toISOString(), phase: 'STARTED', beforeVersion: before.version, afterVersion: bundle.application.version };
  employeeAuditAppend_(intent);
  return employeeReviewFinish_(intent);
}

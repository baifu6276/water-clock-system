// Phase 2 only. Called under the foundation write lock, AFTER LINE verification.
var EMPLOYEE_LIFECYCLE_TRANSITIONS_ = {
  employeeLifecycleSuspend: { from: ['在職'], to: '停職' },
  employeeLifecycleLeave: { from: ['在職'], to: '留停' },
  employeeLifecycleResume: { from: ['停職', '留停'], to: '在職' },
  employeeLifecycleTerminate: { from: ['在職', '停職', '留停'], to: '離職' }
};
function employeeLifecycleInput_(data) {
  if (typeof data.employeeId !== 'string' || !data.employeeId.trim() || data.employeeId.length > 100 ||
      typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000 ||
      !Number.isSafeInteger(data.expectedVersion) || data.expectedVersion < 1 ||
      typeof data.effectiveDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.effectiveDate) ||
      employeeLifecycleDate_(data.effectiveDate) !== data.effectiveDate) {
    employeeFailure_('VALIDATION_ERROR', '請提供員工、版本、原因及有效的西元年月日。');
  }
  if (data.effectiveDate > Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd')) {
    employeeFailure_('FUTURE_EFFECTIVE_DATE_UNSUPPORTED', '本階段不接受未來生效日期。');
  }
  return { employeeId: data.employeeId.trim(), expectedVersion: data.expectedVersion,
    reason: data.reason.trim(), effectiveDate: data.effectiveDate };
}
function employeeLifecyclePending_(id) {
  var logs = employeeStoreRows_('audit');
  return logs.filter(function(a) {
    return a.employeeId === id && a.phase === 'STARTED' && !logs.some(function(b) {
      return b.phase === 'COMPLETED' && b.operatorSub === a.operatorSub && b.requestId === a.requestId;
    });
  });
}
function employeeLifecycleTarget_(context, id) {
  var rows = employeeReviewMasterRows_().filter(function(r) { return employeeText_(r[0]) === id; });
  if (!rows.length) employeeFailure_('EMPLOYEE_NOT_FOUND', '找不到指定員工。');
  if (rows.length !== 1) employeeFailure_('IDENTITY_CONFLICT', '員工識別重複，請人工確認。');
  var role = employeeText_(rows[0][6]);
  if (['OWNER', 'ADMIN', 'SITE_MANAGER', 'EMPLOYEE'].indexOf(role) < 0 ||
      (context.employee.permission === 'ADMIN' && role === 'OWNER')) {
    employeeFailure_('FORBIDDEN', '沒有管理此員工的權限。');
  }
  return rows[0];
}
function employeeLifecycleBindingCheck_(context, master) {
  var id = employeeText_(master[0]), bindings = employeeStoreRows_('bindings');
  var own = bindings.filter(function(b) { return b.employeeId === id; });
  if (!own.length) employeeFailure_('BASELINE_REQUIRED', '需先完成受控的任職及 LINE 綁定基線。');
  var active = own.filter(function(b) { return employeeLifecycleBindingActive_(b, Date.now()); });
  if (active.length !== 1 || !active[0].lineSub || String(active[0].channelId) !== context.channelId ||
      active[0].lineSub !== employeeText_(master[1]) ||
      employeeLegacyRows_().filter(function(e) { return e.lineUid === active[0].lineSub; }).length !== 1) {
    employeeFailure_('BINDING_RECOVERY_REQUIRED', '登入綁定不明確，需人工確認；本功能不提供重新綁定。');
  }
  var resolved;
  try { resolved = employeeContext_({ sub: active[0].lineSub, channelId: context.channelId }); }
  catch (_) { employeeFailure_('BINDING_RECOVERY_REQUIRED', '登入綁定不明確，需人工確認。'); }
  if (!resolved.employee || resolved.employee.employeeId !== id) employeeFailure_('BINDING_RECOVERY_REQUIRED', '登入綁定不明確，需人工確認。');
}
function employeeLifecycleGuards_(context, master, action) {
  if (action === 'employeeLifecycleResume') return;
  var id = employeeText_(master[0]);
  if (employeeText_(master[6]) === 'OWNER') {
    var usable = employeeLegacyRows_().some(function(e) {
      if (e.employeeId === id || e.permission !== 'OWNER' || e.status !== '在職' || !e.lineUid || employeeLifecyclePending_(e.employeeId).length) return false;
      try {
        if (employeeLegacyRows_().filter(function(other) { return other.lineUid === e.lineUid; }).length !== 1) return false;
        if (employeeStoreRows_('bindings').some(function(b) { return b.employeeId === e.employeeId; })) {
          employeeLifecycleBindingCheck_(context, employeeLifecycleTarget_(context, e.employeeId));
        }
        var resolved = employeeContext_({ sub: e.lineUid, channelId: context.channelId });
        return resolved.employee && resolved.employee.employeeId === e.employeeId && employeeIdentityState_(resolved) === 'ACTIVE_EMPLOYEE';
      } catch (_) { return false; }
    });
    if (!usable) employeeFailure_('LAST_OWNER_REQUIRED', '必須先有另一位可正常登入的在職 OWNER。');
  }
  // Exact production helpers: 工地 L=施工中, G=主要領班ID; 工作區段 C/J/K.
  if (getActiveSites_().some(function(s) { return s.foremanId === id; })) {
    employeeFailure_('SITE_HANDOFF_REQUIRED', '此員工仍負責施工中工地，請先完成主要負責人交接。');
  }
  if (findOpenWorkSegment_(id)) employeeFailure_('OPEN_ATTENDANCE_REQUIRED', '此員工仍有未結束工作區段，請先依既有出勤流程處理。');
}
function employeeLifecycleMasterImage_(row) {
  // Business-only snapshot; LINE binding is checked separately, never copied into JSON.
  return employeeLifecycleMaster_(row, true);
}
function employeeLifecyclePeriodImage_(period) {
  var image = Object.assign({}, period);
  // Sheets can return calendar cells as Date/ISO after a successful setValues.
  ['startDate', 'endDate', 'baselineDate'].forEach(function(k) {
    if (image[k] && employeeLifecycleDate_(image[k])) image[k] = employeeLifecycleDate_(image[k]);
  });
  return image;
}
function employeeLifecycleInspectIntent_(context, intent, before, after) {
  if (!before || !after || before.format !== 2 || after.format !== 2 || !before.master || !after.master ||
      !before.period || !after.period || !after.result || before.master.employeeId !== intent.employeeId ||
      after.master.employeeId !== intent.employeeId || before.period.employmentId !== intent.employmentId ||
      after.period.employmentId !== intent.employmentId || before.period.employeeId !== intent.employeeId ||
      after.period.employeeId !== intent.employeeId || Number(after.period.version) !== Number(before.period.version) + 1) employeeReviewRecovery_();
  var master = employeeLifecycleTarget_(context, intent.employeeId), image = employeeLifecycleMasterImage_(master);
  var periods = employeeStoreRows_('employments').filter(function(p) { return p.employeeId === intent.employeeId; });
  var match = periods.filter(function(p) { return p.employmentId === intent.employmentId; });
  if (match.length !== 1 || periods.some(function(p) { return p.employmentId !== intent.employmentId && !p.endDate; })) employeeReviewRecovery_();
  var currentPeriod = employeeLifecyclePeriodImage_(match[0]);
  var masterDone = employeeReviewSame_(image, after.master), periodDone = employeeReviewSame_(currentPeriod, employeeLifecyclePeriodImage_(after.period));
  if ((!masterDone && !employeeReviewSame_(image, before.master)) || (!periodDone && !employeeReviewSame_(currentPeriod, employeeLifecyclePeriodImage_(before.period)))) employeeReviewRecovery_();
  // A later checkpoint with the earlier one missing cannot arise from this write order.
  if (intent.action === 'employeeLifecycleResume' ? masterDone && !periodDone : periodDone && !masterDone) employeeReviewRecovery_();
  employeeLifecycleBindingCheck_(context, master);
  if (employeeLifecyclePending_(intent.employeeId).some(function(a) { return a.requestId !== intent.requestId || a.operatorSub !== intent.operatorSub; })) employeeReviewRecovery_();
  if (!masterDone || !periodDone) employeeLifecycleGuards_(context, master, intent.action);
  return { masterDone: masterDone, periodDone: periodDone };
}
function employeeLifecycleFinish_(context, intent) {
  var before, after;
  try { before = JSON.parse(intent.beforeJson); after = JSON.parse(intent.afterJson); } catch (_) { employeeReviewRecovery_(); }
  var state = employeeLifecycleInspectIntent_(context, intent, before, after);
  function writeMaster() {
    if (state.masterDone) return;
    var sheet = employeeReviewMaster_(), rows = sheet.getDataRange().getValues(), matches = [];
    rows.forEach(function(r, i) { if (i && employeeText_(r[0]) === intent.employeeId) matches.push(i + 1); });
    if (matches.length !== 1) employeeReviewRecovery_();
    // Only J; termination writes I:J together. Never rewrite unrelated A:L cells.
    if (intent.action === 'employeeLifecycleTerminate') sheet.getRange(matches[0], 9, 1, 2).setValues([[after.master.terminationDate, after.master.employeeStatus]]);
    else sheet.getRange(matches[0], 10, 1, 1).setValues([[after.master.employeeStatus]]);
    SpreadsheetApp.flush();
  }
  function writePeriod() {
    if (state.periodDone) return;
    var sheet = employeeStoreSheet_('employments'), rows = sheet.getDataRange().getValues(), matches = [];
    rows.forEach(function(r, i) { if (i && r[0] === intent.employmentId) matches.push(i + 1); });
    if (matches.length !== 1) employeeReviewRecovery_();
    employeeWriteRow_('employments', after.period, matches[0]); SpreadsheetApp.flush();
  }
  // Disable access first; enable access last. Binding history stays immutable.
  if (intent.action === 'employeeLifecycleResume') { writePeriod(); writeMaster(); }
  else { writeMaster(); writePeriod(); }
  state = employeeLifecycleInspectIntent_(context, intent, before, after);
  if (!state.masterDone || !state.periodDone) employeeReviewRecovery_();
  employeeAuditAppend_(Object.assign({}, intent, { auditId: Utilities.getUuid(), phase: 'COMPLETED', operatedAt: new Date().toISOString() }));
  return after.result;
}
function employeeLifecycleMutate_(context, data) {
  employeeRequireReviewer_(context);
  var action = data.action.trim(), rule = EMPLOYEE_LIFECYCLE_TRANSITIONS_[action];
  var requestId = employeeRequestId_(data.requestId), input = employeeLifecycleInput_(data);
  ['employments', 'bindings', 'audit'].forEach(function(t) { employeeStoreSheet_(t); });
  var master = employeeLifecycleTarget_(context, input.employeeId);
  var hash = employeeHash_([action, context.sub, context.channelId, input]);
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.operatorSub === context.sub && a.requestId === requestId; });
  if (logs.length) {
    if (logs.some(function(a) { return a.requestHash !== hash || a.action !== action; })) employeeFailure_('REQUEST_CONFLICT', '相同請求編號的內容不同。');
    var completed = logs.filter(function(a) { return a.phase === 'COMPLETED'; });
    if (completed.length === 1) {
      var saved;
      try { saved = JSON.parse(completed[0].afterJson); } catch (_) { employeeReviewRecovery_(); }
      if (!saved || saved.format !== 2 || !saved.result) employeeReviewRecovery_();
      return saved.result;
    }
    if (logs.length !== 1 || logs[0].phase !== 'STARTED') employeeReviewRecovery_();
    return employeeLifecycleFinish_(context, logs[0]);
  }
  if (employeeLifecyclePending_(input.employeeId).length) employeeReviewRecovery_();
  if (rule.from.indexOf(employeeText_(master[9])) < 0) employeeFailure_('INVALID_STATUS_TRANSITION', '目前狀態不允許此操作；離職回任需使用未來的回任流程。');
  var periods = employeeStoreRows_('employments').filter(function(p) { return p.employeeId === input.employeeId; });
  if (!periods.length) employeeFailure_('BASELINE_REQUIRED', '尚無任職基線，請先完成受控基線程序。');
  var open = periods.filter(function(p) { return !p.endDate; });
  if (open.length !== 1 || open[0].status !== employeeText_(master[9]) || !open[0].employmentId ||
      periods.filter(function(p) { return p.employmentId === open[0].employmentId; }).length !== 1 || employeeText_(master[8])) {
    employeeFailure_('EMPLOYMENT_CONFLICT', '任職紀錄與員工主檔不一致，請人工確認。');
  }
  var period = open[0], version = Number(period.version);
  if (!Number.isSafeInteger(version) || version < 1 || version >= Number.MAX_SAFE_INTEGER) employeeReviewRecovery_();
  if (version !== input.expectedVersion) employeeFailure_('VERSION_CONFLICT', '任職版本已變更，請重新讀取。');
  // Known dates constrain chronology; unknown legacy dates remain unknown.
  var start = employeeLifecycleDate_(period.startDate);
  if ((start && input.effectiveDate < start) || (period.startDate && !start)) employeeFailure_('VALIDATION_ERROR', '生效日期不得早於任職開始日，任職日期需可辨識。');
  var prior = employeeStoreRows_('audit').filter(function(a) { return a.employmentId === period.employmentId && a.phase === 'COMPLETED' && Object.prototype.hasOwnProperty.call(EMPLOYEE_LIFECYCLE_TRANSITIONS_, a.action); });
  if (prior.some(function(a) { return a.effectiveDate > input.effectiveDate; })) employeeFailure_('VALIDATION_ERROR', '生效日期不得早於此任職期間已完成的狀態異動。');
  employeeLifecycleBindingCheck_(context, master);
  employeeLifecycleGuards_(context, master, action);
  var now = new Date().toISOString(), before = { format: 2, master: employeeLifecycleMasterImage_(master), period: period };
  var after = { format: 2, master: Object.assign({}, before.master, { employeeStatus: rule.to }),
    period: Object.assign({}, period, { status: rule.to, disabledAt: rule.to === '在職' ? '' : now, version: version + 1 }) };
  if (rule.to === '離職') {
    after.master.terminationDate = input.effectiveDate;
    Object.assign(after.period, { endDate: input.effectiveDate, terminationReason: input.reason,
      terminatedBy: context.employee.employeeId, terminatedAt: now });
  }
  after.result = { success: true, employeeId: input.employeeId, previousStatus: before.master.employeeStatus,
    employeeStatus: rule.to, effectiveDate: input.effectiveDate, version: version + 1, recoveryStatus: 'COMPLETED' };
  var intent = { auditId: Utilities.getUuid(), requestId: requestId, requestHash: hash, employeeId: input.employeeId,
    employmentId: period.employmentId, applicationId: '', action: action, effectiveDate: input.effectiveDate,
    effectiveAt: now, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), reason: input.reason,
    operatorSub: context.sub, operatorId: context.employee.employeeId, operatedAt: now, phase: 'STARTED',
    beforeVersion: version, afterVersion: version + 1 };
  employeeAuditAppend_(intent);
  return employeeLifecycleFinish_(context, intent);
}
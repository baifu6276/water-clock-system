// Controlled single-person legacy inheritance. Never writes the employee master.
function employeeBaselineId_(id) {
  if (typeof id !== 'string' || !id.trim() || id.length > 100) employeeFailure_('VALIDATION_ERROR', '請提供有效員工識別。');
  return id.trim();
}
function employeeBaselineSort_(rows) {
  return rows.slice().sort(function(a, b) { var x = JSON.stringify(a), y = JSON.stringify(b); return x < y ? -1 : x > y ? 1 : 0; });
}
function employeeBaselineState_(context, id) {
  var master = employeeLifecycleTarget_(context, id), uid = employeeText_(master[1]);
  var audit = employeeStoreRows_('audit').filter(function(a) { return a.employeeId === id || (uid && a.operatorSub === uid); });
  return { channelId: context.channelId, master: master,
    identityRows: employeeBaselineSort_(employeeReviewMasterRows_().filter(function(r) { return employeeText_(r[0]) === id || (uid && employeeText_(r[1]) === uid); })),
    periods: employeeBaselineSort_(employeeStoreRows_('employments').filter(function(p) { return p.employeeId === id; })),
    bindings: employeeBaselineSort_(employeeStoreRows_('bindings').filter(function(b) { return b.employeeId === id || (uid && b.lineSub === uid); })),
    audit: employeeBaselineSort_(audit) };
}
function employeeBaselineVersion_(state) { return employeeHash_(['LEGACY_BASELINE_SNAPSHOT_V1', state]); }
function employeeBaselineResult_(id, existing) {
  return { success: true, employeeId: id, baselineState: existing ? 'ALREADY_BASELINED' : 'RECORDED', version: 1, recoveryStatus: 'COMPLETED' };
}
function employeeBaselineDecode_(intent) {
  var bundle;
  try { bundle = JSON.parse(intent.afterJson); } catch (_) { employeeReviewRecovery_(); }
  if (!bundle || bundle.format !== 3 || !bundle.employment || !bundle.binding || !/^[a-f0-9]{64}$/.test(bundle.snapshotVersion || '') ||
      bundle.employment.employeeId !== intent.employeeId || bundle.binding.employeeId !== intent.employeeId ||
      bundle.employment.employmentId !== intent.employmentId || !bundle.binding.bindingId ||
      bundle.employment.sourceType !== 'LEGACY_BASELINE' || bundle.binding.sourceType !== 'LEGACY_BASELINE' ||
      bundle.employment.version !== 1 || bundle.binding.version !== 1) employeeReviewRecovery_();
  return bundle;
}
function employeeBaselineInspect_(state, intent, bundle) {
  var p = state.periods, b = state.bindings;
  var receipts = state.audit.filter(function(a) { return a.operatorSub === intent.operatorSub && a.requestId === intent.requestId; });
  if (receipts.filter(function(a) { return a.phase === 'STARTED'; }).length !== 1 ||
      receipts.filter(function(a) { return a.phase === 'COMPLETED'; }).length > 1 || receipts.some(function(a) {
        return a.action !== 'LEGACY_BASELINE' || a.requestHash !== intent.requestHash || a.afterJson !== intent.afterJson ||
          ['STARTED', 'COMPLETED'].indexOf(a.phase) < 0;
      })) employeeReviewRecovery_();
  if (p.length > 1 || b.length > 1 ||
      (p.length && !employeeReviewSame_(employeeLifecyclePeriodImage_(p[0]), employeeLifecyclePeriodImage_(bundle.employment))) ||
      (b.length && !employeeReviewSame_(b[0], bundle.binding)) || (b.length && !p.length)) employeeReviewRecovery_();
  // Remove ONLY this operation's provable checkpoints before comparing the original preview.
  var original = Object.assign({}, state, { periods: [], bindings: [], audit: state.audit.filter(function(a) {
    return !(a.operatorSub === intent.operatorSub && a.requestId === intent.requestId);
  }) });
  if (employeeBaselineVersion_(original) !== bundle.snapshotVersion) employeeReviewRecovery_();
  return { employmentDone: p.length === 1, bindingDone: b.length === 1 };
}
function employeeBaselineEligibility_(state) {
  var m = state.master, uid = employeeText_(m[1]), bindingSource = !uid ? 'MISSING' : state.identityRows.length !== 1 ? 'DUPLICATE' : 'PRESENT';
  var code = '', baseline = 'LEGACY_NOT_BASELINED';
  if (state.bindings.some(function(b) { return b.employeeId !== employeeText_(m[0]) || b.lineSub !== uid || String(b.channelId) !== state.channelId; })) bindingSource = 'CONFLICT';
  if (state.periods.length || state.bindings.length || state.audit.some(function(a) {
    return a.phase === 'STARTED' && !state.audit.some(function(b) { return b.phase === 'COMPLETED' && b.operatorSub === a.operatorSub && b.requestId === a.requestId; });
  })) {
    code = 'RECOVERY_REQUIRED'; baseline = 'CONFLICT';
    var complete = state.audit.filter(function(a) { return a.employeeId === employeeText_(m[0]) && a.action === 'LEGACY_BASELINE' && a.phase === 'COMPLETED'; });
    if (complete.length === 1) {
      try {
        var checked = employeeBaselineInspect_(state, complete[0], employeeBaselineDecode_(complete[0]));
        if (checked.employmentDone && checked.bindingDone) { code = ''; baseline = 'ALREADY_BASELINED'; }
      } catch (_) { /* Keep safe conflict classification. */ }
    }
  }
  if (!code && baseline !== 'ALREADY_BASELINED') {
    if (employeeText_(m[9]) !== '在職' || employeeText_(m[8]) ||
        (employeeText_(m[7]) && (!/^\d{4}-\d{2}-\d{2}$/.test(m[7]) || employeeLifecycleDate_(m[7]) !== m[7])) ||
        ['日薪', '月薪'].indexOf(employeeText_(m[4])) < 0 || typeof m[5] !== 'number' || !Number.isFinite(m[5]) || m[5] < 0) code = 'BASELINE_MANUAL_REVIEW_REQUIRED';
    else if (bindingSource !== 'PRESENT') code = 'BASELINE_LINE_IDENTITY_REQUIRED';
  }
  return { code: code, baselineState: baseline, bindingSource: bindingSource };
}
function employeeBaselinePreview_(context, id) {
  employeeRequireReviewer_(context);
  var state = employeeBaselineState_(context, employeeBaselineId_(id)), eligibility = employeeBaselineEligibility_(state);
  var master = employeeLifecycleMaster_(state.master, false);
  return { success: true, dryRun: true, employeeId: master.employeeId, name: master.name, employeeStatus: master.employeeStatus,
    grade: master.grade, salaryType: master.salaryType, salaryAmount: master.salaryAmount, systemRole: master.systemRole,
    hireDate: master.hireDate, bindingSource: eligibility.bindingSource, baselineState: eligibility.baselineState,
    eligible: !eligibility.code && eligibility.baselineState === 'LEGACY_NOT_BASELINED',
    warnings: (eligibility.code ? [eligibility.code] : []).concat(!employeeText_(state.master[7]) ? ['HIRE_DATE_UNKNOWN'] : []),
    snapshotVersion: employeeBaselineVersion_(state) };
}
function employeeBaselineFinish_(context, intent) {
  var bundle = employeeBaselineDecode_(intent), state = employeeBaselineState_(context, intent.employeeId);
  var check = employeeBaselineInspect_(state, intent, bundle);
  if (!check.employmentDone) { employeeWriteRow_('employments', bundle.employment); SpreadsheetApp.flush(); }
  if (!check.bindingDone) { employeeWriteRow_('bindings', bundle.binding); SpreadsheetApp.flush(); }
  check = employeeBaselineInspect_(employeeBaselineState_(context, intent.employeeId), intent, bundle);
  if (!check.employmentDone || !check.bindingDone) employeeReviewRecovery_();
  employeeAuditAppend_(Object.assign({}, intent, { auditId: Utilities.getUuid(), phase: 'COMPLETED', operatedAt: new Date().toISOString() }));
  return employeeBaselineResult_(intent.employeeId, false);
}
function employeeBaselineMigrate_(context, data) {
  employeeRequireReviewer_(context); // Dispatcher already re-resolved actor under lock.
  var id = employeeBaselineId_(data.employeeId), requestId = employeeRequestId_(data.requestId);
  if (data.confirmed !== true || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000 ||
      typeof data.expectedSnapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(data.expectedSnapshotVersion)) employeeFailure_('VALIDATION_ERROR', '請先預覽、明確確認並填寫原因。');
  var reason = data.reason.trim(), hash = employeeHash_(['LEGACY_BASELINE', context.sub, context.channelId, id, data.expectedSnapshotVersion, reason, true]);
  var state = employeeBaselineState_(context, id);
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.operatorSub === context.sub && a.requestId === requestId; });
  if (logs.length) {
    if (logs.some(function(a) { return a.action !== 'LEGACY_BASELINE' || a.requestHash !== hash; })) employeeFailure_('REQUEST_CONFLICT', '相同請求編號的內容不同。');
    var completed = logs.filter(function(a) { return a.phase === 'COMPLETED'; });
    if (completed.length === 1) { employeeBaselineDecode_(completed[0]); return employeeBaselineResult_(id, false); }
    if (logs.length !== 1 || logs[0].phase !== 'STARTED') employeeReviewRecovery_();
    return employeeBaselineFinish_(context, logs[0]);
  }
  if (employeeBaselineVersion_(state) !== data.expectedSnapshotVersion) employeeFailure_('VERSION_CONFLICT', '確認後資料已變更，請重新預覽。');
  var eligibility = employeeBaselineEligibility_(state);
  if (eligibility.code) employeeFailure_(eligibility.code, '目前資料不適合自動建立基線，請由管理員人工核對。');
  if (eligibility.baselineState === 'ALREADY_BASELINED') return employeeBaselineResult_(id, true);
  var now = new Date().toISOString(), day = Utilities.formatDate(new Date(now), 'Asia/Taipei', 'yyyy-MM-dd'), m = state.master;
  var employment = employeeReviewCanonical_('employments', {
    employmentId: Utilities.getUuid(), employeeId: id, sequence: 1, startDate: employeeText_(m[7]) ? employeeLifecycleDate_(m[7]) : '',
    status: '在職', grade: employeeText_(m[3]), salaryType: employeeText_(m[4]), salaryAmount: m[5], permission: employeeText_(m[6]),
    baselineDate: day, sourceType: 'LEGACY_BASELINE', createdBy: context.employee.employeeId, createdAt: now, version: 1,
    note: '既有主檔基線；序號僅為系統首筆任職紀錄，不代表首次入職。未知到職日保持空白。'
  });
  var binding = employeeReviewCanonical_('bindings', {
    bindingId: Utilities.getUuid(), employeeId: id, lineSub: employeeText_(m[1]), channelId: context.channelId,
    status: '有效', validFrom: now, sourceType: 'LEGACY_BASELINE', operatorId: context.employee.employeeId, operatedAt: now,
    reason: '承接既有主檔 LINE 身分；本次未驗證目標員工 token。', version: 1
  });
  var intent = { auditId: Utilities.getUuid(), requestId: requestId, requestHash: hash, employeeId: id, employmentId: employment.employmentId,
    applicationId: '', action: 'LEGACY_BASELINE', effectiveDate: day, effectiveAt: now,
    beforeJson: JSON.stringify({ format: 3, baselineState: 'LEGACY_NOT_BASELINED' }),
    afterJson: JSON.stringify({ format: 3, snapshotVersion: data.expectedSnapshotVersion, employment: employment, binding: binding }),
    reason: reason, operatorSub: context.sub, operatorId: context.employee.employeeId, operatedAt: now, phase: 'STARTED', beforeVersion: 0, afterVersion: 1 };
  employeeAuditAppend_(intent);
  return employeeBaselineFinish_(context, intent);
}

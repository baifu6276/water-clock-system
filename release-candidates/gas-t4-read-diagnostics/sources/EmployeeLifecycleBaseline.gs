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
function employeeBaselineResult_(id, existing, requestId) {
  return { success: true, employeeId: id, requestId: requestId, baselineState: existing ? 'ALREADY_BASELINED' : 'RECORDED', version: 1, recoveryStatus: 'COMPLETED' };
}
function employeeBaselineDecode_(intent) {
  var bundle;
  try { bundle = JSON.parse(intent.afterJson); } catch (_) { employeeReviewRecovery_(); }
  if (!bundle || [3, 4].indexOf(bundle.format) < 0 || !bundle.employment || !bundle.binding || !/^[a-f0-9]{64}$/.test(bundle.snapshotVersion || '') ||
      bundle.employment.employeeId !== intent.employeeId || bundle.binding.employeeId !== intent.employeeId ||
      bundle.employment.employmentId !== intent.employmentId || !bundle.binding.bindingId ||
      bundle.employment.sourceType !== 'LEGACY_BASELINE' || bundle.binding.sourceType !== 'LEGACY_BASELINE' ||
      bundle.employment.version !== 1 || bundle.binding.version !== 1) employeeReviewRecovery_();
  if (bundle.format === 4) {
    var before;
    try { before = JSON.parse(intent.beforeJson); } catch (_) { employeeReviewRecovery_(); }
    if (Object.keys(bundle).sort().join('|') !== 'approvalReference|binding|employment|format|snapshotVersion|source|warnings' ||
        bundle.source !== 'T4_CONTROLLED_BASELINE_V1' || !employeeBaselineApprovalRef_(bundle.approvalReference) ||
        !before || Object.keys(before).sort().join('|') !== 'baselineState|format|master' || before.format !== 4 ||
        before.baselineState !== 'LEGACY_NOT_BASELINED' || !Array.isArray(before.master) || before.master.length !== 12 ||
        before.master[0] !== intent.employeeId || before.master.some(function(v) { return v !== null && !['string', 'number', 'boolean'].includes(typeof v); }) ||
        !employeeReviewSame_(bundle.warnings, before.master[7] ? [] : ['HIRE_DATE_UNKNOWN'])) employeeReviewRecovery_();
  }
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
  if (bundle.format === 4 && !employeeReviewSame_(JSON.parse(intent.beforeJson).master, state.master)) employeeReviewRecovery_();
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
  return employeeBaselineResult_(intent.employeeId, false, intent.requestId);
}
function employeeBaselineMigrate_(context, data) {
  employeeRequireReviewer_(context); // Dispatcher already re-resolved actor under lock.
  employeeBaselineStrictInput_(data);
  var id = employeeBaselineId_(data.employeeId), requestId = employeeRequestId_(data.requestId);
  if (data.confirmed !== true || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000 ||
      typeof data.expectedSnapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(data.expectedSnapshotVersion)) employeeFailure_('VALIDATION_ERROR', '請先預覽、明確確認並填寫原因。');
  var reason = data.reason.trim(), hash = employeeHash_(['LEGACY_BASELINE', context.sub, context.channelId, id, data.expectedSnapshotVersion, reason, true]);
  var state = employeeBaselineState_(context, id);
  var logs = employeeStoreRows_('audit').filter(function(a) { return a.requestId === requestId; });
  if (logs.length) {
    if (logs.some(function(a) { return a.operatorSub !== context.sub || a.operatorId !== context.employee.employeeId || a.action !== 'LEGACY_BASELINE' || a.requestHash !== hash; })) employeeFailure_('REQUEST_CONFLICT', '相同請求編號的內容不同。');
    var status = employeeBaselineStatusEvidence_(context, id, requestId, state, logs);
    if (status.requestStatus === 'COMPLETED' && status.currentConsistency === 'MATCHED') return employeeBaselineResult_(id, false, requestId);
    if (status.requestStatus !== 'STARTED' || logs.length !== 1 || employeeBaselineDecode_(logs[0]).format !== 4) employeeReviewRecovery_();
    employeeBaselineClaim_(context, data, hash, 'RECOVER_ORIGINAL');
    return employeeBaselineFinish_(context, logs[0]);
  }
  if (employeeBaselineVersion_(state) !== data.expectedSnapshotVersion) employeeFailure_('VERSION_CONFLICT', '確認後資料已變更，請重新預覽。');
  var eligibility = employeeBaselineEligibility_(state);
  if (eligibility.code) employeeFailure_(eligibility.code, '目前資料不適合自動建立基線，請由管理員人工核對。');
  if (eligibility.baselineState === 'ALREADY_BASELINED') employeeBaselineDenied_();
  var permit = employeeBaselineClaim_(context, data, hash, 'INITIAL');
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
    beforeJson: JSON.stringify({ format: 4, baselineState: 'LEGACY_NOT_BASELINED', master: state.master }),
    afterJson: JSON.stringify({ format: 4, snapshotVersion: data.expectedSnapshotVersion, employment: employment, binding: binding,
      source: 'T4_CONTROLLED_BASELINE_V1', approvalReference: permit.approvalReference, warnings: employeeText_(m[7]) ? [] : ['HIRE_DATE_UNKNOWN'] }),
    reason: reason, operatorSub: context.sub, operatorId: context.employee.employeeId, operatedAt: now, phase: 'STARTED', beforeVersion: 0, afterVersion: 1 };
  // Validate the exact proposed receipt without writing it. A consumed permit
  // with no STARTED is intentionally recoverable only by manual re-approval.
  var proposed = Object.assign({}, state, { audit: state.audit.concat([intent]) });
  if (employeeBaselineStatusEvidence_(context, id, requestId, proposed, [intent]).requestStatus !== 'STARTED') employeeReviewRecovery_();
  employeeAuditAppend_(intent);
  return employeeBaselineFinish_(context, intent);
}

// Pure status query: never use employeeWithLock_ (its finally flushes).
function employeeBaselineStatusResult_(id, requestId, status, historical, consistency) {
  return { success: true, employeeId: id, requestId: requestId, action: 'employeeLifecycleBaselineMigrate',
    requestStatus: status, historicalCompletion: historical, currentConsistency: consistency,
    recoveryAllowed: false, newRequestAllowed: false };
}
function employeeBaselineRequestStatus_(context, data, diagnostic) {
  var keys = ['action', 'idToken', 'employeeId', 'requestId'];
  if (Object.keys(data).some(function(k) { return keys.indexOf(k) < 0; })) employeeFailure_('VALIDATION_ERROR', '請檢查查詢欄位。');
  var id = employeeBaselineId_(data.employeeId), requestId = employeeRequestId_(data.requestId);
  employeeRequireReviewer_(context);
  employeeLifecycleTarget_(context, id);
  var lock = LockService.getScriptLock();
  if (diagnostic) diagnostic.enter('LOCK_WAIT');
  var acquired = lock.tryLock(1000);
  if (diagnostic) diagnostic.enter('ACTION_READ');
  if (!acquired) return employeeBaselineStatusResult_(id, requestId, 'UNKNOWN', null, 'UNKNOWN');
  try {
    if (diagnostic) { diagnostic.revoke(); diagnostic.enter('EMPLOYEE_CONTEXT'); }
    context = employeeContext_(context);
    if (diagnostic) diagnostic.enter('ACTION_READ');
    employeeRequireReviewer_(context);
    if (diagnostic) diagnostic.expose(context);
    var master = employeeLifecycleTarget_(context, id), uid = employeeText_(master[1]);
    var audit = employeeStoreRows_('audit');
    var state = { channelId: context.channelId, master: master,
      identityRows: employeeBaselineSort_(employeeReviewMasterRows_().filter(function(r) { return employeeText_(r[0]) === id || (uid && employeeText_(r[1]) === uid); })),
      periods: employeeBaselineSort_(employeeStoreRows_('employments').filter(function(p) { return p.employeeId === id; })),
      bindings: employeeBaselineSort_(employeeStoreRows_('bindings').filter(function(b) { return b.employeeId === id || (uid && b.lineSub === uid); })),
      audit: employeeBaselineSort_(audit.filter(function(a) { return a.employeeId === id || (uid && a.operatorSub === uid); })) };
    var matches = audit.filter(function(a) { return a.requestId === requestId; });
    // Foreign/rebound identities get the same response as absence. Only a caller
    // with its own receipt can see a generic conflict, never the other actor.
    var own = matches.filter(function(a) { return a.operatorSub === context.sub && a.operatorId === context.employee.employeeId; });
    if (!own.length) {
      return employeeBaselineStatusResult_(id, requestId, 'NOT_OBSERVED', false, 'UNKNOWN');
    }
    if (own.length !== matches.length) return employeeBaselineStatusResult_(id, requestId, 'RECOVERY_REQUIRED', null, 'CONFLICT');
    return employeeBaselineStatusEvidence_(context, id, requestId, state, matches);
  } finally { lock.releaseLock(); }
}
function employeeBaselineStatusEvidence_(context, id, requestId, state, matches) {
  var historical = null;
  try {
    var starts = matches.filter(function(a) { return a.phase === 'STARTED'; });
    var ends = matches.filter(function(a) { return a.phase === 'COMPLETED'; });
    if (starts.length !== 1 || ends.length > 1 || matches.length !== starts.length + ends.length) employeeReviewRecovery_();
    var intent = starts[0], bundle = employeeBaselineDecode_(intent), p = bundle.employment, b = bundle.binding;
    var validTime = function(v) { return typeof v === 'string' && Boolean(v) && Number.isFinite(new Date(v).getTime()); };
    if (intent.action !== 'LEGACY_BASELINE' || intent.employeeId !== id || intent.applicationId !== '' ||
        intent.beforeVersion !== 0 || intent.afterVersion !== 1 || !intent.auditId ||
        typeof intent.reason !== 'string' || !intent.reason.trim() || intent.reason.length > 1000 ||
        !validTime(intent.operatedAt) || !validTime(intent.effectiveAt) ||
        (bundle.format === 3 && intent.beforeJson !== JSON.stringify({ format: 3, baselineState: 'LEGACY_NOT_BASELINED' })) ||
        !employeeReviewSame_(p, employeeReviewCanonical_('employments', p)) ||
        !employeeReviewSame_(b, employeeReviewCanonical_('bindings', b)) ||
        !p.employmentId || p.sequence !== 1 || p.status !== '在職' || p.endDate !== '' || p.disabledAt !== '' ||
        (p.startDate !== '' && employeeLifecycleDate_(p.startDate) !== p.startDate) ||
        ['日薪', '月薪'].indexOf(p.salaryType) < 0 || typeof p.salaryAmount !== 'number' || !Number.isFinite(p.salaryAmount) || p.salaryAmount < 0 ||
        ['OWNER', 'ADMIN', 'SITE_MANAGER', 'EMPLOYEE'].indexOf(p.permission) < 0 ||
        p.createdBy !== context.employee.employeeId || p.createdAt !== intent.effectiveAt ||
        p.baselineDate !== intent.effectiveDate || p.baselineDate !== Utilities.formatDate(new Date(p.createdAt), 'Asia/Taipei', 'yyyy-MM-dd') ||
        !b.lineSub || b.channelId !== context.channelId || b.status !== '有效' || b.validTo !== '' ||
        b.validFrom !== p.createdAt || b.operatedAt !== p.createdAt || b.operatorId !== p.createdBy ||
        intent.requestHash !== employeeHash_(['LEGACY_BASELINE', context.sub, context.channelId, id, bundle.snapshotVersion, intent.reason.trim(), true])) employeeReviewRecovery_();
    if (ends.length) {
      var done = ends[0];
      if (!done.auditId || done.auditId === intent.auditId || !validTime(done.operatedAt) ||
          new Date(done.operatedAt).getTime() < new Date(intent.operatedAt).getTime() ||
          EMPLOYEE_TABLES_.audit.keys.some(function(k) { return ['auditId', 'phase', 'operatedAt'].indexOf(k) < 0 && done[k] !== intent[k]; })) employeeReviewRecovery_();
      historical = true;
    } else historical = false;
    // Original snapshot verification deliberately rejects unexplained later changes.
    // No CHANGED_WITH_AUDIT claim without a full subsequent-chain verifier.
    var check = employeeBaselineInspect_(state, intent, bundle);
    if (historical && (!check.employmentDone || !check.bindingDone)) employeeReviewRecovery_();
    return employeeBaselineStatusResult_(id, requestId, historical ? 'COMPLETED' : 'STARTED', historical,
      check.bindingDone ? 'MATCHED' : check.employmentDone ? 'PARTIAL' : 'ABSENT');
  } catch (_) {
    return employeeBaselineStatusResult_(id, requestId, 'RECOVERY_REQUIRED', historical, 'CONFLICT');
  }
}

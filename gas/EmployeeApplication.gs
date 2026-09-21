var EMPLOYEE_ACTIONS_ = ['identityBootstrap', 'employeeApplicationSubmit', 'employeeApplicationListOwn',
  'employeeApplicationCancel', 'employeeLifecycleBaselineDryRun', 'employeeApplicationAdminList',
  'employeeApplicationApprove', 'employeeApplicationReject', 'employeeLifecycleAdminList', 'employeeLifecycleAdminDetail',
  'employeeLifecycleSuspend', 'employeeLifecycleLeave', 'employeeLifecycleResume', 'employeeLifecycleTerminate', 'employeeLifecycleBaselineMigrate'];

// Malformed/legacy requests retain the original doPost error and lock behavior.
function employeeFoundationRequest_(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    return data && typeof data.action === 'string' && EMPLOYEE_ACTIONS_.indexOf(data.action.trim()) >= 0 ? data : null;
  } catch (_) { return null; }
}
function handleEmployeeFoundation_(data) {
  var stage = 'VERIFY';
  try {
    var verified = verifyLiffIdentity_(data.idToken);
    stage = 'LOOKUP';
    var context = employeeContext_(verified); // No ScriptLock during LINE request.
    stage = 'ACTION';
    var action = data.action.trim(), result;
    if (action === 'identityBootstrap') result = employeeBootstrap_(context);
    else if (action === 'employeeApplicationListOwn') result = { success: true, applications: employeeOwnApplications_(context).map(employeePublicApplication_) };
    else if (action === 'employeeLifecycleBaselineDryRun') result = employeeLifecycleBaselineDryRun_(context, data);
    else if (action === 'employeeApplicationAdminList') result = employeeApplicationAdminList_(context, data);
    else if (action === 'employeeLifecycleAdminList' || action === 'employeeLifecycleAdminDetail') result = employeeLifecycleRead_(context, data);
    else result = employeeWithLock_(function() {
      // Re-read employee state under the write lock, without re-sending token to LINE.
      context = employeeContext_(context);
      if (action === 'employeeLifecycleBaselineMigrate') return employeeBaselineMigrate_(context, data);
      if (Object.prototype.hasOwnProperty.call(EMPLOYEE_LIFECYCLE_TRANSITIONS_, action)) return employeeLifecycleMutate_(context, data);
      if (action === 'employeeApplicationApprove' || action === 'employeeApplicationReject') {
        return employeeApplicationReview_(context, data, action === 'employeeApplicationApprove');
      }
      if (action === 'employeeApplicationSubmit') return employeeSubmit_(context, data);
      return employeeCancel_(context, data);
    });
    return jsonResponse_(result);
  } catch (error) {
    // Only locally authored errors may cross the API boundary.
    return jsonResponse_({ success: false, code: error.employeeCode || 'OPERATION_ERROR',
      state: error.employeeCode === 'AUTH_ERROR' ? 'AUTH_ERROR' : undefined,
      diagnosticCode: error.employeeDiagnosticCode || (error.employeeCode === 'SCHEMA_ERROR' ? 'BACKEND_SCHEMA_ERROR' :
        error.employeeCode === 'IDENTITY_CONFLICT' ? 'BACKEND_IDENTITY_CONFLICT' :
        !error.employeeCode ? (stage === 'LOOKUP' ? 'BACKEND_LOOKUP_ERROR' : 'BACKEND_INTERNAL_ERROR') : undefined),
      message: error.employeeCode ? error.message : '操作結果尚未確認，請以原操作重試或聯絡管理員。' });
  }
}
function employeeOwnApplications_(context) {
  return employeeStoreRows_('applications', true).filter(function(a) {
    return a.lineSub === context.sub && String(a.channelId) === context.channelId;
  });
}
function employeePublicApplication_(a) {
  return { applicationId: a.applicationId, type: a.type, name: a.name, phone: a.phone, note: a.note,
    status: a.status, createdAt: a.createdAt, cancelledAt: a.cancelledAt, version: a.version };
}
function employeeBootstrap_(context) {
  var state = employeeIdentityState_(context);
  // Existing employees do not depend on the application table being provisioned.
  if (state === 'UNREGISTERED' && employeeOwnApplications_(context).some(function(a) { return a.status === '待審核'; })) state = 'APPLICATION_PENDING';
  return { success: true, state: state,
    employee: context.employee ? { employeeId: context.employee.employeeId, name: context.employee.name, permission: context.employee.permission } : null };
}
function employeeApplicationResult_(application) {
  return { success: true, application: employeePublicApplication_(application) };
}
function employeeSubmit_(context, data) {
  var requestId = employeeRequestId_(data.requestId);
  if (data.type !== 'NEW_EMPLOYEE') employeeFailure_('VALIDATION_ERROR', '目前只提供新人加入申請。');
  if (typeof data.name !== 'string' || typeof data.phone !== 'string' || (data.note != null && typeof data.note !== 'string')) {
    employeeFailure_('VALIDATION_ERROR', '請填寫姓名、手機與申請說明。');
  }
  var name = data.name.trim(), phone = data.phone.trim(), note = (data.note || '').trim();
  if (!name || name.length > 80 || !/^[+0-9 ()-]{6,30}$/.test(phone) || note.length > 1000) {
    employeeFailure_('VALIDATION_ERROR', '請檢查姓名、手機格式及說明長度。');
  }
  var hash = employeeHash_(['SUBMIT', context.sub, context.channelId, data.type, name, phone, note]);
  employeeStoreSheet_('applications'); employeeStoreSheet_('audit');
  var replay = employeeReplay_(context, requestId, hash);
  if (replay) return employeeApplicationResult_(replay);
  if (context.employee) employeeFailure_('ALREADY_EMPLOYEE', '已有員工資料，請聯絡管理員處理。');
  employeeEnsureNoPendingIntent_(context);
  var pending = employeeOwnApplications_(context).filter(function(a) { return a.status === '待審核'; });
  if (pending.length > 1) employeeFailure_('DATA_CONFLICT', '申請資料需要管理員確認。');
  if (pending.length) {
    if (employeeReviewPending_(pending[0].applicationId).length) employeeReviewRecovery_();
    // Record the request receipt without creating another application. A later
    // retry of this request must still detect a changed payload after cancellation.
    employeeAuditAppend_({ auditId: Utilities.getUuid(), requestId: requestId, requestHash: hash,
      employeeId: '', employmentId: '', applicationId: pending[0].applicationId, action: 'APPLICATION_SUBMIT_EXISTING',
      effectiveDate: '', effectiveAt: '', beforeJson: JSON.stringify(pending[0]), afterJson: JSON.stringify(pending[0]),
      reason: '', operatorSub: context.sub, operatorId: '', operatedAt: new Date().toISOString(), phase: 'COMPLETED',
      beforeVersion: pending[0].version, afterVersion: pending[0].version });
    return employeeApplicationResult_(pending[0]);
  }
  var after = { applicationId: Utilities.getUuid(), requestId: requestId, requestHash: hash,
    type: 'NEW_EMPLOYEE', lineSub: context.sub, channelId: context.channelId, name: name, phone: phone,
    note: note, status: '待審核', createdAt: new Date().toISOString(), version: 1 };
  return employeeApplicationResult_(employeeMutateApplication_(context, requestId, hash, 'APPLICATION_SUBMIT', null, after));
}
function employeeCancel_(context, data) {
  var requestId = employeeRequestId_(data.requestId);
  if (typeof data.applicationId !== 'string' || !Number.isInteger(data.expectedVersion) || data.expectedVersion < 1) {
    employeeFailure_('VALIDATION_ERROR', '請重新讀取申請資料。');
  }
  var owned = employeeOwnApplications_(context).filter(function(a) { return a.applicationId === data.applicationId; });
  if (owned.length !== 1) employeeFailure_('FORBIDDEN', '無法操作這筆申請。');
  var hash = employeeHash_(['CANCEL', context.sub, context.channelId, data.applicationId, data.expectedVersion]);
  var replay = employeeReplay_(context, requestId, hash);
  if (replay) return employeeApplicationResult_(replay);
  employeeEnsureNoPendingIntent_(context);
  var before = owned[0];
  if (employeeReviewPending_(before.applicationId).length) employeeReviewRecovery_();
  if (Number(before.version) !== data.expectedVersion) employeeFailure_('VERSION_CONFLICT', '申請已變更，請重新讀取。');
  if (before.status !== '待審核') employeeFailure_('INVALID_STATE', '只能取消待審核申請。');
  var after = Object.assign({}, before, { status: '已取消', cancelledAt: new Date().toISOString(), version: data.expectedVersion + 1 });
  return employeeApplicationResult_(employeeMutateApplication_(context, requestId, hash, 'APPLICATION_CANCEL', before, after));
}

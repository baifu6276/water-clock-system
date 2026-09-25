var EMPLOYEE_ACTIONS_ = ['identityBootstrap', 'employeeApplicationSubmit', 'employeeApplicationListOwn',
  'employeeApplicationCancel', 'employeeLifecycleBaselineDryRun', 'employeeApplicationAdminList',
  'employeeApplicationApprove', 'employeeApplicationReject', 'employeeLifecycleAdminList', 'employeeLifecycleAdminDetail',
  'employeeLifecycleSuspend', 'employeeLifecycleLeave', 'employeeLifecycleResume', 'employeeLifecycleTerminate', 'employeeLifecycleBaselineMigrate', 'employeeLifecycleBaselineRequestStatus'];

// Malformed/legacy requests retain the original doPost error and lock behavior.
function employeeFoundationRequest_(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    // Reserved transport metadata must never fall through to a legacy write action.
    if (data && !Array.isArray(data) && typeof data === 'object' &&
        Object.prototype.hasOwnProperty.call(data, '_transportDiagnostics')) return data;
    return data && typeof data.action === 'string' && EMPLOYEE_ACTIONS_.indexOf(data.action.trim()) >= 0 ? data : null;
  } catch (_) { return null; }
}
function handleEmployeeFoundation_(data, diagnosticDeps) {
  var stage = 'VERIFY';
  var diagnostic, traceId;
  try {
    var separated = employeeReadDiagnosticInput_(data);
    data = separated.data;
    traceId = separated.traceId;
    if (traceId && employeeReadDiagnosticEnabled_()) {
      try {
        diagnostic = employeeReadDiagnostics_(diagnosticDeps && diagnosticDeps.now || Date.now);
        diagnostic.start();
      } catch (_) { diagnostic = undefined; }
    }
    var verified = verifyLiffIdentity_(data.idToken);
    stage = 'LOOKUP';
    if (diagnostic) diagnostic.enter('EMPLOYEE_CONTEXT');
    var context = employeeContext_(verified); // No ScriptLock during LINE request.
    if (diagnostic) { diagnostic.expose(context); diagnostic.enter('ACTION_READ'); }
    stage = 'ACTION';
    var action = data.action.trim(), result;
    if (action === 'identityBootstrap') result = employeeBootstrap_(context);
    else if (action === 'employeeLifecycleBaselineRequestStatus') result = employeeBaselineRequestStatus_(context, data, diagnostic);
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
    return jsonResponse_(employeeReadDiagnosticResponse_(result, diagnostic, traceId));
  } catch (error) {
    // Only locally authored errors may cross the API boundary.
    var failure = { success: false, code: error.employeeCode || 'OPERATION_ERROR',
      state: error.employeeCode === 'AUTH_ERROR' ? 'AUTH_ERROR' : undefined,
      diagnosticCode: error.employeeDiagnosticCode || (error.employeeCode === 'SCHEMA_ERROR' ? 'BACKEND_SCHEMA_ERROR' :
        error.employeeCode === 'IDENTITY_CONFLICT' ? 'BACKEND_IDENTITY_CONFLICT' :
        !error.employeeCode ? (stage === 'LOOKUP' ? 'BACKEND_LOOKUP_ERROR' : 'BACKEND_INTERNAL_ERROR') : undefined),
      message: error.employeeCode ? error.message : '操作結果尚未確認，請以原操作重試或聯絡管理員。' };
    return jsonResponse_(employeeReadDiagnosticResponse_(failure, diagnostic, traceId));
  }
}
// Read diagnostics are request-local. No logging, storage, hashes or authorization tokens.
function employeeReadDiagnosticInput_(data) {
  if (!Object.prototype.hasOwnProperty.call(data, '_transportDiagnostics')) return { data: data };
  var actions = ['identityBootstrap', 'employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus'];
  var meta = data._transportDiagnostics;
  if (typeof data.action !== 'string' || actions.indexOf(data.action.trim()) < 0 ||
      !meta || typeof meta !== 'object' || Array.isArray(meta) || Object.keys(meta).length !== 2 ||
      !Object.prototype.hasOwnProperty.call(meta, 'version') || !Object.prototype.hasOwnProperty.call(meta, 'traceId') ||
      meta.version !== 1 || typeof meta.traceId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(meta.traceId)) {
    employeeFailure_('VALIDATION_ERROR', '診斷請求格式不正確。');
  }
  var business = Object.create(null);
  Object.keys(data).forEach(function(key) { if (key !== '_transportDiagnostics') business[key] = data[key]; });
  return { data: business, traceId: meta.traceId };
}
function employeeReadDiagnosticEnabled_() {
  try { return PropertiesService.getScriptProperties().getProperty('READ_DIAGNOSTICS_ENABLED') === 'true'; }
  catch (_) { return false; }
}
function employeeReadDiagnostics_(now) {
  var keys = ['VERIFY_LINE', 'EMPLOYEE_CONTEXT', 'ACTION_READ', 'LOCK_WAIT', 'RESPONSE_PREP'];
  var elapsed = {}, seen = {}, available = true, eligible = false, started = false, closed = false;
  var last, start, entered, active;
  keys.forEach(function(key) { elapsed[key] = 0; });
  function read() {
    if (!available) return 0;
    try {
      var value = now();
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (last !== undefined && value < last)) throw new Error();
      last = value; return value;
    } catch (_) { available = false; return 0; }
  }
  function bucket(ms) {
    return ms < 100 ? 'LT_100' : ms < 500 ? 'MS_100_499' : ms < 2000 ? 'MS_500_1999' :
      ms < 5000 ? 'MS_2000_4999' : ms < 10000 ? 'MS_5000_9999' : ms < 20000 ? 'MS_10000_19999' : 'MS_GE_20000';
  }
  return {
    start: function() {
      if (closed || started) return;
      started = true; start = entered = read(); active = 'VERIFY_LINE'; seen[active] = true;
    },
    enter: function(key) {
      if (closed || !started || !available) return;
      if (keys.indexOf(key) < 0) { available = false; return; }
      var time = read();
      if (!available) return;
      elapsed[active] += time - entered; active = key; entered = time; seen[key] = true;
    },
    revoke: function() { eligible = false; },
    expose: function(context) {
      eligible = false;
      try { eligible = Boolean(context && context.employee && context.employee.status === '在職' &&
        ['OWNER', 'ADMIN'].indexOf(context.employee.permission) >= 0); }
      catch (_) { available = false; }
    },
    freeze: function(traceId) {
      if (closed || !started) return;
      closed = true;
      var time = read(); // Final clock sample; serialization and ContentService are excluded.
      if (!available || !eligible) return;
      try {
        elapsed[active] += time - entered;
        var stages = {};
        keys.forEach(function(key) { stages[key] = seen[key] ? bucket(elapsed[key]) : 'NOT_RUN'; });
        return Object.freeze({ version: 1, transportTraceId: traceId, total: bucket(time - start), stages: Object.freeze(stages) });
      } catch (_) { return; }
    }
  };
}
function employeeReadDiagnosticResponse_(result, diagnostic, traceId) {
  if (!diagnostic) return result;
  try {
    diagnostic.enter('RESPONSE_PREP');
    var snapshot = diagnostic.freeze(traceId);
    if (snapshot) return Object.assign({}, result, { _gasReadDiagnostics: snapshot });
  } catch (_) { /* Diagnostics never replace a business result or safe error. */ }
  return result;
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

// T4 single-operation interlock. Private editor helpers are NEVER dispatcher actions.
// No token, request body, or raw exception is stored or logged here.
var EMPLOYEE_BASELINE_CONTROL_KEY_ = 'T4_EMP001_BASELINE_CONTROL';
function employeeBaselineDenied_() {
  employeeFailure_('CONTROLLED_MIGRATION_DENIED', '受控操作尚未獲准，請停止寫入並交由管理員核對。');
}
function employeeBaselineStrictInput_(data) {
  var keys = ['action', 'idToken', 'employeeId', 'requestId', 'expectedSnapshotVersion', 'reason', 'confirmed'];
  if (!data || Array.isArray(data) || Object.keys(data).length !== keys.length ||
      keys.some(function(k) { return !Object.prototype.hasOwnProperty.call(data, k); }) ||
      data.action !== 'employeeLifecycleBaselineMigrate' || data.employeeId !== 'EMP001' ||
      typeof data.idToken !== 'string' || !data.idToken.trim() || data.idToken.length > 12000 ||
      typeof data.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(data.requestId) || /^status-probe-/.test(data.requestId) ||
      typeof data.expectedSnapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(data.expectedSnapshotVersion) ||
      typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000 || data.confirmed !== true) {
    employeeFailure_('VALIDATION_ERROR', '請檢查受控操作欄位；本功能只允許 EMP001。');
  }
}
function employeeBaselineControlRead_() {
  var value = PropertiesService.getScriptProperties().getProperty(EMPLOYEE_BASELINE_CONTROL_KEY_);
  if (!value) return null;
  var c;
  try { c = JSON.parse(value); } catch (_) { employeeBaselineDenied_(); }
  var keys = ['format', 'employeeId', 'operatorId', 'operatorRole', 'requestId', 'requestHash', 'snapshotVersion',
    'approvalReference', 'approvedBy', 'mode', 'state', 'generation', 'history'];
  if (!c || Array.isArray(c) || Object.keys(c).length !== keys.length || keys.some(function(k) { return !Object.prototype.hasOwnProperty.call(c, k); }) ||
      c.format !== 1 || c.employeeId !== 'EMP001' || typeof c.operatorId !== 'string' || !c.operatorId ||
      ['OWNER', 'ADMIN'].indexOf(c.operatorRole) < 0 || typeof c.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(c.requestId) ||
      typeof c.requestHash !== 'string' || !/^[a-f0-9]{64}$/.test(c.requestHash) ||
      typeof c.snapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(c.snapshotVersion) ||
      !employeeBaselineApprovalRef_(c.approvalReference) || typeof c.approvedBy !== 'string' || !c.approvedBy ||
      ['INITIAL', 'RECOVER_ORIGINAL'].indexOf(c.mode) < 0 || ['ARMED', 'CLAIMED', 'CLOSED'].indexOf(c.state) < 0 ||
      !Number.isSafeInteger(c.generation) || c.generation < 1 || !Array.isArray(c.history) || !c.history.length ||
      c.history.length > 30 || c.history.some(function(h) {
        return !h || Object.keys(h).sort().join('|') !== 'approvalReference|approvedBy|generation|mode|state|time' ||
          !Number.isSafeInteger(h.generation) || h.generation < 1 || h.generation > c.generation ||
          ['INITIAL', 'RECOVER_ORIGINAL'].indexOf(h.mode) < 0 || ['ARMED', 'CLAIMED', 'CLOSED'].indexOf(h.state) < 0 ||
          !employeeBaselineApprovalRef_(h.approvalReference) || typeof h.approvedBy !== 'string' || !h.approvedBy ||
          typeof h.time !== 'string' || !Number.isFinite(new Date(h.time).getTime());
      })) employeeBaselineDenied_();
  var last = c.history[c.history.length - 1];
  c.history.forEach(function(h, i) {
    if (!i) {
      if (h.generation !== 1 || h.state !== 'ARMED' || h.mode !== 'INITIAL') employeeBaselineDenied_();
      return;
    }
    var previous = c.history[i - 1];
    if (previous.state === 'CLOSED' || new Date(h.time).getTime() < new Date(previous.time).getTime()) employeeBaselineDenied_();
    if (h.state === 'ARMED') {
      if (previous.state !== 'CLAIMED' || h.generation !== previous.generation + 1) employeeBaselineDenied_();
    } else {
      if (h.generation !== previous.generation || h.mode !== previous.mode ||
          (h.state === 'CLAIMED' && (previous.state !== 'ARMED' || h.approvalReference !== previous.approvalReference || h.approvedBy !== previous.approvedBy))) employeeBaselineDenied_();
    }
  });
  if (['generation', 'mode', 'state', 'approvalReference', 'approvedBy'].some(function(k) { return last[k] !== c[k]; })) employeeBaselineDenied_();
  return c;
}
function employeeBaselineApprovalRef_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
}
function employeeBaselineControlPersist_(c) {
  if (c.history.length >= 30) employeeBaselineDenied_();
  c.history.push({ generation: c.generation, mode: c.mode, state: c.state, approvalReference: c.approvalReference,
    approvedBy: c.approvedBy, time: new Date().toISOString() });
  var json = JSON.stringify(c);
  // Stay below the property value limit; never prune evidence to make room.
  if (Utilities.newBlob(json).getBytes().length > 8000) employeeBaselineDenied_();
  var store = PropertiesService.getScriptProperties();
  store.setProperty(EMPLOYEE_BASELINE_CONTROL_KEY_, json);
  if (store.getProperty(EMPLOYEE_BASELINE_CONTROL_KEY_) !== json) employeeBaselineDenied_();
  employeeBaselineControlRead_();
}
function employeeBaselineClaim_(context, data, hash, mode) {
  var c = employeeBaselineControlRead_();
  if (!c || c.state !== 'ARMED' || c.mode !== mode || c.requestId !== data.requestId ||
      c.requestHash !== hash || c.snapshotVersion !== data.expectedSnapshotVersion ||
      c.operatorId !== context.employee.employeeId || c.operatorRole !== context.employee.permission) {
    if (mode === 'RECOVER_ORIGINAL') employeeFailure_('RECOVERY_APPROVAL_REQUIRED', '原操作尚未獲准續作；請保留編號並唯讀查詢。');
    employeeBaselineDenied_();
  }
  c.state = 'CLAIMED';
  employeeBaselineControlPersist_(c); // Durable claim/read-back BEFORE any Sheet write.
  return c;
}
// Editor-only operational authorization. Deployment maintainer records an explicit
// OWNER/ADMIN approval reference. This is NOT a LINE-authenticated approval API.
function employeeBaselineControlPrepare_(plan) {
  var keys = ['operatorId', 'approvedBy', 'approvalReference', 'requestId', 'expectedSnapshotVersion', 'reason', 'mode'];
  if (!plan || Array.isArray(plan) || Object.keys(plan).length !== keys.length || keys.some(function(k) { return !Object.prototype.hasOwnProperty.call(plan, k); }) ||
      !employeeBaselineApprovalRef_(plan.approvalReference) || ['INITIAL', 'RECOVER_ORIGINAL'].indexOf(plan.mode) < 0) employeeBaselineDenied_();
  return employeeWithLock_(function() {
    var channel = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
    var actor = employeeBaselineEditorActor_(plan.operatorId, channel);
    employeeBaselineEditorActor_(plan.approvedBy, channel);
    var data = { action: 'employeeLifecycleBaselineMigrate', idToken: 'EDITOR_VALIDATION_PLACEHOLDER', employeeId: 'EMP001',
      requestId: plan.requestId, expectedSnapshotVersion: plan.expectedSnapshotVersion, reason: plan.reason, confirmed: true };
    employeeBaselineStrictInput_(data); // Dummy only; no LINE request or token persistence.
    var hash = employeeHash_(['LEGACY_BASELINE', actor.sub, actor.channelId, 'EMP001', plan.expectedSnapshotVersion, plan.reason.trim(), true]);
    var state = employeeBaselineState_(actor, 'EMP001'), old = employeeBaselineControlRead_();
    if (old && (old.requestId !== data.requestId || old.requestHash !== hash || old.operatorId !== plan.operatorId ||
        old.operatorRole !== actor.employee.permission || old.state === 'ARMED' || old.state === 'CLOSED')) employeeBaselineDenied_();
    var receipts = employeeStoreRows_('audit').filter(function(a) { return a.requestId === data.requestId; });
    if (plan.mode === 'INITIAL') {
      if (receipts.length || employeeBaselineVersion_(state) !== data.expectedSnapshotVersion ||
          employeeBaselineEligibility_(state).code || state.periods.length || state.bindings.length) employeeBaselineDenied_();
    } else {
      if (!old || old.state !== 'CLAIMED') employeeBaselineDenied_();
      var status = employeeBaselineStatusEvidence_(actor, 'EMP001', data.requestId, state, receipts);
      if (status.requestStatus !== 'STARTED' || receipts.length !== 1 || receipts[0].operatorId !== plan.operatorId ||
          receipts[0].operatorSub !== actor.sub || receipts[0].requestHash !== hash || employeeBaselineDecode_(receipts[0]).format !== 4) employeeBaselineDenied_();
    }
    var c = { format: 1, employeeId: 'EMP001', operatorId: plan.operatorId, operatorRole: actor.employee.permission,
      requestId: data.requestId, requestHash: hash, snapshotVersion: data.expectedSnapshotVersion,
      approvedBy: plan.approvedBy, approvalReference: plan.approvalReference, mode: plan.mode, state: 'ARMED',
      generation: old ? old.generation + 1 : 1, history: old ? old.history : [] };
    employeeBaselineControlPersist_(c);
    return { success: true, employeeId: 'EMP001', requestId: data.requestId, generation: c.generation, state: 'ARMED' };
  });
}
function employeeBaselineEditorActor_(id, channel) {
  if (typeof id !== 'string' || !id || typeof channel !== 'string' || !channel) employeeBaselineDenied_();
  var rows = employeeLegacyRows_().filter(function(e) { return e.employeeId === id; });
  if (rows.length !== 1 || !rows[0].lineUid) employeeBaselineDenied_();
  var context = employeeContext_({ sub: rows[0].lineUid, channelId: channel });
  if (!context.employee || context.employee.employeeId !== id) employeeBaselineDenied_();
  employeeRequireReviewer_(context);
  employeeLifecycleTarget_(context, 'EMP001');
  return context;
}
function employeeBaselineControlClose_(requestId, approvalReference) {
  if (!employeeBaselineApprovalRef_(approvalReference)) employeeBaselineDenied_();
  return employeeWithLock_(function() {
    var c = employeeBaselineControlRead_();
    if (!c || c.requestId !== requestId || c.state === 'CLOSED') employeeBaselineDenied_();
    // Closing only removes authority; never deletes evidence or rolls back rows.
    c.state = 'CLOSED'; c.approvalReference = approvalReference;
    employeeBaselineControlPersist_(c);
    return { success: true, requestId: requestId, state: 'CLOSED' };
  });
}

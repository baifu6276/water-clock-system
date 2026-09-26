// Read-only projections. No locks, mutations, baseline creation or payroll refresh.
function employeeLifecycleScalar_(value) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ? value : '';
}
function employeeLifecycleDate_(value) {
  if (!value) return '';
  if (typeof value !== 'string') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    var day = new Date(value + 'T00:00:00Z');
    return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : '';
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return '';
  var date = new Date(value);
  return Number.isFinite(date.getTime()) ? Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd') : '';
}
function employeeLifecycleMaster_(row, detail) {
  // Deployed Code.gs A:L; deliberately omit B (LINE UID).
  var result = { employeeId: employeeText_(row[0]), name: employeeText_(row[2]), grade: employeeText_(row[3]),
    salaryType: employeeText_(row[4]), salaryAmount: employeeLifecycleScalar_(row[5]), systemRole: employeeText_(row[6]),
    hireDate: employeeLifecycleDate_(row[7]), terminationDate: employeeLifecycleDate_(row[8]),
    employeeStatus: employeeText_(row[9]), phone: employeeText_(row[10]) };
  if (detail) result.note = employeeText_(row[11]);
  return result;
}
function employeeLifecyclePeriod_(row) {
  return { employmentId: employeeLifecycleScalar_(row.employmentId), sequence: employeeLifecycleScalar_(row.sequence),
    startDate: employeeLifecycleDate_(row.startDate), endDate: employeeLifecycleDate_(row.endDate),
    grade: employeeLifecycleScalar_(row.grade), salaryType: employeeLifecycleScalar_(row.salaryType),
    salaryAmount: employeeLifecycleScalar_(row.salaryAmount), systemRole: employeeLifecycleScalar_(row.permission),
    status: employeeLifecycleScalar_(row.status), disabledAt: employeeLifecycleScalar_(row.disabledAt),
    baselineDate: employeeLifecycleDate_(row.baselineDate), createdAt: employeeLifecycleScalar_(row.createdAt),
    terminatedAt: employeeLifecycleScalar_(row.terminatedAt), version: employeeLifecycleScalar_(row.version) };
}
function employeeLifecycleBindingActive_(row, now) {
  var start = new Date(row.validFrom).getTime(), end = row.validTo ? new Date(row.validTo).getTime() : Infinity;
  return row.status === '有效' && Boolean(row.validFrom) && Number.isFinite(start) && start <= now && end > now;
}
function employeeLifecycleBusinessValues_(json) {
  // Recognize actual application snapshots and approval bundle v1; never expose raw JSON.
  var value;
  try { value = JSON.parse(json || 'null'); } catch (_) { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  if (value.format === 3) return { baselineState: value.employment ? 'RECORDED' : 'LEGACY_NOT_BASELINED' };
  if (value.format === 2 && value.master) return { employeeStatus: employeeLifecycleScalar_(value.master.employeeStatus),
    terminationDate: employeeLifecycleDate_(value.master.terminationDate) };
  if (value.format === 1 && Array.isArray(value.employee) && value.employee.length === 12) {
    var master = employeeLifecycleMaster_(value.employee, false);
    delete master.employeeId;
    return master;
  }
  if (value.format === 1 && value.application) value = value.application;
  var result = {};
  // Application audit uses status; do not mislabel it as employeeStatus.
  if (typeof value.applicationId === 'string') {
    ['name', 'phone', 'status'].forEach(function(k) {
      if (typeof value[k] === 'string') result[k === 'status' ? 'applicationStatus' : k] = value[k];
    });
  }
  return result;
}
function employeeLifecycleProjection_(row, snapshot, detail, context) {
  var employee = employeeLifecycleMaster_(row, detail), id = employee.employeeId;
  var periods = id ? snapshot.periods.filter(function(p) { return p.employeeId === id; }) : [];
  var bindings = id ? snapshot.bindings.filter(function(b) { return b.employeeId === id; }) : [];
  var changes = id ? snapshot.audit.filter(function(a) { return a.employeeId === id; }) : [];
  var warnings = [];
  function warn(code, message) { if (!warnings.some(function(w) { return w.code === code; })) warnings.push({ code: code, message: message }); }
  var legacy = !periods.length && !bindings.length && !changes.length;
  if (!id) warn('EMPLOYEE_ID_MISSING', '員工主檔缺少永久識別，需人工確認。');
  if (id && snapshot.master.filter(function(r) { return employeeText_(r[0]) === id; }).length > 1) warn('DUPLICATE_EMPLOYEE_ID', '員工主檔存在重複識別，需人工確認。');
  if (employeeText_(row[1]) && snapshot.master.filter(function(r) { return employeeText_(r[1]) === employeeText_(row[1]); }).length > 1) warn('DUPLICATE_MASTER_LINE_BINDING', '員工主檔存在重複登入身分，需人工確認。');
  if (legacy) warn('LEGACY_NOT_BASELINED', '舊員工尚未建立生命週期基線；未知歷史保持空白，不代表資料損壞。');
  var open = periods.filter(function(p) { return !p.endDate && ['在職', '停職', '留停'].indexOf(p.status) >= 0; });
  if (open.length > 1) warn('MULTIPLE_OPEN_EMPLOYMENTS', '存在多個未結束任職期間，需人工核對。');
  if (!legacy && !periods.length) warn('EMPLOYMENT_HISTORY_MISSING', '已有生命週期資料但缺少任職紀錄，可能尚未完成基線或操作，需人工核對。');
  if (periods.length && employee.employeeStatus === '在職' && !open.length) warn('ACTIVE_WITHOUT_OPEN_EMPLOYMENT', '員工在職但沒有可確認的未結束任職期間。');
  if (employee.employeeStatus === '離職' && open.length) warn('TERMINATED_WITH_OPEN_EMPLOYMENT', '離職員工仍有未結束任職期間。');
  if (open.length === 1 && open[0].status !== employee.employeeStatus) warn('EMPLOYMENT_STATUS_MISMATCH', '員工主檔與未結束任職狀態不一致。');
  if (periods.some(function(p) { return ['在職', '停職', '留停', '離職'].indexOf(p.status) < 0 || (p.status === '離職' && !p.endDate); })) warn('EMPLOYMENT_STATUS_UNCERTAIN', '任職狀態或結束日期不足，無法確定任職期間。');
  if (['在職', '停職', '留停', '離職'].indexOf(employee.employeeStatus) < 0) warn('EMPLOYEE_STATUS_UNKNOWN', '員工主檔狀態未被辨識。');
  var active = bindings.filter(function(b) { return employeeLifecycleBindingActive_(b, snapshot.now); });
  if (active.length > 1) warn('MULTIPLE_ACTIVE_BINDINGS', '同一員工有多筆有效 LINE 綁定。');
  if (!legacy && !bindings.length) warn('BINDING_HISTORY_MISSING', '尚無綁定紀錄，請確認基線或操作是否完成。');
  if (bindings.some(function(b) { return b.status === '有效' && (!b.validFrom || !Number.isFinite(new Date(b.validFrom).getTime()) || (b.validTo && !Number.isFinite(new Date(b.validTo).getTime()))); })) warn('BINDING_DATES_INVALID', '綁定有效期間資料不足，不能確認有效性。');
  if (active.some(function(b) { return !b.lineSub || String(b.channelId) !== context.channelId; })) warn('BINDING_IDENTITY_CONFLICT', '有效綁定的身分或驗證來源需人工核對。');
  if (active.some(function(b) { return snapshot.bindings.some(function(other) {
    return other.employeeId !== id && other.lineSub === b.lineSub && employeeLifecycleBindingActive_(other, snapshot.now);
  }); })) warn('LINE_BOUND_TO_MULTIPLE_EMPLOYEES', '同一 LINE 身分同時關聯多位員工。');
  if (active.length === 1 && employeeText_(row[1]) !== active[0].lineSub) warn('MASTER_BINDING_MISMATCH', '員工主檔與有效登入綁定不一致。');
  if (changes.some(function(a) { return a.phase === 'STARTED' && !changes.some(function(b) {
    return b.phase === 'COMPLETED' && b.requestId === a.requestId && b.operatorSub === a.operatorSub;
  }); })) warn('LIFECYCLE_OPERATION_PENDING', '存在未完成的生命週期操作，需由原操作人重試或人工核對。');
  var lifecycle = { baselineStatus: legacy ? 'LEGACY_NOT_BASELINED' : 'RECORDED', openEmploymentCount: open.length,
    currentEmployment: open.length === 1 ? employeeLifecyclePeriod_(open[0]) : null,
    activeBindingCount: active.length, hasActiveLineBinding: bindings.length ? active.length > 0 : null,
    bindingStatus: !bindings.length ? 'UNKNOWN' : active.length > 1 ? 'CONFLICT' : active.length === 1 ? 'ACTIVE' : 'INACTIVE' };
  var result = { employee: employee, lifecycle: lifecycle, warnings: warnings };
  if (detail) {
    result.employments = periods.map(employeeLifecyclePeriod_);
    result.lineBindings = bindings.map(function(b) { return { status: employeeLifecycleScalar_(b.status),
      active: employeeLifecycleBindingActive_(b, snapshot.now), validFrom: employeeLifecycleScalar_(b.validFrom),
      validTo: employeeLifecycleScalar_(b.validTo), sourceType: employeeLifecycleScalar_(b.sourceType), reason: employeeLifecycleScalar_(b.reason) }; });
    result.changes = changes.map(function(a) {
      var operators = snapshot.master.filter(function(r) { return employeeText_(r[0]) === a.operatorId; });
      var before = employeeLifecycleBusinessValues_(a.beforeJson), after = employeeLifecycleBusinessValues_(a.afterJson);
      if (before === null || after === null) warn('AUDIT_VALUES_UNAVAILABLE', '部分異動快照無法安全解析，僅提供異動摘要。');
      return { changeType: employeeLifecycleScalar_(a.action), effectiveDate: employeeLifecycleDate_(a.effectiveDate),
        effectiveAt: employeeLifecycleScalar_(a.effectiveAt), before: before || {}, after: after || {},
        operatorEmployeeId: employeeLifecycleScalar_(a.operatorId), operatorName: operators.length === 1 ? employeeText_(operators[0][2]) : '',
        timestamp: employeeLifecycleScalar_(a.operatedAt), reason: employeeLifecycleScalar_(a.reason),
        phase: ['STARTED', 'COMPLETED'].indexOf(a.phase) >= 0 ? a.phase : 'UNKNOWN' };
    });
  }
  return result;
}
function employeeLifecycleRead_(context, data) {
  employeeRequireReviewer_(context);
  var detail = data.action.trim() === 'employeeLifecycleAdminDetail';
  if (detail && (typeof data.employeeId !== 'string' || !data.employeeId.trim() || data.employeeId.length > 100)) employeeFailure_('VALIDATION_ERROR', '請提供有效員工識別。');
  try {
    var snapshot = { master: employeeReviewMasterRows_(), periods: employeeStoreRows_('employments'),
      bindings: employeeStoreRows_('bindings'), audit: employeeStoreRows_('audit'), now: Date.now() };
    if (!detail) return { success: true, employees: snapshot.master.map(function(row) { return employeeLifecycleProjection_(row, snapshot, false, context); }) };
    var matches = snapshot.master.filter(function(row) { return employeeText_(row[0]) === data.employeeId.trim(); });
    if (!matches.length) employeeFailure_('EMPLOYEE_NOT_FOUND', '找不到指定員工。');
    if (matches.length !== 1) employeeFailure_('IDENTITY_CONFLICT', '員工主檔有重複識別，請人工確認。');
    return Object.assign({ success: true }, employeeLifecycleProjection_(matches[0], snapshot, true, context));
  } catch (error) {
    if (error.employeeCode) throw error;
    employeeFailure_('STORAGE_ERROR', '無法讀取人員資料，請稍後重試或聯絡管理員。');
  }
}
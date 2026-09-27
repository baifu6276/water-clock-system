(() => {
  'use strict';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  const button = document.getElementById('check');
  const baselineButton = document.getElementById('baselineCheck');
  const baselineFields = document.getElementById('baselineFields');
  const STATUS_VERSION = 't3-2-status-only';
  const TIMING_VERSION = 't3-3-timing-diag';
  const GAS_TIMING_VERSION = 't3-4-gas-read-diag';
  const T4_TIMING_VERSION = 't4-safety-2-gas-read-diag';
  const statusCapable = version => [STATUS_VERSION, 't4-safety-1', TIMING_VERSION, GAS_TIMING_VERSION, T4_TIMING_VERSION].includes(version);
  const statusButton = document.getElementById('operationStatusCheck');
  const probeButton = document.getElementById('operationStatusProbe');
  const requestIdInput = document.getElementById('operationRequestId');
  const statusFields = document.getElementById('operationStatusFields');
  const statusSection = document.getElementById('operationStatusSection');
  // Older cached HTML has no status controls: existing identity/preview still work.
  const hasStatusUi = Boolean(statusButton && probeButton && requestIdInput && statusFields && statusSection);
  const validRequestId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{16,100}$/.test(value);
  let lastTransportVersion = null;
  const codes = new Set(['STATUS_VERSION_REQUIRED', 'STATUS_RESPONSE_INVALID', 'REQUEST_ID_INVALID', 'CONFIG_ERROR', 'HTTPS_REQUIRED', 'PATH_DENIED', 'ORIGIN_DENIED',
    'METHOD_DENIED', 'CONTENT_TYPE_INVALID', 'REQUEST_INVALID', 'REQUEST_TOO_LARGE', 'TOKEN_REQUIRED',
    'ACTION_DENIED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_HTTP_ERROR',
    'UPSTREAM_REDIRECT_DENIED', 'UPSTREAM_REDIRECT_LIMIT', 'UPSTREAM_RESPONSE_TOO_LARGE',
    'UPSTREAM_JSON_INVALID', 'TRANSPORT_ERROR', 'AUTH_ERROR', 'FORBIDDEN', 'SCHEMA_ERROR',
    'IDENTITY_CONFLICT', 'OPERATION_ERROR', 'VALIDATION_ERROR', 'NOT_FOUND', 'LINE_CHANNEL_ID_MISSING', 'LINE_TOKEN_MISSING_OR_INVALID',
    'LINE_VERIFY_NETWORK_ERROR', 'LINE_VERIFY_HTTP_ERROR', 'LINE_TOKEN_REJECTED', 'LINE_AUDIENCE_MISMATCH',
    'LINE_ISSUER_MISMATCH', 'LINE_TOKEN_EXPIRED', 'LINE_SUB_MISSING', 'LINE_VERIFY_MALFORMED_RESPONSE',
    'LINE_VERIFY_PERMISSION_ERROR', 'LINE_VERIFY_FETCH_ERROR', 'BACKEND_SCHEMA_ERROR',
    'BACKEND_IDENTITY_CONFLICT', 'BACKEND_LOOKUP_ERROR', 'BACKEND_INTERNAL_ERROR']);
  const states = new Set(['ACTIVE_EMPLOYEE', 'UNREGISTERED', 'APPLICATION_PENDING', 'SUSPENDED', 'LEAVE', 'TERMINATED', 'AUTH_ERROR']);
  const timeoutStages = new Set(['READ_REQUEST', 'POST_HEADERS', 'REDIRECT_GET_HEADERS', 'FINAL_BODY']);
  const redirectDiagnostics = new Set(['REDIRECT_STATUS_DENIED', 'REDIRECT_LOCATION_INVALID',
    'REDIRECT_SCHEME_DENIED', 'REDIRECT_HOST_DENIED', 'REDIRECT_URL_COMPONENT_DENIED']);
  const setRedirectDiagnostic = value => {
    const field = document.getElementById('redirectDiagnostic');
    if (field) field.textContent = value; // Older cached HTML may not have the field.
  };
  const timingText = Object.freeze({
    LT_100: '未滿 0.1 秒', MS_100_499: '0.1 秒至未滿 0.5 秒', MS_500_1999: '0.5 秒至未滿 2 秒',
    MS_2000_4999: '2 秒至未滿 5 秒', MS_5000_9999: '5 秒至未滿 10 秒',
    MS_10000_19999: '10 秒至未滿 20 秒', MS_GE_20000: '20 秒以上',
    TIMEOUT: '逾時（共用 20 秒期限）', NOT_RUN: '未執行'
  });
  const timingIds = ['timingTotal', 'timingCurrentStage', 'timingHops', 'timingPostHeaders', 'timingLastGet'];
  const gasStages = ['VERIFY_LINE', 'EMPLOYEE_CONTEXT', 'ACTION_READ', 'LOCK_WAIT', 'RESPONSE_PREP'];
  const gasTimingIds = ['gasTimingTotal', 'gasVerifyLine', 'gasEmployeeContext', 'gasActionRead', 'gasLockWait', 'gasResponsePrep'];
  const hasGasTimingUi = ['gasTimingAvailability', ...gasTimingIds].every(id => document.getElementById(id));
  function resetGasTiming() {
    if (!hasGasTimingUi) return;
    set('gasTimingAvailability', '無法取得');
    for (const id of gasTimingIds) set(id, '—');
  }
  function showGasTiming(value, correlation) {
    if (!hasGasTimingUi) return;
    try {
      const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
        Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
      const duration = bucket => typeof bucket === 'string' && Object.hasOwn(timingText, bucket) && !['TIMEOUT', 'NOT_RUN'].includes(bucket);
      if (!exact(value, ['version', 'transportTraceId', 'total', 'stages']) || value.version !== 1 ||
          typeof value.transportTraceId !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.transportTraceId) ||
          value.transportTraceId !== correlation || !duration(value.total) || !exact(value.stages, gasStages) ||
          gasStages.some(key => value.stages[key] !== 'NOT_RUN' && !duration(value.stages[key]))) return;
      const buckets = [value.total, ...gasStages.map(key => value.stages[key])];
      gasTimingIds.forEach((id, i) => set(id, timingText[buckets[i]]));
      set('gasTimingAvailability', '可用');
    } catch { resetGasTiming(); }
  }
  const hasTimingUi = ['timingAvailability', ...timingIds].every(id => document.getElementById(id));
  function resetTiming() {
    if (!hasTimingUi) return;
    set('timingAvailability', '尚未取得');
    for (const id of timingIds) set(id, '—');
  }
  function parseTiming(header) {
    if (typeof header !== 'string' || header.length > 256 || !/^[A-Za-z0-9_=;]+$/.test(header)) return null;
    const keys = ['v', 'rr', 'ph', 'g1', 'g2', 'g3', 'fb', 'tot', 'cur', 'hops'];
    const parts = header.split(';'), value = Object.create(null);
    if (parts.length !== keys.length) return null;
    for (let i = 0; i < keys.length; i++) {
      const pair = parts[i].split('=');
      if (pair.length !== 2 || pair[0] !== keys[i]) return null;
      value[keys[i]] = pair[1];
    }
    const duration = bucket => Object.hasOwn(timingText, bucket) && !['TIMEOUT', 'NOT_RUN'].includes(bucket);
    if (value.v !== '1' || !/^[0-3]$/.test(value.hops) ||
        !['READ_REQUEST', 'POST_HEADERS', 'REDIRECT_GET_HEADERS', 'FINAL_BODY', 'DONE'].includes(value.cur) ||
        !(duration(value.tot) || value.tot === 'TIMEOUT')) return null;
    const hops = Number(value.hops), timeout = value.tot === 'TIMEOUT';
    if ((['READ_REQUEST', 'POST_HEADERS'].includes(value.cur) && hops !== 0) ||
        (value.cur === 'REDIRECT_GET_HEADERS' && hops === 0) || (value.cur === 'DONE' && timeout)) return null;
    const entered = ['rr'];
    if (value.cur !== 'READ_REQUEST') entered.push('ph');
    for (let hop = 1; hop <= hops; hop++) entered.push('g' + hop);
    if (['FINAL_BODY', 'DONE'].includes(value.cur)) entered.push('fb');
    const active = entered[entered.length - 1];
    for (const key of ['rr', 'ph', 'g1', 'g2', 'g3', 'fb']) {
      if (!entered.includes(key)) { if (value[key] !== 'NOT_RUN') return null; }
      else if (timeout && key === active) { if (value[key] !== 'TIMEOUT') return null; }
      else if (!duration(value[key])) return null;
    }
    return value;
  }
  function showTiming(response) {
    if (!hasTimingUi) return;
    // Diagnostics are optional and never throw into the business request path.
    try {
      const value = parseTiming(response.headers.get('x-transport-timing'));
      if (!value) { set('timingAvailability', '無法取得'); return; }
      set('timingAvailability', '可用');
      set('timingTotal', timingText[value.tot]);
      set('timingCurrentStage', value.cur); set('timingHops', value.hops);
      set('timingPostHeaders', timingText[value.ph]);
      const getLabels = ['', 'GET1', 'GET2', 'GET3'];
      set('timingLastGet', value.hops === '0' ? '未執行' : getLabels[Number(value.hops)] + '：' + timingText[value['g' + value.hops]]);
    } catch { set('timingAvailability', '無法取得'); }
  }
  let ready = false, busy = false, identity = null;
  const manager = () => identity?.state === 'ACTIVE_EMPLOYEE' && ['OWNER', 'ADMIN'].includes(identity.permission);
  function controls() {
    button.disabled = !ready || busy;
    baselineButton.disabled = !ready || busy || !manager();
    document.getElementById('baselineSection').hidden = !manager();
    if (hasStatusUi) {
      statusSection.hidden = !manager();
      const capable = manager() && statusCapable(identity.transportVersion);
      requestIdInput.disabled = !ready || busy || !capable;
      probeButton.disabled = !ready || busy || !capable;
      statusButton.disabled = !ready || busy || !capable || !validRequestId(requestIdInput.value);
      set('operationStatusHint', capable
        ? '只查 EMP001 的原請求；結果不會授權建立、重送或復原寫入。'
        : '此身分回應尚未確認唯讀查詢版本；需 Relay t3-2-status-only 或 t3-3-timing-diag，再手動檢查身分。');
    }
  }
  async function request(action, requestId) {
    resetTiming();
    resetGasTiming();
    set('transportStage', '—');
    setRedirectDiagnostic('—');
    lastTransportVersion = null;
    if (!['identityBootstrap', 'employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus'].includes(action)) throw new Error('ACTION_DENIED');
    if (action !== 'identityBootstrap' && !manager()) throw new Error('FORBIDDEN');
    if (action === 'employeeLifecycleBaselineRequestStatus' && !validRequestId(requestId)) throw new Error('REQUEST_ID_INVALID');
    const controller = new AbortController(); let timer;
    try {
      let endpoint;
      try { endpoint = new URL(window.TransportT1Config.relayEndpoint); } catch { throw new Error('CONFIG_ERROR'); }
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/identity') throw new Error('CONFIG_ERROR');
      if (action === 'employeeLifecycleBaselineDryRun') endpoint.pathname = '/employee-read';
      if (action === 'employeeLifecycleBaselineRequestStatus') endpoint.pathname = '/employee-operation-status';
      const idToken = liff.getIDToken();
      set('token', idToken ? '是' : '否');
      if (!idToken) throw new Error('TOKEN_REQUIRED');
      timer = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(endpoint.href, { method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(action === 'identityBootstrap' ? { action, idToken } :
          { action, idToken, employeeId: 'EMP001', ...(action === 'employeeLifecycleBaselineRequestStatus' ? { requestId } : {}) }),
        redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      set('http', String(response.status));
      showTiming(response);
      const version = response.headers.get('x-transport-version');
      lastTransportVersion = ['t1-1', 't3-1', STATUS_VERSION, 't4-safety-1', TIMING_VERSION, GAS_TIMING_VERSION, T4_TIMING_VERSION].includes(version) ? version : null;
      set('version', lastTransportVersion || '未識別');
      if (action === 'employeeLifecycleBaselineRequestStatus' && !statusCapable(version)) throw new Error('STATUS_VERSION_REQUIRED');
      const correlation = response.headers.get('x-correlation-id');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlation || '')) set('correlation', correlation);
      const result = await response.json();
      if (!result || typeof result.success !== 'boolean') throw new Error('TRANSPORT_ERROR');
      showGasTiming(result._gasReadDiagnostics, correlation);
      if (!response.ok || !result.success) {
        if (result.transportError === 'UPSTREAM_TIMEOUT') {
          set('transportStage', timeoutStages.has(result.transportStage) ? result.transportStage : 'UNKNOWN');
        }
        if (result.transportError === 'UPSTREAM_REDIRECT_DENIED') {
          setRedirectDiagnostic(redirectDiagnostics.has(result.redirectDiagnostic) ? result.redirectDiagnostic : '—');
          set('transportStage', ['POST_HEADERS', 'REDIRECT_GET_HEADERS'].includes(result.transportStage) ? result.transportStage : '—');
        }
        const code = result.transportError || result.diagnosticCode || result.code;
        throw new Error(codes.has(code) ? code : 'TRANSPORT_ERROR');
      }
      return result;
    } catch (error) {
      throw new Error(controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
    } finally { clearTimeout(timer); }
  }
  function resetTransport() {
    for (const id of ['correlation', 'version']) set(id, '—');
    set('error', '無'); set('http', '處理中');
  }
  button.addEventListener('click', async () => {
    if (!ready || busy) return;
    busy = true; identity = null; controls();
    baselineFields.replaceChildren(); set('baselineStatus', '尚未執行');
    clearOperationStatus();
    for (const id of ['employee', 'state']) set(id, '—');
    resetTransport();
    try {
      const result = await request('identityBootstrap');
      if (!states.has(result.state)) throw new Error('TRANSPORT_ERROR');
      set('state', result.state);
      if (result.state === 'ACTIVE_EMPLOYEE') {
        if (typeof result.employee?.employeeId !== 'string' || typeof result.employee?.name !== 'string') throw new Error('TRANSPORT_ERROR');
        set('employee', result.employee.employeeId + ' / ' + result.employee.name);
      }
      identity = { state: result.state, permission: result.employee?.permission, transportVersion: lastTransportVersion };
      set('http', document.getElementById('http').textContent + ' / 成功');
    } catch (error) {
      set('error', codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
      set('employee', '—');
    } finally { busy = false; controls(); }
  });
  const fields = [['employeeId', '員工'], ['name', '姓名'], ['employeeStatus', '員工狀態'],
    ['grade', '級職'], ['salaryType', '薪資制'], ['salaryAmount', '薪資金額'], ['systemRole', '系統權限'],
    ['hireDate', '到職日'], ['bindingSource', '綁定來源狀態'], ['baselineState', '基線狀態']];
  const warnings = Object.freeze({ RECOVERY_REQUIRED: '資料有未完成或衝突狀態，請管理員確認。',
    BASELINE_MANUAL_REVIEW_REQUIRED: '基線資料需要人工確認。', BASELINE_LINE_IDENTITY_REQUIRED: 'LINE 綁定資料需要確認。',
    HIRE_DATE_UNKNOWN: '到職日未知，基線保持空白。' });
  baselineButton.addEventListener('click', async () => {
    if (!ready || busy || !manager()) return;
    busy = true; controls(); baselineFields.replaceChildren(); resetTransport(); set('baselineStatus', '讀取中');
    try {
      const result = await request('employeeLifecycleBaselineDryRun');
      if (result.success !== true || result.dryRun !== true || result.employeeId !== 'EMP001' ||
        !fields.every(([key]) => key === 'salaryAmount' ? typeof result[key] === 'string' ||
          (typeof result[key] === 'number' && Number.isFinite(result[key])) : typeof result[key] === 'string') ||
        !['PRESENT', 'MISSING', 'DUPLICATE', 'CONFLICT'].includes(result.bindingSource) ||
        !['LEGACY_NOT_BASELINED', 'ALREADY_BASELINED', 'CONFLICT'].includes(result.baselineState) ||
        typeof result.eligible !== 'boolean' || !Array.isArray(result.warnings) || !result.warnings.every(w => typeof w === 'string') ||
        typeof result.snapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(result.snapshotVersion)) throw new Error('TRANSPORT_ERROR');
      const values = fields.map(([key, label]) => [label, result[key]]);
      values.push(['符合基線條件', result.eligible ? '是' : '否'], ['警告', result.warnings.length ?
        result.warnings.map(w => Object.hasOwn(warnings, w) ? warnings[w] : '未識別警告，請管理員核對。').join('；') : '無'],
      ['快照版本', '快照版本格式有效']);
      for (const [label, value] of values) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value; baselineFields.append(dt, dd);
      }
      set('baselineStatus', result.eligible ? '此員工可進行 Legacy Baseline' : '目前不可自動建立 Legacy Baseline');
      set('http', document.getElementById('http').textContent + ' / 成功');
    } catch (error) {
      set('error', codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
      set('baselineStatus', '預覽未完成，請確認安全錯誤碼。');
      identity = null; // Re-verify before another management attempt after any failure.
    } finally { busy = false; controls(); }
  });
  // Status reads only. No localStorage, token logging, migration or retry functions.
  function clearOperationStatus() {
    if (!hasStatusUi) return;
    statusFields.replaceChildren();
    set('operationStatusMessage', '尚未查詢');
  }
  function validStatusResult(result, requestId) {
    if (!result || result.success !== true || result.employeeId !== 'EMP001' || result.requestId !== requestId ||
        result.action !== 'employeeLifecycleBaselineMigrate' || result.recoveryAllowed !== false || result.newRequestAllowed !== false) return false;
    const historical = result.historicalCompletion, consistency = result.currentConsistency;
    if (result.requestStatus === 'UNKNOWN') return historical === null && consistency === 'UNKNOWN';
    if (result.requestStatus === 'NOT_OBSERVED') return historical === false && consistency === 'UNKNOWN';
    if (result.requestStatus === 'STARTED') return historical === false && ['ABSENT', 'PARTIAL', 'MATCHED'].includes(consistency);
    if (result.requestStatus === 'COMPLETED') return historical === true && consistency === 'MATCHED';
    return result.requestStatus === 'RECOVERY_REQUIRED' && [null, false, true].includes(historical) && consistency === 'CONFLICT';
  }
  if (hasStatusUi) {
    requestIdInput.addEventListener('input', () => { clearOperationStatus(); controls(); });
    probeButton.addEventListener('click', () => {
      if (!ready || busy || !manager() || !statusCapable(identity.transportVersion)) return;
      clearOperationStatus();
      try {
        // Generate a read-only probe ID locally; it is NOT a write request or reservation.
        requestIdInput.value = 'status-probe-' + crypto.randomUUID();
        set('operationStatusMessage', '已建立唯讀測試編號，尚未送出查詢，也沒有建立基線。');
      } catch (_) { set('error', 'CONFIG_ERROR'); }
      controls();
    });
    statusButton.addEventListener('click', async () => {
      if (!ready || busy || !manager() || !statusCapable(identity.transportVersion)) return;
      const requestId = requestIdInput.value;
      clearOperationStatus();
      if (!validRequestId(requestId)) { set('error', 'REQUEST_ID_INVALID'); controls(); return; }
      busy = true; controls(); resetTransport(); set('operationStatusMessage', '唯讀查詢中');
      try {
        const result = await request('employeeLifecycleBaselineRequestStatus', requestId);
        if (!validStatusResult(result, requestId)) throw new Error('STATUS_RESPONSE_INVALID');
        const values = [
          ['員工', 'EMP001'], ['本次查詢編號', requestId], ['原請求狀態', result.requestStatus],
          ['歷史完成證據', result.historicalCompletion === null ? '無法確認' : result.historicalCompletion ? '有' : '無'],
          ['目前一致性', result.currentConsistency], ['允許復原寫入', '否'], ['允許新寫入', '否']
        ];
        for (const [label, value] of values) {
          const dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = label; dd.textContent = value; statusFields.append(dt, dd);
        }
        const messages = {
          COMPLETED: '原請求歷史完成且目前資料相符；這不是新的寫入，也不授權再次寫入。',
          NOT_OBSERVED: '未查到此登入者可見的原請求；不能據此判定可以重新送出或建立基線。',
          STARTED: '有開始紀錄，但尚無完整完成證據；停止寫入，交由管理員核對。',
          UNKNOWN: '目前無法確認原請求；不要重送寫入。',
          RECOVERY_REQUIRED: '原請求或目前資料需要人工核對；本頁不提供自動復原。'
        };
        set('operationStatusMessage', messages[result.requestStatus]);
        set('http', document.getElementById('http').textContent + ' / 查詢成功（非寫入成功）');
      } catch (error) {
        set('error', codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
        set('operationStatusMessage', '查詢未確認；請重新檢查身分。本頁不會重送或建立寫入。');
        baselineFields.replaceChildren(); set('baselineStatus', '尚未執行');
        identity = null;
      } finally { busy = false; controls(); }
    });
  }
  document.getElementById('login').addEventListener('click', () => { if (!busy) liff.login(); });
  (async () => {
    try {
      await liff.init({ liffId: window.TransportT1Config.liffId });
      set('init', '成功'); set('inLine', liff.isInClient() ? '是' : '否');
      if (!liff.isLoggedIn()) { document.getElementById('login').hidden = false; return; }
      ready = true; set('token', liff.getIDToken() ? '是' : '否'); button.disabled = false;
    } catch (error) {
      // Only fixed LIFF codes may cross into the UI; never inspect error details.
      const initCodes = new Set(['INIT_FAILED', 'INVALID_ARGUMENT', 'INVALID_CONFIG',
        'UNAUTHORIZED', 'FORBIDDEN', 'INVALID_ID_TOKEN', 'UNKNOWN']);
      const code = error?.code;
      set('init', '失敗');
      set('error', initCodes.has(code) ? code : 'LIFF_INIT_ERROR');
    }
  })();
})();

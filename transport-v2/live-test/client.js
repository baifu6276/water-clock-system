(() => {
  'use strict';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  const button = document.getElementById('check');
  const baselineButton = document.getElementById('baselineCheck');
  const baselineFields = document.getElementById('baselineFields');
  const statusButton = document.getElementById('requestStatusCheck');
  const statusFields = document.getElementById('requestStatusFields');
  const requestIdInput = document.getElementById('requestId');
  const codes = new Set(['CONFIG_ERROR', 'HTTPS_REQUIRED', 'PATH_DENIED', 'ORIGIN_DENIED',
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
  let ready = false, busy = false, identity = null;
  const manager = () => identity?.state === 'ACTIVE_EMPLOYEE' && ['OWNER', 'ADMIN'].includes(identity.permission);
  const statusAccess = () => {
    try { return ready && manager() && liff.isInClient() && Boolean(liff.getIDToken()); }
    catch { return false; }
  };
  function controls() {
    button.disabled = !ready || busy;
    baselineButton.disabled = !ready || busy || !manager();
    document.getElementById('baselineSection').hidden = !manager();
    statusButton.disabled = busy || !statusAccess();
    requestIdInput.disabled = busy || !statusAccess();
    document.getElementById('requestStatusSection').hidden = !statusAccess();
  }
  async function request(action, requestId) {
    set('transportStage', '—');
    if (!['identityBootstrap', 'employeeLifecycleBaselineDryRun', 'employeeLifecycleBaselineRequestStatus'].includes(action)) throw new Error('ACTION_DENIED');
    if (action === 'employeeLifecycleBaselineRequestStatus' && (!statusAccess() || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId))) throw new Error('FORBIDDEN');
    if (action === 'employeeLifecycleBaselineDryRun' && !manager()) throw new Error('FORBIDDEN');
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
        body: JSON.stringify(action === 'identityBootstrap' ? { action, idToken } : { action, idToken, employeeId: 'EMP001',
          ...(action === 'employeeLifecycleBaselineRequestStatus' ? { requestId } : {}) }),
        redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      set('http', String(response.status));
      const version = response.headers.get('x-transport-version');
      set('version', ['t1-1', 't3-1'].includes(version) ? version : '未識別');
      const correlation = response.headers.get('x-correlation-id');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlation || '')) set('correlation', correlation);
      const result = await response.json();
      if (!result || typeof result.success !== 'boolean') throw new Error('TRANSPORT_ERROR');
      if (!response.ok || !result.success) {
        if (result.transportError === 'UPSTREAM_TIMEOUT') {
          set('transportStage', timeoutStages.has(result.transportStage) ? result.transportStage : 'UNKNOWN');
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
    statusFields.replaceChildren(); set('requestStatusMessage', '尚未查詢');
    baselineFields.replaceChildren(); set('baselineStatus', '尚未執行');
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
      identity = { state: result.state, permission: result.employee?.permission };
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
  const statusMessages = Object.freeze({
    COMPLETED: '已觀察到完成證據。',
    STARTED: '已觀察到開始證據；請勿重新送出 Baseline。',
    RECOVERY_REQUIRED: '資料需要人工核對；請勿重新送出 Baseline。',
    NOT_OBSERVED: '未觀察到此 Request 的操作證據；不代表原操作失敗，也不代表可以重新送出。',
    UNKNOWN: '目前無法安全判定，請稍後以同一 Request ID 再次唯讀查詢。'
  });
  statusButton.addEventListener('click', async () => {
    if (busy || !statusAccess()) return;
    statusFields.replaceChildren();
    const requestId = requestIdInput.value.trim();
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)) {
      set('requestStatusMessage', 'Request ID 須為 16–100 個英數字、底線或連字號。'); return;
    }
    busy = true; controls(); resetTransport(); set('requestStatusMessage', '查詢中');
    try {
      const result = await request('employeeLifecycleBaselineRequestStatus', requestId);
      if (Array.isArray(result) || result.employeeId !== 'EMP001' || result.requestId !== requestId ||
          result.action !== 'employeeLifecycleBaselineMigrate' || result.recoveryAllowed !== false || result.newRequestAllowed !== false ||
          typeof result.requestStatus !== 'string' || !Object.hasOwn(statusMessages, result.requestStatus) ||
          ![true, false, null].includes(result.historicalCompletion) ||
          !['MATCHED', 'CHANGED_WITH_AUDIT', 'ABSENT', 'PARTIAL', 'CONFLICT', 'UNKNOWN'].includes(result.currentConsistency)) throw new Error('TRANSPORT_ERROR');
      const values = [['Request ID', requestId], ['Request 狀態', result.requestStatus],
        ['歷史完成證據', result.historicalCompletion === true ? '有' : result.historicalCompletion === false ? '未觀察到完成證據' : '無法判定'],
        ['目前一致性', result.currentConsistency], ['可恢復', '否'], ['可建立新操作', '否']];
      for (const [label, value] of values) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = label; dd.textContent = value; statusFields.append(dt, dd);
      }
      set('requestStatusMessage', statusMessages[result.requestStatus]);
      set('http', document.getElementById('http').textContent + ' / 成功');
    } catch (error) {
      set('error', codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
      set('requestStatusMessage', '查詢未完成，請確認安全錯誤碼；不代表原操作失敗。');
    } finally { busy = false; controls(); }
  });
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

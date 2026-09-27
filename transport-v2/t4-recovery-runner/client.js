(() => {
  'use strict';
  // One reviewed operation, fixed in source. Never derive values from DOM/URL.
  const EXPECTED_VERSION = 't4-safety-2-gas-read-diag';
  const LIFF_ID = '2011467618-QZYsTwb9';
  const RELAY = 'https://employee-identity-transport-t1.baifu6276.workers.dev';
  const EMPLOYEE = 'EMP001';
  const REQUEST_ID = 'c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab';
  const SNAPSHOT = 'f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd';
  const REASON = '建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。';
  const routes = Object.freeze({
    identityBootstrap: '/identity',
    employeeLifecycleBaselineMigrate: '/employee-baseline-migrate',
    employeeLifecycleBaselineRequestStatus: '/employee-operation-status'
  });
  const safeCodes = new Set(['LIFF_INIT_ERROR', 'LINE_REQUIRED', 'TOKEN_REQUIRED', 'IDENTITY_DENIED',
    'STATUS_NOT_READY', 'TRANSPORT_VERSION_REQUIRED', 'RESPONSE_INVALID', 'NETWORK_ERROR', 'HTTP_ERROR',
    'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_HTTP_ERROR', 'UPSTREAM_REDIRECT_DENIED',
    'UPSTREAM_REDIRECT_LIMIT', 'UPSTREAM_JSON_INVALID', 'UPSTREAM_RESPONSE_TOO_LARGE', 'PATH_DENIED',
    'AUTH_ERROR', 'FORBIDDEN', 'VERSION_CONFLICT', 'REQUEST_CONFLICT', 'RECOVERY_REQUIRED',
    'RECOVERY_APPROVAL_REQUIRED', 'CONTROLLED_MIGRATION_DENIED', 'VALIDATION_ERROR', 'BUSY', 'SCHEMA_ERROR', 'IDENTITY_CONFLICT', 'OPERATION_ERROR']);
  const $ = id => document.getElementById(id);
  const set = (id, text) => { $(id).textContent = text; };
  const fail = code => { const error = new Error(); error.safeCode = code; throw error; };
  const errorCode = error => safeCodes.has(error?.safeCode) ? error.safeCode : 'RESPONSE_INVALID';
  let state = 'PRECHECK', initialized = false, busy = false, authorized = false, preflight = false, attempted = false, writeSent = false;
  function render() {
    set('state', state);
    $('precheck').disabled = !initialized || busy || attempted;
    $('confirmation').disabled = !preflight || busy || attempted;
    $('recover').disabled = state !== 'READY' || !authorized || !preflight || busy || attempted || $('confirmation').value !== 'RECOVER EMP001';
    $('statusCheck').disabled = !initialized || !authorized || busy || !attempted;
  }
  function transition(next, message) {
    // The write latch never resets, including after unknown/status outcomes.
    if (attempted && (next === 'READY' || next === 'PRECHECK')) return;
    state = next; set('message', message); render();
  }
  function liveToken() {
    try {
      if (!liff.isInClient() || !liff.isLoggedIn()) fail('LINE_REQUIRED');
      const token = liff.getIDToken();
      if (typeof token !== 'string' || !token.trim() || token.length > 12000) fail('TOKEN_REQUIRED');
      return token;
    } catch (error) { fail(safeCodes.has(error?.safeCode) ? error.safeCode : 'TOKEN_REQUIRED'); }
  }
  async function request(action) {
    if (!Object.hasOwn(routes, action)) fail('RESPONSE_INVALID');
    if (action === 'employeeLifecycleBaselineMigrate') {
      if (!attempted || !busy || state !== 'SUBMITTING' || writeSent) fail('RESPONSE_INVALID');
      writeSent = true; // Additional private guard before token retrieval or fetch.
    }
    const idToken = liveToken();
    const payload = action === 'identityBootstrap' ? { action, idToken } :
      action === 'employeeLifecycleBaselineRequestStatus' ? { action, idToken, employeeId: EMPLOYEE, requestId: REQUEST_ID } :
      { action, idToken, employeeId: EMPLOYEE, requestId: REQUEST_ID, expectedSnapshotVersion: SNAPSHOT, reason: REASON, confirmed: true };
    const controller = new AbortController(); let timer, closed = false;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => { closed = true; controller.abort(); const error = new Error(); error.safeCode = 'UPSTREAM_TIMEOUT'; reject(error); }, 20000);
      });
      const operation = async () => {
        let response;
        try {
          response = await fetch(RELAY + routes[action], { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload), redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
        } catch { fail('NETWORK_ERROR'); }
        if (closed) fail('UPSTREAM_TIMEOUT');
        const version = response.headers.get('x-transport-version');
        const allowed = [EXPECTED_VERSION];
        set('version', allowed.includes(version) ? version : '未識別');
        if (!allowed.includes(version)) fail('TRANSPORT_VERSION_REQUIRED');
        let result;
        try { result = await response.json(); } catch { fail('RESPONSE_INVALID'); }
        if (closed) fail('UPSTREAM_TIMEOUT');
        if (!result || Array.isArray(result) || typeof result !== 'object' || typeof result.success !== 'boolean') fail('RESPONSE_INVALID');
        if (!response.ok || !result.success) {
          const code = result.transportError || result.code;
          fail(safeCodes.has(code) ? code : !response.ok ? 'HTTP_ERROR' : 'RESPONSE_INVALID');
        }
        return result;
      };
      return await Promise.race([operation(), timeout]);
    } finally { closed = true; clearTimeout(timer); }
  }
  function validIdentity(result) {
    return result.success === true && result.state === 'ACTIVE_EMPLOYEE' && result.employee?.employeeId === EMPLOYEE &&
      ['OWNER', 'ADMIN'].includes(result.employee?.permission);
  }
  function validStatus(result) {
    const keys = ['success', 'employeeId', 'requestId', 'action', 'requestStatus',
      'historicalCompletion', 'currentConsistency', 'recoveryAllowed', 'newRequestAllowed'];
    // The pinned Worker may append this known read-only metadata. Never render/use it.
    return keys.every(key => Object.hasOwn(result, key)) &&
      Object.keys(result).every(key => keys.includes(key) || key === '_gasReadDiagnostics') &&
      result.success === true && result.employeeId === EMPLOYEE && result.requestId === REQUEST_ID &&
      result.action === 'employeeLifecycleBaselineMigrate' && result.recoveryAllowed === false && result.newRequestAllowed === false;
  }
  function readyStatus(result) {
    return validStatus(result) && result.requestStatus === 'STARTED' &&
      result.historicalCompletion === false && result.currentConsistency === 'MATCHED';
  }
  function validSuccess(result) {
    const keys = ['success', 'employeeId', 'requestId', 'baselineState', 'version', 'recoveryStatus'];
    return Object.keys(result).length === keys.length && keys.every(key => Object.hasOwn(result, key)) &&
      result.success === true && result.employeeId === EMPLOYEE && result.requestId === REQUEST_ID &&
      result.baselineState === 'RECORDED' && result.version === 1 && result.recoveryStatus === 'COMPLETED';
  }
  $('confirmation').addEventListener('input', render);
  $('precheck').addEventListener('click', async () => {
    if (!initialized || busy || attempted) return;
    busy = true; authorized = false; preflight = false; set('error', '無'); set('identity', '尚未確認');
    transition('PRECHECK', '讀取身分與固定原請求狀態；不寫入。');
    try {
      if (!validIdentity(await request('identityBootstrap'))) fail('IDENTITY_DENIED');
      authorized = true; set('identity', 'ACTIVE_EMPLOYEE / EMP001 / 管理權限符合');
      if (!readyStatus(await request('employeeLifecycleBaselineRequestStatus'))) fail('STATUS_NOT_READY');
      preflight = true;
      transition('READY', '原請求 STARTED / MATCHED。READY 僅代表唯讀條件符合；仍須另行人工批准續作與 Worker flag。');
    } catch (error) {
      authorized = false; preflight = false; set('error', errorCode(error));
      transition('PRECHECK', '檢查未通過，禁止寫入。');
    } finally { busy = false; render(); }
  });
  $('recover').addEventListener('click', async () => {
    if (!initialized || busy || attempted || state !== 'READY' || !authorized || !preflight || $('confirmation').value !== 'RECOVER EMP001') return;
    attempted = true; busy = true; preflight = false; // Set BEFORE any await/token/fetch.
    set('error', '無'); transition('REVALIDATING', '已鎖定本頁一次機會；重新驗證身分與原請求。');
    try {
      if (!validIdentity(await request('identityBootstrap'))) fail('IDENTITY_DENIED');
      if (!readyStatus(await request('employeeLifecycleBaselineRequestStatus'))) fail('STATUS_NOT_READY');
      transition('SUBMITTING', '重新驗證通過，僅續作固定原請求一次。');
      const result = await request('employeeLifecycleBaselineMigrate');
      if (!validSuccess(result)) fail('RESPONSE_INVALID');
      transition('SUCCESS', '收到 RECORDED / COMPLETED 成功回應。停止寫入；人工關閉 Worker flag，再查原請求狀態。');
    } catch (error) {
      set('error', errorCode(error));
      transition('WRITE_RESULT_UNKNOWN', '結果未知，僅能查原請求狀態。不得重送；由人工決定並關閉 Worker flag。');
    } finally { busy = false; render(); }
  });
  function statusState(result) {
    if (!validStatus(result)) fail('RESPONSE_INVALID');
    const h = result.historicalCompletion, c = result.currentConsistency;
    if (result.requestStatus === 'COMPLETED' && h === true && c === 'MATCHED') return 'STATUS_COMPLETED';
    if (result.requestStatus === 'STARTED' && h === false && c === 'MATCHED') return 'STATUS_STARTED';
    if (result.requestStatus === 'RECOVERY_REQUIRED' && [null, false, true].includes(h) && c === 'CONFLICT') return 'STATUS_RECOVERY_REQUIRED';
    fail('RESPONSE_INVALID');
  }
  const statusMessages = Object.freeze({
    STATUS_COMPLETED: '原請求 COMPLETED + MATCHED：具有完成證據。停止寫入；由人工核對並關閉 Worker flag。',
    STATUS_STARTED: '原請求仍為 STARTED + MATCHED，尚未證實完成。STOP，不得重送；交由人工調查。',
    STATUS_RECOVERY_REQUIRED: '原請求 RECOVERY_REQUIRED / CONFLICT。STOP，不得重送；交由人工調查。',
    WRITE_RESULT_UNKNOWN: '結果未知，僅能查原請求狀態。STOP，不得重送；由人工關閉 Worker flag。'
  });
  $('statusCheck').addEventListener('click', async () => {
    if (!initialized || busy || !authorized || !attempted) return;
    busy = true; set('error', '無'); transition('STATUS_CHECKING', '唯讀查詢固定原 requestId；不會觸發寫入。');
    try {
      const next = statusState(await request('employeeLifecycleBaselineRequestStatus'));
      transition(next, statusMessages[next]);
    } catch (error) {
      set('error', errorCode(error)); transition('WRITE_RESULT_UNKNOWN', statusMessages.WRITE_RESULT_UNKNOWN);
    } finally { busy = false; render(); }
  });
  set('requestId', REQUEST_ID); set('snapshot', SNAPSHOT); set('reason', REASON); render();
  (async () => {
    try {
      await liff.init({ liffId: LIFF_ID }); set('init', '成功');
      set('inLine', liff.isInClient() ? '是' : '否');
      liveToken(); set('token', '是'); initialized = true; render();
    } catch (error) {
      set('error', safeCodes.has(error?.safeCode) ? error.safeCode : 'LIFF_INIT_ERROR');
      if ($('init').textContent !== '成功') set('init', '失敗');
      set('message', '初始化或 LINE 身分條件未通過，禁止操作。');
    }
  })();
})();

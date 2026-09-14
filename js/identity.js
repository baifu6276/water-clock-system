// Strong identity for the employee foundation only; legacy callApi is untouched.
(() => {
  'use strict';
  const diagnostics = Object.freeze({
    "LINE_CHANNEL_ID_MISSING": "未設定 LINE_LOGIN_CHANNEL_ID。",
    "LINE_TOKEN_MISSING_OR_INVALID": "ID token 缺少或格式不符，請重新登入。",
    "LINE_VERIFY_NETWORK_ERROR": "GAS 無法完成 LINE verify 連線；請確認外部請求授權、配額與網路。",
    "LINE_VERIFY_HTTP_ERROR": "LINE verify 回傳非預期 HTTP 狀態，可能為限流或服務錯誤。",
    "LINE_TOKEN_REJECTED": "LINE 拒絕此 token；未取得可確認的細分類原因。",
    "LINE_AUDIENCE_MISMATCH": "LINE token 與設定的 LINE Login channel ID 不符；不可使用 LIFF ID 或其他 channel ID。",
    "LINE_ISSUER_MISMATCH": "LINE token issuer 不符。",
    "LINE_TOKEN_EXPIRED": "LINE token 已過期，請重新登入。",
    "LINE_SUB_MISSING": "LINE verify 成功回應缺少有效 sub。",
    "LINE_VERIFY_MALFORMED_RESPONSE": "LINE verify 回應不是預期 JSON／claims 格式。",
    "BACKEND_SCHEMA_ERROR": "後端資料表缺少或表頭不符。",
    "BACKEND_IDENTITY_CONFLICT": "員工或 LINE 綁定資料衝突。",
    "BACKEND_LOOKUP_ERROR": "後端讀取員工／綁定資料失敗，請確認 Spreadsheet 綁定與授權。",
    "BACKEND_INTERNAL_ERROR": "後端新身分流程發生未預期錯誤。",
    "GAS_NETWORK_ERROR": "瀏覽器未取得 GAS 回應，請確認網路、CORS 或部署存取設定。",
    "GAS_HTTP_ERROR": "GAS 回傳非成功 HTTP 狀態，請確認部署存取設定。",
    "GAS_NON_JSON_RESPONSE": "GAS 回應無法解析為 JSON，可能為登入／錯誤頁或部署問題。",
    "GAS_RESPONSE_INVALID": "GAS JSON 不符合新身分 API 回應格式，請確認部署版本。"
});
  function diagnosticError(code) {
    const error = new Error(diagnostics[code]); error.diagnosticCode = code; return error;
  }
  async function request(action, payload = {}) {
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('無法取得 LINE 身分憑證，請重新開啟 LINE；若仍失敗，請聯絡管理員確認 openid 設定。');
    let response, result;
    try {
      response = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
        body: JSON.stringify({ ...payload, action, idToken })
      });
    } catch (_) { throw diagnosticError('GAS_NETWORK_ERROR'); }
    if (!response.ok) throw diagnosticError('GAS_HTTP_ERROR');
    try { result = await response.json(); }
    catch (_) { throw diagnosticError('GAS_NON_JSON_RESPONSE'); }
    if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') throw diagnosticError('GAS_RESPONSE_INVALID');
    if (!result || result.success !== true) {
      const messages = {
        AUTH_ERROR: 'LINE 身分驗證失敗，請重新開啟 LINE 登入。',
        CONFIG_ERROR: '人員功能尚未完成設定，請聯絡管理員。',
        SCHEMA_ERROR: '人員資料表尚未設定完成，請聯絡管理員。',
        REQUEST_CONFLICT: '請求內容衝突，請聯絡管理員確認。',
        VERSION_CONFLICT: '資料已變更，請重新讀取。',
        FORBIDDEN: '沒有操作這筆資料的權限。',
        ALREADY_EMPLOYEE: '已有員工資料，請聯絡管理員處理。',
        VALIDATION_ERROR: '請檢查姓名、手機與申請說明。',
        INVALID_STATE: '申請已非待審核狀態，請重新讀取。'
      };
      const error = new Error(messages[result?.code] || '操作尚未完成，請以原操作重試或聯絡管理員。');
      error.code = Object.hasOwn(messages, result.code) ? result.code : 'OPERATION_ERROR';
      if (Object.hasOwn(diagnostics, result.diagnosticCode)) {
        error.diagnosticCode = result.diagnosticCode; error.message = diagnostics[result.diagnosticCode];
      }
      throw error;
    }
    return result;
  }
  let modulePromise;
  function loadApplicationModule() {
    if (window.EmployeeManagement) return Promise.resolve();
    if (!modulePromise) modulePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'js/employee-management.js';
      const fail = () => { script.remove(); reject(new Error('申請畫面載入失敗，請重新整理。')); };
      script.addEventListener('load', () => window.EmployeeManagement ? resolve() : fail(), { once: true });
      script.addEventListener('error', fail, { once: true });
      document.head.append(script);
    }).catch(error => { modulePromise = null; throw error; });
    return modulePromise;
  }
  async function route() {
    document.getElementById('legacyEmployeeContent').hidden = true;
    const result = await request('identityBootstrap');
    if (result.state === 'ACTIVE_EMPLOYEE') {
      if (!result.employee?.employeeId) throw new Error('員工資料不完整，請聯絡管理員。');
      document.getElementById('legacyEmployeeContent').hidden = false;
      return true;
    }
    if (!['UNREGISTERED', 'APPLICATION_PENDING', 'SUSPENDED', 'LEAVE', 'TERMINATED'].includes(result.state)) {
      throw new Error('身分狀態無法確認，請聯絡管理員。');
    }
    document.getElementById('legacyEmployeeContent').hidden = true;
    await loadApplicationModule();
    await window.EmployeeManagement.open(result.state);
    return false;
  }
  window.EmployeeIdentity = Object.freeze({ request, route, diagnostics });
})();

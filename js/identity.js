// Strong identity for the employee foundation only; legacy callApi is untouched.
(() => {
  'use strict';
  async function request(action, payload = {}) {
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('無法取得 LINE 身分憑證，請重新開啟 LINE；若仍失敗，請聯絡管理員確認 openid 設定。');
    let response, result;
    try {
      response = await fetch(GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow',
        body: JSON.stringify({ ...payload, action, idToken })
      });
      if (!response.ok) throw new Error('network');
      result = await response.json();
    } catch (_) { throw new Error('連線結果尚未確認，請稍後以原操作重試。'); }
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
      error.code = result?.code;
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
  window.EmployeeIdentity = Object.freeze({ request, route });
})();

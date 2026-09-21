(() => {
  'use strict';
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  const button = document.getElementById('check');
  const codes = new Set(['CONFIG_ERROR', 'HTTPS_REQUIRED', 'PATH_DENIED', 'ORIGIN_DENIED',
    'METHOD_DENIED', 'CONTENT_TYPE_INVALID', 'REQUEST_INVALID', 'REQUEST_TOO_LARGE', 'TOKEN_REQUIRED',
    'ACTION_DENIED', 'UPSTREAM_TIMEOUT', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_HTTP_ERROR',
    'UPSTREAM_REDIRECT_DENIED', 'UPSTREAM_REDIRECT_LIMIT', 'UPSTREAM_RESPONSE_TOO_LARGE',
    'UPSTREAM_JSON_INVALID', 'TRANSPORT_ERROR', 'AUTH_ERROR', 'FORBIDDEN', 'SCHEMA_ERROR',
    'IDENTITY_CONFLICT', 'OPERATION_ERROR', 'LINE_CHANNEL_ID_MISSING', 'LINE_TOKEN_MISSING_OR_INVALID',
    'LINE_VERIFY_NETWORK_ERROR', 'LINE_VERIFY_HTTP_ERROR', 'LINE_TOKEN_REJECTED', 'LINE_AUDIENCE_MISMATCH',
    'LINE_ISSUER_MISMATCH', 'LINE_TOKEN_EXPIRED', 'LINE_SUB_MISSING', 'LINE_VERIFY_MALFORMED_RESPONSE',
    'LINE_VERIFY_PERMISSION_ERROR', 'LINE_VERIFY_FETCH_ERROR', 'BACKEND_SCHEMA_ERROR',
    'BACKEND_IDENTITY_CONFLICT', 'BACKEND_LOOKUP_ERROR', 'BACKEND_INTERNAL_ERROR']);
  const states = new Set(['ACTIVE_EMPLOYEE', 'UNREGISTERED', 'APPLICATION_PENDING', 'SUSPENDED', 'LEAVE', 'TERMINATED', 'AUTH_ERROR']);
  let ready = false, busy = false;
  button.addEventListener('click', async () => {
    if (!ready || busy) return;
    busy = true; button.disabled = true;
    for (const id of ['employee', 'correlation', 'version', 'state']) set(id, '—');
    set('error', '無'); set('http', '處理中');
    const controller = new AbortController(); let timer;
    try {
      let endpoint;
      try { endpoint = new URL(window.TransportT1Config.relayEndpoint); } catch { throw new Error('CONFIG_ERROR'); }
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/identity') throw new Error('CONFIG_ERROR');
      const idToken = liff.getIDToken();
      set('token', idToken ? '是' : '否');
      if (!idToken) throw new Error('TOKEN_REQUIRED');
      timer = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(endpoint.href, { method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'identityBootstrap', idToken }),
        redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      set('http', String(response.status));
      const version = response.headers.get('x-transport-version');
      set('version', version === 't1-1' ? version : '未識別');
      const correlation = response.headers.get('x-correlation-id');
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(correlation || '')) set('correlation', correlation);
      const result = await response.json();
      if (!result || typeof result.success !== 'boolean') throw new Error('TRANSPORT_ERROR');
      if (!response.ok || !result.success) {
        const code = result.transportError || result.diagnosticCode || result.code;
        throw new Error(codes.has(code) ? code : 'TRANSPORT_ERROR');
      }
      if (!states.has(result.state)) throw new Error('TRANSPORT_ERROR');
      set('state', result.state);
      if (result.state === 'ACTIVE_EMPLOYEE') {
        if (typeof result.employee?.employeeId !== 'string' || typeof result.employee?.name !== 'string') throw new Error('TRANSPORT_ERROR');
        set('employee', result.employee.employeeId + ' / ' + result.employee.name);
      }
      set('http', response.status + ' / 成功');
    } catch (error) {
      set('error', controller.signal.aborted ? 'UPSTREAM_TIMEOUT' : codes.has(error.message) ? error.message : 'TRANSPORT_ERROR');
      set('employee', '—');
    } finally { clearTimeout(timer); busy = false; button.disabled = !ready; }
  });
  document.getElementById('login').addEventListener('click', () => { if (!busy) liff.login(); });
  (async () => {
    try {
      await liff.init({ liffId: window.TransportT1Config.liffId });
      set('init', '成功'); set('inLine', liff.isInClient() ? '是' : '否');
      if (!liff.isLoggedIn()) { document.getElementById('login').hidden = false; return; }
      ready = true; set('token', liff.getIDToken() ? '是' : '否'); button.disabled = false;
    } catch { set('init', '失敗'); set('error', 'LIFF_INIT_ERROR'); }
  })();
})();

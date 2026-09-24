(() => {
  'use strict';
  const $ = id => document.getElementById(id), set = (id, value) => { $(id).textContent = value; };
  const KEY = 'water-clock:t4:EMP001:operation:v1';
  const ACTION = 'employeeLifecycleBaselineMigrate', VERSION = 't4-safety-1';
  const routes = Object.freeze({ identityBootstrap: '/identity', employeeLifecycleBaselineDryRun: '/employee-read',
    employeeLifecycleBaselineRequestStatus: '/employee-operation-status', employeeLifecycleBaselineMigrate: '/employee-baseline-migrate' });
  const codes = new Set(['AUTH_ERROR', 'FORBIDDEN', 'VALIDATION_ERROR', 'VERSION_CONFLICT', 'REQUEST_CONFLICT',
    'CONTROLLED_MIGRATION_DENIED', 'RECOVERY_APPROVAL_REQUIRED', 'RECOVERY_REQUIRED', 'BUSY', 'OPERATION_ERROR',
    'TOKEN_REQUIRED', 'CONFIG_ERROR', 'STORAGE_ERROR', 'TRANSPORT_ERROR', 'UPSTREAM_TIMEOUT', 'PATH_DENIED', 'RESPONSE_INVALID']);
  let ready = false, busy = false, identity = null, preview = null, frozen = null, journal = null, blocked = false;
  const manager = () => identity?.state === 'ACTIVE_EMPLOYEE' && typeof identity.employeeId === 'string' && Boolean(identity.employeeId) && ['OWNER', 'ADMIN'].includes(identity.permission) && identity.version === VERSION;
  const validId = value => typeof value === 'string' && /^t4-baseline-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  function validJournal(j) {
    return j && !Array.isArray(j) && Object.keys(j).sort().join('|') === 'action|attemptMayHaveStarted|employeeId|requestId|state' &&
      j.action === ACTION && j.employeeId === 'EMP001' && validId(j.requestId) && typeof j.attemptMayHaveStarted === 'boolean' &&
      ['PREPARED', 'SUBMITTING'].includes(j.state) && (j.state === 'SUBMITTING') === j.attemptMayHaveStarted;
  }
  function readJournal() {
    try { const raw = localStorage.getItem(KEY); if (!raw) return null;
      const j = JSON.parse(raw); if (!validJournal(j)) throw new Error(); return j;
    } catch (_) { blocked = true; throw new Error('STORAGE_ERROR'); }
  }
  function saveJournal(j) {
    try { const raw = JSON.stringify(j); localStorage.setItem(KEY, raw);
      if (localStorage.getItem(KEY) !== raw) throw new Error();
    } catch (_) { blocked = true; throw new Error('STORAGE_ERROR'); }
  }
  function controls() {
    $('identityCheck').disabled = !ready || busy;
    $('management').hidden = !manager();
    const can = ready && manager() && !busy;
    $('preview').disabled = !can || blocked || Boolean(journal);
    $('reason').disabled = !can || blocked || Boolean(journal) || !preview;
    $('confirmed').disabled = $('reason').disabled;
    $('prepare').disabled = $('reason').disabled;
    $('submit').disabled = !can || blocked || !frozen || !journal || journal.attemptMayHaveStarted || frozen.operatorId !== identity?.employeeId;
    $('statusCheck').disabled = !can || !journal;
    set('requestId', journal ? journal.requestId : '—');
  }
  function safeError(error) { set('error', codes.has(error?.message) ? error.message : 'TRANSPORT_ERROR'); }
  function render(id, pairs) {
    $(id).replaceChildren();
    for (const [label, value] of pairs) { const dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; $(id).append(dt, dd); }
  }
  async function request(action, fields = {}) {
    if (!Object.hasOwn(routes, action) || (action !== 'identityBootstrap' && !manager())) throw new Error('FORBIDDEN');
    let url; try { url = new URL(window.TransportT1Config.relayEndpoint); } catch (_) { throw new Error('CONFIG_ERROR'); }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/identity') throw new Error('CONFIG_ERROR');
    url.pathname = routes[action];
    const token = liff.getIDToken(); if (typeof token !== 'string' || !token) throw new Error('TOKEN_REQUIRED');
    const controller = new AbortController(); let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('UPSTREAM_TIMEOUT')); }, 25000); });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await fetch(url.href, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, idToken: token, ...fields }), redirect: 'error', credentials: 'omit', cache: 'no-store',
          referrerPolicy: 'no-referrer', signal: controller.signal });
        if (response.headers.get('x-transport-version') !== VERSION) throw new Error('RESPONSE_INVALID');
        const data = await response.json();
        if (!response.ok || data?.success !== true) {
          const code = data?.transportError || data?.code;
          throw new Error(codes.has(code) ? code : 'TRANSPORT_ERROR');
        }
        return data;
      })()]);
    } finally { clearTimeout(timer); }
  }
  $('identityCheck').addEventListener('click', async () => {
    if (!ready || busy) return;
    busy = true; identity = null; preview = null; frozen = null; controls(); set('error', '無');
    $('previewFields').replaceChildren(); $('statusFields').replaceChildren(); set('snapshotGate', '尚未取得快照');
    try {
      const r = await request('identityBootstrap');
      identity = { state: r.state, employeeId: r.employee?.employeeId, permission: r.employee?.permission, version: VERSION };
      if (typeof identity.employeeId !== 'string') identity.employeeId = '';
      set('identityStatus', manager() ? '在職管理員身分已驗證' : '此身分無受控操作權限');
      journal = readJournal();
      if (journal) set('message', '已有原操作編號；本次開啟僅允許狀態查詢，不會重送。');
    } catch (e) { identity = null; safeError(e); set('identityStatus', '身分尚未確認'); }
    finally { busy = false; controls(); }
  });
  $('preview').addEventListener('click', async () => {
    if (!manager() || busy || blocked || journal) return;
    busy = true; preview = null; controls(); set('error', '無');
    try {
      if (readJournal()) { blocked = true; throw new Error('STORAGE_ERROR'); }
      const r = await request('employeeLifecycleBaselineDryRun', { employeeId: 'EMP001' });
      const fields = ['name', 'employeeStatus', 'grade', 'salaryType', 'systemRole', 'hireDate'];
      if (r.employeeId !== 'EMP001' || r.dryRun !== true || r.eligible !== true || r.baselineState !== 'LEGACY_NOT_BASELINED' ||
          r.bindingSource !== 'PRESENT' || !fields.every(k => typeof r[k] === 'string') ||
          !(typeof r.salaryAmount === 'string' || typeof r.salaryAmount === 'number' && Number.isFinite(r.salaryAmount)) ||
          typeof r.snapshotVersion !== 'string' || !/^[a-f0-9]{64}$/.test(r.snapshotVersion) ||
          !Array.isArray(r.warnings) || r.warnings.some(w => w !== 'HIRE_DATE_UNKNOWN')) throw new Error('RESPONSE_INVALID');
      preview = { snapshotVersion: r.snapshotVersion, operatorId: identity.employeeId };
      render('previewFields', [['員工', 'EMP001'], ['姓名', r.name], ['狀態', r.employeeStatus], ['級職', r.grade], ['薪資制', r.salaryType],
        ['薪資金額', r.salaryAmount], ['角色', r.systemRole], ['到職日', r.hireDate || '未知，保持空白'],
        ['警告', r.warnings.length ? 'HIRE_DATE_UNKNOWN：不補造歷史日期' : '無']]);
      set('snapshotGate', '原快照已保留；GAS 會在寫入鎖內重新比對。');
      set('message', '核對資料與原因後固定原操作編號；仍須 server permit。');
    } catch (e) { safeError(e); set('message', '預覽未確認，禁止寫入。'); }
    finally { busy = false; controls(); }
  });
  $('prepare').addEventListener('click', () => {
    if (!manager() || busy || blocked || journal || !preview || preview.operatorId !== identity.employeeId) return;
    try {
      if (readJournal()) { blocked = true; throw new Error('STORAGE_ERROR'); }
      const reason = $('reason').value.trim();
      if (!reason || $('reason').value.length > 1000 || !$('confirmed').checked) throw new Error('VALIDATION_ERROR');
      const requestId = 't4-baseline-' + crypto.randomUUID(); if (!validId(requestId)) throw new Error('CONFIG_ERROR');
      journal = { action: ACTION, employeeId: 'EMP001', requestId, attemptMayHaveStarted: false, state: 'PREPARED' };
      saveJournal(journal);
      frozen = Object.freeze({ employeeId: 'EMP001', requestId, expectedSnapshotVersion: preview.snapshotVersion, reason, confirmed: true, operatorId: identity.employeeId });
      set('message', '操作編號與內容已固定。須由管理員依私人核准紀錄準備 server permit，才可送出一次。');
    } catch (e) { safeError(e); }
    controls();
  });
  $('submit').addEventListener('click', async () => {
    if (!ready || !manager() || busy || blocked || !frozen || !journal || journal.attemptMayHaveStarted || frozen.operatorId !== identity.employeeId) return;
    busy = true; controls(); set('error', '無');
    try {
      const stored = readJournal();
      if (!stored || JSON.stringify(stored) !== JSON.stringify(journal)) { blocked = true; throw new Error('STORAGE_ERROR'); }
      journal = { ...journal, state: 'SUBMITTING', attemptMayHaveStarted: true }; saveJournal(journal);
      const { operatorId, ...payload } = frozen;
      frozen = null; preview = null; controls();
      const r = await request(ACTION, payload);
      if (r.employeeId !== 'EMP001' || r.requestId !== journal.requestId || r.baselineState !== 'RECORDED' || r.version !== 1 || r.recoveryStatus !== 'COMPLETED') throw new Error('RESPONSE_INVALID');
      set('message', '已收到處理回覆，尚待查詢原請求與人工核對；請勿再次送出。');
    } catch (e) {
      safeError(e); blocked = true;
      set('message', '結果尚未確認，後端可能已完成或部分完成。保留原操作編號，僅查詢狀態，勿再次送出。');
    } finally { frozen = null; busy = false; controls(); }
  });
  const messages = Object.freeze({
    COMPLETED: '原請求已完成且目前資料相符。請完成人工唯讀核對後結案，不需再次寫入。',
    STARTED: '原請求已有開始紀錄，尚未完成結案。停止寫入，等待人工核對。',
    NOT_OBSERVED: '尚無此登入者可見的原請求證據；不代表未寫入，不允許建立新請求。',
    UNKNOWN: '目前無法確認原請求，請勿重送或更換操作編號。',
    RECOVERY_REQUIRED: '資料或回執需要人工核對；本頁不會修復或重送。'
  });
  $('statusCheck').addEventListener('click', async () => {
    if (!manager() || busy || !journal) return;
    busy = true; frozen = null; controls(); set('error', '無');
    try {
      const r = await request('employeeLifecycleBaselineRequestStatus', { employeeId: 'EMP001', requestId: journal.requestId });
      const tuples = { COMPLETED: r.historicalCompletion === true && r.currentConsistency === 'MATCHED',
        STARTED: r.historicalCompletion === false && ['ABSENT', 'PARTIAL', 'MATCHED'].includes(r.currentConsistency),
        NOT_OBSERVED: r.historicalCompletion === false && r.currentConsistency === 'UNKNOWN',
        UNKNOWN: r.historicalCompletion === null && r.currentConsistency === 'UNKNOWN',
        RECOVERY_REQUIRED: [true, false, null].includes(r.historicalCompletion) && r.currentConsistency === 'CONFLICT' };
      if (r.employeeId !== 'EMP001' || r.requestId !== journal.requestId || r.action !== ACTION || r.recoveryAllowed !== false ||
          r.newRequestAllowed !== false || !Object.hasOwn(tuples, r.requestStatus) || !tuples[r.requestStatus]) throw new Error('RESPONSE_INVALID');
      render('statusFields', [['原請求狀態', r.requestStatus], ['目前一致性', r.currentConsistency], ['允許新增／續作', '否']]);
      set('message', messages[r.requestStatus]);
    } catch (e) { safeError(e); set('message', '結果尚未確認；保留原操作編號，停止寫入並交由管理員核對。'); }
    finally { busy = false; controls(); }
  });
  window.addEventListener('storage', event => {
    if (event.key !== KEY && event.key !== null) return;
    blocked = true; frozen = null;
    try { journal = readJournal() || journal; } catch (_) { set('error', 'STORAGE_ERROR'); }
    set('message', '操作紀錄由其他頁面變動；停止寫入，只能查詢原操作。'); controls();
  });
  $('login').addEventListener('click', () => { if (!busy) liff.login(); });
  (async () => {
    try { journal = readJournal(); } catch (e) { safeError(e); }
    try {
      await liff.init({ liffId: window.TransportT1Config.liffId });
      ready = liff.isLoggedIn(); $('login').hidden = ready;
      set('identityStatus', ready ? 'LIFF 已初始化，請手動驗證身分' : '請先登入 LINE');
      if (journal) set('message', '已有原操作編號；只允許唯讀查詢，不會重送。');
    } catch (_) { set('identityStatus', 'LIFF 初始化失敗'); set('error', 'AUTH_ERROR'); }
    controls();
  })();
})();

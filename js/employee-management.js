// Applicant and pending-application review UI. All writes use verified backend actions.
(() => {
  'use strict';
  const root = document.getElementById('employeeIdentityPanel');
  let busy = false, intent = null;
  const storageKey = () => 'employee-application-intent:' + userId;
  const node = (tag, text) => { const el = document.createElement(tag); if (text != null) el.textContent = text; return el; };
  const message = node('p'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const controls = node('fieldset'), list = node('div'), form = node('form');
  const fields = {};
  let currentState;
  function saveIntent(next) {
    // Keep only the unresolved business request, never an ID token.
    if (next) sessionStorage.setItem(storageKey(), JSON.stringify(next));
    else sessionStorage.removeItem(storageKey());
    intent = next;
  }
  async function run(work) {
    if (busy) return;
    busy = true; controls.disabled = true;
    try { await work(); }
    catch (error) { message.textContent = error.message; }
    finally { busy = false; controls.disabled = false; syncIntent(); }
  }
  function button(text, handler, parent = controls) {
    const el = node('button', text); el.type = 'button'; el.addEventListener('click', handler); parent.append(el); return el;
  }
  function syncIntent() {
    form.hidden = currentState !== 'UNREGISTERED' || Boolean(intent);
    retry.hidden = !intent;
    list.querySelectorAll('button').forEach(b => { b.disabled = Boolean(intent); });
  }
  async function write() {
    message.textContent = '正在送出…';
    try {
      await EmployeeIdentity.request(intent.action, intent.payload);
    } catch (error) {
      // These are definitive rejections; uncertain failures must retain the original request.
      if (['VERSION_CONFLICT', 'FORBIDDEN', 'INVALID_STATE', 'ALREADY_EMPLOYEE', 'VALIDATION_ERROR'].includes(error.code)) saveIntent(null);
      throw error;
    }
    saveIntent(null);
    message.textContent = '操作已完成。';
    await refresh();
  }
  async function refresh() {
    const identity = await EmployeeIdentity.request('identityBootstrap');
    if (identity.state === 'ACTIVE_EMPLOYEE') { location.reload(); return; }
    currentState = identity.state;
    if (!['UNREGISTERED', 'APPLICATION_PENDING'].includes(currentState)) { list.replaceChildren(); syncIntent(); return; }
    const result = await EmployeeIdentity.request('employeeApplicationListOwn');
    if (!Array.isArray(result.applications)) throw new Error('申請資料格式錯誤，請聯絡管理員。');
    list.replaceChildren();
    result.applications.forEach(a => {
      const card = node('article');
      card.append(node('h3', a.status), node('p', a.name), node('p', a.note || '未填申請說明'));
      if (a.status === '待審核') button('取消申請', () => run(async () => {
        if (intent || !window.confirm('確定取消這筆待審核申請？')) return;
        saveIntent({ action: 'employeeApplicationCancel', payload: { applicationId: a.applicationId, expectedVersion: Number(a.version), requestId: crypto.randomUUID() } });
        await write();
      }), card);
      list.append(card);
    });
    syncIntent();
  }
  ['name', 'phone', 'note'].forEach((name, i) => {
    const label = node('label', ['姓名', '手機', '申請說明'][i]);
    const input = node(name === 'note' ? 'textarea' : 'input');
    input.name = name; input.maxLength = [80, 30, 1000][i]; input.required = name !== 'note';
    if (name === 'phone') input.type = 'tel';
    label.append(input); form.append(label); fields[name] = input;
  });
  const submit = node('button', '送出加入申請'); submit.type = 'submit'; form.append(submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (intent || !form.reportValidity()) return;
    run(async () => {
      saveIntent({ action: 'employeeApplicationSubmit', payload: { requestId: crypto.randomUUID(), type: 'NEW_EMPLOYEE',
        name: fields.name.value.trim(), phone: fields.phone.value.trim(), note: fields.note.value.trim() } });
      await write();
    });
  });
  controls.append(form);
  const retry = button('重試前次操作', () => run(write)); retry.hidden = true;
  button('重新讀取狀態', () => run(refresh));
  controls.append(list);
  root.append(node('h2', '申請加入公司'), message, controls);
  async function open(state) {
    root.hidden = false; currentState = state;
    const labels = { APPLICATION_PENDING: '申請待審核，核准前無法使用正式員工功能。',
      UNREGISTERED: '請填寫加入申請，由管理員審核。', SUSPENDED: '目前為停職狀態，請聯絡管理員。',
      LEAVE: '目前為留停狀態，請聯絡管理員。', TERMINATED: '目前為離職狀態，請聯絡管理員。' };
    message.textContent = labels[state] || '請聯絡管理員確認身分。';
    try { intent = JSON.parse(sessionStorage.getItem(storageKey()) || 'null'); }
    catch (_) { message.textContent = '瀏覽器儲存空間無法使用，請重新開啟 LINE。'; }
    syncIntent();
    if (['UNREGISTERED', 'APPLICATION_PENDING'].includes(state)) await run(refresh);
  }
  // Built only when a verified manager opens the pending-application panel.
  let admin;
  async function openAdmin() {
    if (!admin) admin = buildAdmin();
    await admin.open();
  }
  function buildAdmin() {
    const panel = document.getElementById('employeeAdminPanel');
    const status = node('p'); status.id = 'employeeAdminStatus';
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const area = node('fieldset'), applications = node('div'), detail = node('div');
    const approval = node('form'), rejection = node('form'), inputs = {};
    const roles = { OWNER: '擁有者', ADMIN: '管理員', SITE_MANAGER: '工地管理員', EMPLOYEE: '員工' };
    const grades = ['老闆', '領班', '師傅', '半技', '學徒'];
    const safe = {
      FORBIDDEN: '目前沒有在職管理員權限。', AUTH_ERROR: '身分驗證失敗，請重新登入後再試。',
      VERSION_CONFLICT: '申請已被更新，請重新讀取並再次審核。',
      APPLICATION_NOT_PENDING: '申請已非待審核，請重新讀取清單。', APPLICATION_NOT_FOUND: '找不到申請，請重新讀取清單。',
      INVALID_APPROVAL_DATA: '請檢查必填欄位、薪資金額與到職日。', VALIDATION_ERROR: '請檢查必填欄位。',
      INVALID_ROLE_ASSIGNMENT: '目前權限不能授予此角色，請聯絡管理員。',
      RECOVERY_REQUIRED: '操作尚待確認，請保留原操作重試；若仍失敗，請聯絡管理員人工核對，不要另建申請。',
      REQUEST_CONFLICT: '原操作內容衝突，請保留紀錄並聯絡管理員。',
      IDENTITY_CONFLICT: '既有員工身分需人工核對，本功能不處理回任或重綁。',
      LINE_BINDING_CONFLICT: '既有 LINE 綁定需人工核對，本功能不處理重綁。',
      EMPLOYMENT_CONFLICT: '已有任職紀錄，請聯絡管理員人工核對。',
      STORAGE_ERROR: '無法保存操作紀錄，已停止送出。請保留此頁並確認瀏覽器儲存功能。',
      RESPONSE_ERROR: '回應格式不符，請重新讀取；若剛送出審核，請重試原操作。'
    };
    let working = false, actor = null, sessionActorId = null, selected = null, pending = null, storageBlocked = false;
    const error = code => Object.assign(new Error('人員管理操作未完成'), { code });
    const key = () => 'employee-review-intent:' + actor.employeeId;
    const permitted = () => actor && ['OWNER', 'ADMIN'].includes(actor.permission);
    const permittedRoles = () => actor?.permission === 'OWNER' ? Object.keys(roles) : ['ADMIN', 'SITE_MANAGER', 'EMPLOYEE'];
    function notice(text) { status.textContent = text; status.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    function addButton(text, fn, parent = area) {
      const b = node('button', text); b.type = 'button'; b.addEventListener('click', fn); parent.append(b); return b;
    }
    function field(name, label, type, choices) {
      const wrap = node('label', label), input = node(choices ? 'select' : type === 'textarea' ? 'textarea' : 'input');
      input.name = name;
      if (choices) { input.append(new Option('請選擇', '')); choices.forEach(v => input.append(new Option(roles[v] || v, v))); }
      else if (type !== 'textarea') input.type = type || 'text';
      wrap.append(input); approval.append(wrap); inputs[name] = input; return input;
    }
    function sync() {
      area.disabled = working || !permitted();
      approval.hidden = rejection.hidden = !selected || Boolean(pending) || storageBlocked;
      retryReview.hidden = !pending || storageBlocked;
      applications.querySelectorAll('button').forEach(b => { b.disabled = Boolean(pending) || storageBlocked; });
      recovery.textContent = pending ? '有結果未確認的審核。重試會沿用原內容與原請求；請勿清除瀏覽器資料或換另一個操作。' : '';
    }
    async function runAdmin(work) {
      if (working) return;
      working = true; sync();
      try { await work(); }
      catch (e) {
        if (['FORBIDDEN', 'AUTH_ERROR'].includes(e?.code)) { actor = null; applications.replaceChildren(); detail.hidden = true; }
        notice(Object.hasOwn(safe, e?.code) ? safe[e.code] : '操作結果尚未確認，請手動重試；不會自動再次送出。');
      }
      finally { working = false; sync(); }
    }
    async function identify() {
      const result = await EmployeeIdentity.request('identityBootstrap');
      if (result.state !== 'ACTIVE_EMPLOYEE' || !['OWNER', 'ADMIN'].includes(result.employee?.permission) || !result.employee.employeeId) {
        actor = null; applications.replaceChildren(); detail.hidden = true; throw error('FORBIDDEN');
      }
      if (sessionActorId && sessionActorId !== result.employee.employeeId) {
        actor = null; applications.replaceChildren(); detail.hidden = true; throw error('FORBIDDEN');
      }
      sessionActorId = result.employee.employeeId;
      actor = { employeeId: result.employee.employeeId, permission: result.employee.permission };
    }
    function store(next) {
      try {
        if (next) sessionStorage.setItem(key(), JSON.stringify(next));
        else sessionStorage.removeItem(key());
        pending = next;
      } catch (_) { storageBlocked = true; throw error('STORAGE_ERROR'); }
    }
    function restore() {
      try {
        const saved = JSON.parse(sessionStorage.getItem(key()) || 'null');
        if (saved && (!['employeeApplicationApprove', 'employeeApplicationReject'].includes(saved.action) ||
            !saved.payload || typeof saved.payload.requestId !== 'string' || typeof saved.payload.applicationId !== 'string' ||
            !Number.isInteger(saved.payload.expectedVersion))) throw error('STORAGE_ERROR');
        if (saved) {
          // Only the request contract is retained; never serialize a whole response or token.
          const names = ['applicationId', 'requestId', 'expectedVersion', 'adminNote'];
          if (saved.action === 'employeeApplicationApprove') names.push('grade', 'salaryType', 'salaryAmount', 'systemRole', 'hireDate');
          pending = { action: saved.action, payload: Object.fromEntries(names.map(k => [k, saved.payload[k]])) };
        } else pending = null;
      } catch (_) { storageBlocked = true; throw error('STORAGE_ERROR'); }
    }
    async function loadList() {
      selected = null; detail.hidden = true; applications.replaceChildren();
      const result = await EmployeeIdentity.request('employeeApplicationAdminList');
      if (!Array.isArray(result.applications) || !result.applications.every(a => a && typeof a.applicationId === 'string' &&
          a.type === 'NEW_EMPLOYEE' && a.status === '待審核' && Number.isInteger(a.version) && a.version > 0 &&
          typeof a.name === 'string' && typeof a.phone === 'string' && typeof a.note === 'string')) throw error('RESPONSE_ERROR');
      if (!result.applications.length) applications.append(node('p', '目前沒有待審申請。'));
      result.applications.forEach(a => {
        const card = node('article'); card.append(node('h3', a.name || '姓名未提供'), node('p', '待審核'));
        if (a.recoveryRequired) card.append(node('p', '此申請有未完成操作，需由原管理員重試或人工確認。'));
        else addButton('審核申請', () => {
          if (working || pending || storageBlocked || !permitted()) return;
          selected = { applicationId: a.applicationId, version: a.version, name: a.name, phone: a.phone, note: a.note };
          approval.reset(); rejection.reset();
          inputs.name.value = selected.name; inputs.phone.value = selected.phone;
          description.textContent = selected.note || '未填申請說明';
          inputs.systemRole.replaceChildren(new Option('請選擇', ''));
          permittedRoles().forEach(r => inputs.systemRole.append(new Option(roles[r], r)));
          detail.hidden = false; sync(); detail.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, card);
        applications.append(card);
      });
    }
    async function writeReview() {
      if (!pending || storageBlocked) return;
      await identify();
      if (pending.action === 'employeeApplicationApprove' && !permittedRoles().includes(pending.payload.systemRole)) throw error('INVALID_ROLE_ASSIGNMENT');
      let result;
      try { result = await EmployeeIdentity.request(pending.action, pending.payload); }
      catch (e) {
        // Only these pre-write failures prove no checkpoint was created.
        if (['VERSION_CONFLICT', 'APPLICATION_NOT_PENDING', 'APPLICATION_NOT_FOUND', 'INVALID_APPROVAL_DATA', 'VALIDATION_ERROR'].includes(e?.code)) {
          store(null); selected = null; detail.hidden = true; applications.replaceChildren();
        }
        throw e;
      }
      const expected = pending.action === 'employeeApplicationApprove' ? '已核准' : '已拒絕';
      if (result.application?.applicationId !== pending.payload.applicationId || result.application.status !== expected) throw error('RESPONSE_ERROR');
      store(null); selected = null; detail.hidden = true;
      notice('審核已完成，正在重新讀取待審清單…');
      try { await loadList(); notice('審核已完成，待審清單已更新。'); }
      catch (_) { applications.replaceChildren(); notice('審核已完成，但清單讀取失敗。請按「重新讀取待審申請」，不要重新送出審核。'); }
    }
    async function startReview(approve) {
      if (working || pending || storageBlocked || !selected || !permitted()) return;
      const adminNote = approve ? inputs.adminNote.value.trim() : reason.value.trim();
      if (!approve && !adminNote) { notice('拒絕申請必須填寫原因。'); return; }
      if (approve && (!approval.reportValidity() || !grades.includes(inputs.grade.value) ||
          !['日薪', '月薪'].includes(inputs.salaryType.value) || !permittedRoles().includes(inputs.systemRole.value) ||
          inputs.salaryAmount.value.trim() === '' || !Number.isFinite(Number(inputs.salaryAmount.value)) || Number(inputs.salaryAmount.value) < 0)) {
        notice('請完整填寫核准資料；薪資金額不得空白或小於零。'); return;
      }
      if (!window.confirm(approve ? '確定核准這筆申請並建立正式員工？' : '確定拒絕這筆申請？')) return;
      await runAdmin(async () => {
        const payload = { applicationId: selected.applicationId, expectedVersion: selected.version, requestId: crypto.randomUUID(), adminNote };
        if (approve) Object.assign(payload, { grade: inputs.grade.value, salaryType: inputs.salaryType.value,
          salaryAmount: Number(inputs.salaryAmount.value), systemRole: inputs.systemRole.value, hireDate: inputs.hireDate.value });
        store({ action: approve ? 'employeeApplicationApprove' : 'employeeApplicationReject', payload });
        await writeReview();
      });
    }
    panel.append(node('h2', '待審申請管理'), status, area);
    addButton('重新讀取待審申請', () => runAdmin(async () => { await identify(); await loadList(); notice('待審清單已更新。'); }));
    const recovery = node('p'); area.append(recovery);
    const retryReview = addButton('重試原審核操作', () => runAdmin(writeReview));
    area.append(applications, detail); detail.hidden = true;
    detail.append(node('h3', '申請資料'), node('p', '姓名與電話依原申請採用，本階段不提供修改。'));
    const description = node('p'); detail.append(description, approval, rejection);
    field('name', '姓名').readOnly = true; field('phone', '電話', 'tel').readOnly = true;
    field('grade', '級職', null, grades).required = true;
    field('salaryType', '薪資制', null, ['日薪', '月薪']).required = true;
    const amount = field('salaryAmount', '薪資金額', 'number'); amount.required = true; amount.min = '0'; amount.step = 'any';
    field('systemRole', '系統權限', null, []).required = true;
    field('hireDate', '到職日', 'date').required = true;
    field('adminNote', '備註', 'textarea').maxLength = 1000;
    const approveButton = node('button', '核准並建立員工'); approveButton.type = 'submit'; approval.append(approveButton);
    approval.addEventListener('submit', e => { e.preventDefault(); startReview(true); });
    const reasonLabel = node('label', '拒絕原因（必填）'), reason = node('textarea'); reason.name = 'rejectionReason'; reason.maxLength = 1000;
    reasonLabel.append(reason); rejection.append(reasonLabel);
    const rejectButton = node('button', '拒絕申請'); rejectButton.type = 'submit'; rejection.append(rejectButton);
    rejection.addEventListener('submit', e => { e.preventDefault(); startReview(false); });
    return { open: () => runAdmin(async () => {
      panel.hidden = false; detail.hidden = true; applications.replaceChildren();
      await identify(); restore(); await loadList();
      notice(pending ? '有尚未確認的審核，請重試原操作。' : '請選擇待審申請；核准或拒絕前請確認資料。');
    }) };
  }
  window.EmployeeManagement = Object.freeze({ open, openAdmin });
})();

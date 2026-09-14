// Applicant UI only. No approval, employee mutation or migration controls.
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
  window.EmployeeManagement = Object.freeze({ open });
})();

// 工程進度 V1。契約依既有 progress-test；不在首頁初始化呼叫 API。
(() => {
  "use strict";
  const roles = ["OWNER", "ADMIN", "SITE_MANAGER"];
  const businessFields = ["plannedQty", "completedQty", "planStart", "planEnd"];
  const state = { boot: null, rows: [], snapshot: null, busy: false, ready: false };
  let root, body, message, controls, site, location, item, editor, list, masters;
  let eventsBound = false;
  let percentModulePromise;
  function loadPercentModule() {
    if (window.ProgressPercentEditor) return Promise.resolve();
    if (!percentModulePromise) {
      percentModulePromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "js/progress-percent-editor.js";
        const fail = () => { script.remove(); reject(new Error("百分比編輯模組載入失敗，請重新開啟工程進度。")); };
        script.addEventListener("load", () => window.ProgressPercentEditor ? resolve() : fail(), { once: true });
        script.addEventListener("error", fail, { once: true });
        document.head.append(script);
      }).catch(error => { percentModulePromise = null; throw error; });
    }
    return percentModulePromise;
  }
  const inputs = {};
  const role = () => String(employee?.permission || "").trim().toUpperCase();
  const allowed = () => Boolean(userId) && roles.includes(role());
  const masterAllowed = () => allowed() && ["OWNER", "ADMIN"].includes(role()) &&
    ["OWNER", "ADMIN"].includes(String(state.boot?.operator?.permission || "").trim().toUpperCase());
  const key = row => JSON.stringify([String(row.siteId), String(row.locationId), String(row.itemCode)]);
  const text = value => value == null ? "" : String(value).trim();
  // 不將缺少名稱的主檔退回顯示 ID，也不直接展示後端訊息。
  const label = (value, missing = "未提供") => {
    const valueText = text(value);
    const ids = [...(state.boot?.sites || []).map(row => row.siteId),
      ...(state.boot?.locations || []).map(row => row.locationId),
      ...(state.boot?.items || []).map(row => row.itemCode), ...state.rows.map(row => row.progressId)];
    return !valueText || ids.some(id => text(id) && valueText.includes(String(id))) ||
      /\b(?:SITE\d+|LOC-[\w-]+|PRG-[\w-]+)\b|itemCode/i.test(valueText) ? missing : valueText;
  };
  const siteName = row => label(text(row?.name) || text(row?.siteName), "名稱未設定");
  const locationName = row => label(text(row?.displayName) || text(row?.name) ||
    [row?.zone, row?.floor, row?.unit].map(text).filter(Boolean).join(" / "), "位置名稱未設定");
  const itemName = row => [row?.category, row?.workItem, row?.unit]
    .map(value => label(value, "名稱未設定")).join(" ／ ");
  const taiwanDateFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
  });
  function displayTaiwanDate(value) {
    const raw = text(value);
    if (!raw) return "未提供";
    // 純日期保留原曆日；帶時區的 ISO 時間才轉換成台灣日期。
    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw)) {
      const dateText = raw.replace(/\//g, "-");
      const date = new Date(`${dateText}T00:00:00Z`);
      return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateText
        ? dateText.replace(/-/g, "/") : "未提供";
    }
    if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return "未提供";
    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) return "未提供";
    const parts = Object.fromEntries(taiwanDateFormatter.formatToParts(date).map(part => [part.type, part.value]));
    return `${parts.year}/${parts.month}/${parts.day}`;
  }
  // 僅相容已知的啟用與空值；其他狀態維持不開放新增。
  const locationSelectable = row => row.status == null || text(row.status) === "" || row.status === "啟用";
  const node = (tag, content, className) => {
    const result = document.createElement(tag);
    if (content != null) result.textContent = content;
    if (className) result.className = className;
    return result;
  };
  function announce(value) { message.textContent = value; }
  function button(title, handler, parent) {
    const result = node("button", title);
    result.type = "button";
    result.addEventListener("click", handler);
    parent.append(result);
    return result;
  }
  function field(parent, title, name, type = "text") {
    const wrapper = node("label", title);
    const input = node(type === "select" ? "select" : "input");
    if (type !== "select") input.type = type;
    input.name = name;
    if (type === "number") { input.min = "0"; input.step = "any"; input.inputMode = "decimal"; }
    wrapper.append(input);
    parent.append(wrapper);
    return input;
  }
  function options(select, rows, idField, nameFn, placeholder) {
    select.replaceChildren();
    const empty = node("option", placeholder);
    empty.value = "";
    select.append(empty);
    rows.forEach(row => {
      if (!text(row[idField])) return;
      const option = node("option", nameFn(row));
      option.value = String(row[idField]);
      select.append(option);
    });
  }
  function scope() {
    if (!allowed() || !state.boot || !state.boot.sites.some(row => String(row.siteId) === site.value)) {
      throw new Error("scope");
    }
    return site.value;
  }
  async function api(action, data = {}) {
    if (!allowed()) throw new Error("permission");
    const result = await callApi({ action, userId, ...data });
    if (!result?.success) throw new Error("api");
    return result;
  }
  async function run(work) {
    if (state.busy) return;
    if (!allowed()) { refreshAccess(); return; }
    state.busy = true;
    controls.disabled = true;
    document.getElementById("progressOpen").disabled = true;
    root.setAttribute("aria-busy", "true");
    try { await work(); }
    catch (_) { announce("操作未完成，請重新讀取資料後再試；若仍失敗，請聯絡管理員確認權限或資料設定。"); }
    finally {
      state.busy = false;
      controls.disabled = false;
      document.getElementById("progressOpen").disabled = false;
      root.removeAttribute("aria-busy");
      refreshAccess();
    }
  }
  function refreshAccess() {
    root.hidden = !allowed();
    if (masters) masters.hidden = !masterAllowed();
    if (!allowed()) {
      state.boot = null; state.rows = []; state.snapshot = null; state.ready = false;
      body.hidden = true;
      if (list) list.replaceChildren();
    }
  }
  function resetEditor() {
    state.snapshot = null;
    Object.values(inputs).forEach(input => { input.value = ""; input.disabled = false; input.removeAttribute("title"); });
  }
  function selectExisting() {
    resetEditor();
    const found = state.rows.find(row => key(row) === key({ siteId: site.value, locationId: location.value, itemCode: item.value }));
    if (found) {
      state.snapshot = Object.freeze({ ...found });
      [...businessFields, "progressPercent"].forEach(name => {
        inputs[name].value = text(found[name]);
        if (text(found[name]) && !inputs[name].value) {
          inputs[name].disabled = true;
          inputs[name].title = "後端資料格式無法直接編輯，儲存時保留原值。";
        }
      });
      announce(found.confirmStatus === "已確認" ? "此進度已確認；修改儲存後將回到待確認，並由後端保留異動紀錄。" : "已載入既有進度，可修改後儲存。");
    }
  }
  function renderChoices() {
    options(location, state.boot.locations.filter(row => String(row.siteId) === site.value && locationSelectable(row)),
      "locationId", locationName, "請選擇工程位置");
    options(item, state.boot.items.filter(row => row.status == null || row.status === "啟用"), "itemCode",
      itemName, "請選擇工程項目");
    resetEditor();
  }
  async function bootstrap() {
    state.ready = false;
    const previousSite = site.value;
    state.boot = null; state.rows = []; state.snapshot = null;
    list.replaceChildren(); editor.hidden = true; masters.hidden = true;
    site.replaceChildren();
    const result = await api("adminProgressBootstrap");
    if (![result.sites, result.locations, result.items].every(Array.isArray) ||
        !roles.includes(String(result.operator?.permission || "").trim().toUpperCase())) throw new Error("contract");
    state.boot = result;
    options(site, result.sites, "siteId", siteName, "請選擇工地");
    if (result.sites.some(row => String(row.siteId) === previousSite)) site.value = previousSite;
    else if (result.sites.length) site.value = String(result.sites[0].siteId);
    masters.hidden = !masterAllowed();
    renderChoices();
    if (site.value) await loadRows();
    else announce("目前沒有可管理的工地。");
  }
  async function loadRows() {
    state.ready = false; state.rows = []; state.snapshot = null;
    list.replaceChildren(); editor.hidden = true;
    const siteId = scope();
    const result = await api("adminProgressList", { siteId });
    if (!Array.isArray(result.records)) throw new Error("contract");
    // 工地範圍不借用首頁 sites 或領班推算；異常回傳一律停止編輯。
    if (result.records.some(row => String(row.siteId) !== siteId || !text(row.locationId) || !text(row.itemCode))) throw new Error("scope");
    if (new Set(result.records.map(key)).size !== result.records.length) throw new Error("duplicate");
    state.rows = result.records;
    state.ready = true;
    editor.hidden = false;
    renderRows();
    selectExisting();
    announce(`已讀取 ${state.rows.length} 筆目前進度。`);
  }
  function detail(parent, title, value) {
    const block = node("div");
    block.append(node("dt", title), node("dd", label(value)));
    parent.append(block);
  }
  function renderRows() {
    list.replaceChildren();
    if (!state.rows.length) { list.append(node("p", "目前沒有工程進度，請選擇位置與項目建立。")); return; }
    state.rows.forEach(row => {
      const card = node("article", null, "progress-record");
      const loc = state.boot.locations.find(entry => String(entry.locationId) === String(row.locationId) && String(entry.siteId) === site.value);
      const task = state.boot.items.find(entry => String(entry.itemCode) === String(row.itemCode));
      card.append(node("h3", `${siteName(state.boot.sites.find(entry => String(entry.siteId) === site.value))} ｜ ${locationName(loc)}`));
      card.append(node("p", itemName({ category: text(task?.category) || row.category,
        workItem: text(task?.workItem) || row.workItem, unit: task?.unit })));
      if (text(row.progressPercent) !== "" && Number.isFinite(Number(row.progressPercent))) {
        const bar = node("progress");
        bar.max = 100; bar.value = Math.min(100, Math.max(0, Number(row.progressPercent)));
        bar.setAttribute("aria-label", "目前進度"); card.append(bar);
      }
      const data = node("dl", null, "progress-grid");
      detail(data, "計畫數量", row.plannedQty);
      detail(data, "完成數量", row.completedQty);
      detail(data, "單位", label(task?.unit, "名稱未設定"));
      detail(data, "進度百分比", text(row.progressPercent) === "" ? "未提供" : `${label(row.progressPercent)}%`);
      detail(data, "進度狀態", row.progressStatus);
      detail(data, "計畫開始日", row.planStart);
      detail(data, "計畫完成日", row.planEnd);
      detail(data, "實際開始日", displayTaiwanDate(row.actualStart));
      detail(data, "實際完成日", displayTaiwanDate(row.actualEnd));
      detail(data, "主要負責人", row.responsibleEmployeeName);
      detail(data, "確認狀態", row.confirmStatus);
      card.append(data);
      button("編輯進度", () => {
        if (state.busy || !state.ready || !allowed()) return;
        // 停用的主檔不新增使用，但可保留既有記錄的識別鍵進行修正。
        [[location, row.locationId, locationName(loc)], [item, row.itemCode, itemName(task)]].forEach(([select, value, title]) => {
          if (![...select.options].some(option => option.value === String(value))) {
            const option = node("option", title); option.value = String(value); select.append(option);
          }
          select.value = String(value);
        });
        selectExisting();
        editor.scrollIntoView({ block: "start", behavior: "smooth" });
      }, card);
      if (row.confirmStatus === "待確認" && text(row.progressId)) {
        button("確認進度", () => confirmProgress(row), card);
      }
      list.append(card);
    });
  }
  function normalized(value, numeric) {
    const valueText = text(value);
    if (!valueText) return null;
    return numeric && Number.isFinite(Number(valueText)) ? Number(valueText) : valueText;
  }
  function unchanged(original, values) {
    return businessFields.every(name => normalized(original[name], name.endsWith("Qty")) === normalized(values[name], name.endsWith("Qty"))) && window.ProgressPercentEditor.unchanged(original, values);
  }
  async function saveProgress(event) {
    event.preventDefault();
    if (state.busy || !state.ready || !editor.reportValidity()) return;
    const values = Object.fromEntries([...businessFields, "progressPercent"].map(name => [name,
      inputs[name].disabled && state.snapshot ? state.snapshot[name] : inputs[name].value]));
    if (values.planStart && values.planEnd && values.planStart > values.planEnd) { announce("計畫完成日不可早於開始日。"); return; }
    if (!location.value || !item.value) { announce("請先選擇工程位置與工程項目。"); return; }
    const identity = { siteId: site.value, locationId: location.value, itemCode: item.value };
    const original = state.snapshot || state.rows.find(row => key(row) === key(identity));
    if (original && key(original) === key(identity) && unchanged(original, values)) {
      announce("內容未變更，無需儲存"); return;
    }
    if (!inputs.changeReason.value.trim()) { announce("請填寫異動原因。"); return; }
    // 空白不當作 0；省略百分比才交由後端依數量計算。
    if (!text(values.progressPercent)) delete values.progressPercent;
    await run(async () => {
      scope();
      if (!original && (!state.boot.locations.some(row => String(row.locationId) === location.value && String(row.siteId) === site.value && locationSelectable(row)) ||
          !state.boot.items.some(row => String(row.itemCode) === item.value && (row.status == null || row.status === "啟用")))) throw new Error("master");
      announce("正在儲存工程進度…");
      state.ready = false;
      try { await api("adminProgressUpsert", { ...identity, ...values, changeReason: inputs.changeReason.value.trim(), sourceType: "工程進度看板" }); }
      catch (_) { editor.hidden = true; announce("儲存結果尚未確認。請重新讀取資料確認結果後再操作。"); return; }
      // 成功後不自行改百分比、確認狀態或 ID；重新取得權威資料。
      try { await loadRows(); announce("工程進度已儲存，並重新讀取最新資料。"); }
      catch (_) { announce("儲存已成功，但重新讀取失敗。請按重新讀取後再操作，避免重複送出。"); }
    });
  }
  async function confirmProgress(row) {
    if (state.busy || !state.ready || !allowed()) return;
    if (!window.confirm("確定確認這筆工程進度？後續修改將回到待確認。")) return;
    await run(async () => {
      if (scope() !== String(row.siteId) || !state.rows.includes(row)) throw new Error("scope");
      announce("正在確認進度…");
      state.ready = false;
      try { await api("adminProgressConfirm", { progressId: row.progressId, note: "" }); }
      catch (_) { editor.hidden = true; announce("確認結果尚未確認。請重新讀取資料確認結果後再操作。"); return; }
      try { await loadRows(); announce("工程進度已確認，並重新讀取最新資料。"); }
      catch (_) { announce("確認已成功，但重新讀取失敗。請按重新讀取後再操作。"); }
    });
  }
  function masterForm(title, fields, action) {
    const form = node("form", null, "progress-master-form");
    form.append(node("h3", title));
    const entries = {};
    fields.forEach(([name, titleText]) => { entries[name] = field(form, titleText, name); entries[name].required = name !== "unit" || action === "adminProgressItemSave"; });
    const submit = node("button", title); submit.type = "submit"; form.append(submit);
    form.addEventListener("submit", event => {
      event.preventDefault();
      if (!masterAllowed() || !form.reportValidity()) return;
      run(async () => {
        if (!masterAllowed()) throw new Error("permission");
        const data = Object.fromEntries(Object.entries(entries).map(([name, input]) => [name, input.value.trim()]));
        if (Object.entries(entries).some(([name, input]) => input.required && !data[name])) { announce("請填寫完整名稱。"); return; }
        if (action === "adminProgressLocationSave") data.siteId = scope();
        data.status = "啟用";
        if (action === "adminProgressItemSave") {
          data.defaultWeight = 1;
          data.includeTotal = "是";
        }
        announce("正在新增設定…");
        await api(action, data);
        form.reset();
        try { await bootstrap(); announce("設定已新增，並重新讀取資料。"); }
        catch (_) { announce("設定已新增，但重新讀取失敗。請重新讀取，勿重複新增。"); }
      });
    });
    masters.append(form);
  }
  function build() {
    controls = node("fieldset"); controls.className = "progress-controls";
    body.append(controls);
    const filters = node("div", null, "progress-grid"); controls.append(filters);
    site = field(filters, "工地", "siteId", "select");
    button("重新讀取", () => run(async () => { announce("正在讀取工程進度…"); await bootstrap(); }), filters);
    site.addEventListener("change", () => run(async () => {
      renderChoices(); state.ready = false; state.rows = []; list.replaceChildren(); editor.hidden = true;
      if (site.value) await loadRows(); else announce("請選擇工地。");
    }));
    editor = node("form", null, "progress-editor"); editor.hidden = true;
    editor.append(node("h3", "建立／更新工程進度"), node("p", "選擇相同位置與項目會載入既有進度。完成數量填目前累計完成量，百分比不按天累加。"));
    const grid = node("div", null, "progress-grid"); editor.append(grid);
    location = field(grid, "棟別／區域、樓層、戶別", "locationId", "select");
    item = field(grid, "工程類別／工作項目／單位", "itemCode", "select");
    location.required = true; item.required = true;
    location.addEventListener("change", selectExisting); item.addEventListener("change", selectExisting);
    [["plannedQty", "計畫數量", "number"], ["completedQty", "目前完成數量", "number"], ["planStart", "計畫開始日", "date"], ["planEnd", "計畫完成日", "date"], ["changeReason", "異動原因", "text"]].forEach(([name, title, type]) => { inputs[name] = field(grid, title, name, type); });
    inputs.progressPercent = field(grid, "目前進度百分比（留空依數量計算）", "progressPercent", "number");
    inputs.progressPercent.max = "100";
    const submit = node("button", "儲存工程進度"); submit.type = "submit"; editor.append(submit);
    editor.addEventListener("submit", saveProgress);
    controls.append(editor, node("h3", "目前工程進度"));
    list = node("div"); controls.append(list);
    masters = node("div", null, "progress-masters"); masters.hidden = true;
    masters.append(node("h3", "工程主檔設定"), node("p", "工程位置新增至上方選定的工地；工程項目為共用設定。"));
    controls.append(masters);
    masterForm("新增工程位置", [["zone", "棟別／區域"], ["floor", "樓層"], ["unit", "戶別（選填）"]], "adminProgressLocationSave");
    masterForm("新增工程項目", [["category", "工程類別"], ["workItem", "工作項目"], ["unit", "計量單位"]], "adminProgressItemSave");
  }
  async function open() {
    if (!allowed()) return;
    await loadPercentModule();
    if (!allowed()) return;
    bindEventsOnce();
    body.hidden = false;
    document.getElementById("progressOpen").setAttribute("aria-expanded", "true");
    await run(async () => { announce("正在讀取工程進度…"); await bootstrap(); });
  }
  function bindEventsOnce() {
    if (eventsBound) return;
    root = document.getElementById("progressV1");
    body = document.getElementById("progressBody");
    message = document.getElementById("progressMessage");
    if (!root || !body || !message) throw new Error("container");
    build();
    eventsBound = true;
    // 只同步入口可見性，不包裝既有管理函式，也不依赖 GPS。
    const observer = new MutationObserver(refreshAccess);
    ["adminEntry", "adminPanel"].forEach(id => {
      const target = document.getElementById(id);
      if (target) observer.observe(target, { attributes: true, attributeFilter: ["style"] });
    });
    refreshAccess();
  }
  window.ProgressV1 = Object.freeze({ open });
})();

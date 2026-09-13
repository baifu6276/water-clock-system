// 每日回報 → 工程進度串接 V1
// 漸進式導入：有完整主檔時使用標準化選單；尚未設定主檔的工地保留原自由輸入，不影響既有回報流程。
(() => {
  "use strict";

  const state = {
    siteId: "",
    locations: [],
    items: [],
    standardized: false,
    loading: false,
    requestToken: 0,
    originalCallApi: null
  };

  const text = value => value == null ? "" : String(value).trim();

  function getSiteSelect() {
    return document.getElementById("dailyReportSite");
  }

  function getLocationSelect() {
    return document.getElementById("dailyReportProgressLocation");
  }

  function locationLabel(row) {
    return text(row.name) || [row.zone, row.floor, row.unit].map(text).filter(Boolean).join(" / ") || "位置名稱未設定";
  }

  function itemLabel(row) {
    const base = [row.category, row.workItem].map(text).filter(Boolean).join(" / ") || "工程項目名稱未設定";
    return row.unit ? `${base} / ${text(row.unit)}` : base;
  }

  function sharedLegacyFields() {
    return ["dailyReportArea", "dailyReportFloor", "dailyReportUnit"]
      .map(id => document.getElementById(id))
      .filter(Boolean);
  }

  function setLegacySharedVisible(visible) {
    sharedLegacyFields().forEach(input => {
      const field = input.closest(".daily-report-field") || input.parentElement;
      if (field) field.style.display = visible ? "" : "none";
    });
  }

  function ensureLocationField() {
    let select = getLocationSelect();
    if (select) return select;

    const area = document.getElementById("dailyReportArea");
    if (!area) return null;

    const anchor = area.closest(".daily-report-field") || area.parentElement;
    if (!anchor || !anchor.parentElement) return null;

    const field = document.createElement("div");
    field.className = "daily-report-field";
    field.id = "dailyReportProgressLocationField";

    const label = document.createElement("label");
    label.htmlFor = "dailyReportProgressLocation";
    label.textContent = "工程位置";

    select = document.createElement("select");
    select.id = "dailyReportProgressLocation";
    select.innerHTML = '<option value="">請選擇工程位置</option>';

    const hint = document.createElement("div");
    hint.id = "dailyReportProgressLocationHint";
    hint.className = "open-segment-info";
    hint.style.marginTop = "8px";
    hint.textContent = "選擇標準工程位置後，系統會自動帶入工作區域、樓層與戶別。";

    field.append(label, select, hint);
    anchor.parentElement.insertBefore(field, anchor);

    select.addEventListener("change", syncLegacyLocationFields);
    return select;
  }

  function syncLegacyLocationFields() {
    const select = getLocationSelect();
    const location = state.locations.find(row => text(row.locationId) === text(select?.value));
    if (!location) return;

    const area = document.getElementById("dailyReportArea");
    const floor = document.getElementById("dailyReportFloor");
    const unit = document.getElementById("dailyReportUnit");
    if (area) area.value = text(location.zone);
    if (floor) floor.value = text(location.floor);
    if (unit) unit.value = text(location.unit);
  }

  function renderLocationOptions(selectedId = "") {
    const select = ensureLocationField();
    const field = document.getElementById("dailyReportProgressLocationField");
    if (!select || !field) return;

    if (!state.standardized) {
      field.style.display = "none";
      setLegacySharedVisible(true);
      return;
    }

    field.style.display = "";
    setLegacySharedVisible(false);
    select.innerHTML = '<option value="">請選擇工程位置</option>';

    state.locations.forEach(row => {
      const option = document.createElement("option");
      option.value = text(row.locationId);
      option.textContent = locationLabel(row);
      select.appendChild(option);
    });

    if (selectedId && state.locations.some(row => text(row.locationId) === text(selectedId))) {
      select.value = text(selectedId);
      syncLegacyLocationFields();
    }
  }

  function legacyPair(card) {
    const category = card.querySelector(".dr-category");
    const workItem = card.querySelector(".dr-work-item");
    return { category, workItem };
  }

  function setLegacyItemVisible(card, visible) {
    const { category, workItem } = legacyPair(card);
    [category, workItem].filter(Boolean).forEach(input => {
      const field = input.closest(".daily-report-field") || input.parentElement;
      if (field) field.style.display = visible ? "" : "none";
    });
  }

  function ensureItemSelect(card) {
    let select = card.querySelector(".dr-item-code");
    if (select) return select;

    const { category } = legacyPair(card);
    if (!category) return null;
    const anchor = category.closest(".daily-report-field") || category.parentElement;
    if (!anchor || !anchor.parentElement) return null;

    const field = document.createElement("div");
    field.className = "daily-report-field dr-progress-item-field";

    const label = document.createElement("label");
    label.textContent = "工程類別 / 工作項目 / 單位 *";

    select = document.createElement("select");
    select.className = "dr-item-code";
    select.innerHTML = '<option value="">請選擇工程項目</option>';
    select.addEventListener("change", () => syncLegacyItemFields(card));

    field.append(label, select);
    anchor.parentElement.insertBefore(field, anchor);
    return select;
  }

  function syncLegacyItemFields(card) {
    const select = card.querySelector(".dr-item-code");
    const item = state.items.find(row => text(row.itemCode) === text(select?.value));
    if (!item) return;

    const { category, workItem } = legacyPair(card);
    const unit = card.querySelector(".dr-quantity-unit");
    if (category) category.value = text(item.category);
    if (workItem) workItem.value = text(item.workItem);
    if (unit) unit.value = text(item.unit);
  }

  function enhanceItemCard(card, selectedCode = "") {
    if (!card) return;
    const select = ensureItemSelect(card);
    const field = select?.closest(".dr-progress-item-field");
    if (!select || !field) return;

    if (!state.standardized) {
      field.style.display = "none";
      setLegacyItemVisible(card, true);
      return;
    }

    field.style.display = "";
    setLegacyItemVisible(card, false);
    const previous = selectedCode || select.value;
    select.innerHTML = '<option value="">請選擇工程項目</option>';

    state.items.forEach(row => {
      const option = document.createElement("option");
      option.value = text(row.itemCode);
      option.textContent = itemLabel(row);
      select.appendChild(option);
    });

    if (previous && state.items.some(row => text(row.itemCode) === text(previous))) {
      select.value = text(previous);
      syncLegacyItemFields(card);
    }
  }

  function enhanceAllItemCards() {
    document.querySelectorAll("#dailyReportItems .daily-report-item-editor")
      .forEach(card => enhanceItemCard(card));
  }

  function setModeMessage(message, type = "normal") {
    if (typeof window.showDailyReportStatus === "function") {
      window.showDailyReportStatus(message, type);
    }
  }

  async function loadOptions(preferredLocationId = "", preferredItemCode = "") {
    const siteId = text(getSiteSelect()?.value);
    state.siteId = siteId;
    state.requestToken += 1;
    const token = state.requestToken;

    if (!siteId || !state.originalCallApi || !window.userId) {
      state.locations = [];
      state.items = [];
      state.standardized = false;
      renderLocationOptions();
      enhanceAllItemCards();
      return;
    }

    state.loading = true;
    try {
      const result = await state.originalCallApi({
        action: "dailyReportProgressOptions",
        userId: window.userId,
        siteId
      });
      if (token !== state.requestToken) return;
      if (!result?.success) throw new Error(result?.message || "讀取工程主檔失敗");

      state.locations = Array.isArray(result.locations) ? result.locations : [];
      state.items = Array.isArray(result.items) ? result.items : [];
      state.standardized = state.locations.length > 0 && state.items.length > 0;

      renderLocationOptions(preferredLocationId);
      enhanceAllItemCards();

      if (preferredItemCode) {
        const first = document.querySelector("#dailyReportItems .daily-report-item-editor");
        if (first) enhanceItemCard(first, preferredItemCode);
      }

      if (!state.standardized) {
        setModeMessage("此工地尚未完成工程位置或工程項目設定，本次仍可用原方式回報；此回報不會自動同步工程進度。", "normal");
      }
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("daily report progress options", error);
      state.locations = [];
      state.items = [];
      state.standardized = false;
      renderLocationOptions();
      enhanceAllItemCards();
      setModeMessage("工程主檔暫時無法讀取，已切回原每日回報方式；本次不會自動同步工程進度。", "normal");
    } finally {
      if (token === state.requestToken) state.loading = false;
    }
  }

  function validateAndDecoratePayload(payload) {
    if (!payload || !state.standardized) return payload;
    if (!["dailyReportCreateBatch", "dailyReportUpdateReturned"].includes(payload.action)) return payload;

    const locationId = text(getLocationSelect()?.value);
    if (!locationId) throw new Error("請選擇工程位置");

    if (payload.action === "dailyReportCreateBatch") {
      const cards = Array.from(document.querySelectorAll("#dailyReportItems .daily-report-item-editor"));
      const sourceItems = Array.isArray(payload.items) ? payload.items : [];
      if (cards.length !== sourceItems.length) throw new Error("工作項目資料不同步，請重新整理頁面後再試");

      const items = sourceItems.map((item, index) => {
        const itemCode = text(cards[index].querySelector(".dr-item-code")?.value);
        if (!itemCode) throw new Error(`工作項目 ${index + 1}：請選擇工程項目`);
        return { ...item, itemCode };
      });
      return { ...payload, locationId, items };
    }

    const first = document.querySelector("#dailyReportItems .daily-report-item-editor");
    const itemCode = text(first?.querySelector(".dr-item-code")?.value);
    if (!itemCode) throw new Error("請選擇工程項目");
    return { ...payload, locationId, itemCode };
  }

  function wrapCallApi() {
    if (state.originalCallApi || typeof window.callApi !== "function") return;
    state.originalCallApi = window.callApi;
    window.callApi = function(payload) {
      return state.originalCallApi(validateAndDecoratePayload(payload));
    };
  }

  function wrapReturnedEdit() {
    if (typeof window.startReturnedDailyReportEdit !== "function" || window.startReturnedDailyReportEdit.__progressLinked) return;
    const original = window.startReturnedDailyReportEdit;
    const wrapped = function(item) {
      original(item);
      Promise.resolve(loadOptions(text(item?.locationId), text(item?.itemCode))).catch(console.error);
    };
    wrapped.__progressLinked = true;
    window.startReturnedDailyReportEdit = wrapped;
  }

  function observeItems() {
    const wrap = document.getElementById("dailyReportItems");
    if (!wrap) return;
    const observer = new MutationObserver(() => enhanceAllItemCards());
    observer.observe(wrap, { childList: true });
  }

  function init() {
    wrapCallApi();
    wrapReturnedEdit();
    ensureLocationField();
    observeItems();

    const site = getSiteSelect();
    if (site && !site.dataset.progressLinkBound) {
      site.dataset.progressLinkBound = "1";
      site.addEventListener("change", () => loadOptions());
    }

    enhanceAllItemCards();
    loadOptions().catch(console.error);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();

// 每日回報 → 工程進度串接 V2
// 每一個工作項目獨立選擇工程位置、工程項目與是否連動進度。
(() => {
  "use strict";

  const OTHER = "__OTHER__";
  const state = {
    siteId: "",
    locations: [],
    items: [],
    loading: false,
    requestToken: 0,
    originalCallApi: null
  };

  const text = value => value == null ? "" : String(value).trim();
  const currentUserId = () => typeof userId === "undefined" ? "" : text(userId);
  const getSiteSelect = () => document.getElementById("dailyReportSite");
  const cards = () => Array.from(document.querySelectorAll("#dailyReportItems .daily-report-item-editor"));

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

  function hideSharedLegacyFields() {
    sharedLegacyFields().forEach(input => {
      const field = input.closest(".daily-report-field") || input.parentElement;
      if (field) field.style.display = "none";
    });

    const section = document.getElementById("dailyReportSection");
    const info = section?.querySelector(".open-segment-info");
    if (info) {
      info.textContent = "日期與工地共用；每個工作項目可各自選擇施工位置、工程項目，以及是否連動工程進度。";
    }
  }

  function legacyPair(card) {
    return {
      category: card.querySelector(".dr-category"),
      workItem: card.querySelector(".dr-work-item")
    };
  }

  function setFieldVisible(input, visible) {
    if (!input) return;
    const field = input.closest(".daily-report-field") || input.parentElement;
    if (field) field.style.display = visible ? "" : "none";
  }

  function ensureLocationControls(card) {
    let select = card.querySelector(".dr-location-id");
    if (select) return select;

    const firstGrid = card.querySelector(".daily-report-grid");
    if (!firstGrid) return null;

    const wrap = document.createElement("div");
    wrap.className = "dr-location-block";
    wrap.style.marginBottom = "14px";

    const field = document.createElement("div");
    field.className = "daily-report-field";
    const label = document.createElement("label");
    label.textContent = "工程位置 *";
    select = document.createElement("select");
    select.className = "dr-location-id";
    field.append(label, select);

    const manual = document.createElement("div");
    manual.className = "daily-report-grid dr-manual-location";
    manual.style.marginTop = "10px";

    const manualSpecs = [
      ["dr-work-area", "工作區域", "例如：B棟、公共區域"],
      ["dr-floor", "樓層", "例如：B2F、5F"],
      ["dr-unit", "戶別／位置", "例如：A戶、機房"]
    ];

    manualSpecs.forEach(([className, title, placeholder]) => {
      const f = document.createElement("div");
      f.className = "daily-report-field";
      const l = document.createElement("label");
      l.textContent = title;
      const input = document.createElement("input");
      input.type = "text";
      input.className = className;
      input.placeholder = placeholder;
      f.append(l, input);
      manual.appendChild(f);
    });

    const hint = document.createElement("div");
    hint.className = "open-segment-info dr-location-hint";
    hint.style.marginTop = "8px";

    wrap.append(field, manual, hint);
    firstGrid.parentElement.insertBefore(wrap, firstGrid);

    select.addEventListener("change", () => updateLocationMode(card));
    return select;
  }

  function ensureItemControls(card) {
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
    field.append(label, select);
    anchor.parentElement.insertBefore(field, anchor);

    select.addEventListener("change", () => updateItemMode(card));
    return select;
  }

  function ensureLinkControl(card) {
    let select = card.querySelector(".dr-link-progress");
    if (select) return select;

    const completed = card.querySelector(".dr-completed");
    const anchor = completed?.closest(".daily-report-field") || completed?.parentElement;
    if (!anchor || !anchor.parentElement) return null;

    const field = document.createElement("div");
    field.className = "daily-report-field dr-link-progress-field";
    field.style.marginBottom = "12px";

    const label = document.createElement("label");
    label.textContent = "是否連動工程進度";
    select = document.createElement("select");
    select.className = "dr-link-progress";
    select.innerHTML = '<option value="否">否，僅工作紀錄</option><option value="是">是，確認後連動工程進度</option>';

    const hint = document.createElement("div");
    hint.className = "open-segment-info dr-link-progress-hint";
    hint.style.marginTop = "8px";
    hint.textContent = "預設僅作工作紀錄。只有選擇「是」且使用標準工程位置與標準工程項目時，主管確認後才可能更新工程進度。";

    field.append(label, select, hint);
    anchor.parentElement.insertBefore(field, anchor);

    select.addEventListener("change", () => updateLinkHint(card));
    return select;
  }

  function renderLocationOptions(card, selected = "") {
    const select = ensureLocationControls(card);
    if (!select) return;

    const previous = selected || select.value;
    select.innerHTML = '<option value="">請選擇工程位置</option>';
    state.locations.forEach(row => {
      const option = document.createElement("option");
      option.value = text(row.locationId);
      option.textContent = locationLabel(row);
      select.appendChild(option);
    });

    const other = document.createElement("option");
    other.value = OTHER;
    other.textContent = "＋ 其他／未建立位置";
    select.appendChild(other);

    if (previous === OTHER || state.locations.some(row => text(row.locationId) === text(previous))) {
      select.value = previous;
    } else if (state.locations.length === 0) {
      select.value = OTHER;
    }
    updateLocationMode(card);
  }

  function renderItemOptions(card, selected = "") {
    const select = ensureItemControls(card);
    if (!select) return;

    const previous = selected || select.value;
    select.innerHTML = '<option value="">請選擇工程項目</option>';
    state.items.forEach(row => {
      const option = document.createElement("option");
      option.value = text(row.itemCode);
      option.textContent = itemLabel(row);
      select.appendChild(option);
    });

    const other = document.createElement("option");
    other.value = OTHER;
    other.textContent = "＋ 其他／未建立工作項目";
    select.appendChild(other);

    if (previous === OTHER || state.items.some(row => text(row.itemCode) === text(previous))) {
      select.value = previous;
    } else if (state.items.length === 0) {
      select.value = OTHER;
    }
    updateItemMode(card);
  }

  function updateLocationMode(card) {
    const select = card.querySelector(".dr-location-id");
    const manual = card.querySelector(".dr-manual-location");
    const hint = card.querySelector(".dr-location-hint");
    const value = text(select?.value);
    const isOther = value === OTHER || (state.locations.length === 0 && !value);

    if (manual) manual.style.display = isOther ? "grid" : "none";

    if (value && value !== OTHER) {
      const row = state.locations.find(item => text(item.locationId) === value);
      if (hint) hint.textContent = row ? `已對應標準位置：${locationLabel(row)}` : "請重新選擇工程位置。";
    } else if (isOther) {
      if (hint) hint.textContent = "此位置會正常寫入每日回報，但不會自動建立工程位置主檔。";
    } else if (hint) {
      hint.textContent = "請選擇標準位置，或選擇「其他／未建立位置」。";
    }
    updateLinkHint(card);
  }

  function updateItemMode(card) {
    const select = card.querySelector(".dr-item-code");
    const value = text(select?.value);
    const isOther = value === OTHER || (state.items.length === 0 && !value);
    const { category, workItem } = legacyPair(card);
    const unit = card.querySelector(".dr-quantity-unit");

    setFieldVisible(category, isOther);
    setFieldVisible(workItem, isOther);

    if (value && value !== OTHER) {
      const row = state.items.find(item => text(item.itemCode) === value);
      if (row) {
        if (category) category.value = text(row.category);
        if (workItem) workItem.value = text(row.workItem);
        if (unit) unit.value = text(row.unit);
      }
    }
    updateLinkHint(card);
  }

  function updateLinkHint(card) {
    const link = card.querySelector(".dr-link-progress");
    const hint = card.querySelector(".dr-link-progress-hint");
    if (!link || !hint) return;

    const locationId = text(card.querySelector(".dr-location-id")?.value);
    const itemCode = text(card.querySelector(".dr-item-code")?.value);
    const standard = locationId && locationId !== OTHER && itemCode && itemCode !== OTHER;

    if (link.value === "是" && !standard) {
      hint.textContent = "要連動工程進度，必須改選「標準工程位置」與「標準工程項目」；其他／未建立資料只能作工作紀錄。";
    } else if (link.value === "是") {
      hint.textContent = "主管確認這筆每日回報後，系統會依你填的「進度百分比」更新對應工程進度；今日完成數量不會直接累加。";
    } else {
      hint.textContent = "此項預設僅作工作紀錄，不會異動工程進度。";
    }
  }

  function enhanceCard(card, preset = null) {
    if (!card) return;
    ensureLocationControls(card);
    ensureItemControls(card);
    ensureLinkControl(card);

    renderLocationOptions(card, text(preset?.locationId));
    renderItemOptions(card, text(preset?.itemCode));

    const link = card.querySelector(".dr-link-progress");
    if (link) link.value = text(preset?.linkProgress) === "是" ? "是" : "否";

    const manualLocation = !preset?.locationId && preset;
    if (manualLocation) {
      const locationSelect = card.querySelector(".dr-location-id");
      if (locationSelect) locationSelect.value = OTHER;
      const area = card.querySelector(".dr-work-area");
      const floor = card.querySelector(".dr-floor");
      const unit = card.querySelector(".dr-unit");
      if (area) area.value = text(preset.workArea);
      if (floor) floor.value = text(preset.floor);
      if (unit) unit.value = text(preset.unit);
      updateLocationMode(card);
    }

    const manualItem = !preset?.itemCode && preset;
    if (manualItem) {
      const itemSelect = card.querySelector(".dr-item-code");
      if (itemSelect) itemSelect.value = OTHER;
      updateItemMode(card);
      const { category, workItem } = legacyPair(card);
      const quantityUnit = card.querySelector(".dr-quantity-unit");
      if (category) category.value = text(preset.category);
      if (workItem) workItem.value = text(preset.workItem);
      if (quantityUnit && preset.quantityUnit != null) quantityUnit.value = text(preset.quantityUnit);
    }

    updateLinkHint(card);
  }

  function enhanceAllCards() {
    cards().forEach(card => enhanceCard(card));
  }

  function decorateItem(item, card, index) {
    const locationValue = text(card.querySelector(".dr-location-id")?.value);
    const itemValue = text(card.querySelector(".dr-item-code")?.value);
    const linkProgress = card.querySelector(".dr-link-progress")?.value === "是" ? "是" : "否";

    if (!locationValue) throw new Error(`工作項目 ${index + 1}：請選擇工程位置`);
    if (!itemValue) throw new Error(`工作項目 ${index + 1}：請選擇工程項目`);

    const standardLocation = locationValue !== OTHER;
    const standardItem = itemValue !== OTHER;

    if (linkProgress === "是" && (!standardLocation || !standardItem)) {
      throw new Error(`工作項目 ${index + 1}：要連動工程進度，必須選擇標準工程位置與標準工程項目`);
    }

    const next = { ...item, linkProgress };

    if (standardLocation) {
      next.locationId = locationValue;
    } else {
      next.locationId = "";
      next.workArea = text(card.querySelector(".dr-work-area")?.value);
      next.floor = text(card.querySelector(".dr-floor")?.value);
      next.unit = text(card.querySelector(".dr-unit")?.value);
      if (!next.workArea && !next.floor && !next.unit) {
        throw new Error(`工作項目 ${index + 1}：使用其他位置時，至少填寫工作區域、樓層或戶別／位置其中一項`);
      }
    }

    if (standardItem) {
      next.itemCode = itemValue;
    } else {
      next.itemCode = "";
      // 原每日回報核心已從現有欄位收集 category/workItem/quantityUnit。
    }

    return next;
  }

  function validateAndDecoratePayload(payload) {
    if (!payload || !["dailyReportCreateBatch", "dailyReportUpdateReturned"].includes(payload.action)) return payload;

    const allCards = cards();
    if (payload.action === "dailyReportCreateBatch") {
      const sourceItems = Array.isArray(payload.items) ? payload.items : [];
      if (allCards.length !== sourceItems.length) throw new Error("工作項目資料不同步，請重新整理頁面後再試");
      return {
        ...payload,
        workArea: "",
        floor: "",
        unit: "",
        locationId: "",
        items: sourceItems.map((item, index) => decorateItem(item, allCards[index], index))
      };
    }

    const first = allCards[0];
    if (!first) throw new Error("找不到工作項目，請重新整理頁面後再試");
    const decorated = decorateItem(payload, first, 0);
    return {
      ...payload,
      ...decorated,
      workArea: decorated.workArea || "",
      floor: decorated.floor || "",
      unit: decorated.unit || "",
      locationId: decorated.locationId || "",
      itemCode: decorated.itemCode || "",
      linkProgress: decorated.linkProgress
    };
  }

  function setStatus(message, type = "normal") {
    if (typeof showDailyReportStatus === "function") showDailyReportStatus(message, type);
  }

  async function loadOptions() {
    const siteId = text(getSiteSelect()?.value);
    const uid = currentUserId();
    state.siteId = siteId;
    state.requestToken += 1;
    const token = state.requestToken;

    if (!siteId || !state.originalCallApi || !uid) {
      state.locations = [];
      state.items = [];
      enhanceAllCards();
      return;
    }

    state.loading = true;
    try {
      const result = await state.originalCallApi({
        action: "dailyReportProgressOptions",
        userId: uid,
        siteId
      });
      if (token !== state.requestToken) return;
      if (!result?.success) throw new Error(result?.message || "讀取工程主檔失敗");

      state.locations = Array.isArray(result.locations) ? result.locations : [];
      state.items = Array.isArray(result.items) ? result.items : [];
      enhanceAllCards();

      if (state.locations.length === 0 || state.items.length === 0) {
        setStatus("此工地的標準工程位置或工程項目尚未完整設定；仍可選擇「其他／未建立」完成工作回報，且預設不連動工程進度。", "normal");
      }
    } catch (error) {
      if (token !== state.requestToken) return;
      console.error("daily report progress options", error);
      state.locations = [];
      state.items = [];
      enhanceAllCards();
      setStatus("工程主檔暫時無法讀取；仍可使用「其他／未建立」填寫工作紀錄，但不允許連動工程進度。", "normal");
    } finally {
      if (token === state.requestToken) state.loading = false;
    }
  }

  function wrapCallApi() {
    if (state.originalCallApi || typeof callApi !== "function") return;
    state.originalCallApi = callApi;
    callApi = function(payload) {
      return state.originalCallApi(validateAndDecoratePayload(payload));
    };
  }

  function wrapReturnedEdit() {
    if (typeof startReturnedDailyReportEdit !== "function" || startReturnedDailyReportEdit.__progressLinkedV2) return;
    const original = startReturnedDailyReportEdit;
    const wrapped = function(item) {
      original(item);
      Promise.resolve(loadOptions()).then(() => {
        const first = cards()[0];
        if (first) enhanceCard(first, item || {});
      }).catch(console.error);
    };
    wrapped.__progressLinkedV2 = true;
    startReturnedDailyReportEdit = wrapped;
  }

  function wrapFinishReturnedEdit() {
    if (typeof finishReturnedDailyReportEdit !== "function" || finishReturnedDailyReportEdit.__progressLinkedV2) return;
    const original = finishReturnedDailyReportEdit;
    const wrapped = function() {
      const result = original();
      Promise.resolve(loadOptions()).catch(console.error);
      return result;
    };
    wrapped.__progressLinkedV2 = true;
    finishReturnedDailyReportEdit = wrapped;
  }

  function observeItems() {
    const wrap = document.getElementById("dailyReportItems");
    if (!wrap) return;
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.matches?.(".daily-report-item-editor")) enhanceCard(node);
        });
      });
    });
    observer.observe(wrap, { childList: true });
  }

  function observeSiteOptions() {
    const site = getSiteSelect();
    if (!site) return;
    const observer = new MutationObserver(() => {
      if (text(site.value) && currentUserId()) loadOptions().catch(console.error);
    });
    observer.observe(site, { childList: true });
  }

  function scheduleInitialLoads() {
    [0, 500, 1500, 3000].forEach(delay => {
      setTimeout(() => {
        if (text(getSiteSelect()?.value) && currentUserId()) loadOptions().catch(console.error);
      }, delay);
    });
  }

  function init() {
    wrapCallApi();
    wrapReturnedEdit();
    wrapFinishReturnedEdit();
    hideSharedLegacyFields();
    observeItems();
    observeSiteOptions();

    const site = getSiteSelect();
    if (site && !site.dataset.progressLinkV2Bound) {
      site.dataset.progressLinkV2Bound = "1";
      site.addEventListener("change", () => loadOptions().catch(console.error));
    }

    enhanceAllCards();
    scheduleInitialLoads();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, 0), { once: true });
  } else {
    setTimeout(init, 0);
  }
})();

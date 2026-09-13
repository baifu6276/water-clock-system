// 工程進度百分比修正模組：允許數量不變時單獨修正目前進度，並避免手機編輯時強制叫出鍵盤。
(() => {
  "use strict";

  const text = value => value == null ? "" : String(value).trim();

  function status(message) {
    const el = document.getElementById("progressMessage");
    if (el) el.textContent = message;
  }

  function fieldValue(form, name) {
    return form.querySelector(`[name="${name}"]`)?.value ?? "";
  }

  function currentPercentFromCard(card) {
    if (!card) return "";
    const blocks = card.querySelectorAll(".progress-grid > div");
    for (const block of blocks) {
      const title = text(block.querySelector("dt")?.textContent);
      if (title !== "進度百分比") continue;
      return text(block.querySelector("dd")?.textContent).replace(/%$/, "");
    }
    return "";
  }

  function ensurePercentField(form) {
    let input = form.querySelector('[name="progressPercentManual"]');
    if (input) return input;

    const grid = form.querySelector(".progress-grid");
    if (!grid) return null;

    const wrapper = document.createElement("label");
    wrapper.textContent = "目前進度百分比";

    input = document.createElement("input");
    input.type = "number";
    input.name = "progressPercentManual";
    input.min = "0";
    input.max = "100";
    input.step = "0.01";
    input.inputMode = "decimal";
    input.placeholder = "0～100";

    const hint = document.createElement("small");
    hint.textContent = "可依現場實際狀況調整；留空時由完成數量與計畫數量自動計算。";

    wrapper.append(input, hint);

    const reason = grid.querySelector('[name="changeReason"]')?.closest("label");
    if (reason) grid.insertBefore(wrapper, reason);
    else grid.append(wrapper);

    return input;
  }

  async function saveExplicitPercent(form, input, event) {
    const original = text(input.dataset.originalPercent);
    const desired = text(input.value);
    if (!desired || desired === original) return false;

    const number = Number(desired);
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status("進度百分比請填 0～100。");
      input.focus();
      return true;
    }

    const reason = text(fieldValue(form, "changeReason"));
    if (!reason) {
      event.preventDefault();
      event.stopImmediatePropagation();
      status("手動調整進度百分比時，請填寫異動原因。");
      form.querySelector('[name="changeReason"]')?.focus();
      return true;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const siteId = text(document.querySelector('#progressV1 [name="siteId"]')?.value);
    const payload = {
      action: "adminProgressUpsert",
      userId,
      siteId,
      locationId: text(fieldValue(form, "locationId")),
      itemCode: text(fieldValue(form, "itemCode")),
      plannedQty: fieldValue(form, "plannedQty"),
      completedQty: fieldValue(form, "completedQty"),
      planStart: fieldValue(form, "planStart"),
      planEnd: fieldValue(form, "planEnd"),
      progressPercent: desired,
      changeReason: reason,
      sourceType: "工程進度看板"
    };

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    status("正在儲存工程進度…");

    try {
      const result = await callApi(payload);
      if (!result?.success) throw new Error(result?.message || "儲存失敗");
      status("工程進度已儲存，正在重新讀取最新資料…");
      const refresh = [...document.querySelectorAll("#progressV1 button")]
        .find(button => text(button.textContent) === "重新讀取");
      if (refresh) refresh.click();
    } catch (error) {
      console.error("progress percent override", error);
      status("進度百分比儲存失敗，請重新讀取後再試。");
    } finally {
      if (submit) submit.disabled = false;
    }
    return true;
  }

  function enhance(root) {
    const form = root.querySelector(".progress-editor");
    if (!form || form.dataset.percentEditorEnhanced === "1") return;
    form.dataset.percentEditorEnhanced = "1";

    const input = ensurePercentField(form);
    if (!input) return;

    root.addEventListener("click", event => {
      const button = event.target.closest("button");
      if (!button || text(button.textContent) !== "編輯進度") return;
      const card = button.closest(".progress-record");
      const percent = currentPercentFromCard(card);
      setTimeout(() => {
        input.value = percent;
        input.dataset.originalPercent = percent;
        if (document.activeElement?.name === "plannedQty") document.activeElement.blur();
      }, 0);
    }, true);

    ["locationId", "itemCode"].forEach(name => {
      form.querySelector(`[name="${name}"]`)?.addEventListener("change", () => {
        input.value = "";
        input.dataset.originalPercent = "";
      });
    });

    form.addEventListener("submit", event => {
      void saveExplicitPercent(form, input, event);
    }, true);
  }

  function init() {
    const root = document.getElementById("progressV1");
    if (!root) return;
    enhance(root);
    const observer = new MutationObserver(() => enhance(root));
    observer.observe(root, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();

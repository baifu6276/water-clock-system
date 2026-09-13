// 百分比欄位的純資料比較；送出與授權統一由 progress.js 處理。
(() => {
  "use strict";
  const text = value => value == null ? "" : String(value).trim();
  const numeric = value => text(value) === "" ? null : Number(value);
  function unchanged(original, values) {
    const before = numeric(original.progressPercent);
    let after = numeric(values.progressPercent);
    if (after === null && before !== null) {
      const planned = numeric(values.plannedQty);
      const completed = numeric(values.completedQty);
      if (planned > 0 && completed !== null) after = completed / planned * 100;
    }
    return before === after;
  }
  window.ProgressPercentEditor = Object.freeze({ unchanged });
})();

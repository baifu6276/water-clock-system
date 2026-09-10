// 工地日報 V1
// 依已確認的每日回報自動彙整，管理者確認後鎖定。

function renderSiteDailyReportSites() {
  const select = document.getElementById("siteDailyReportSite");
  if (!select) return;

  const current = select.value;
  select.innerHTML = '<option value="">全部可管理工地</option>';

  const permission = String(employee?.permission || "").trim().toUpperCase();

  (sites || []).forEach(function(site) {
    if (
      permission === "SITE_MANAGER" &&
      String(site.foremanId || "").trim() !== String(employee?.employeeId || "").trim()
    ) {
      return;
    }

    const option = document.createElement("option");
    option.value = site.siteId;
    option.innerText = site.name;
    select.appendChild(option);
  });

  if ([...select.options].some(o => o.value === current)) {
    select.value = current;
  }
}

function setDefaultSiteDailyReportDate() {
  const input = document.getElementById("siteDailyReportDate");
  if (!input || input.value) return;

  const reviewDate = document.getElementById("dailyReportReviewDate");
  if (reviewDate && reviewDate.value) {
    input.value = reviewDate.value;
    return;
  }

  const now = new Date();
  const pad = value => String(value).padStart(2, "0");
  input.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function refreshSiteDailyReports() {
  const date = document.getElementById("siteDailyReportDate")?.value || "";
  const siteId = document.getElementById("siteDailyReportSite")?.value || "";
  const button = document.getElementById("siteDailyReportRefreshButton");

  if (!date) {
    showSiteDailyReportStatus("❌ 請先選擇日期", "error");
    return;
  }

  if (button) button.disabled = true;
  showSiteDailyReportStatus("⏳ 正在彙整工地日報...", "normal");

  try {
    const result = await callApi({
      action: "adminSiteDailyReportRefresh",
      userId,
      date,
      siteId
    });

    if (!result.success) throw new Error(result.message || "彙整工地日報失敗");

    showSiteDailyReportStatus(
      `✅ ${result.message || `已彙整 ${result.updatedCount || 0} 份工地日報`}`,
      "success"
    );

    await loadSiteDailyReports(false);
  } catch (error) {
    console.error(error);
    showSiteDailyReportStatus(`❌ ${error.message || error}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

async function loadSiteDailyReports(showLoading = true) {
  const date = document.getElementById("siteDailyReportDate")?.value || "";
  const siteId = document.getElementById("siteDailyReportSite")?.value || "";
  const button = document.getElementById("siteDailyReportListButton");

  if (!date) {
    showSiteDailyReportStatus("❌ 請先選擇日期", "error");
    return;
  }

  if (button) button.disabled = true;
  if (showLoading) showSiteDailyReportStatus("⏳ 正在讀取工地日報...", "normal");

  try {
    const result = await callApi({
      action: "adminSiteDailyReportList",
      userId,
      date,
      siteId
    });

    if (!result.success) throw new Error(result.message || "讀取工地日報失敗");

    renderSiteDailyReportList(result.reports || []);

    if (showLoading) {
      showSiteDailyReportStatus(`✅ 已讀取 ${(result.reports || []).length} 份工地日報`, "success");
    }
  } catch (error) {
    console.error(error);
    const list = document.getElementById("siteDailyReportList");
    if (list) list.innerHTML = "";
    showSiteDailyReportStatus(`❌ ${error.message || error}`, "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function renderSiteDailyReportList(reports) {
  const list = document.getElementById("siteDailyReportList");
  if (!list) return;

  if (!reports || reports.length === 0) {
    list.innerHTML = '<div class="admin-empty">此日期沒有工地日報</div>';
    return;
  }

  list.innerHTML = "";

  reports.forEach(function(item, index) {
    const card = document.createElement("div");
    card.className = "site-daily-report-card";

    const noteId = `siteDailyReportNote_${index}`;
    const confirmable = item.status === "待確認";

    card.innerHTML = `
      <div class="daily-report-card-title">
        ${escapeHtml(item.siteName || "")}｜${escapeHtml(item.date || "")}
      </div>
      <div class="site-daily-report-stats">
        <span>出工 <b>${escapeHtml(String(item.workerCount ?? 0))}</b> 人</span>
        <span>回報 <b>${escapeHtml(String(item.reporterCount ?? 0))}</b> 人</span>
        <span>項目 <b>${escapeHtml(String(item.itemCount ?? 0))}</b> 筆</span>
      </div>
      <div><b>主要負責人：</b>${escapeHtml(item.managerName || "未設定")}</div>
      <div><b>狀態：</b>${escapeHtml(item.status || "")}</div>
      <div class="site-daily-report-block"><b>今日施工摘要</b><div>${escapeHtml(item.workSummary || "無已確認回報")}</div></div>
      <div class="site-daily-report-block"><b>異常／問題摘要</b><div>${escapeHtml(item.issueSummary || "無")}</div></div>
      <div class="site-daily-report-block"><b>需協助事項</b><div>${escapeHtml(item.helpSummary || "無")}</div></div>
      <div class="site-daily-report-block"><b>明日預定工作</b><div>${escapeHtml(item.tomorrowPlan || "未填")}</div></div>
      ${item.confirmNote ? `<div class="site-daily-report-block"><b>確認備註</b><div>${escapeHtml(item.confirmNote)}</div></div>` : ""}
      ${item.confirmedByName ? `<div class="small">確認人：${escapeHtml(item.confirmedByName)} ${escapeHtml(item.confirmedAt || "")}</div>` : ""}
      <div class="daily-report-field">
        <label for="${noteId}">確認備註</label>
        <textarea id="${noteId}" ${confirmable ? "" : "disabled"} placeholder="可填寫現場補充說明"></textarea>
      </div>
      <div class="daily-report-review-actions">
        <button class="btn-report-confirm" ${confirmable ? "" : "disabled"}
          onclick="confirmSiteDailyReport('${escapeJsString(item.dailyReportId || "")}', '${noteId}')">
          ${item.status === "已確認" ? "已確認" : "確認工地日報"}
        </button>
      </div>
    `;

    list.appendChild(card);
  });
}

async function confirmSiteDailyReport(dailyReportId, noteId) {
  const note = document.getElementById(noteId)?.value.trim() || "";

  if (!window.confirm("確定要確認這份工地日報嗎？確認後將鎖定，不會被重新彙整直接覆蓋。")) {
    return;
  }

  showSiteDailyReportStatus("⏳ 正在確認工地日報...", "normal");

  try {
    const result = await callApi({
      action: "adminSiteDailyReportFinalize",
      userId,
      dailyReportId,
      note
    });

    if (!result.success) throw new Error(result.message || "確認工地日報失敗");

    showSiteDailyReportStatus("✅ 工地日報已確認", "success");
    await loadSiteDailyReports(false);
  } catch (error) {
    console.error(error);
    showSiteDailyReportStatus(`❌ ${error.message || error}`, "error");
  }
}

function showSiteDailyReportStatus(message, type = "normal") {
  const box = document.getElementById("siteDailyReportStatusMsg");
  if (!box) return;

  box.className =
    type === "success" ? "status-success" :
    type === "error" ? "status-error" :
    "status-normal";

  box.innerText = message;
}

// 不改動既有管理模組：頁面載入完成後掛接管理後台開啟流程。
document.addEventListener("DOMContentLoaded", function() {
  const originalOpenAdminPanel = window.openAdminPanel;

  if (typeof originalOpenAdminPanel === "function") {
    window.openAdminPanel = function() {
      originalOpenAdminPanel.apply(this, arguments);
      renderSiteDailyReportSites();
      setDefaultSiteDailyReportDate();
    };
  }

  const style = document.createElement("style");
  style.textContent = `
    .site-daily-report-section {
      margin-top: 18px;
      padding-top: 18px;
      border-top: 1px solid rgba(127, 127, 127, 0.25);
    }
    .site-daily-report-card {
      margin-top: 12px;
      padding: 14px;
      border: 1px solid rgba(127, 127, 127, 0.28);
      border-radius: 12px;
    }
    .site-daily-report-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin: 8px 0 12px;
    }
    .site-daily-report-block {
      margin-top: 10px;
      white-space: pre-wrap;
      line-height: 1.55;
    }
    @media print {
      body * { visibility: hidden; }
      #siteDailyReportList, #siteDailyReportList * { visibility: visible; }
      #siteDailyReportList {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
      }
      .site-daily-report-card {
        break-inside: avoid;
        border: none;
      }
      .site-daily-report-card .daily-report-field,
      .site-daily-report-card .daily-report-review-actions {
        display: none !important;
      }
    }
  `;
  document.head.appendChild(style);
});

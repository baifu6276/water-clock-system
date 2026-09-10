// 打卡、GPS 與主畫面狀態
function renderSites() {
  const select = document.getElementById("siteSelect");
  select.innerHTML = "";
  sites.forEach(function (site) {
    const option = document.createElement("option");
    option.value = site.siteId;
    option.innerText = site.name;
    select.appendChild(option);
  });
  select.onchange = function () { updateGpsDisplay(); };
}

function getSelectedSite() {
  const siteId = document.getElementById("siteSelect").value;
  return sites.find(function (site) {
    return String(site.siteId) === String(siteId);
  });
}

function refreshLocation() {
  return new Promise(function (resolve, reject) {
    currentPosition = null;
    currentDistance = null;
    gpsAllowed = false;
    setButtons(false);
    document.getElementById("gpsBox").innerHTML = '<div class="gps-title">📡 正在取得目前位置...</div>';

    if (!navigator.geolocation) {
      showGpsError("此裝置不支援 GPS 定位");
      reject(new Error("此裝置不支援 GPS 定位"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      function (position) {
        currentPosition = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        updateGpsDisplay();
        resolve();
      },
      function (error) {
        console.error("GPS Error", error);
        let message = "無法取得 GPS 定位";
        if (error.code === 1) message = "定位權限被拒絕，請允許 LINE 使用定位";
        if (error.code === 2) message = "目前無法取得定位，請到戶外或稍後再試";
        if (error.code === 3) message = "取得定位逾時，請再試一次";
        showGpsError(message);
        reject(new Error(message));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function updateGpsDisplay() {
  const site = getSelectedSite();
  if (!site || !currentPosition) {
    setButtons(false);
    return;
  }

  const siteLat = Number(site.lat);
  const siteLng = Number(site.lng);
  if (isNaN(siteLat) || isNaN(siteLng)) {
    showGpsError("這個工地尚未設定 GPS");
    return;
  }

  currentDistance = Math.round(calculateDistance(currentPosition.lat, currentPosition.lng, siteLat, siteLng));
  const radius = Number(site.radius || settings.gpsRadius || 100);
  gpsAllowed = currentDistance <= radius;
  let statusHtml = "";

  if (gpsAllowed) {
    statusHtml = '<div class="gps-ok">✅ 位於打卡範圍內</div>';
  } else {
    const mode = String(settings.gpsMode || "BLOCK").toUpperCase();
    statusHtml = mode === "ALLOW_WITH_FLAG"
      ? '<div class="gps-warn">⚠️ 已超出工地範圍，系統目前允許異常打卡</div>'
      : '<div class="gps-error">❌ 已超出工地打卡範圍</div>';
  }

  document.getElementById("gpsBox").innerHTML = `
    <div class="gps-title">📍 ${escapeHtml(site.name)}</div>
    <div>目前距離工地：<b>${currentDistance} 公尺</b></div>
    <div>允許範圍：<b>${radius} 公尺</b></div>
    <div>GPS 精度：約 ±${Math.round(currentPosition.accuracy)} 公尺</div>
    ${statusHtml}
  `;
  updateButtons();
}

function showGpsError(message) {
  gpsAllowed = false;
  document.getElementById("gpsBox").innerHTML = `<div class="gps-error">❌ ${escapeHtml(message)}</div>`;
  setButtons(false);
}

function checkIn(type) {
  if (sending) return;
  if (!userId) {
    showStatus("❌ 尚未取得 LINE 身分", "error");
    return;
  }

  const site = getSelectedSite();
  if (!site) {
    showStatus("❌ 請先選擇工地", "error");
    return;
  }
  if (!currentPosition) {
    showStatus("❌ 尚未取得 GPS 定位", "error");
    return;
  }

  const mode = String(settings.gpsMode || "BLOCK").toUpperCase();
  if (!gpsAllowed && mode === "BLOCK") {
    showStatus("❌ 目前不在允許打卡範圍內", "error");
    return;
  }

  let workContent = document.getElementById("workContent").value.trim();
  if (!workContent) workContent = "未填寫";

  sending = true;
  setButtons(false);
  showStatus("⏳ 正在處理" + type + "打卡...", "normal");

  sendToGoogle({
    action: "clock",
    userId: userId,
    siteId: site.siteId,
    type: type,
    lat: currentPosition.lat,
    lng: currentPosition.lng,
    workContent: workContent
  }, type, site);
}

async function sendToGoogle(data, type, site) {
  try {
    const result = await callApi(data);
    if (!result.success) throw new Error(result.message || "打卡失敗");

    let message = "✅ " + (result.message || type + "打卡成功");
    message += "\n\n工地：" + (result.siteName || site.name);
    if (result.distance !== undefined) message += "\n距離：" + result.distance + " 公尺";
    if (type === "下班" && result.workHours !== undefined) message += "\n本段工時：" + result.workHours + " 小時";

    showStatus(message, "success");
    document.getElementById("workContent").value = "";
    try { await refreshLocation(); } catch (gpsError) { console.error(gpsError); }
  } catch (error) {
    console.error("傳送錯誤", error);
    showStatus("❌ " + (error.message || error), "error");
  } finally {
    sending = false;
    updateButtons();
  }
}

function updateButtons() {
  const site = getSelectedSite();
  const mode = String(settings.gpsMode || "BLOCK").toUpperCase();
  const canClock = !sending && !!userId && !!site && !!currentPosition && (gpsAllowed || mode === "ALLOW_WITH_FLAG");
  setButtons(canClock);
}

function setButtons(enabled) {
  document.getElementById("btnIn").disabled = !enabled;
  document.getElementById("btnOut").disabled = !enabled;
}

function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = function (value) { return value * Math.PI / 180; };
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function showStatus(message, type) {
  const el = document.getElementById("statusMsg");
  el.innerText = message;
  el.className = "";
  if (type === "success") el.classList.add("status-success");
  else if (type === "error") el.classList.add("status-error");
  else el.classList.add("status-normal");
}

/*******************************************************
 * 水電工程管理系統 API V3.3
 *
 * 功能：
 * 1. LINE UID 辨識員工
 * 2. 讀取施工中工地
 * 3. GPS 100 公尺判斷
 * 4. GPS_MODE 系統設定
 * 5. 上班 / 下班打卡
 * 6. 建立工作區段
 * 7. 防止重複上班
 * 8. 支援同一天跨工地
 * 9. 預留異常打卡模式
 * 10. 跨日未下班保護
 * 11. ADMIN / OWNER 補卡
 * 12. SITE_MANAGER 僅可處理自己負責工地
 * 13. 補卡原因與修改紀錄留痕
 * 14. 出勤審核彙總
 * 15. 出工日 / 加班認定
 * 16. SITE_MANAGER 工地範圍審核
 *******************************************************/


/*******************************************************
 * GET
 *
 * 直接開啟 API 網址時顯示系統狀態
 *******************************************************/
function doGet(e) {

  try {

    var action = "";

    if (
      e &&
      e.parameter &&
      e.parameter.action
    ) {
      action = String(
        e.parameter.action
      ).trim();
    }


    // ==========================================
    // 取得系統資訊
    // ==========================================
    if (action === "health") {

      return jsonResponse_({
        success: true,
        version: "3.3",
        message: "水電工程管理系統 API V3.3 正常運作"
      });

    }


    // ==========================================
    // 預設
    // ==========================================
    return jsonResponse_({
      success: true,
      version: "2.9",
      message: "水電工程管理系統 API V3.3 正常運作"
    });


  } catch (error) {

    return jsonResponse_({
      success: false,
      message: error.message
    });

  }

}



/*******************************************************
 * POST
 *******************************************************/
function doPost(e) {

  // Employee foundation actions authenticate before taking their own short write lock.
  var employeeRequest = employeeFoundationRequest_(e);
  if (employeeRequest) return handleEmployeeFoundation_(employeeRequest);

  var lock =
    LockService.getScriptLock();

  try {

    // 最多等待 10 秒，避免兩個人同時寫入資料時撞在一起
    lock.waitLock(10000);


    // ==========================================
    // 1. 檢查收到的資料
    // ==========================================
    if (
      !e ||
      !e.postData ||
      !e.postData.contents
    ) {

      throw new Error(
        "沒有收到系統資料"
      );

    }


    // ==========================================
    // 2. JSON 解析
    // ==========================================
    var data =
      JSON.parse(
        e.postData.contents
      );


    // ==========================================
    // 3. 判斷 API 動作
    //
    // 舊前端沒有 action
    // 只要有 type 就視為打卡
    // ==========================================
    var action =
      data.action
        ? String(data.action).trim()
        : "";


    if (
      action === "bootstrap"
    ) {

      return handleBootstrap_(data);

    }


    if (
      action === "adminOpenSegments"
    ) {

      return handleAdminOpenSegments_(data);

    }


    if (
      action === "adminMakeup"
    ) {

      return handleAdminMakeup_(data);

    }


    if (
      action === "adminAttendanceReviewRefresh"
    ) {

      return handleAdminAttendanceReviewRefresh_(data);

    }


    if (
      action === "adminAttendanceReviewList"
    ) {

      return handleAdminAttendanceReviewList_(data);

    }


    if (
      action === "adminAttendanceReviewApprove"
    ) {

      return handleAdminAttendanceReviewApprove_(data);

    }


    if (
      action === "adminDailySettlementRefresh"
    ) {

      return handleAdminDailySettlementRefresh_(data);

    }


    if (
      action === "adminDailySettlementList"
    ) {

      return handleAdminDailySettlementList_(data);

    }


    if (
      action === "adminDailySettlementFinalize"
    ) {

      return handleAdminDailySettlementFinalize_(data);

    }


    if (
      action === "adminPayrollRefresh"
    ) {

      return handleAdminPayrollRefresh_(data);

    }


    if (
      action === "adminPayrollList"
    ) {

      return handleAdminPayrollList_(data);

    }


    if (
      action === "adminPayrollFinalize"
    ) {

      return handleAdminPayrollFinalize_(data);

    }


    if (
      action === "adminPayrollReturnForCorrection"
    ) {

      return handleAdminPayrollReturnForCorrection_(data);

    }


    if (
      action === "dailyReportCreateBatch"
    ) {

      return handleDailyReportCreateBatch_(data);

    }


    if (
      action === "dailyReportProgressOptions"
    ) {

      return handleDailyReportProgressOptions_(data);

    }


    if (
      action === "dailyReportCreate"
    ) {

      return handleDailyReportCreate_(data);

    }


    if (
      action === "dailyReportListOwn"
    ) {

      return handleDailyReportListOwn_(data);

    }


    if (
      action === "dailyReportUpdateReturned"
    ) {

      return handleDailyReportUpdateReturned_(data);

    }


    if (
      action === "adminDailyReportReviewList"
    ) {

      return handleAdminDailyReportReviewList_(data);

    }


    if (
      action === "adminDailyReportReviewAction"
    ) {

      return handleAdminDailyReportReviewAction_(data);

    }


    if (
      action === "adminSiteDailyReportRefresh"
    ) {

      return handleAdminSiteDailyReportRefresh_(data);

    }


    if (
      action === "adminSiteDailyReportList"
    ) {

      return handleAdminSiteDailyReportList_(data);

    }


    if (
      action === "adminSiteDailyReportFinalize"
    ) {

      return handleAdminSiteDailyReportFinalize_(data);

    }



    if (
      action === "adminProgressBootstrap"
    ) {

      return handleAdminProgressBootstrap_(data);

    }


    if (
      action === "adminProgressLocationSave"
    ) {

      return handleAdminProgressLocationSave_(data);

    }


    if (
      action === "adminProgressItemSave"
    ) {

      return handleAdminProgressItemSave_(data);

    }


    if (
      action === "adminProgressList"
    ) {

      return handleAdminProgressList_(data);

    }


    if (
      action === "adminProgressUpsert"
    ) {

      return handleAdminProgressUpsert_(data);

    }


    if (
      action === "adminProgressConfirm"
    ) {

      return handleAdminProgressConfirm_(data);

    }


    if (
      action === "clock" ||
      data.type
    ) {

      return handleClock_(data);

    }


    throw new Error(
      "未知的 API 操作"
    );


  } catch (error) {

    return jsonResponse_({
      success: false,
      message: error.message
    });

  } finally {

    try {
      lock.releaseLock();
    } catch (ignore) {
    }

  }

}



/*******************************************************
 * 取得登入者 + 工地資料
 *
 * 未來新版 GitHub 頁面會使用
 *******************************************************/
function handleBootstrap_(data) {

  if (!data.userId) {

    throw new Error(
      "沒有收到 LINE UID"
    );

  }


  var employee =
    getEmployeeByLineUid_(
      data.userId
    );


  if (!employee) {

    throw new Error(
      "查無此員工資料，請聯絡管理員新增權限"
    );

  }


  if (
    String(employee.status).trim()
    !== "在職"
  ) {

    throw new Error(
      "此員工目前不是在職狀態"
    );

  }


  var sites =
    getActiveSites_();


  return jsonResponse_({

    success: true,

    employee: {
      employeeId:
        employee.employeeId,

      name:
        employee.name,

      grade:
        employee.grade,

      permission:
        employee.permission
    },

    sites: sites,

    settings: {
      gpsMode:
        getSetting_(
          "GPS_MODE",
          "BLOCK"
        ),

      gpsRadius:
        Number(
          getSetting_(
            "GPS_RADIUS",
            100
          )
        )
    }

  });

}



/*******************************************************
 * 正式打卡
 *******************************************************/
function handleClock_(data) {

  // ==========================================
  // 1. 基本檢查
  // ==========================================
  if (!data.userId) {

    throw new Error(
      "沒有收到 LINE UID"
    );

  }


  if (!data.type) {

    throw new Error(
      "沒有收到打卡類型"
    );

  }


  if (
    data.lat === undefined ||
    data.lng === undefined ||
    data.lat === null ||
    data.lng === null ||
    data.lat === "" ||
    data.lng === ""
  ) {

    throw new Error(
      "沒有收到 GPS 定位"
    );

  }


  var type =
    normalizeClockType_(
      data.type
    );


  var userLat =
    Number(data.lat);

  var userLng =
    Number(data.lng);


  if (
    isNaN(userLat) ||
    isNaN(userLng)
  ) {

    throw new Error(
      "GPS 座標格式錯誤"
    );

  }



  // ==========================================
  // 2. 找員工
  // ==========================================
  var employee =
    getEmployeeByLineUid_(
      data.userId
    );


  if (!employee) {

    throw new Error(
      "查無此員工資料，請聯絡管理員新增權限"
    );

  }


  if (
    String(employee.status).trim()
    !== "在職"
  ) {

    throw new Error(
      "此員工狀態非在職，無法打卡"
    );

  }



  // ==========================================
  // 3. 找工地
  // ==========================================
  var site =
    getSiteForClock_(data);


  if (!site) {

    throw new Error(
      "找不到可以使用的施工中工地"
    );

  }


  if (
    site.lat === "" ||
    site.lng === "" ||
    isNaN(Number(site.lat)) ||
    isNaN(Number(site.lng))
  ) {

    throw new Error(
      "此工地尚未設定 GPS 座標"
    );

  }



  // ==========================================
  // 4. GPS 距離
  // ==========================================
  var distance =
    calculateDistanceMeters_(
      userLat,
      userLng,
      Number(site.lat),
      Number(site.lng)
    );


  distance =
    Math.round(distance);


  // 工地自己有設定半徑，就優先使用工地半徑
  // 沒有才使用系統設定
  var radius =
    Number(site.radius);


  if (
    !radius ||
    radius <= 0
  ) {

    radius =
      Number(
        getSetting_(
          "GPS_RADIUS",
          100
        )
      );

  }


  var gpsMode =
    String(
      getSetting_(
        "GPS_MODE",
        "BLOCK"
      )
    )
      .trim()
      .toUpperCase();


  var gpsStatus =
    "正常";


  var abnormalReason =
    "";


  // ==========================================
  // 5. 超過 GPS 範圍
  // ==========================================
  if (distance > radius) {

    gpsStatus =
      "超出範圍";


    if (gpsMode === "BLOCK") {

      throw new Error(
        "目前距離「" +
        site.name +
        "」約 " +
        distance +
        " 公尺，允許打卡範圍為 " +
        radius +
        " 公尺，因此無法打卡"
      );

    }


    // 未來可切換成允許異常打卡
    if (
      gpsMode ===
      "ALLOW_WITH_FLAG"
    ) {

      abnormalReason =
        data.abnormalReason
          ? String(
              data.abnormalReason
            ).trim()
          : "";


      if (
        abnormalReason === ""
      ) {

        throw new Error(
          "目前不在工地打卡範圍內，請填寫異常原因"
        );

      }

    }

  }



  // ==========================================
  // 6. 工作內容
  // ==========================================
  var workContent =
    data.workContent
      ? String(
          data.workContent
        ).trim()
      : "";


  if (workContent === "") {

    workContent =
      "未填寫";

  }



  // ==========================================
  // 7. 現在時間
  // ==========================================
  var now =
    new Date();


  // ==========================================
  // 8. 上班
  // ==========================================
  if (type === "上班") {

    return clockIn_({

      employee:
        employee,

      site:
        site,

      now:
        now,

      lat:
        userLat,

      lng:
        userLng,

      distance:
        distance,

      gpsStatus:
        gpsStatus,

      workContent:
        workContent,

      abnormalReason:
        abnormalReason

    });

  }



  // ==========================================
  // 9. 下班
  // ==========================================
  if (type === "下班") {

    return clockOut_({

      employee:
        employee,

      site:
        site,

      now:
        now,

      lat:
        userLat,

      lng:
        userLng,

      distance:
        distance,

      gpsStatus:
        gpsStatus,

      workContent:
        workContent,

      abnormalReason:
        abnormalReason

    });

  }


  throw new Error(
    "不支援的打卡類型"
  );

}



/*******************************************************
 * 上班打卡
 *******************************************************/
function clockIn_(info) {

  // ==========================================
  // 檢查是否還有未完成區段
  // ==========================================
  var openSegment =
    findOpenWorkSegment_(
      info.employee.employeeId
    );


  if (openSegment) {

    throw new Error(
      "你目前還有一筆尚未下班的工作紀錄：" +
      openSegment.siteName +
      "，請先完成上一段下班"
    );

  }



  // ==========================================
  // 建立原始打卡紀錄
  // ==========================================
  appendClockRecord_({

    employee:
      info.employee,

    site:
      info.site,

    type:
      "上班",

    time:
      info.now,

    lat:
      info.lat,

    lng:
      info.lng,

    distance:
      info.distance,

    gpsStatus:
      info.gpsStatus,

    workContent:
      info.workContent,

    abnormalReason:
      info.abnormalReason

  });



  // ==========================================
  // 建立工作區段
  // ==========================================
  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var segmentSheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!segmentSheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var segmentId =
    createId_("SEG");


  var dateText =
    formatDate_(
      info.now
    );


  segmentSheet.appendRow([

    segmentId,                       // A 區段ID
    dateText,                        // B 日期
    info.employee.employeeId,        // C 員工ID
    info.employee.name,              // D 姓名
    info.employee.grade,             // E 級職
    info.site.siteId,                // F 工地ID
    info.site.name,                  // G 工地名稱
    info.site.foremanId || "",       // H 工作領班ID
    info.site.foremanName || "",     // I 工作領班姓名
    info.now,                        // J 上班時間
    "",                              // K 下班時間
    info.lat,                        // L 上班GPS緯度
    info.lng,                        // M 上班GPS經度
    info.distance,                   // N 上班距離
    "",                              // O 下班GPS緯度
    "",                              // P 下班GPS經度
    "",                              // Q 下班距離
    info.gpsStatus,                  // R GPS狀態
    info.workContent,                // S 工作內容
    "",                              // T 工時
    "",                              // U 加班狀態
    "",                              // V 異常狀態
    "",                              // W 補卡註記
    "",                              // X 修改人
    "",                              // Y 修改時間
    ""                               // Z 備註

  ]);


  return jsonResponse_({

    success: true,

    message:
      "上班打卡成功",

    name:
      info.employee.name,

    employeeId:
      info.employee.employeeId,

    siteId:
      info.site.siteId,

    siteName:
      info.site.name,

    distance:
      info.distance,

    radius:
      info.site.radius,

    segmentId:
      segmentId

  });

}



/*******************************************************
 * 下班打卡
 *******************************************************/
function clockOut_(info) {

  var openSegment =
    findOpenWorkSegment_(
      info.employee.employeeId
    );


  if (!openSegment) {

    throw new Error(
      "找不到尚未完成的上班紀錄，請先上班打卡"
    );

  }


  // ==========================================
  // 下班必須與目前開啟中的工地相同
  // ==========================================
  if (
    String(openSegment.siteId)
      .trim()
    !==
    String(info.site.siteId)
      .trim()
  ) {

    throw new Error(
      "你目前的上班工地是「" +
      openSegment.siteName +
      "」，請先在該工地完成下班"
    );

  }



  // ==========================================
  // 跨日未下班保護
  //
  // 昨天忘記下班，不允許今天直接按「下班」
  // 避免產生 20、24 小時以上的錯誤工時。
  // 必須由有權限的管理者進行補卡。
  // ==========================================
  var openStartDate =
    formatDate_(
      new Date(
        openSegment.startTime
      )
    );

  var currentDate =
    formatDate_(
      info.now
    );

  if (
    openStartDate !== currentDate
  ) {

    throw new Error(
      "你有一筆「" +
      openStartDate +
      "」尚未完成的工作區段，已跨日，不能直接下班。請聯絡管理員或該工地負責人補卡"
    );

  }



  // ==========================================
  // 寫原始下班紀錄
  // ==========================================
  appendClockRecord_({

    employee:
      info.employee,

    site:
      info.site,

    type:
      "下班",

    time:
      info.now,

    lat:
      info.lat,

    lng:
      info.lng,

    distance:
      info.distance,

    gpsStatus:
      info.gpsStatus,

    workContent:
      info.workContent,

    abnormalReason:
      info.abnormalReason

  });



  // ==========================================
  // 計算工時
  // ==========================================
  var startTime =
    new Date(
      openSegment.startTime
    );


  var diffMs =
    info.now.getTime() -
    startTime.getTime();


  var hours =
    diffMs /
    1000 /
    60 /
    60;


  hours =
    Math.round(
      hours * 100
    ) / 100;


  if (hours < 0) {

    hours = 0;

  }



  // ==========================================
  // 更新工作區段
  // ==========================================
  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  // K 下班時間
  sheet
    .getRange(
      openSegment.row,
      11
    )
    .setValue(
      info.now
    );


  // O 下班 GPS 緯度
  sheet
    .getRange(
      openSegment.row,
      15
    )
    .setValue(
      info.lat
    );


  // P 下班 GPS 經度
  sheet
    .getRange(
      openSegment.row,
      16
    )
    .setValue(
      info.lng
    );


  // Q 下班距離
  sheet
    .getRange(
      openSegment.row,
      17
    )
    .setValue(
      info.distance
    );


  // R GPS 狀態
  var finalGpsStatus =
    openSegment.gpsStatus;


  if (
    info.gpsStatus !== "正常"
  ) {

    finalGpsStatus =
      info.gpsStatus;

  }


  sheet
    .getRange(
      openSegment.row,
      18
    )
    .setValue(
      finalGpsStatus
    );


  // T 工時
  sheet
    .getRange(
      openSegment.row,
      20
    )
    .setValue(
      hours
    );


  // 如果下班有重新填工作內容
  // 就把 S 更新成最新內容
  if (
    info.workContent &&
    info.workContent !== "未填寫"
  ) {

    sheet
      .getRange(
        openSegment.row,
        19
      )
      .setValue(
        info.workContent
      );

  }



  return jsonResponse_({

    success: true,

    message:
      "下班打卡成功",

    name:
      info.employee.name,

    employeeId:
      info.employee.employeeId,

    siteId:
      info.site.siteId,

    siteName:
      info.site.name,

    distance:
      info.distance,

    workHours:
      hours,

    segmentId:
      openSegment.segmentId

  });

}




/*******************************************************
 * 管理端：取得未完成工作區段
 *
 * action: adminOpenSegments
 * 必填：
 * - userId：操作者 LINE UID
 *
 * 權限：
 * OWNER / ADMIN：可看全部
 * SITE_MANAGER：只看自己負責的工地
 *******************************************************/
function handleAdminOpenSegments_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertAttendanceManager_(
    operator
  );


  var segments =
    listOpenWorkSegments_();


  var allowed = [];


  for (
    var i = 0;
    i < segments.length;
    i++
  ) {

    if (
      canManageSite_(
        operator,
        segments[i].siteId
      )
    ) {

      allowed.push(
        segments[i]
      );

    }

  }


  return jsonResponse_({

    success: true,

    operator: {
      employeeId:
        operator.employeeId,

      name:
        operator.name,

      permission:
        operator.permission
    },

    openSegments:
      allowed

  });

}



/*******************************************************
 * 管理端：補卡
 *
 * action: adminMakeup
 *
 * makeupType：
 * 1. 補下班
 *    必填：segmentId, endTime, reason
 *
 * 2. 補完整區段
 *    必填：employeeId, siteId, startTime, endTime, reason
 *
 * 可選：
 * - workContent
 * - note
 *
 * 權限：
 * OWNER / ADMIN：全部工地
 * SITE_MANAGER：自己為主要負責人的工地
 *******************************************************/
function handleAdminMakeup_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertAttendanceManager_(
    operator
  );


  var makeupType =
    data.makeupType
      ? String(
          data.makeupType
        ).trim()
      : "";


  var reason =
    data.reason
      ? String(
          data.reason
        ).trim()
      : "";


  if (reason === "") {

    throw new Error(
      "補卡原因必填"
    );

  }


  if (
    makeupType === "補下班"
  ) {

    return makeupClockOut_(
      operator,
      data,
      reason
    );

  }


  if (
    makeupType === "補完整區段"
  ) {

    return makeupFullSegment_(
      operator,
      data,
      reason
    );

  }


  throw new Error(
    "補卡類型錯誤，請使用「補下班」或「補完整區段」"
  );

}



/*******************************************************
 * 補下班
 *******************************************************/
function makeupClockOut_(
  operator,
  data,
  reason
) {

  var segmentId =
    data.segmentId
      ? String(
          data.segmentId
        ).trim()
      : "";


  if (segmentId === "") {

    throw new Error(
      "沒有收到工作區段ID"
    );

  }


  var segment =
    getWorkSegmentById_(
      segmentId
    );


  if (!segment) {

    throw new Error(
      "找不到指定的工作區段"
    );

  }


  if (segment.endTime) {

    throw new Error(
      "這筆工作區段已經有下班時間，不能使用「補下班」"
    );

  }


  assertCanManageSite_(
    operator,
    segment.siteId
  );


  var endTime =
    parseLocalDateTime_(
      data.endTime,
      "補下班時間"
    );


  var startTime =
    new Date(
      segment.startTime
    );


  validateMakeupTimeRange_(
    startTime,
    endTime
  );


  var hours =
    calculateWorkHours_(
      startTime,
      endTime
    );


  var now =
    new Date();


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  // K 下班時間
  sheet
    .getRange(
      segment.row,
      11
    )
    .setValue(
      endTime
    );


  // R GPS狀態
  // 補卡沒有現場GPS，保留原上班GPS狀態；
  // 若原本為空白，標記「補卡」。
  var gpsStatus =
    segment.gpsStatus
      ? segment.gpsStatus
      : "補卡";

  sheet
    .getRange(
      segment.row,
      18
    )
    .setValue(
      gpsStatus
    );


  // T 工時
  sheet
    .getRange(
      segment.row,
      20
    )
    .setValue(
      hours
    );


  // V 異常狀態
  sheet
    .getRange(
      segment.row,
      22
    )
    .setValue(
      "補卡"
    );


  // W 補卡註記
  sheet
    .getRange(
      segment.row,
      23
    )
    .setValue(
      "補下班：" +
      reason
    );


  // X 修改人
  sheet
    .getRange(
      segment.row,
      24
    )
    .setValue(
      operator.employeeId +
      " " +
      operator.name
    );


  // Y 修改時間
  sheet
    .getRange(
      segment.row,
      25
    )
    .setValue(
      now
    );


  if (
    data.workContent &&
    String(data.workContent).trim() !== ""
  ) {

    sheet
      .getRange(
        segment.row,
        19
      )
      .setValue(
        String(
          data.workContent
        ).trim()
      );

  }


  var makeupId =
    appendMakeupRecord_({

      employeeId:
        segment.employeeId,

      employeeName:
        segment.employeeName,

      siteId:
        segment.siteId,

      siteName:
        segment.siteName,

      makeupType:
        "補下班",

      originalStartTime:
        startTime,

      originalEndTime:
        "",

      newStartTime:
        startTime,

      newEndTime:
        endTime,

      reason:
        reason,

      operator:
        operator,

      segmentId:
        segment.segmentId,

      note:
        data.note
          ? String(data.note).trim()
          : ""

    });


  return jsonResponse_({

    success: true,

    message:
      "補下班成功",

    makeupId:
      makeupId,

    segmentId:
      segment.segmentId,

    employeeId:
      segment.employeeId,

    employeeName:
      segment.employeeName,

    siteId:
      segment.siteId,

    siteName:
      segment.siteName,

    startTime:
      startTime,

    endTime:
      endTime,

    workHours:
      hours

  });

}



/*******************************************************
 * 補完整區段
 *
 * 適用：
 * 員工整天忘記上班打卡，後續由管理者
 * 補上班 + 補下班建立一個完整工作區段。
 *******************************************************/
function makeupFullSegment_(
  operator,
  data,
  reason
) {

  var employeeId =
    data.employeeId
      ? String(
          data.employeeId
        ).trim()
      : "";


  var siteId =
    data.siteId
      ? String(
          data.siteId
        ).trim()
      : "";


  if (employeeId === "") {

    throw new Error(
      "沒有收到員工ID"
    );

  }


  if (siteId === "") {

    throw new Error(
      "沒有收到工地ID"
    );

  }


  var employee =
    getEmployeeByEmployeeId_(
      employeeId
    );


  if (!employee) {

    throw new Error(
      "找不到指定員工"
    );

  }


  var site =
    getSiteById_(
      siteId
    );


  if (!site) {

    throw new Error(
      "找不到指定工地"
    );

  }


  assertCanManageSite_(
    operator,
    site.siteId
  );


  var startTime =
    parseLocalDateTime_(
      data.startTime,
      "補上班時間"
    );


  var endTime =
    parseLocalDateTime_(
      data.endTime,
      "補下班時間"
    );


  validateMakeupTimeRange_(
    startTime,
    endTime
  );


  var existingOverlap =
    findOverlappingWorkSegment_(
      employee.employeeId,
      startTime,
      endTime
    );


  if (existingOverlap) {

    throw new Error(
      "這個時段與既有工作區段重疊：" +
      existingOverlap.siteName +
      "（" +
      formatDateTime_(existingOverlap.startTime) +
      " ～ " +
      formatDateTime_(existingOverlap.endTime) +
      "）"
    );

  }


  var hours =
    calculateWorkHours_(
      startTime,
      endTime
    );


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var segmentId =
    createId_(
      "SEG"
    );


  var now =
    new Date();


  var workContent =
    data.workContent
      ? String(
          data.workContent
        ).trim()
      : "";


  if (workContent === "") {

    workContent =
      "補卡建立";

  }


  sheet.appendRow([

    segmentId,                       // A 區段ID
    formatDate_(startTime),          // B 日期
    employee.employeeId,             // C 員工ID
    employee.name,                   // D 姓名
    employee.grade,                  // E 級職
    site.siteId,                     // F 工地ID
    site.name,                       // G 工地名稱
    site.foremanId || "",            // H 工作領班ID
    site.foremanName || "",          // I 工作領班姓名
    startTime,                       // J 上班時間
    endTime,                         // K 下班時間
    "",                              // L 上班GPS緯度
    "",                              // M 上班GPS經度
    "",                              // N 上班距離
    "",                              // O 下班GPS緯度
    "",                              // P 下班GPS經度
    "",                              // Q 下班距離
    "補卡",                          // R GPS狀態
    workContent,                     // S 工作內容
    hours,                           // T 工時
    "",                              // U 加班狀態
    "補卡",                          // V 異常狀態
    "補完整區段：" + reason,         // W 補卡註記
    operator.employeeId + " " +
      operator.name,                 // X 修改人
    now,                             // Y 修改時間
    data.note
      ? String(data.note).trim()
      : ""                           // Z 備註

  ]);


  var makeupId =
    appendMakeupRecord_({

      employeeId:
        employee.employeeId,

      employeeName:
        employee.name,

      siteId:
        site.siteId,

      siteName:
        site.name,

      makeupType:
        "補完整區段",

      originalStartTime:
        "",

      originalEndTime:
        "",

      newStartTime:
        startTime,

      newEndTime:
        endTime,

      reason:
        reason,

      operator:
        operator,

      segmentId:
        segmentId,

      note:
        data.note
          ? String(data.note).trim()
          : ""

    });


  return jsonResponse_({

    success: true,

    message:
      "補完整工作區段成功",

    makeupId:
      makeupId,

    segmentId:
      segmentId,

    employeeId:
      employee.employeeId,

    employeeName:
      employee.name,

    siteId:
      site.siteId,

    siteName:
      site.name,

    startTime:
      startTime,

    endTime:
      endTime,

    workHours:
      hours

  });

}



/*******************************************************
 * 寫入補卡紀錄
 *
 * 補卡紀錄：
 * A 補卡ID
 * B 員工ID
 * C 姓名
 * D 工地ID
 * E 工地名稱
 * F 補卡類型
 * G 原始上班時間
 * H 原始下班時間
 * I 補卡後上班時間
 * J 補卡後下班時間
 * K 補卡原因
 * L 修改人ID
 * M 修改人姓名
 * N 修改時間
 * O 關聯區段ID
 * P 備註
 *******************************************************/
function appendMakeupRecord_(info) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "補卡紀錄"
    );


  if (!sheet) {

    throw new Error(
      "找不到「補卡紀錄」"
    );

  }


  var makeupId =
    createId_(
      "MUP"
    );


  sheet.appendRow([

    makeupId,
    info.employeeId,
    info.employeeName,
    info.siteId,
    info.siteName,
    info.makeupType,
    info.originalStartTime || "",
    info.originalEndTime || "",
    info.newStartTime || "",
    info.newEndTime || "",
    info.reason,
    info.operator.employeeId,
    info.operator.name,
    new Date(),
    info.segmentId,
    info.note || ""

  ]);


  return makeupId;

}



/*******************************************************
 * 取得目前登入的管理者
 *******************************************************/
function getOperatorEmployee_(
  lineUid
) {

  if (!lineUid) {

    throw new Error(
      "沒有收到操作者 LINE UID"
    );

  }


  var operator =
    getEmployeeByLineUid_(
      lineUid
    );


  if (!operator) {

    throw new Error(
      "查無操作者員工資料"
    );

  }


  if (
    String(operator.status).trim()
    !== "在職"
  ) {

    throw new Error(
      "操作者目前不是在職狀態"
    );

  }


  return operator;

}



/*******************************************************
 * 檢查是否具有出勤管理權
 *******************************************************/
function assertAttendanceManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    )
      .trim()
      .toUpperCase();


  if (
    permission === "OWNER" ||
    permission === "ADMIN" ||
    permission === "SITE_MANAGER"
  ) {

    return true;

  }


  throw new Error(
    "你的系統權限不能處理補卡或出勤審核"
  );

}



/*******************************************************
 * 是否可管理指定工地
 *
 * OWNER / ADMIN：全部工地
 * SITE_MANAGER：工地資料表 G欄主要領班ID
 *               必須等於自己的員工ID
 *******************************************************/
function canManageSite_(
  operator,
  siteId
) {

  var permission =
    String(
      operator.permission || ""
    )
      .trim()
      .toUpperCase();


  if (
    permission === "OWNER" ||
    permission === "ADMIN"
  ) {

    return true;

  }


  if (
    permission !== "SITE_MANAGER"
  ) {

    return false;

  }


  var site =
    getSiteById_(
      siteId
    );


  if (!site) {

    return false;

  }


  return (
    String(site.foremanId || "")
      .trim()
    ===
    String(operator.employeeId || "")
      .trim()
  );

}



/*******************************************************
 * 強制檢查工地管理權
 *******************************************************/
function assertCanManageSite_(
  operator,
  siteId
) {

  if (
    !canManageSite_(
      operator,
      siteId
    )
  ) {

    throw new Error(
      "你沒有權限管理這個工地的出勤資料"
    );

  }

}



/*******************************************************
 * 取得所有未完成工作區段
 *******************************************************/
function listOpenWorkSegments_() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return [];

  }


  var data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        26
      )
      .getValues();


  var result = [];


  for (
    var i = 0;
    i < data.length;
    i++
  ) {

    var startTime =
      data[i][9];

    var endTime =
      data[i][10];


    if (
      startTime &&
      !endTime
    ) {

      result.push({

        row:
          i + 2,

        segmentId:
          String(
            data[i][0]
          ).trim(),

        date:
          data[i][1],

        employeeId:
          String(
            data[i][2]
          ).trim(),

        employeeName:
          String(
            data[i][3]
          ).trim(),

        grade:
          String(
            data[i][4]
          ).trim(),

        siteId:
          String(
            data[i][5]
          ).trim(),

        siteName:
          String(
            data[i][6]
          ).trim(),

        foremanId:
          String(
            data[i][7]
          ).trim(),

        foremanName:
          String(
            data[i][8]
          ).trim(),

        startTime:
          startTime,

        workContent:
          String(
            data[i][18]
          ).trim(),

        gpsStatus:
          String(
            data[i][17]
          ).trim(),

        abnormalStatus:
          String(
            data[i][21]
          ).trim(),

        makeupNote:
          String(
            data[i][22]
          ).trim()

      });

    }

  }


  result.sort(
    function(a, b) {
      return (
        new Date(a.startTime).getTime() -
        new Date(b.startTime).getTime()
      );
    }
  );


  return result;

}



/*******************************************************
 * 用區段ID取得工作區段
 *******************************************************/
function getWorkSegmentById_(
  segmentId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return null;

  }


  var data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        26
      )
      .getValues();


  var target =
    String(
      segmentId
    ).trim();


  for (
    var i = 0;
    i < data.length;
    i++
  ) {

    if (
      String(
        data[i][0]
      ).trim()
      === target
    ) {

      return {

        row:
          i + 2,

        segmentId:
          target,

        date:
          data[i][1],

        employeeId:
          String(
            data[i][2]
          ).trim(),

        employeeName:
          String(
            data[i][3]
          ).trim(),

        grade:
          String(
            data[i][4]
          ).trim(),

        siteId:
          String(
            data[i][5]
          ).trim(),

        siteName:
          String(
            data[i][6]
          ).trim(),

        foremanId:
          String(
            data[i][7]
          ).trim(),

        foremanName:
          String(
            data[i][8]
          ).trim(),

        startTime:
          data[i][9],

        endTime:
          data[i][10],

        gpsStatus:
          String(
            data[i][17]
          ).trim(),

        workContent:
          String(
            data[i][18]
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 用員工ID尋找員工
 *******************************************************/
function getEmployeeByEmployeeId_(
  employeeId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "員工資料表"
    );


  if (!sheet) {

    throw new Error(
      "找不到「員工資料表」"
    );

  }


  var data =
    sheet
      .getDataRange()
      .getValues();


  var targetId =
    String(
      employeeId
    ).trim();


  for (
    var i = 1;
    i < data.length;
    i++
  ) {

    var rowId =
      String(
        data[i][0]
      ).trim();


    if (rowId === targetId) {

      return {

        row:
          i + 1,

        employeeId:
          rowId,

        lineUid:
          String(
            data[i][1]
          ).trim(),

        name:
          String(
            data[i][2]
          ).trim(),

        grade:
          String(
            data[i][3]
          ).trim(),

        salaryType:
          String(
            data[i][4]
          ).trim(),

        salaryAmount:
          data[i][5],

        permission:
          String(
            data[i][6]
          ).trim(),

        startDate:
          data[i][7],

        endDate:
          data[i][8],

        status:
          String(
            data[i][9]
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 用工地ID取得工地
 *
 * 與 getActiveSites_ 不同：
 * 補歷史資料時，即使工地已完工也仍需能找到。
 *******************************************************/
function getSiteById_(
  siteId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工地資料表"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工地資料表」"
    );

  }


  var data =
    sheet
      .getDataRange()
      .getValues();


  var targetId =
    String(
      siteId
    ).trim();


  for (
    var i = 1;
    i < data.length;
    i++
  ) {

    var rowSiteId =
      String(
        data[i][0]
      ).trim();


    if (
      rowSiteId === targetId
    ) {

      var radius =
        Number(
          data[i][5]
        );


      if (
        !radius ||
        radius <= 0
      ) {

        radius =
          Number(
            getSetting_(
              "GPS_RADIUS",
              100
            )
          );

      }


      return {

        row:
          i + 1,

        siteId:
          rowSiteId,

        name:
          String(
            data[i][1]
          ).trim(),

        address:
          String(
            data[i][2]
          ).trim(),

        lat:
          data[i][3],

        lng:
          data[i][4],

        radius:
          radius,

        foremanId:
          String(
            data[i][6]
          ).trim(),

        foremanName:
          String(
            data[i][7]
          ).trim(),

        status:
          String(
            data[i][11]
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 找指定員工在指定時段是否已有工作區段重疊
 *******************************************************/
function findOverlappingWorkSegment_(
  employeeId,
  startTime,
  endTime
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return null;

  }


  var data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        26
      )
      .getValues();


  var targetId =
    String(
      employeeId
    ).trim();


  for (
    var i = 0;
    i < data.length;
    i++
  ) {

    var rowEmployeeId =
      String(
        data[i][2]
      ).trim();


    if (
      rowEmployeeId !== targetId
    ) {

      continue;

    }


    var rowStart =
      data[i][9];

    var rowEnd =
      data[i][10];


    if (!rowStart) {

      continue;

    }


    // 尚未下班的區段視為持續到無限遠，
    // 避免補卡與未完成區段重疊。
    var rowStartDate =
      new Date(
        rowStart
      );


    var rowEndDate =
      rowEnd
        ? new Date(rowEnd)
        : new Date(8640000000000000);


    if (
      startTime.getTime() <
        rowEndDate.getTime()
      &&
      endTime.getTime() >
        rowStartDate.getTime()
    ) {

      return {

        segmentId:
          String(
            data[i][0]
          ).trim(),

        siteName:
          String(
            data[i][6]
          ).trim(),

        startTime:
          rowStartDate,

        endTime:
          rowEnd
            ? new Date(rowEnd)
            : ""

      };

    }

  }


  return null;

}



/*******************************************************
 * 驗證補卡時段
 *******************************************************/
function validateMakeupTimeRange_(
  startTime,
  endTime
) {

  if (
    !(startTime instanceof Date) ||
    isNaN(startTime.getTime())
  ) {

    throw new Error(
      "上班時間格式錯誤"
    );

  }


  if (
    !(endTime instanceof Date) ||
    isNaN(endTime.getTime())
  ) {

    throw new Error(
      "下班時間格式錯誤"
    );

  }


  if (
    endTime.getTime() <=
    startTime.getTime()
  ) {

    throw new Error(
      "下班時間必須晚於上班時間"
    );

  }


  var hours =
    (
      endTime.getTime() -
      startTime.getTime()
    ) /
    1000 /
    60 /
    60;


  if (hours > 24) {

    throw new Error(
      "單一工作區段不能超過 24 小時，請確認補卡時間"
    );

  }

}



/*******************************************************
 * 計算工作時數
 *******************************************************/
function calculateWorkHours_(
  startTime,
  endTime
) {

  var hours =
    (
      endTime.getTime() -
      startTime.getTime()
    ) /
    1000 /
    60 /
    60;


  return (
    Math.round(
      hours * 100
    ) / 100
  );

}



/*******************************************************
 * 解析前端 datetime-local
 *
 * 支援：
 * 2026-09-08T08:00
 * 2026-09-08 08:00
 * Date 可直接解析的其他格式
 *******************************************************/
function parseLocalDateTime_(
  value,
  fieldName
) {

  if (
    value instanceof Date
  ) {

    if (
      isNaN(
        value.getTime()
      )
    ) {

      throw new Error(
        fieldName +
        "格式錯誤"
      );

    }

    return value;

  }


  var text =
    value !== undefined &&
    value !== null
      ? String(value).trim()
      : "";


  if (text === "") {

    throw new Error(
      "請填寫" +
      fieldName
    );

  }


  var match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
    );


  if (match) {

    var parsed =
      new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0),
        0
      );


    if (
      parsed.getFullYear() !==
        Number(match[1])
      ||
      parsed.getMonth() !==
        Number(match[2]) - 1
      ||
      parsed.getDate() !==
        Number(match[3])
      ||
      parsed.getHours() !==
        Number(match[4])
      ||
      parsed.getMinutes() !==
        Number(match[5])
    ) {

      throw new Error(
        fieldName +
        "日期或時間不存在"
      );

    }


    return parsed;

  }


  var fallback =
    new Date(
      text
    );


  if (
    isNaN(
      fallback.getTime()
    )
  ) {

    throw new Error(
      fieldName +
      "格式錯誤"
    );

  }


  return fallback;

}



/*******************************************************
 * 日期 + 時間格式
 *******************************************************/
function formatDateTime_(date) {

  if (!date) {

    return "";

  }


  return Utilities.formatDate(
    new Date(date),
    Session.getScriptTimeZone(),
    "yyyy/MM/dd HH:mm:ss"
  );

}



/*******************************************************
 * 出勤審核 V1
 *
 * 「出勤審核」欄位：
 * A 審核ID
 * B 日期
 * C 員工ID
 * D 姓名
 * E 工地ID
 * F 工地名稱
 * G 負責人ID
 * H 負責人姓名
 * I 工作區段數
 * J 工地總工時
 * K 出工認定
 * L 加班認定
 * M 補卡狀態
 * N 異常狀態
 * O 審核狀態
 * P 審核人ID
 * Q 審核人姓名
 * R 審核時間
 * S 審核備註
 * T 建立時間
 * U 最後修改時間
 *******************************************************/


/*******************************************************
 * 管理端：依指定日期重新彙總出勤審核
 *
 * action: adminAttendanceReviewRefresh
 * 必填：
 * - userId
 * - date：yyyy-MM-dd 或 yyyy/MM/dd
 *
 * 可選：
 * - siteId
 *
 * OWNER / ADMIN：全部工地
 * SITE_MANAGER：自己負責工地
 *******************************************************/
function handleAdminAttendanceReviewRefresh_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertAttendanceManager_(
    operator
  );


  var targetDate =
    normalizeDateInput_(
      data.date
    );


  var requestedSiteId =
    data.siteId
      ? String(
          data.siteId
        ).trim()
      : "";


  if (
    requestedSiteId !== ""
  ) {

    assertCanManageSite_(
      operator,
      requestedSiteId
    );

  }


  var result =
    syncAttendanceReview_(
      operator,
      targetDate,
      requestedSiteId
    );


  return jsonResponse_({

    success: true,

    message:
      "出勤審核彙總完成",

    date:
      targetDate,

    created:
      result.created,

    updated:
      result.updated,

    total:
      result.total

  });

}



/*******************************************************
 * 管理端：讀取出勤審核
 *
 * action: adminAttendanceReviewList
 * 必填：
 * - userId
 *
 * 可選：
 * - date
 * - siteId
 *******************************************************/
function handleAdminAttendanceReviewList_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertAttendanceManager_(
    operator
  );


  var targetDate =
    data.date
      ? normalizeDateInput_(
          data.date
        )
      : "";


  var requestedSiteId =
    data.siteId
      ? String(
          data.siteId
        ).trim()
      : "";


  if (
    requestedSiteId !== ""
  ) {

    assertCanManageSite_(
      operator,
      requestedSiteId
    );

  }


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤審核"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return jsonResponse_({

      success: true,

      reviews: []

    });

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  var reviews = [];


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    var reviewDate =
      row[1]
        ? formatDate_(
            new Date(
              row[1]
            )
          )
        : "";


    var siteId =
      String(
        row[4] || ""
      ).trim();


    if (
      targetDate !== "" &&
      reviewDate !== targetDate
    ) {

      continue;

    }


    if (
      requestedSiteId !== "" &&
      siteId !== requestedSiteId
    ) {

      continue;

    }


    if (
      !canManageSite_(
        operator,
        siteId
      )
    ) {

      continue;

    }


    reviews.push({

      reviewId:
        String(
          row[0] || ""
        ).trim(),

      date:
        reviewDate,

      employeeId:
        String(
          row[2] || ""
        ).trim(),

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      siteId:
        siteId,

      siteName:
        String(
          row[5] || ""
        ).trim(),

      managerId:
        String(
          row[6] || ""
        ).trim(),

      managerName:
        String(
          row[7] || ""
        ).trim(),

      segmentCount:
        Number(
          row[8] || 0
        ),

      totalHours:
        Number(
          row[9] || 0
        ),

      workdayDecision:
        String(
          row[10] || ""
        ).trim() ||
        "未核定",

      overtimeDecision:
        String(
          row[11] || ""
        ).trim() ||
        "待確認",

      makeupStatus:
        String(
          row[12] || ""
        ).trim(),

      abnormalStatus:
        String(
          row[13] || ""
        ).trim(),

      reviewStatus:
        String(
          row[14] || ""
        ).trim() ||
        "待審核",

      reviewerId:
        String(
          row[15] || ""
        ).trim(),

      reviewerName:
        String(
          row[16] || ""
        ).trim(),

      reviewTime:
        row[17] || "",

      note:
        String(
          row[18] || ""
        ).trim(),

      createdAt:
        row[19] || "",

      updatedAt:
        row[20] || ""

    });

  }


  reviews.sort(
    function(a, b) {

      if (
        a.date !== b.date
      ) {

        return a.date <
          b.date
            ? 1
            : -1;

      }


      if (
        a.siteName !==
        b.siteName
      ) {

        return a.siteName >
          b.siteName
            ? 1
            : -1;

      }


      return a.employeeName >
        b.employeeName
          ? 1
          : -1;

    }
  );


  return jsonResponse_({

    success: true,

    reviews:
      reviews

  });

}



/*******************************************************
 * 管理端：確認 / 退回出勤審核
 *
 * action: adminAttendanceReviewApprove
 * 必填：
 * - userId
 * - reviewId
 * - reviewStatus：已確認 / 退回修正
 *
 * 已確認時：
 * - workdayDecision：整日 / 半日 / 不計出工
 * - overtimeDecision：無 / 半日 / 待確認
 *
 * 退回修正時：
 * - note 必填
 *******************************************************/
function handleAdminAttendanceReviewApprove_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertAttendanceManager_(
    operator
  );


  var reviewId =
    data.reviewId
      ? String(
          data.reviewId
        ).trim()
      : "";


  if (
    reviewId === ""
  ) {

    throw new Error(
      "沒有收到審核ID"
    );

  }


  var review =
    getAttendanceReviewById_(
      reviewId
    );


  if (!review) {

    throw new Error(
      "找不到指定的出勤審核資料"
    );

  }


  assertCanManageSite_(
    operator,
    review.siteId
  );


  var reviewStatus =
    data.reviewStatus
      ? String(
          data.reviewStatus
        ).trim()
      : "";


  var note =
    data.note
      ? String(
          data.note
        ).trim()
      : "";


  if (
    reviewStatus !== "已確認" &&
    reviewStatus !== "退回修正"
  ) {

    throw new Error(
      "審核狀態必須是「已確認」或「退回修正」"
    );

  }


  var workdayDecision =
    data.workdayDecision
      ? String(
          data.workdayDecision
        ).trim()
      : "";


  var overtimeDecision =
    data.overtimeDecision
      ? String(
          data.overtimeDecision
        ).trim()
      : "";


  if (
    reviewStatus === "已確認"
  ) {

    var allowedWorkday =
      [
        "整日",
        "半日",
        "不計出工"
      ];


    if (
      allowedWorkday.indexOf(
        workdayDecision
      ) === -1
    ) {

      throw new Error(
        "請選擇出工認定：整日、半日或不計出工"
      );

    }


    var allowedOvertime =
      [
        "無",
        "半日",
        "待確認"
      ];


    if (
      allowedOvertime.indexOf(
        overtimeDecision
      ) === -1
    ) {

      throw new Error(
        "請選擇加班認定"
      );

    }

  }


  if (
    reviewStatus === "退回修正" &&
    note === ""
  ) {

    throw new Error(
      "退回修正時必須填寫審核備註"
    );

  }


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤審核"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  var now =
    new Date();


  if (
    reviewStatus === "已確認"
  ) {

    sheet
      .getRange(
        review.row,
        11
      )
      .setValue(
        workdayDecision
      );


    sheet
      .getRange(
        review.row,
        12
      )
      .setValue(
        overtimeDecision
      );

  }


  sheet
    .getRange(
      review.row,
      15
    )
    .setValue(
      reviewStatus
    );


  sheet
    .getRange(
      review.row,
      16
    )
    .setValue(
      operator.employeeId
    );


  sheet
    .getRange(
      review.row,
      17
    )
    .setValue(
      operator.name
    );


  sheet
    .getRange(
      review.row,
      18
    )
    .setValue(
      now
    );


  sheet
    .getRange(
      review.row,
      19
    )
    .setValue(
      note
    );


  sheet
    .getRange(
      review.row,
      21
    )
    .setValue(
      now
    );


  return jsonResponse_({

    success: true,

    message:
      reviewStatus === "已確認"
        ? "出勤審核已確認"
        : "出勤審核已退回修正",

    reviewId:
      reviewId,

    reviewStatus:
      reviewStatus

  });

}



/*******************************************************
 * 依工作區段同步「出勤審核」
 *
 * 規則：
 * - 一列 = 日期 × 員工 × 工地
 * - 不刪除既有審核資料
 * - 既有「已確認」仍保留其審核認定與審核人
 * - 彙總欄位 I/J/M/N 會更新為目前工作區段結果
 *******************************************************/
function syncAttendanceReview_(
  operator,
  targetDate,
  requestedSiteId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var segmentSheet =
    ss.getSheetByName(
      "工作區段"
    );


  var reviewSheet =
    ss.getSheetByName(
      "出勤審核"
    );


  if (!segmentSheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  if (!reviewSheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  var groups = {};


  var lastRow =
    segmentSheet.getLastRow();


  if (lastRow >= 2) {

    var values =
      segmentSheet
        .getRange(
          2,
          1,
          lastRow - 1,
          26
        )
        .getValues();


    for (
      var i = 0;
      i < values.length;
      i++
    ) {

      var row =
        values[i];


      var startTime =
        row[9];


      if (!startTime) {

        continue;

      }


      var rowDate =
        formatDate_(
          new Date(
            startTime
          )
        );


      if (
        rowDate !== targetDate
      ) {

        continue;

      }


      var employeeId =
        String(
          row[2] || ""
        ).trim();


      var employeeName =
        String(
          row[3] || ""
        ).trim();


      var siteId =
        String(
          row[5] || ""
        ).trim();


      var siteName =
        String(
          row[6] || ""
        ).trim();


      if (
        requestedSiteId !== "" &&
        siteId !== requestedSiteId
      ) {

        continue;

      }


      if (
        !canManageSite_(
          operator,
          siteId
        )
      ) {

        continue;

      }


      var key =
        rowDate +
        "|" +
        employeeId +
        "|" +
        siteId;


      if (!groups[key]) {

        var site =
          getSiteById_(
            siteId
          );


        groups[key] = {

          date:
            rowDate,

          employeeId:
            employeeId,

          employeeName:
            employeeName,

          siteId:
            siteId,

          siteName:
            siteName,

          managerId:
            site
              ? site.foremanId
              : "",

          managerName:
            site
              ? site.foremanName
              : "",

          segmentCount:
            0,

          totalHours:
            0,

          hasMakeup:
            false,

          hasAbnormal:
            false

        };

      }


      groups[key].segmentCount++;


      groups[key].totalHours +=
        Number(
          row[19] || 0
        );


      if (
        String(
          row[22] || ""
        ).trim() !== ""
      ) {

        groups[key].hasMakeup =
          true;

      }


      var abnormal =
        String(
          row[21] || ""
        ).trim();


      if (
        abnormal !== ""
      ) {

        groups[key].hasAbnormal =
          true;

      }

    }

  }


  var existing =
    getAttendanceReviewIndex_();


  var created = 0;
  var updated = 0;
  var now = new Date();


  Object.keys(
    groups
  )
  .forEach(
    function(key) {

      var group =
        groups[key];


      var hours =
        Math.round(
          group.totalHours * 100
        ) / 100;


      var makeupStatus =
        group.hasMakeup
          ? "有補卡"
          : "無補卡";


      var abnormalStatus =
        group.hasAbnormal
          ? "有異常"
          : "正常";


      var existingRow =
        existing[key];


      if (existingRow) {

        reviewSheet
          .getRange(
            existingRow.row,
            7,
            1,
            4
          )
          .setValues([[
            group.managerId,
            group.managerName,
            group.segmentCount,
            hours
          ]]);


        reviewSheet
          .getRange(
            existingRow.row,
            13,
            1,
            2
          )
          .setValues([[
            makeupStatus,
            abnormalStatus
          ]]);


        reviewSheet
          .getRange(
            existingRow.row,
            21
          )
          .setValue(
            now
          );


        updated++;

      } else {

        reviewSheet.appendRow([

          createId_(
            "REV"
          ),                      // A 審核ID

          parseDateOnly_(
            group.date
          ),                      // B 日期

          group.employeeId,       // C 員工ID
          group.employeeName,     // D 姓名
          group.siteId,           // E 工地ID
          group.siteName,         // F 工地名稱
          group.managerId,        // G 負責人ID
          group.managerName,      // H 負責人姓名
          group.segmentCount,     // I 工作區段數
          hours,                  // J 工地總工時
          "未核定",               // K 出工認定
          "待確認",               // L 加班認定
          makeupStatus,           // M 補卡狀態
          abnormalStatus,         // N 異常狀態
          "待審核",               // O 審核狀態
          "",                     // P 審核人ID
          "",                     // Q 審核人姓名
          "",                     // R 審核時間
          "",                     // S 審核備註
          now,                    // T 建立時間
          now                     // U 最後修改時間

        ]);


        created++;

      }

    }
  );


  return {

    created:
      created,

    updated:
      updated,

    total:
      created + updated

  };

}



/*******************************************************
 * 建立出勤審核索引
 * key = yyyy/MM/dd|employeeId|siteId
 *******************************************************/
function getAttendanceReviewIndex_() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤審核"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  var index = {};


  if (lastRow < 2) {

    return index;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      !row[1] ||
      !row[2] ||
      !row[4]
    ) {

      continue;

    }


    var key =
      formatDate_(
        new Date(
          row[1]
        )
      ) +
      "|" +
      String(
        row[2]
      ).trim() +
      "|" +
      String(
        row[4]
      ).trim();


    index[key] = {

      row:
        i + 2,

      reviewId:
        String(
          row[0] || ""
        ).trim(),

      status:
        String(
          row[14] || ""
        ).trim()

    };

  }


  return index;

}



/*******************************************************
 * 用審核ID取得出勤審核
 *******************************************************/
function getAttendanceReviewById_(
  reviewId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤審核"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return null;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  var target =
    String(
      reviewId
    ).trim();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      String(
        row[0] || ""
      ).trim() === target
    ) {

      return {

        row:
          i + 2,

        reviewId:
          target,

        date:
          row[1],

        employeeId:
          String(
            row[2] || ""
          ).trim(),

        employeeName:
          String(
            row[3] || ""
          ).trim(),

        siteId:
          String(
            row[4] || ""
          ).trim(),

        siteName:
          String(
            row[5] || ""
          ).trim(),

        reviewStatus:
          String(
            row[14] || ""
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 正規化日期輸入，回傳 yyyy/MM/dd
 *******************************************************/
function normalizeDateInput_(
  value
) {

  var text =
    value !== undefined &&
    value !== null
      ? String(value).trim()
      : "";


  if (
    text === ""
  ) {

    throw new Error(
      "請選擇日期"
    );

  }


  var match =
    text.match(
      /^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/
    );


  if (!match) {

    throw new Error(
      "日期格式錯誤"
    );

  }


  var year =
    Number(
      match[1]
    );


  var month =
    Number(
      match[2]
    );


  var day =
    Number(
      match[3]
    );


  var date =
    new Date(
      year,
      month - 1,
      day
    );


  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {

    throw new Error(
      "日期不存在"
    );

  }


  return formatDate_(
    date
  );

}



/*******************************************************
 * yyyy/MM/dd 轉 Date
 *******************************************************/
function parseDateOnly_(
  value
) {

  var normalized =
    normalizeDateInput_(
      value
    );


  var parts =
    normalized.split(
      "/"
    );


  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );

}



/*******************************************************
 * 出勤日結 V1
 *
 * 「出勤日結」欄位：
 * A 日結ID
 * B 日期
 * C 員工ID
 * D 姓名
 * E 薪資制
 * F 當日工地數
 * G 當日工作區段數
 * H 當日總工時
 * I 工地出勤審核狀態
 * J 出工日數
 * K 加班日數
 * L 異常狀態
 * M 補卡狀態
 * N 日結狀態
 * O 日結人ID
 * P 日結人姓名
 * Q 日結時間
 * R 日結備註
 * S 建立時間
 * T 最後修改時間
 *
 * 核心規則：
 * 1. 一列 = 日期 × 員工
 * 2. 不論同一天跑幾個工地，J 出工日數最高只能 1
 * 3. 薪資後續只讀「出勤日結」，不直接累加工地審核
 * 4. 工地尚未全部確認時，不允許正式日結
 *******************************************************/


/*******************************************************
 * 公司級出勤日結權限
 *
 * SITE_MANAGER 已在「出勤審核」層級負責自己的工地。
 * 跨工地的最終「員工 × 日期」日結屬公司級，
 * 由 OWNER / ADMIN 執行，避免單一工地主管
 * 影響其他工地的最終計薪日數。
 *******************************************************/
function assertDailySettlementManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    ).trim();


  if (
    permission !== "OWNER" &&
    permission !== "ADMIN"
  ) {

    throw new Error(
      "你沒有公司級出勤日結權限"
    );

  }

}



/*******************************************************
 * 管理端：重新彙總某一天的出勤日結
 *
 * action: adminDailySettlementRefresh
 * 必填：
 * - userId
 * - date
 *
 * 來源：
 * 「出勤審核」
 *
 * 輸出：
 * 一位員工一天只會有一筆「出勤日結」
 *******************************************************/
function handleAdminDailySettlementRefresh_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertDailySettlementManager_(
    operator
  );


  var targetDate =
    normalizeDateInput_(
      data.date
    );


  var result =
    syncDailySettlement_(
      targetDate
    );


  return jsonResponse_({

    success: true,

    message:
      "出勤日結彙總完成",

    date:
      targetDate,

    created:
      result.created,

    updated:
      result.updated,

    unchanged:
      result.unchanged,

    total:
      result.total

  });

}



/*******************************************************
 * 管理端：讀取某一天出勤日結
 *
 * action: adminDailySettlementList
 * 必填：
 * - userId
 *
 * 可選：
 * - date
 *******************************************************/
function handleAdminDailySettlementList_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertDailySettlementManager_(
    operator
  );


  var targetDate =
    data.date
      ? normalizeDateInput_(
          data.date
        )
      : "";


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤日結"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (lastRow < 2) {

    return jsonResponse_({

      success: true,

      settlements: []

    });

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        20
      )
      .getValues();


  var settlements = [];


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    var rowDate =
      row[1]
        ? formatDate_(
            new Date(
              row[1]
            )
          )
        : "";


    if (
      targetDate !== "" &&
      rowDate !== targetDate
    ) {

      continue;

    }


    settlements.push({

      settlementId:
        String(
          row[0] || ""
        ).trim(),

      date:
        rowDate,

      employeeId:
        String(
          row[2] || ""
        ).trim(),

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      salaryType:
        String(
          row[4] || ""
        ).trim(),

      siteCount:
        Number(
          row[5] || 0
        ),

      segmentCount:
        Number(
          row[6] || 0
        ),

      totalHours:
        Number(
          row[7] || 0
        ),

      siteReviewStatus:
        String(
          row[8] || ""
        ).trim(),

      workdayCount:
        row[9] === "" ||
        row[9] === null
          ? ""
          : Number(
              row[9]
            ),

      overtimeCount:
        row[10] === "" ||
        row[10] === null
          ? ""
          : Number(
              row[10]
            ),

      abnormalStatus:
        String(
          row[11] || ""
        ).trim(),

      makeupStatus:
        String(
          row[12] || ""
        ).trim(),

      settlementStatus:
        String(
          row[13] || ""
        ).trim() ||
        "待日結",

      settledById:
        String(
          row[14] || ""
        ).trim(),

      settledByName:
        String(
          row[15] || ""
        ).trim(),

      settledAt:
        row[16] || "",

      note:
        String(
          row[17] || ""
        ).trim(),

      createdAt:
        row[18] || "",

      updatedAt:
        row[19] || ""

    });

  }


  settlements.sort(
    function(a, b) {

      if (
        a.date !== b.date
      ) {

        return a.date <
          b.date
            ? 1
            : -1;

      }


      return a.employeeName >
        b.employeeName
          ? 1
          : -1;

    }
  );


  return jsonResponse_({

    success: true,

    settlements:
      settlements

  });

}



/*******************************************************
 * 管理端：正式日結
 *
 * action: adminDailySettlementFinalize
 * 必填：
 * - userId
 * - settlementId
 * - workdayCount：0 / 0.5 / 1
 * - overtimeCount：0 / 0.5
 *
 * 可選：
 * - note
 *
 * 規則：
 * - 工地出勤審核必須「全部已確認」
 * - 出工日最高只能 1
 * - 同一天跨多工地也只能存在一筆日結
 *******************************************************/
function handleAdminDailySettlementFinalize_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertDailySettlementManager_(
    operator
  );


  var settlementId =
    data.settlementId
      ? String(
          data.settlementId
        ).trim()
      : "";


  if (
    settlementId === ""
  ) {

    throw new Error(
      "沒有收到日結ID"
    );

  }


  var settlement =
    getDailySettlementById_(
      settlementId
    );


  if (!settlement) {

    throw new Error(
      "找不到指定的出勤日結資料"
    );

  }


  if (
    settlement.siteReviewStatus !==
    "全部已確認"
  ) {

    throw new Error(
      "工地出勤尚未全部確認，不能正式日結"
    );

  }


  var workdayCount =
    Number(
      data.workdayCount
    );


  var overtimeCount =
    Number(
      data.overtimeCount
    );


  var allowedWorkdays =
    [
      0,
      0.5,
      1
    ];


  var allowedOvertime =
    [
      0,
      0.5
    ];


  if (
    allowedWorkdays.indexOf(
      workdayCount
    ) === -1
  ) {

    throw new Error(
      "出工日數只能是 0、0.5 或 1"
    );

  }


  if (
    allowedOvertime.indexOf(
      overtimeCount
    ) === -1
  ) {

    throw new Error(
      "加班日數只能是 0 或 0.5"
    );

  }


  var note =
    data.note
      ? String(
          data.note
        ).trim()
      : "";


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤日結"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  var now =
    new Date();


  sheet
    .getRange(
      settlement.row,
      10
    )
    .setValue(
      workdayCount
    );


  sheet
    .getRange(
      settlement.row,
      11
    )
    .setValue(
      overtimeCount
    );


  sheet
    .getRange(
      settlement.row,
      14
    )
    .setValue(
      "已日結"
    );


  sheet
    .getRange(
      settlement.row,
      15
    )
    .setValue(
      operator.employeeId
    );


  sheet
    .getRange(
      settlement.row,
      16
    )
    .setValue(
      operator.name
    );


  sheet
    .getRange(
      settlement.row,
      17
    )
    .setValue(
      now
    );


  sheet
    .getRange(
      settlement.row,
      18
    )
    .setValue(
      note
    );


  sheet
    .getRange(
      settlement.row,
      20
    )
    .setValue(
      now
    );


  return jsonResponse_({

    success: true,

    message:
      "出勤日結已完成",

    settlementId:
      settlementId,

    workdayCount:
      workdayCount,

    overtimeCount:
      overtimeCount

  });

}



/*******************************************************
 * 同步「出勤日結」
 *
 * 一列 = 日期 × 員工
 *
 * 彙總來源：
 * 「出勤審核」一列 = 日期 × 員工 × 工地
 *******************************************************/
function syncDailySettlement_(
  targetDate
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var reviewSheet =
    ss.getSheetByName(
      "出勤審核"
    );


  var settlementSheet =
    ss.getSheetByName(
      "出勤日結"
    );


  if (!reviewSheet) {

    throw new Error(
      "找不到「出勤審核」"
    );

  }


  if (!settlementSheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  var groups = {};


  var lastReviewRow =
    reviewSheet.getLastRow();


  if (
    lastReviewRow >= 2
  ) {

    var values =
      reviewSheet
        .getRange(
          2,
          1,
          lastReviewRow - 1,
          21
        )
        .getValues();


    for (
      var i = 0;
      i < values.length;
      i++
    ) {

      var row =
        values[i];


      if (!row[1]) {

        continue;

      }


      var rowDate =
        formatDate_(
          new Date(
            row[1]
          )
        );


      if (
        rowDate !== targetDate
      ) {

        continue;

      }


      var employeeId =
        String(
          row[2] || ""
        ).trim();


      if (
        employeeId === ""
      ) {

        continue;

      }


      if (!groups[employeeId]) {

        var employee =
          getEmployeeByEmployeeId_(
            employeeId
          );


        groups[employeeId] = {

          date:
            rowDate,

          employeeId:
            employeeId,

          employeeName:
            String(
              row[3] || ""
            ).trim(),

          salaryType:
            employee
              ? employee.salaryType
              : "",

          siteIds:
            {},

          segmentCount:
            0,

          totalHours:
            0,

          hasPendingReview:
            false,

          hasReturnedReview:
            false,

          allConfirmed:
            true,

          hasAbnormal:
            false,

          hasMakeup:
            false

        };

      }


      var group =
        groups[employeeId];


      var siteId =
        String(
          row[4] || ""
        ).trim();


      if (
        siteId !== ""
      ) {

        group.siteIds[
          siteId
        ] = true;

      }


      group.segmentCount +=
        Number(
          row[8] || 0
        );


      group.totalHours +=
        Number(
          row[9] || 0
        );


      var reviewStatus =
        String(
          row[14] || ""
        ).trim();


      if (
        reviewStatus ===
        "退回修正"
      ) {

        group.hasReturnedReview =
          true;

        group.allConfirmed =
          false;

      } else if (
        reviewStatus !==
        "已確認"
      ) {

        group.hasPendingReview =
          true;

        group.allConfirmed =
          false;

      }


      if (
        String(
          row[13] || ""
        ).trim() ===
        "有異常"
      ) {

        group.hasAbnormal =
          true;

      }


      if (
        String(
          row[12] || ""
        ).trim() ===
        "有補卡"
      ) {

        group.hasMakeup =
          true;

      }

    }

  }


  var existing =
    getDailySettlementIndex_();


  var created = 0;
  var updated = 0;
  var unchanged = 0;
  var now = new Date();


  Object.keys(
    groups
  )
  .forEach(
    function(employeeId) {

      var group =
        groups[employeeId];


      var siteCount =
        Object.keys(
          group.siteIds
        ).length;


      var totalHours =
        Math.round(
          group.totalHours * 100
        ) / 100;


      var siteReviewStatus =
        group.hasReturnedReview
          ? "有退回修正"
          : (
              group.allConfirmed
                ? "全部已確認"
                : "尚有待審核"
            );


      var abnormalStatus =
        group.hasAbnormal
          ? "有異常"
          : "正常";


      var makeupStatus =
        group.hasMakeup
          ? "有補卡"
          : "無補卡";


      var key =
        group.date +
        "|" +
        group.employeeId;


      var current =
        existing[key];


      if (!current) {

        settlementSheet.appendRow([

          createId_(
            "DAY"
          ),                       // A 日結ID

          parseDateOnly_(
            group.date
          ),                       // B 日期

          group.employeeId,        // C 員工ID
          group.employeeName,      // D 姓名
          group.salaryType,        // E 薪資制
          siteCount,               // F 當日工地數
          group.segmentCount,      // G 當日工作區段數
          totalHours,              // H 當日總工時
          siteReviewStatus,        // I 工地出勤審核狀態
          "",                      // J 出工日數
          "",                      // K 加班日數
          abnormalStatus,          // L 異常狀態
          makeupStatus,            // M 補卡狀態
          "待日結",                // N 日結狀態
          "",                      // O 日結人ID
          "",                      // P 日結人姓名
          "",                      // Q 日結時間
          "",                      // R 日結備註
          now,                     // S 建立時間
          now                      // T 最後修改時間

        ]);


        created++;

        return;

      }


      var sourceChanged =
        Number(
          current.siteCount
        ) !== siteCount ||
        Number(
          current.segmentCount
        ) !== Number(
          group.segmentCount
        ) ||
        Number(
          current.totalHours
        ) !== Number(
          totalHours
        ) ||
        current.siteReviewStatus !==
          siteReviewStatus ||
        current.abnormalStatus !==
          abnormalStatus ||
        current.makeupStatus !==
          makeupStatus ||
        current.salaryType !==
          group.salaryType ||
        current.employeeName !==
          group.employeeName;


      if (!sourceChanged) {

        unchanged++;

        return;

      }


      settlementSheet
        .getRange(
          current.row,
          4,
          1,
          6
        )
        .setValues([[
          group.employeeName,
          group.salaryType,
          siteCount,
          group.segmentCount,
          totalHours,
          siteReviewStatus
        ]]);


      settlementSheet
        .getRange(
          current.row,
          12,
          1,
          2
        )
        .setValues([[
          abnormalStatus,
          makeupStatus
        ]]);


      // 如果來源資料在已日結後又發生改變，
      // 不直接刪除舊的日結人/時間，而是把狀態退回「待日結」，
      // 保留上一次日結痕跡，提醒管理者重新確認。
      if (
        current.settlementStatus ===
        "已日結"
      ) {

        settlementSheet
          .getRange(
            current.row,
            14
          )
          .setValue(
            "待日結"
          );


        var previousNote =
          String(
            current.note || ""
          ).trim();


        var systemNote =
          "[系統] 來源出勤資料已變更，請重新日結";


        var newNote =
          previousNote
            ? previousNote +
              "\n" +
              systemNote
            : systemNote;


        settlementSheet
          .getRange(
            current.row,
            18
          )
          .setValue(
            newNote
          );

      }


      settlementSheet
        .getRange(
          current.row,
          20
        )
        .setValue(
          now
        );


      updated++;

    }
  );


  return {

    created:
      created,

    updated:
      updated,

    unchanged:
      unchanged,

    total:
      created +
      updated +
      unchanged

  };

}



/*******************************************************
 * 建立出勤日結索引
 * key = yyyy/MM/dd|employeeId
 *******************************************************/
function getDailySettlementIndex_() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤日結"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  var index = {};


  if (
    lastRow < 2
  ) {

    return index;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        20
      )
      .getValues();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      !row[1] ||
      !row[2]
    ) {

      continue;

    }


    var key =
      formatDate_(
        new Date(
          row[1]
        )
      ) +
      "|" +
      String(
        row[2]
      ).trim();


    index[key] = {

      row:
        i + 2,

      settlementId:
        String(
          row[0] || ""
        ).trim(),

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      salaryType:
        String(
          row[4] || ""
        ).trim(),

      siteCount:
        Number(
          row[5] || 0
        ),

      segmentCount:
        Number(
          row[6] || 0
        ),

      totalHours:
        Number(
          row[7] || 0
        ),

      siteReviewStatus:
        String(
          row[8] || ""
        ).trim(),

      abnormalStatus:
        String(
          row[11] || ""
        ).trim(),

      makeupStatus:
        String(
          row[12] || ""
        ).trim(),

      settlementStatus:
        String(
          row[13] || ""
        ).trim(),

      note:
        String(
          row[17] || ""
        ).trim()

    };

  }


  return index;

}



/*******************************************************
 * 用日結ID取得出勤日結
 *******************************************************/
function getDailySettlementById_(
  settlementId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "出勤日結"
    );


  if (!sheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return null;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        20
      )
      .getValues();


  var target =
    String(
      settlementId
    ).trim();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      String(
        row[0] || ""
      ).trim() === target
    ) {

      return {

        row:
          i + 2,

        settlementId:
          target,

        date:
          row[1],

        employeeId:
          String(
            row[2] || ""
          ).trim(),

        employeeName:
          String(
            row[3] || ""
          ).trim(),

        salaryType:
          String(
            row[4] || ""
          ).trim(),

        siteCount:
          Number(
            row[5] || 0
          ),

        segmentCount:
          Number(
            row[6] || 0
          ),

        totalHours:
          Number(
            row[7] || 0
          ),

        siteReviewStatus:
          String(
            row[8] || ""
          ).trim(),

        settlementStatus:
          String(
            row[13] || ""
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 薪資 V1
 *
 * 「薪資結算」欄位：
 * A 結算ID
 * B 結算月份
 * C 員工ID
 * D 姓名
 * E 級職
 * F 薪資制
 * G 薪資單價
 * H 出工日數
 * I 加班日數
 * J 基本薪資
 * K 加班薪資
 * L 其他加項
 * M 其他扣項
 * N 應發薪資
 * O 結算狀態
 * P 結算人ID
 * Q 結算人姓名
 * R 結算時間
 * S 結算備註
 * T 建立時間
 * U 最後修改時間
 *
 * V1 原則：
 * 1. 一列 = 結算月份 × 員工
 * 2. 只讀「出勤日結」中 N=已日結 的資料
 * 3. 日薪：
 *    基本薪資 = 出工日數 × 薪資單價
 *    加班薪資 = 加班日數 × 薪資單價
 * 4. 月薪：
 *    基本薪資 = 員工資料表的月薪金額
 *    加班薪資 V1 仍依「加班日數 × 薪資單價」顯示，
 *    正式月薪加班法規/公司規則後續再獨立設定。
 * 5. 正式「已結算」後，重新彙總不靜默覆蓋。
 *******************************************************/


/*******************************************************
 * 薪資管理權限
 * V1：OWNER / ADMIN
 *******************************************************/
function assertPayrollManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    ).trim();


  if (
    permission !== "OWNER" &&
    permission !== "ADMIN"
  ) {

    throw new Error(
      "你沒有公司級薪資結算權限"
    );

  }

}



/*******************************************************
 * 重新彙總指定月份薪資
 *
 * action: adminPayrollRefresh
 * 必填：
 * - userId
 * - month：yyyy-MM 或 yyyy/MM
 *******************************************************/
function handleAdminPayrollRefresh_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertPayrollManager_(
    operator
  );


  var month =
    normalizeMonthInput_(
      data.month
    );


  var result =
    syncPayrollSettlement_(
      month
    );


  return jsonResponse_({

    success: true,

    message:
      "薪資彙總完成",

    month:
      month,

    created:
      result.created,

    updated:
      result.updated,

    unchanged:
      result.unchanged,

    locked:
      result.locked,

    total:
      result.total

  });

}



/*******************************************************
 * 讀取指定月份薪資
 *
 * action: adminPayrollList
 *******************************************************/
function handleAdminPayrollList_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertPayrollManager_(
    operator
  );


  var month =
    data.month
      ? normalizeMonthInput_(
          data.month
        )
      : "";


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "薪資結算"
    );


  if (!sheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return jsonResponse_({

      success: true,

      payrolls: []

    });

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  var payrolls = [];


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    var rowMonth =
      normalizeStoredMonth_(
        row[1]
      );


    if (
      month !== "" &&
      rowMonth !== month
    ) {

      continue;

    }


    payrolls.push({

      settlementId:
        String(
          row[0] || ""
        ).trim(),

      month:
        rowMonth,

      employeeId:
        String(
          row[2] || ""
        ).trim(),

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      grade:
        String(
          row[4] || ""
        ).trim(),

      salaryType:
        String(
          row[5] || ""
        ).trim(),

      salaryRate:
        Number(
          row[6] || 0
        ),

      workdays:
        Number(
          row[7] || 0
        ),

      overtimeDays:
        Number(
          row[8] || 0
        ),

      baseSalary:
        Number(
          row[9] || 0
        ),

      overtimeSalary:
        Number(
          row[10] || 0
        ),

      otherAdditions:
        Number(
          row[11] || 0
        ),

      otherDeductions:
        Number(
          row[12] || 0
        ),

      grossPay:
        Number(
          row[13] || 0
        ),

      status:
        String(
          row[14] || ""
        ).trim() ||
        "待結算",

      settledById:
        String(
          row[15] || ""
        ).trim(),

      settledByName:
        String(
          row[16] || ""
        ).trim(),

      settledAt:
        row[17] || "",

      note:
        String(
          row[18] || ""
        ).trim(),

      createdAt:
        row[19] || "",

      updatedAt:
        row[20] || ""

    });

  }


  payrolls.sort(
    function(a, b) {

      return a.employeeName >
        b.employeeName
          ? 1
          : -1;

    }
  );


  return jsonResponse_({

    success: true,

    payrolls:
      payrolls

  });

}



/*******************************************************
 * 正式確認薪資結算
 *
 * action: adminPayrollFinalize
 *
 * V1 允許輸入：
 * - otherAdditions
 * - otherDeductions
 * - note
 *
 * 正式結算後保留當時薪資單價與計算結果。
 *******************************************************/
function handleAdminPayrollFinalize_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertPayrollManager_(
    operator
  );


  var settlementId =
    data.settlementId
      ? String(
          data.settlementId
        ).trim()
      : "";


  if (
    settlementId === ""
  ) {

    throw new Error(
      "沒有收到薪資結算ID"
    );

  }


  var payroll =
    getPayrollSettlementById_(
      settlementId
    );


  if (!payroll) {

    throw new Error(
      "找不到指定的薪資結算資料"
    );

  }


  var otherAdditions =
    parseNonNegativeMoney_(
      data.otherAdditions,
      "其他加項"
    );


  var otherDeductions =
    parseNonNegativeMoney_(
      data.otherDeductions,
      "其他扣項"
    );


  var note =
    data.note
      ? String(
          data.note
        ).trim()
      : "";


  var grossPay =
    roundMoney_(
      payroll.baseSalary +
      payroll.overtimeSalary +
      otherAdditions -
      otherDeductions
    );


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "薪資結算"
    );


  var correctionSheet =
    ss.getSheetByName(
      "薪資修正紀錄"
    );


  if (!sheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  var now =
    new Date();


  if (
    payroll.status ===
    "退回修正"
  ) {

    if (!correctionSheet) {

      throw new Error(
        "找不到「薪資修正紀錄」"
      );

    }


    correctionSheet.appendRow([

      createId_(
        "PAYFIX"
      ),                         // A 修正ID

      payroll.settlementId,      // B 結算ID
      payroll.month,             // C 結算月份
      payroll.employeeId,        // D 員工ID
      payroll.employeeName,      // E 姓名
      "重新結算",                // F 修正類型
      "退回修正",                // G 修正前狀態
      "已結算",                  // H 修正後狀態
      payroll.otherAdditions,    // I 修正前其他加項
      otherAdditions,            // J 修正後其他加項
      payroll.otherDeductions,   // K 修正前其他扣項
      otherDeductions,           // L 修正後其他扣項
      payroll.grossPay,          // M 修正前應發薪資
      grossPay,                  // N 修正後應發薪資
      "重新完成薪資結算",        // O 修正原因
      operator.employeeId,       // P 操作人ID
      operator.name,             // Q 操作人姓名
      now,                       // R 操作時間
      note                       // S 備註

    ]);

  }


  sheet
    .getRange(
      payroll.row,
      12
    )
    .setValue(
      otherAdditions
    );


  sheet
    .getRange(
      payroll.row,
      13
    )
    .setValue(
      otherDeductions
    );


  sheet
    .getRange(
      payroll.row,
      14
    )
    .setValue(
      grossPay
    );


  sheet
    .getRange(
      payroll.row,
      15
    )
    .setValue(
      "已結算"
    );


  sheet
    .getRange(
      payroll.row,
      16
    )
    .setValue(
      operator.employeeId
    );


  sheet
    .getRange(
      payroll.row,
      17
    )
    .setValue(
      operator.name
    );


  sheet
    .getRange(
      payroll.row,
      18
    )
    .setValue(
      now
    );


  sheet
    .getRange(
      payroll.row,
      19
    )
    .setValue(
      note
    );


  sheet
    .getRange(
      payroll.row,
      21
    )
    .setValue(
      now
    );


  return jsonResponse_({

    success: true,

    message:
      "薪資已正式結算",

    settlementId:
      settlementId,

    grossPay:
      grossPay

  });

}




/*******************************************************
 * 薪資退回修正
 *
 * action: adminPayrollReturnForCorrection
 *
 * 規則：
 * 1. 只有 OWNER / ADMIN 可操作
 * 2. 只能將「已結算」薪資退回為「退回修正」
 * 3. 修正原因必填
 * 4. 不刪除原薪資資料
 * 5. 先寫入「薪資修正紀錄」留痕
 * 6. 退回後可重新彙總、調整加扣項、再正式結算
 *******************************************************/
function handleAdminPayrollReturnForCorrection_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertPayrollManager_(
    operator
  );


  var settlementId =
    data.settlementId
      ? String(
          data.settlementId
        ).trim()
      : "";


  var reason =
    data.reason
      ? String(
          data.reason
        ).trim()
      : "";


  if (
    settlementId === ""
  ) {

    throw new Error(
      "沒有收到薪資結算ID"
    );

  }


  if (
    reason === ""
  ) {

    throw new Error(
      "退回修正原因必填"
    );

  }


  var payroll =
    getPayrollSettlementById_(
      settlementId
    );


  if (!payroll) {

    throw new Error(
      "找不到指定的薪資結算資料"
    );

  }


  if (
    payroll.status !==
    "已結算"
  ) {

    throw new Error(
      "只有「已結算」的薪資可以退回修正"
    );

  }


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var payrollSheet =
    ss.getSheetByName(
      "薪資結算"
    );


  var correctionSheet =
    ss.getSheetByName(
      "薪資修正紀錄"
    );


  if (!payrollSheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  if (!correctionSheet) {

    throw new Error(
      "找不到「薪資修正紀錄」"
    );

  }


  var now =
    new Date();


  correctionSheet.appendRow([

    createId_(
      "PAYFIX"
    ),                         // A 修正ID

    payroll.settlementId,      // B 結算ID
    payroll.month,             // C 結算月份
    payroll.employeeId,        // D 員工ID
    payroll.employeeName,      // E 姓名
    "退回修正",                // F 修正類型
    payroll.status,            // G 修正前狀態
    "退回修正",                // H 修正後狀態
    payroll.otherAdditions,    // I 修正前其他加項
    payroll.otherAdditions,    // J 修正後其他加項
    payroll.otherDeductions,   // K 修正前其他扣項
    payroll.otherDeductions,   // L 修正後其他扣項
    payroll.grossPay,          // M 修正前應發薪資
    payroll.grossPay,          // N 修正後應發薪資
    reason,                    // O 修正原因
    operator.employeeId,       // P 操作人ID
    operator.name,             // Q 操作人姓名
    now,                       // R 操作時間
    ""                         // S 備註

  ]);


  payrollSheet
    .getRange(
      payroll.row,
      15
    )
    .setValue(
      "退回修正"
    );


  payrollSheet
    .getRange(
      payroll.row,
      19
    )
    .setValue(
      appendAuditNote_(
        payroll.note,
        "[退回修正] " +
        reason
      )
    );


  payrollSheet
    .getRange(
      payroll.row,
      21
    )
    .setValue(
      now
    );


  return jsonResponse_({

    success: true,

    message:
      "薪資已退回修正",

    settlementId:
      settlementId

  });

}



/*******************************************************
 * 將新的稽核文字附加到原備註
 *******************************************************/
function appendAuditNote_(
  original,
  newText
) {

  var oldText =
    original
      ? String(
          original
        ).trim()
      : "";


  var addText =
    newText
      ? String(
          newText
        ).trim()
      : "";


  if (
    oldText === ""
  ) {

    return addText;

  }


  if (
    addText === ""
  ) {

    return oldText;

  }


  return (
    oldText +
    "\n" +
    addText
  );

}


/*******************************************************
 * 依「已日結」資料同步指定月份薪資
 *******************************************************/
function syncPayrollSettlement_(
  month
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var dailySheet =
    ss.getSheetByName(
      "出勤日結"
    );


  var payrollSheet =
    ss.getSheetByName(
      "薪資結算"
    );


  if (!dailySheet) {

    throw new Error(
      "找不到「出勤日結」"
    );

  }


  if (!payrollSheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  var groups = {};


  var lastDailyRow =
    dailySheet.getLastRow();


  if (
    lastDailyRow >= 2
  ) {

    var values =
      dailySheet
        .getRange(
          2,
          1,
          lastDailyRow - 1,
          20
        )
        .getValues();


    for (
      var i = 0;
      i < values.length;
      i++
    ) {

      var row =
        values[i];


      if (!row[1]) {

        continue;

      }


      var rowDate =
        new Date(
          row[1]
        );


      var rowMonth =
        Utilities.formatDate(
          rowDate,
          Session.getScriptTimeZone(),
          "yyyy/MM"
        );


      if (
        rowMonth !== month
      ) {

        continue;

      }


      var dailyStatus =
        String(
          row[13] || ""
        ).trim();


      if (
        dailyStatus !==
        "已日結"
      ) {

        continue;

      }


      var employeeId =
        String(
          row[2] || ""
        ).trim();


      if (
        employeeId === ""
      ) {

        continue;

      }


      if (!groups[employeeId]) {

        groups[employeeId] = {

          employeeId:
            employeeId,

          employeeName:
            String(
              row[3] || ""
            ).trim(),

          workdays:
            0,

          overtimeDays:
            0

        };

      }


      groups[employeeId].workdays +=
        Number(
          row[9] || 0
        );


      groups[employeeId].overtimeDays +=
        Number(
          row[10] || 0
        );

    }

  }


  var existing =
    getPayrollSettlementIndex_();


  var created = 0;
  var updated = 0;
  var unchanged = 0;
  var locked = 0;
  var now = new Date();


  Object.keys(
    groups
  )
  .forEach(
    function(employeeId) {

      var group =
        groups[employeeId];


      var employee =
        getEmployeeByEmployeeId_(
          employeeId
        );


      if (!employee) {

        throw new Error(
          "找不到員工資料：" +
          employeeId
        );

      }


      var salaryType =
        String(
          employee.salaryType || ""
        ).trim();


      var salaryRate =
        Number(
          employee.salaryAmount || 0
        );


      if (
        salaryType !== "日薪" &&
        salaryType !== "月薪"
      ) {

        throw new Error(
          "員工 " +
          employee.name +
          " 的薪資制必須設定為「日薪」或「月薪」"
        );

      }


      if (
        !isFinite(
          salaryRate
        ) ||
        salaryRate < 0
      ) {

        throw new Error(
          "員工 " +
          employee.name +
          " 的薪資金額設定錯誤"
        );

      }


      var workdays =
        Math.round(
          group.workdays * 100
        ) / 100;


      var overtimeDays =
        Math.round(
          group.overtimeDays * 100
        ) / 100;


      var baseSalary =
        salaryType === "日薪"
          ? roundMoney_(
              workdays *
              salaryRate
            )
          : roundMoney_(
              salaryRate
            );


      // V1 暫時沿用公司目前「半日」概念。
      // 月薪員工正式加班計算規則後續獨立設定，
      // 此處先保留可測試的薪資主幹。
      var overtimeSalary =
        roundMoney_(
          overtimeDays *
          salaryRate
        );


      var key =
        month +
        "|" +
        employeeId;


      var current =
        existing[key];


      if (!current) {

        var grossPay =
          roundMoney_(
            baseSalary +
            overtimeSalary
          );


        payrollSheet.appendRow([

          createId_(
            "PAY"
          ),                       // A 結算ID

          month,                   // B 結算月份
          employeeId,              // C 員工ID
          employee.name,           // D 姓名
          employee.grade,          // E 級職
          salaryType,              // F 薪資制
          salaryRate,              // G 薪資單價
          workdays,                // H 出工日數
          overtimeDays,            // I 加班日數
          baseSalary,              // J 基本薪資
          overtimeSalary,          // K 加班薪資
          0,                       // L 其他加項
          0,                       // M 其他扣項
          grossPay,                // N 應發薪資
          "待結算",                // O 結算狀態
          "",                      // P 結算人ID
          "",                      // Q 結算人姓名
          "",                      // R 結算時間
          "",                      // S 結算備註
          now,                     // T 建立時間
          now                      // U 最後修改時間

        ]);


        created++;

        return;

      }


      // 正式結算後，不允許重新彙總靜默改寫歷史薪資。
      if (
        current.status ===
        "已結算"
      ) {

        locked++;

        return;

      }


      var otherAdditions =
        Number(
          current.otherAdditions || 0
        );


      var otherDeductions =
        Number(
          current.otherDeductions || 0
        );


      var grossPay =
        roundMoney_(
          baseSalary +
          overtimeSalary +
          otherAdditions -
          otherDeductions
        );


      var changed =
        current.employeeName !==
          employee.name ||
        current.grade !==
          employee.grade ||
        current.salaryType !==
          salaryType ||
        Number(
          current.salaryRate
        ) !== salaryRate ||
        Number(
          current.workdays
        ) !== workdays ||
        Number(
          current.overtimeDays
        ) !== overtimeDays ||
        Number(
          current.baseSalary
        ) !== baseSalary ||
        Number(
          current.overtimeSalary
        ) !== overtimeSalary ||
        Number(
          current.grossPay
        ) !== grossPay;


      if (!changed) {

        unchanged++;

        return;

      }


      payrollSheet
        .getRange(
          current.row,
          4,
          1,
          8
        )
        .setValues([[
          employee.name,
          employee.grade,
          salaryType,
          salaryRate,
          workdays,
          overtimeDays,
          baseSalary,
          overtimeSalary
        ]]);


      payrollSheet
        .getRange(
          current.row,
          14
        )
        .setValue(
          grossPay
        );


      payrollSheet
        .getRange(
          current.row,
          21
        )
        .setValue(
          now
        );


      updated++;

    }
  );


  return {

    created:
      created,

    updated:
      updated,

    unchanged:
      unchanged,

    locked:
      locked,

    total:
      created +
      updated +
      unchanged +
      locked

  };

}



/*******************************************************
 * 建立薪資結算索引
 * key = yyyy/MM|employeeId
 *******************************************************/
function getPayrollSettlementIndex_() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "薪資結算"
    );


  if (!sheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  var index = {};


  if (
    lastRow < 2
  ) {

    return index;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      !row[1] ||
      !row[2]
    ) {

      continue;

    }


    var month =
      normalizeStoredMonth_(
        row[1]
      );


    var key =
      month +
      "|" +
      String(
        row[2]
      ).trim();


    index[key] = {

      row:
        i + 2,

      settlementId:
        String(
          row[0] || ""
        ).trim(),

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      grade:
        String(
          row[4] || ""
        ).trim(),

      salaryType:
        String(
          row[5] || ""
        ).trim(),

      salaryRate:
        Number(
          row[6] || 0
        ),

      workdays:
        Number(
          row[7] || 0
        ),

      overtimeDays:
        Number(
          row[8] || 0
        ),

      baseSalary:
        Number(
          row[9] || 0
        ),

      overtimeSalary:
        Number(
          row[10] || 0
        ),

      otherAdditions:
        Number(
          row[11] || 0
        ),

      otherDeductions:
        Number(
          row[12] || 0
        ),

      grossPay:
        Number(
          row[13] || 0
        ),

      status:
        String(
          row[14] || ""
        ).trim(),

      note:
        String(
          row[18] || ""
        ).trim()

    };

  }


  return index;

}



/*******************************************************
 * 用結算ID取得薪資資料
 *******************************************************/
function getPayrollSettlementById_(
  settlementId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "薪資結算"
    );


  if (!sheet) {

    throw new Error(
      "找不到「薪資結算」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return null;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        21
      )
      .getValues();


  var target =
    String(
      settlementId
    ).trim();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      String(
        row[0] || ""
      ).trim() === target
    ) {

      return {

        row:
          i + 2,

        settlementId:
          target,

        month:
          normalizeStoredMonth_(
            row[1]
          ),

        employeeId:
          String(
            row[2] || ""
          ).trim(),

        employeeName:
          String(
            row[3] || ""
          ).trim(),

        salaryType:
          String(
            row[5] || ""
          ).trim(),

        salaryRate:
          Number(
            row[6] || 0
          ),

        workdays:
          Number(
            row[7] || 0
          ),

        overtimeDays:
          Number(
            row[8] || 0
          ),

        baseSalary:
          Number(
            row[9] || 0
          ),

        overtimeSalary:
          Number(
            row[10] || 0
          ),

        otherAdditions:
          Number(
            row[11] || 0
          ),

        otherDeductions:
          Number(
            row[12] || 0
          ),

        grossPay:
          Number(
            row[13] || 0
          ),

        status:
          String(
            row[14] || ""
          ).trim(),

        note:
          String(
            row[18] || ""
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 正規化月份輸入 -> yyyy/MM
 *******************************************************/
function normalizeMonthInput_(
  value
) {

  var text =
    value !== undefined &&
    value !== null
      ? String(
          value
        ).trim()
      : "";


  var match =
    text.match(
      /^(\d{4})[-\/](\d{1,2})$/
    );


  if (!match) {

    throw new Error(
      "月份格式錯誤，請使用 yyyy-MM"
    );

  }


  var year =
    Number(
      match[1]
    );


  var month =
    Number(
      match[2]
    );


  if (
    month < 1 ||
    month > 12
  ) {

    throw new Error(
      "月份不存在"
    );

  }


  return (
    String(year) +
    "/" +
    String(month)
      .padStart(
        2,
        "0"
      )
  );

}



/*******************************************************
 * 正規化儲存中的月份
 *******************************************************/
function normalizeStoredMonth_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy/MM"
    );

  }


  var text =
    value !== undefined &&
    value !== null
      ? String(
          value
        ).trim()
      : "";


  if (
    text === ""
  ) {

    return "";

  }


  var match =
    text.match(
      /^(\d{4})[-\/](\d{1,2})/
    );


  if (!match) {

    return text;

  }


  return (
    match[1] +
    "/" +
    String(
      Number(
        match[2]
      )
    )
    .padStart(
      2,
      "0"
    )
  );

}



/*******************************************************
 * 金額輸入：不得為負數
 *******************************************************/
function parseNonNegativeMoney_(
  value,
  fieldName
) {

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {

    return 0;

  }


  var number =
    Number(
      value
    );


  if (
    !isFinite(
      number
    ) ||
    number < 0
  ) {

    throw new Error(
      fieldName +
      "必須是 0 以上的數字"
    );

  }


  return roundMoney_(
    number
  );

}



/*******************************************************
 * 金額四捨五入至整數元
 *******************************************************/
function roundMoney_(
  value
) {

  return Math.round(
    Number(
      value || 0
    )
  );

}



/*******************************************************
 * 每日回報 V1
 *
 * 「每日回報」欄位：
 * A 回報ID
 * B 日期
 * C 員工ID
 * D 姓名
 * E 級職
 * F 工地ID
 * G 工地名稱
 * H 工作領班ID
 * I 工作領班姓名
 * J 工作區域
 * K 樓層
 * L 戶別
 * M 工程類別
 * N 工作項目
 * O 今日完成內容
 * P 今日完成數量
 * Q 單位
 * R 進度百分比
 * S 異常／問題
 * T 明日預定工作
 * U 是否需協助
 * V 協助內容
 * W 回報時間
 * X 回報狀態
 * Y 審核人ID
 * Z 審核人姓名
 * AA 審核時間
 * AB 審核備註
 * AC 建立時間
 * AD 最後修改時間
 *
 * V1：
 * - 員工可送出每日回報
 * - 一天可有多筆、可跨工地
 * - 工地領班由「工地資料表」主要領班自動帶入
 * - 初始狀態固定「已提交」
 * - 可讀取自己的回報紀錄
 * - 審核流程下一版再接 SITE_MANAGER / ADMIN
 *******************************************************/



/*******************************************************
 * 一次提交多個工作項目
 *
 * action: dailyReportCreateBatch
 *
 * 共用欄位：
 * - date
 * - siteId
 * - workArea
 * - floor
 * - unit
 * - tomorrowPlan
 *
 * items[] 每筆：
 * - category
 * - workItem
 * - completedContent
 * - quantity
 * - quantityUnit
 * - progress
 * - issue
 * - needHelp
 * - helpContent
 *
 * 每個工作項目仍各寫一列「每日回報」，
 * 方便後續工地日報、進度、照片與統計。
 *******************************************************/
function handleDailyReportCreateBatch_(
  data
) {

  var employee = getOperatorEmployee_(data.userId);
  var siteId = safeText_(data.siteId);

  if (siteId === "") {
    throw new Error("請選擇工地");
  }

  var site = getSiteById_(siteId);
  if (!site) {
    throw new Error("找不到指定工地");
  }
  if (String(site.status || "").trim() !== "施工中") {
    throw new Error("此工地目前不是施工中狀態");
  }

  var reportDate = normalizeReportDate_(data.date);
  var tomorrowPlan = safeText_(data.tomorrowPlan);
  var items = Array.isArray(data.items) ? data.items : [];

  if (items.length === 0) {
    throw new Error("請至少新增一個工作項目");
  }
  if (items.length > 20) {
    throw new Error("一次最多提交20個工作項目");
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("每日回報");
  if (!sheet) {
    throw new Error("找不到「每日回報」");
  }
  ensureDailyReportProgressColumns_(sheet);

  var now = new Date();
  var rows = [];
  var reportIds = [];

  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};

    // V1.2：位置與工項改為每一個工作項目獨立。
    // 保留 data.locationId / 共用自由文字 fallback，兼容尚未更新的舊前端。
    var locationId = safeText_(item.locationId || data.locationId);
    var itemCode = safeText_(item.itemCode);
    var linkProgress = String(item.linkProgress || "否").trim() === "是" ? "是" : "否";

    var location = null;
    if (locationId !== "") {
      location = validateDailyReportProgressLocation_(siteId, locationId);
    }

    var progressItem = null;
    if (itemCode !== "") {
      progressItem = validateDailyReportProgressItem_(itemCode);
    }

    if (linkProgress === "是" && (!location || !progressItem)) {
      throw new Error(
        "第" + (i + 1) +
        "個工作項目要連動工程進度時，必須選擇標準工程位置與標準工程項目"
      );
    }

    var workArea = location ? location.zone : safeText_(item.workArea || data.workArea);
    var floor = location ? location.floor : safeText_(item.floor || data.floor);
    var unit = location ? location.unit : safeText_(item.unit || data.unit);
    var category = progressItem ? progressItem.category : safeText_(item.category);
    var workItem = progressItem ? progressItem.workItem : safeText_(item.workItem);
    var completedContent = safeText_(item.completedContent);
    var quantity = parseOptionalNonNegativeNumber_(item.quantity, "第" + (i + 1) + "項的今日完成數量");
    var quantityUnit = progressItem ? (progressItem.unit || safeText_(item.quantityUnit)) : safeText_(item.quantityUnit);
    var progress = parseProgressPercent_(item.progress);
    var issue = safeText_(item.issue);
    var needHelp = String(item.needHelp || "否").trim();
    var helpContent = safeText_(item.helpContent);

    if (category === "") throw new Error("第" + (i + 1) + "個工作項目的「工程類別」必填");
    if (workItem === "") throw new Error("第" + (i + 1) + "個工作項目的「工作項目」必填");
    if (completedContent === "") throw new Error("第" + (i + 1) + "個工作項目的「今日完成內容」必填");
    if (needHelp !== "是" && needHelp !== "否") throw new Error("第" + (i + 1) + "個工作項目的「是否需協助」格式錯誤");
    if (needHelp === "是" && helpContent === "") throw new Error("第" + (i + 1) + "個工作項目需要協助，請填寫協助內容");

    var reportId = createId_("RPT");
    reportIds.push(reportId);

    var syncStatus = "";
    var syncNote = "";
    if (linkProgress === "是") {
      syncStatus = "待同步";
      syncNote = "等待每日回報確認";
    } else {
      syncStatus = "僅工作紀錄";
      syncNote = "此工作項目未選擇連動工程進度";
    }

    rows.push([
      reportId, reportDate, employee.employeeId, employee.name, employee.grade,
      site.siteId, site.name, site.foremanId || "", site.foremanName || "",
      workArea, floor, unit, category, workItem, completedContent,
      quantity, quantityUnit, progress, issue, tomorrowPlan, needHelp, helpContent,
      now, "已提交", "", "", "", "", now, now,
      locationId, itemCode, syncStatus, "", "", syncNote, linkProgress
    ]);
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 37).setValues(rows);

  return jsonResponse_({
    success: true,
    message: "每日回報已提交，共 " + rows.length + " 個工作項目",
    count: rows.length,
    reportIds: reportIds
  });
}

/*******************************************************
 * 新增每日回報
 *
 * action: dailyReportCreate
 *******************************************************/
function handleDailyReportCreate_(
  data
) {

  var employee =
    getOperatorEmployee_(
      data.userId
    );


  var siteId =
    data.siteId
      ? String(
          data.siteId
        ).trim()
      : "";


  if (
    siteId === ""
  ) {

    throw new Error(
      "請選擇工地"
    );

  }


  var site =
    getSiteById_(
      siteId
    );


  if (!site) {

    throw new Error(
      "找不到指定工地"
    );

  }


  if (
    String(
      site.status || ""
    ).trim() !== "施工中"
  ) {

    throw new Error(
      "此工地目前不是施工中狀態"
    );

  }


  var reportDate =
    normalizeReportDate_(
      data.date
    );


  var workArea =
    safeText_(
      data.workArea
    );


  var floor =
    safeText_(
      data.floor
    );


  var unit =
    safeText_(
      data.unit
    );


  var category =
    safeText_(
      data.category
    );


  var workItem =
    safeText_(
      data.workItem
    );


  var completedContent =
    safeText_(
      data.completedContent
    );


  var quantity =
    parseOptionalNonNegativeNumber_(
      data.quantity,
      "今日完成數量"
    );


  var quantityUnit =
    safeText_(
      data.quantityUnit
    );


  var progress =
    parseProgressPercent_(
      data.progress
    );


  var issue =
    safeText_(
      data.issue
    );


  var tomorrowPlan =
    safeText_(
      data.tomorrowPlan
    );


  var needHelp =
    String(
      data.needHelp || "否"
    ).trim();


  if (
    needHelp !== "是" &&
    needHelp !== "否"
  ) {

    throw new Error(
      "是否需協助格式錯誤"
    );

  }


  var helpContent =
    safeText_(
      data.helpContent
    );


  if (
    completedContent === ""
  ) {

    throw new Error(
      "「今日完成內容」必填"
    );

  }


  if (
    category === ""
  ) {

    throw new Error(
      "「工程類別」必填"
    );

  }


  if (
    workItem === ""
  ) {

    throw new Error(
      "「工作項目」必填"
    );

  }


  if (
    needHelp === "是" &&
    helpContent === ""
  ) {

    throw new Error(
      "勾選需要協助時，請填寫協助內容"
    );

  }


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "每日回報"
    );


  if (!sheet) {

    throw new Error(
      "找不到「每日回報」"
    );

  }


  var now =
    new Date();


  var reportId =
    createId_(
      "RPT"
    );


  sheet.appendRow([

    reportId,                    // A 回報ID
    reportDate,                  // B 日期
    employee.employeeId,         // C 員工ID
    employee.name,               // D 姓名
    employee.grade,              // E 級職
    site.siteId,                 // F 工地ID
    site.name,                   // G 工地名稱
    site.foremanId || "",        // H 工作領班ID
    site.foremanName || "",      // I 工作領班姓名
    workArea,                    // J 工作區域
    floor,                       // K 樓層
    unit,                        // L 戶別
    category,                    // M 工程類別
    workItem,                    // N 工作項目
    completedContent,            // O 今日完成內容
    quantity,                    // P 今日完成數量
    quantityUnit,                // Q 單位
    progress,                    // R 進度百分比
    issue,                       // S 異常／問題
    tomorrowPlan,                // T 明日預定工作
    needHelp,                    // U 是否需協助
    helpContent,                 // V 協助內容
    now,                         // W 回報時間
    "已提交",                    // X 回報狀態
    "",                          // Y 審核人ID
    "",                          // Z 審核人姓名
    "",                          // AA 審核時間
    "",                          // AB 審核備註
    now,                         // AC 建立時間
    now                          // AD 最後修改時間

  ]);


  return jsonResponse_({

    success: true,

    message:
      "每日回報已提交",

    reportId:
      reportId

  });

}



/*******************************************************
 * 讀取自己的每日回報
 *
 * action: dailyReportListOwn
 * 可用 date 篩選 yyyy-MM-dd
 *******************************************************/
function handleDailyReportListOwn_(
  data
) {

  var employee =
    getOperatorEmployee_(
      data.userId
    );


  var targetDate =
    data.date
      ? normalizeReportDateText_(
          data.date
        )
      : "";


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "每日回報"
    );


  if (!sheet) {

    throw new Error(
      "找不到「每日回報」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return jsonResponse_({

      success: true,

      reports: []

    });

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        37
      )
      .getValues();


  var reports = [];


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    var employeeId =
      String(
        row[2] || ""
      ).trim();


    if (
      employeeId !==
      employee.employeeId
    ) {

      continue;

    }


    var dateText =
      formatReportDate_(
        row[1]
      );


    if (
      targetDate !== "" &&
      dateText !== targetDate
    ) {

      continue;

    }


    reports.push({

      reportId:
        String(
          row[0] || ""
        ).trim(),

      date:
        dateText,

      employeeId:
        employeeId,

      employeeName:
        String(
          row[3] || ""
        ).trim(),

      grade:
        String(
          row[4] || ""
        ).trim(),

      siteId:
        String(
          row[5] || ""
        ).trim(),

      siteName:
        String(
          row[6] || ""
        ).trim(),

      foremanId:
        String(
          row[7] || ""
        ).trim(),

      foremanName:
        String(
          row[8] || ""
        ).trim(),

      workArea:
        String(
          row[9] || ""
        ).trim(),

      floor:
        String(
          row[10] || ""
        ).trim(),

      unit:
        String(
          row[11] || ""
        ).trim(),

      category:
        String(
          row[12] || ""
        ).trim(),

      workItem:
        String(
          row[13] || ""
        ).trim(),

      completedContent:
        String(
          row[14] || ""
        ).trim(),

      quantity:
        row[15] === ""
          ? ""
          : Number(
              row[15]
            ),

      quantityUnit:
        String(
          row[16] || ""
        ).trim(),

      progress:
        row[17] === ""
          ? ""
          : Number(
              row[17]
            ),

      issue:
        String(
          row[18] || ""
        ).trim(),

      tomorrowPlan:
        String(
          row[19] || ""
        ).trim(),

      needHelp:
        String(
          row[20] || ""
        ).trim(),

      helpContent:
        String(
          row[21] || ""
        ).trim(),

      reportedAt:
        formatDateTimeText_(
          row[22]
        ),

      status:
        String(
          row[23] || ""
        ).trim(),

      reviewerName:
        String(
          row[25] || ""
        ).trim(),

      reviewedAt:
        formatDateTimeText_(
          row[26]
        ),

      reviewNote:
        String(
          row[27] || ""
        ).trim(),

      locationId:
        String(row[30] || "").trim(),

      itemCode:
        String(row[31] || "").trim(),

      progressSyncStatus:
        String(row[32] || "").trim(),

      progressSyncedAt:
        formatDateTimeText_(row[33]),

      linkedProgressId:
        String(row[34] || "").trim(),

      progressSyncNote:
        String(row[35] || "").trim()

    });

  }


  reports.sort(
    function(a, b) {

      if (
        a.reportedAt ===
        b.reportedAt
      ) {

        return 0;

      }

      return a.reportedAt <
        b.reportedAt
          ? 1
          : -1;

    }
  );


  return jsonResponse_({

    success: true,

    reports:
      reports

  });

}





/*******************************************************
 * 員工修改被退回的每日回報並重新提交
 *
 * action: dailyReportUpdateReturned
 *
 * 規則：
 * 1. 只能修改自己的回報
 * 2. 只有「退回修正」狀態可以修改
 * 3. 日期、員工、工地不允許由前端任意變更
 * 4. 修改完成後狀態回到「已提交」
 * 5. 清空主表目前審核人/審核時間，但保留審核歷史在
 *    「每日回報審核紀錄」
 * 6. 重新提交也寫一筆審核紀錄，留下退回→已提交的軌跡
 *******************************************************/
function handleDailyReportUpdateReturned_(
  data
) {

  var employee =
    getOperatorEmployee_(data.userId);

  var reportId =
    safeText_(data.reportId);

  if (reportId === "") {
    throw new Error("沒有收到回報ID");
  }

  var report =
    getDailyReportById_(reportId);

  if (!report) {
    throw new Error("找不到指定的每日回報");
  }

  if (
    report.employeeId !==
    employee.employeeId
  ) {
    throw new Error("只能修改自己的每日回報");
  }

  if (report.status !== "退回修正") {
    throw new Error(
      "只有「退回修正」的每日回報可以重新編輯"
    );
  }

  var locationId =
    data.locationId === undefined
      ? (report.locationId || "")
      : safeText_(data.locationId);

  var itemCode =
    data.itemCode === undefined
      ? (report.itemCode || "")
      : safeText_(data.itemCode);

  if (
    (locationId === "") !==
    (itemCode === "")
  ) {
    throw new Error(
      "工程位置與工程項目必須同時選擇"
    );
  }

  var location = null;
  var progressItem = null;

  if (locationId !== "") {
    location =
      validateDailyReportProgressLocation_(
        report.siteId,
        locationId
      );

    progressItem =
      validateDailyReportProgressItem_(
        itemCode
      );
  }

  var workArea =
    location
      ? location.zone
      : safeText_(data.workArea);

  var floor =
    location
      ? location.floor
      : safeText_(data.floor);

  var unit =
    location
      ? location.unit
      : safeText_(data.unit);

  var category =
    progressItem
      ? progressItem.category
      : safeText_(data.category);

  var workItem =
    progressItem
      ? progressItem.workItem
      : safeText_(data.workItem);

  var completedContent =
    safeText_(data.completedContent);

  var quantity =
    parseOptionalNonNegativeNumber_(
      data.quantity,
      "今日完成數量"
    );

  var quantityUnit =
    progressItem
      ? (progressItem.unit || safeText_(data.quantityUnit))
      : safeText_(data.quantityUnit);

  var progress =
    parseProgressPercent_(data.progress);

  var issue = safeText_(data.issue);
  var tomorrowPlan = safeText_(data.tomorrowPlan);
  var needHelp = String(data.needHelp || "否").trim();
  var helpContent = safeText_(data.helpContent);

  if (category === "") {
    throw new Error("「工程類別」必填");
  }

  if (workItem === "") {
    throw new Error("「工作項目」必填");
  }

  if (completedContent === "") {
    throw new Error("「今日完成內容」必填");
  }

  if (
    needHelp !== "是" &&
    needHelp !== "否"
  ) {
    throw new Error("是否需協助格式錯誤");
  }

  if (
    needHelp === "是" &&
    helpContent === ""
  ) {
    throw new Error("需要協助時，請填寫協助內容");
  }

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var reportSheet =
    ss.getSheetByName("每日回報");

  var auditSheet =
    ss.getSheetByName("每日回報審核紀錄");

  if (!reportSheet) {
    throw new Error("找不到「每日回報」");
  }

  if (!auditSheet) {
    throw new Error("找不到「每日回報審核紀錄」");
  }

  ensureDailyReportProgressColumns_(reportSheet);

  var now = new Date();

  auditSheet.appendRow([
    createId_("RPTREV"),
    report.reportId,
    report.dateValue,
    report.employeeId,
    report.employeeName,
    report.siteId,
    report.siteName,
    "重新提交",
    "退回修正",
    "已提交",
    report.reviewNote || "",
    employee.employeeId,
    employee.name,
    now,
    "員工依退回意見修改後重新提交"
  ]);

  reportSheet.getRange(report.row, 10).setValue(workArea);
  reportSheet.getRange(report.row, 11).setValue(floor);
  reportSheet.getRange(report.row, 12).setValue(unit);
  reportSheet.getRange(report.row, 13).setValue(category);
  reportSheet.getRange(report.row, 14).setValue(workItem);
  reportSheet.getRange(report.row, 15).setValue(completedContent);
  reportSheet.getRange(report.row, 16).setValue(quantity);
  reportSheet.getRange(report.row, 17).setValue(quantityUnit);
  reportSheet.getRange(report.row, 18).setValue(progress);
  reportSheet.getRange(report.row, 19).setValue(issue);
  reportSheet.getRange(report.row, 20).setValue(tomorrowPlan);
  reportSheet.getRange(report.row, 21).setValue(needHelp);
  reportSheet.getRange(report.row, 22).setValue(helpContent);
  reportSheet.getRange(report.row, 23).setValue(now);
  reportSheet.getRange(report.row, 24).setValue("已提交");
  reportSheet.getRange(report.row, 25, 1, 3).clearContent();
  reportSheet.getRange(report.row, 30).setValue(now);
  reportSheet.getRange(report.row, 31).setValue(locationId);
  reportSheet.getRange(report.row, 32).setValue(itemCode);
  var linkProgress =
    String(data.linkProgress || "否").trim() === "是"
      ? "是"
      : "否";

  if (linkProgress === "是" && (!locationId || !itemCode)) {
    throw new Error("要連動工程進度時，必須選擇標準工程位置與標準工程項目");
  }

  reportSheet.getRange(report.row, 33).setValue(
    linkProgress === "是"
      ? "待同步"
      : "僅工作紀錄"
  );
  reportSheet.getRange(report.row, 34, 1, 2).clearContent();
  reportSheet.getRange(report.row, 36).setValue(
    linkProgress === "是"
      ? "等待每日回報確認"
      : "此工作項目未選擇連動工程進度"
  );
  reportSheet.getRange(report.row, 37).setValue(linkProgress);

  return jsonResponse_({
    success: true,
    message: "每日回報已重新提交，等待再次審核",
    reportId: reportId,
    status: "已提交"
  });

}


/*******************************************************
 * 每日回報審核 V1
 *
 * 權限：
 * OWNER / ADMIN：可審核全部工地
 * SITE_MANAGER：只能審核自己為主要負責人的工地
 *
 * 狀態：
 * 已提交 -> 已確認
 * 已提交 -> 退回修正（原因必填）
 *
 * 每次確認/退回，都寫入「每日回報審核紀錄」。
 *******************************************************/


/*******************************************************
 * 管理端讀取每日回報
 *
 * action: adminDailyReportReviewList
 * date: yyyy-MM-dd（必填）
 * siteId: 可空白，空白=權限範圍內全部工地
 *******************************************************/
function handleAdminDailyReportReviewList_(
  data
) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );


  assertDailyReportManager_(
    operator
  );


  var targetDate =
    normalizeReportDateText_(
      data.date
    );


  var targetSiteId =
    safeText_(
      data.siteId
    );


  if (
    targetSiteId !== ""
  ) {

    assertCanManageDailyReportSite_(
      operator,
      targetSiteId
    );

  }


  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "每日回報"
    );


  if (!sheet) {

    throw new Error(
      "找不到「每日回報」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return jsonResponse_({

      success: true,
      reports: []

    });

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        37
      )
      .getValues();


  var reports = [];


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    var dateText =
      formatReportDate_(
        row[1]
      );


    if (
      dateText !==
      targetDate
    ) {

      continue;

    }


    var siteId =
      String(
        row[5] || ""
      ).trim();


    if (
      targetSiteId !== "" &&
      siteId !== targetSiteId
    ) {

      continue;

    }


    if (
      !canManageSite_(
        operator,
        siteId
      )
    ) {

      continue;

    }


    reports.push(
      dailyReportRowToObject_(
        row
      )
    );

  }


  reports.sort(
    function(a, b) {

      if (
        a.siteName !==
        b.siteName
      ) {

        return a.siteName >
          b.siteName
            ? 1
            : -1;

      }


      if (
        a.employeeName !==
        b.employeeName
      ) {

        return a.employeeName >
          b.employeeName
            ? 1
            : -1;

      }


      return a.reportedAt >
        b.reportedAt
          ? 1
          : -1;

    }
  );


  return jsonResponse_({

    success: true,
    reports:
      reports

  });

}



/*******************************************************
 * 管理端確認 / 退回每日回報
 *
 * actionType:
 * CONFIRM = 已確認
 * RETURN  = 退回修正
 *******************************************************/
function handleAdminDailyReportReviewAction_(
  data
) {

  var operator =
    getOperatorEmployee_(data.userId);

  assertDailyReportManager_(operator);

  var reportId = safeText_(data.reportId);
  var actionType = safeText_(data.actionType).toUpperCase();
  var note = safeText_(data.note);

  if (reportId === "") {
    throw new Error("沒有收到回報ID");
  }

  if (
    actionType !== "CONFIRM" &&
    actionType !== "RETURN"
  ) {
    throw new Error("不支援的每日回報審核動作");
  }

  if (
    actionType === "RETURN" &&
    note === ""
  ) {
    throw new Error("退回修正時，審核備註必填");
  }

  var report =
    getDailyReportById_(reportId);

  if (!report) {
    throw new Error("找不到指定的每日回報");
  }

  assertCanManageDailyReportSite_(
    operator,
    report.siteId
  );

  if (report.status !== "已提交") {
    throw new Error(
      "這筆每日回報目前狀態為「" +
      report.status +
      "」，只有「已提交」可以進行審核"
    );
  }

  var newStatus =
    actionType === "CONFIRM"
      ? "已確認"
      : "退回修正";

  var reviewType =
    actionType === "CONFIRM"
      ? "確認"
      : "退回修正";

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var reportSheet =
    ss.getSheetByName("每日回報");

  var auditSheet =
    ss.getSheetByName("每日回報審核紀錄");

  if (!reportSheet) {
    throw new Error("找不到「每日回報」");
  }

  if (!auditSheet) {
    throw new Error("找不到「每日回報審核紀錄」");
  }

  ensureDailyReportProgressColumns_(reportSheet);

  var now = new Date();

  auditSheet.appendRow([
    createId_("RPTREV"),
    report.reportId,
    report.dateValue,
    report.employeeId,
    report.employeeName,
    report.siteId,
    report.siteName,
    reviewType,
    report.status,
    newStatus,
    note,
    operator.employeeId,
    operator.name,
    now,
    ""
  ]);

  reportSheet.getRange(report.row, 24).setValue(newStatus);
  reportSheet.getRange(report.row, 25).setValue(operator.employeeId);
  reportSheet.getRange(report.row, 26).setValue(operator.name);
  reportSheet.getRange(report.row, 27).setValue(now);
  reportSheet.getRange(report.row, 28).setValue(note);
  reportSheet.getRange(report.row, 30).setValue(now);

  var syncResult = null;

  if (actionType === "CONFIRM") {

    try {
      syncResult =
        syncConfirmedDailyReportToProgress_(
          reportId,
          operator
        );
    } catch (syncError) {

      reportSheet.getRange(report.row, 33).setValue("同步失敗");
      reportSheet.getRange(report.row, 34).setValue(new Date());
      reportSheet.getRange(report.row, 36).setValue(
        safeText_(syncError.message || syncError)
      );

      return jsonResponse_({
        success: true,
        message:
          "每日回報已確認，但工程進度同步失敗，請由管理者檢查",
        reportId: reportId,
        status: newStatus,
        progressSync: {
          success: false,
          status: "同步失敗",
          message: safeText_(syncError.message || syncError)
        }
      });
    }

  } else {

    if (
      report.locationId &&
      report.itemCode
    ) {
      reportSheet.getRange(report.row, 33).setValue("待同步");
      reportSheet.getRange(report.row, 34, 1, 2).clearContent();
      reportSheet.getRange(report.row, 36).setValue("等待每日回報重新確認");
    }
  }

  return jsonResponse_({
    success: true,
    message:
      actionType === "CONFIRM"
        ? (
            syncResult && syncResult.message
              ? "每日回報已確認；" + syncResult.message
              : "每日回報已確認"
          )
        : "每日回報已退回修正",
    reportId: reportId,
    status: newStatus,
    progressSync: syncResult
  });

}



/*******************************************************
 * 每日回報管理權限
 *******************************************************/
function assertDailyReportManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    )
    .trim()
    .toUpperCase();


  if (
    permission === "OWNER" ||
    permission === "ADMIN" ||
    permission === "SITE_MANAGER"
  ) {

    return true;

  }


  throw new Error(
    "你的系統權限不能審核每日回報"
  );

}


function assertCanManageDailyReportSite_(
  operator,
  siteId
) {

  if (
    !canManageSite_(
      operator,
      siteId
    )
  ) {

    throw new Error(
      "你沒有權限審核這個工地的每日回報"
    );

  }

}



/*******************************************************
 * 依回報ID找每日回報
 *******************************************************/
function getDailyReportById_(
  reportId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "每日回報"
    );


  if (!sheet) {

    throw new Error(
      "找不到「每日回報」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return null;

  }


  var values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        37
      )
      .getValues();


  var targetId =
    String(
      reportId
    ).trim();


  for (
    var i = 0;
    i < values.length;
    i++
  ) {

    var row =
      values[i];


    if (
      String(
        row[0] || ""
      ).trim() ===
      targetId
    ) {

      var result =
        dailyReportRowToObject_(
          row
        );


      result.row =
        i + 2;


      result.dateValue =
        row[1];


      return result;

    }

  }


  return null;

}



/*******************************************************
 * 每日回報列轉物件
 *******************************************************/
function dailyReportRowToObject_(
  row
) {

  return {
    reportId: String(row[0] || "").trim(),
    date: formatReportDate_(row[1]),
    employeeId: String(row[2] || "").trim(),
    employeeName: String(row[3] || "").trim(),
    grade: String(row[4] || "").trim(),
    siteId: String(row[5] || "").trim(),
    siteName: String(row[6] || "").trim(),
    foremanId: String(row[7] || "").trim(),
    foremanName: String(row[8] || "").trim(),
    workArea: String(row[9] || "").trim(),
    floor: String(row[10] || "").trim(),
    unit: String(row[11] || "").trim(),
    category: String(row[12] || "").trim(),
    workItem: String(row[13] || "").trim(),
    completedContent: String(row[14] || "").trim(),
    quantity:
      row[15] === ""
        ? ""
        : Number(row[15]),
    quantityUnit: String(row[16] || "").trim(),
    progress:
      row[17] === ""
        ? ""
        : Number(row[17]),
    issue: String(row[18] || "").trim(),
    tomorrowPlan: String(row[19] || "").trim(),
    needHelp: String(row[20] || "").trim(),
    helpContent: String(row[21] || "").trim(),
    reportedAt: formatDateTimeText_(row[22]),
    status: String(row[23] || "").trim(),
    reviewerId: String(row[24] || "").trim(),
    reviewerName: String(row[25] || "").trim(),
    reviewedAt: formatDateTimeText_(row[26]),
    reviewNote: String(row[27] || "").trim(),
    locationId: String(row[30] || "").trim(),
    itemCode: String(row[31] || "").trim(),
    progressSyncStatus: String(row[32] || "").trim(),
    progressSyncedAt: formatDateTimeText_(row[33]),
    linkedProgressId: String(row[34] || "").trim(),
    progressSyncNote: String(row[35] || "").trim(),
    linkProgress: String(row[36] || "否").trim() === "是" ? "是" : "否"
  };

}


/*******************************************************
 * 每日回報日期
 *******************************************************/
function normalizeReportDate_(
  value
) {

  var text =
    normalizeReportDateText_(
      value
    );


  var parts =
    text.split(
      "-"
    );


  return new Date(
    Number(
      parts[0]
    ),
    Number(
      parts[1]
    ) - 1,
    Number(
      parts[2]
    )
  );

}


function normalizeReportDateText_(
  value
) {

  var text =
    value
      ? String(
          value
        ).trim()
      : "";


  if (
    text === ""
  ) {

    return Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

  }


  var match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );


  if (!match) {

    throw new Error(
      "回報日期格式錯誤"
    );

  }


  var date =
    new Date(
      Number(
        match[1]
      ),
      Number(
        match[2]
      ) - 1,
      Number(
        match[3]
      )
    );


  if (
    isNaN(
      date.getTime()
    ) ||
    date.getFullYear() !==
      Number(
        match[1]
      ) ||
    date.getMonth() !==
      Number(
        match[2]
      ) - 1 ||
    date.getDate() !==
      Number(
        match[3]
      )
  ) {

    throw new Error(
      "回報日期不存在"
    );

  }


  return text;

}


function formatReportDate_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

  }


  var text =
    String(
      value || ""
    ).trim();


  if (
    text === ""
  ) {

    return "";

  }


  var date =
    new Date(
      text
    );


  if (
    !isNaN(
      date.getTime()
    )
  ) {

    return Utilities.formatDate(
      date,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd"
    );

  }


  return text;

}


function formatDateTimeText_(
  value
) {

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {

    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy/MM/dd HH:mm:ss"
    );

  }


  return String(
    value || ""
  ).trim();

}


function safeText_(
  value
) {

  return value === undefined ||
    value === null
      ? ""
      : String(
          value
        ).trim();

}


function parseOptionalNonNegativeNumber_(
  value,
  fieldName
) {

  if (
    value === undefined ||
    value === null ||
    String(
      value
    ).trim() === ""
  ) {

    return "";

  }


  var number =
    Number(
      value
    );


  if (
    !isFinite(
      number
    ) ||
    number < 0
  ) {

    throw new Error(
      fieldName +
      "必須是 0 以上的數字"
    );

  }


  return number;

}


function parseProgressPercent_(
  value
) {

  if (
    value === undefined ||
    value === null ||
    String(
      value
    ).trim() === ""
  ) {

    return "";

  }


  var number =
    Number(
      value
    );


  if (
    !isFinite(
      number
    ) ||
    number < 0 ||
    number > 100
  ) {

    throw new Error(
      "進度百分比必須介於 0～100"
    );

  }


  return number;

}


/*******************************************************
 * 寫入原始打卡紀錄
 *******************************************************/
function appendClockRecord_(info) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "打卡紀錄"
    );


  if (!sheet) {

    throw new Error(
      "找不到「打卡紀錄」"
    );

  }


  var recordId =
    createId_("CLK");


  var now =
    info.time;


  sheet.appendRow([

    recordId,                        // A 紀錄ID
    formatDate_(now),                // B 日期
    info.employee.employeeId,        // C 員工ID
    info.employee.lineUid,           // D LINE UID
    info.employee.name,              // E 姓名
    info.employee.grade,             // F 級職
    info.site.siteId,                // G 工地ID
    info.site.name,                  // H 工地名稱
    info.type,                       // I 打卡類型
    now,                             // J 打卡時間
    info.lat,                        // K GPS緯度
    info.lng,                        // L GPS經度
    info.distance,                   // M 距離工地
    info.gpsStatus,                  // N GPS狀態
    info.workContent,                // O 工作內容
    info.abnormalReason || "",       // P 異常原因
    new Date()                       // Q 建立時間

  ]);


  return recordId;

}



/*******************************************************
 * 用 LINE UID 尋找員工
 *
 * 員工資料表：
 * A 員工ID
 * B LINE UID
 * C 姓名
 * D 級職
 * E 薪資制
 * F 薪資金額
 * G 系統權限
 * H 到職日
 * I 離職日
 * J 狀態
 * K 電話
 * L 備註
 *******************************************************/
function getEmployeeByLineUid_(lineUid) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "員工資料表"
    );


  if (!sheet) {

    throw new Error(
      "找不到「員工資料表」"
    );

  }


  var data =
    sheet
      .getDataRange()
      .getValues();


  var targetUid =
    String(
      lineUid
    ).trim();


  for (
    var i = 1;
    i < data.length;
    i++
  ) {

    var sheetUid =
      String(
        data[i][1]
      ).trim();


    if (
      sheetUid === targetUid
    ) {

      return {

        row:
          i + 1,

        employeeId:
          String(
            data[i][0]
          ).trim(),

        lineUid:
          sheetUid,

        name:
          String(
            data[i][2]
          ).trim(),

        grade:
          String(
            data[i][3]
          ).trim(),

        salaryType:
          String(
            data[i][4]
          ).trim(),

        salaryAmount:
          data[i][5],

        permission:
          String(
            data[i][6]
          ).trim(),

        startDate:
          data[i][7],

        endDate:
          data[i][8],

        status:
          String(
            data[i][9]
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 取得施工中工地
 *******************************************************/
function getActiveSites_() {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工地資料表"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工地資料表」"
    );

  }


  var data =
    sheet
      .getDataRange()
      .getValues();


  var result = [];


  for (
    var i = 1;
    i < data.length;
    i++
  ) {

    var siteId =
      String(
        data[i][0]
      ).trim();


    var status =
      String(
        data[i][11]
      ).trim();


    if (
      siteId === ""
    ) {

      continue;

    }


    if (
      status !== "施工中"
    ) {

      continue;

    }


    var radius =
      Number(
        data[i][5]
      );


    if (
      !radius ||
      radius <= 0
    ) {

      radius =
        Number(
          getSetting_(
            "GPS_RADIUS",
            100
          )
        );

    }


    result.push({

      siteId:
        siteId,

      name:
        String(
          data[i][1]
        ).trim(),

      address:
        String(
          data[i][2]
        ).trim(),

      lat:
        data[i][3],

      lng:
        data[i][4],

      radius:
        radius,

      foremanId:
        String(
          data[i][6]
        ).trim(),

      foremanName:
        String(
          data[i][7]
        ).trim(),

      status:
        status

    });

  }


  return result;

}



/*******************************************************
 * 打卡時取得工地
 *
 * 新版：
 * data.siteId 有值 → 使用指定工地
 *
 * 舊版前端：
 * 沒有 siteId，而且只有 1 個施工中工地
 * → 自動使用唯一工地
 *******************************************************/
function getSiteForClock_(data) {

  var sites =
    getActiveSites_();


  if (
    sites.length === 0
  ) {

    throw new Error(
      "目前沒有施工中的工地"
    );

  }


  var siteId =
    data.siteId
      ? String(
          data.siteId
        ).trim()
      : "";


  // ==========================================
  // 新版前端有指定工地
  // ==========================================
  if (siteId !== "") {

    for (
      var i = 0;
      i < sites.length;
      i++
    ) {

      if (
        String(
          sites[i].siteId
        ).trim()
        ===
        siteId
      ) {

        return sites[i];

      }

    }


    throw new Error(
      "找不到指定的施工中工地"
    );

  }


  // ==========================================
  // 舊前端相容模式
  // ==========================================
  if (
    sites.length === 1
  ) {

    return sites[0];

  }


  throw new Error(
    "目前有多個施工中工地，請先選擇工地"
  );

}



/*******************************************************
 * 找員工目前尚未下班的工作區段
 *******************************************************/
function findOpenWorkSegment_(
  employeeId
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "工作區段"
    );


  if (!sheet) {

    throw new Error(
      "找不到「工作區段」"
    );

  }


  var lastRow =
    sheet.getLastRow();


  if (
    lastRow < 2
  ) {

    return null;

  }


  var data =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        26
      )
      .getValues();


  // 從最下面往上找
  for (
    var i =
      data.length - 1;
    i >= 0;
    i--
  ) {

    var rowEmployeeId =
      String(
        data[i][2]
      ).trim();


    var startTime =
      data[i][9];


    var endTime =
      data[i][10];


    if (
      rowEmployeeId ===
      String(
        employeeId
      ).trim()
      &&
      startTime
      &&
      !endTime
    ) {

      return {

        row:
          i + 2,

        segmentId:
          String(
            data[i][0]
          ).trim(),

        siteId:
          String(
            data[i][5]
          ).trim(),

        siteName:
          String(
            data[i][6]
          ).trim(),

        startTime:
          startTime,

        gpsStatus:
          String(
            data[i][17]
          ).trim()

      };

    }

  }


  return null;

}



/*******************************************************
 * 系統設定
 *
 * 系統設定表：
 * A 設定項目
 * B 設定值
 * C 說明
 *******************************************************/
function getSetting_(
  settingName,
  defaultValue
) {

  var ss =
    SpreadsheetApp
      .getActiveSpreadsheet();


  var sheet =
    ss.getSheetByName(
      "系統設定"
    );


  if (!sheet) {

    return defaultValue;

  }


  var data =
    sheet
      .getDataRange()
      .getValues();


  var target =
    String(
      settingName
    ).trim()
      .toUpperCase();


  for (
    var i = 1;
    i < data.length;
    i++
  ) {

    var key =
      String(
        data[i][0]
      ).trim()
        .toUpperCase();


    if (
      key === target
    ) {

      if (
        data[i][1] === "" ||
        data[i][1] === null
      ) {

        return defaultValue;

      }


      return data[i][1];

    }

  }


  return defaultValue;

}



/*******************************************************
 * 統一打卡類型
 *
 * 相容：
 * 上班
 * 下班
 * 上班打卡
 * 下班打卡
 * clockIn
 * clockOut
 *******************************************************/
function normalizeClockType_(type) {

  var value =
    String(
      type
    ).trim();


  var lower =
    value.toLowerCase();


  if (
    value === "上班" ||
    value === "上班打卡" ||
    lower === "clockin" ||
    lower === "in"
  ) {

    return "上班";

  }


  if (
    value === "下班" ||
    value === "下班打卡" ||
    lower === "clockout" ||
    lower === "out"
  ) {

    return "下班";

  }


  throw new Error(
    "打卡類型錯誤：" +
    value
  );

}



/*******************************************************
 * GPS 距離計算
 *
 * Haversine Formula
 * 回傳：公尺
 *******************************************************/
function calculateDistanceMeters_(
  lat1,
  lng1,
  lat2,
  lng2
) {

  var earthRadius =
    6371000;


  var dLat =
    degreesToRadians_(
      lat2 - lat1
    );


  var dLng =
    degreesToRadians_(
      lng2 - lng1
    );


  var a =
    Math.sin(
      dLat / 2
    ) *
    Math.sin(
      dLat / 2
    )
    +
    Math.cos(
      degreesToRadians_(
        lat1
      )
    ) *
    Math.cos(
      degreesToRadians_(
        lat2
      )
    ) *
    Math.sin(
      dLng / 2
    ) *
    Math.sin(
      dLng / 2
    );


  var c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );


  return (
    earthRadius * c
  );

}



/*******************************************************
 * 角度轉弧度
 *******************************************************/
function degreesToRadians_(
  degrees
) {

  return (
    degrees *
    Math.PI /
    180
  );

}



/*******************************************************
 * 建立編號
 *******************************************************/
function createId_(prefix) {

  var time =
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyyMMddHHmmss"
    );


  var random =
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ""
      )
      .substring(
        0,
        6
      )
      .toUpperCase();


  return (
    prefix +
    "-" +
    time +
    "-" +
    random
  );

}



/*******************************************************
 * 日期格式
 *******************************************************/
function formatDate_(date) {

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy/MM/dd"
  );

}



/*******************************************************
 * JSON 回覆
 *******************************************************/
function jsonResponse_(object) {

  return ContentService
    .createTextOutput(
      JSON.stringify(
        object
      )
    )
    .setMimeType(
      ContentService.MimeType.JSON
    );

}


/*******************************************************
 * 工地日報 V1
 *
 * 一筆 = 日期 × 工地
 * 資料來源：
 * - 出工人數：出勤審核（已確認，且出工認定不是不計出工）
 * - 回報內容：每日回報（已確認）
 *
 * 狀態：
 * - 待確認：可重新彙整
 * - 已確認：鎖定，不會被重新彙整直接覆蓋
 *******************************************************/

function assertSiteDailyReportManager_(operator) {

  var permission =
    String(operator.permission || "")
      .trim()
      .toUpperCase();

  if (
    permission === "OWNER" ||
    permission === "ADMIN" ||
    permission === "SITE_MANAGER"
  ) {
    return true;
  }

  throw new Error(
    "你的系統權限不能管理工地日報"
  );
}


function handleAdminSiteDailyReportRefresh_(data) {

  var operator =
    getOperatorEmployee_(data.userId);

  assertSiteDailyReportManager_(operator);

  var targetDate =
    normalizeReportDateText_(data.date);

  var targetSiteId =
    safeText_(data.siteId);

  if (targetSiteId !== "") {
    if (!getSiteById_(targetSiteId)) {
      throw new Error("找不到指定工地");
    }

    if (!canManageSite_(operator, targetSiteId)) {
      throw new Error("你沒有權限管理這個工地的工地日報");
    }
  }

  var ss =
    SpreadsheetApp.getActiveSpreadsheet();

  var siteDailySheet =
    ss.getSheetByName("工地日報");

  var dailyReportSheet =
    ss.getSheetByName("每日回報");

  var attendanceReviewSheet =
    ss.getSheetByName("出勤審核");

  if (!siteDailySheet) {
    throw new Error("找不到「工地日報」");
  }

  if (!dailyReportSheet) {
    throw new Error("找不到「每日回報」");
  }

  if (!attendanceReviewSheet) {
    throw new Error("找不到「出勤審核」");
  }

  var confirmedReportsBySite = {};
  var candidateSiteIds = {};

  var dailyLastRow =
    dailyReportSheet.getLastRow();

  if (dailyLastRow >= 2) {

    var dailyValues =
      dailyReportSheet
        .getRange(2, 1, dailyLastRow - 1, 30)
        .getValues();

    for (var i = 0; i < dailyValues.length; i++) {

      var row = dailyValues[i];
      var dateText = formatReportDate_(row[1]);

      if (dateText !== targetDate) {
        continue;
      }

      var rowSiteId =
        String(row[5] || "").trim();

      if (
        rowSiteId === "" ||
        (targetSiteId !== "" && rowSiteId !== targetSiteId) ||
        !canManageSite_(operator, rowSiteId)
      ) {
        continue;
      }

      candidateSiteIds[rowSiteId] = true;

      var status =
        String(row[23] || "").trim();

      if (status !== "已確認") {
        continue;
      }

      if (!confirmedReportsBySite[rowSiteId]) {
        confirmedReportsBySite[rowSiteId] = [];
      }

      confirmedReportsBySite[rowSiteId].push(row);
    }
  }

  var attendanceBySite = {};
  var attendanceLastRow =
    attendanceReviewSheet.getLastRow();

  if (attendanceLastRow >= 2) {

    var attendanceValues =
      attendanceReviewSheet
        .getRange(2, 1, attendanceLastRow - 1, 21)
        .getValues();

    for (var j = 0; j < attendanceValues.length; j++) {

      var aRow = attendanceValues[j];
      var aDate = formatReportDate_(aRow[1]);

      if (aDate !== targetDate) {
        continue;
      }

      var aSiteId =
        String(aRow[4] || "").trim();

      if (
        aSiteId === "" ||
        (targetSiteId !== "" && aSiteId !== targetSiteId) ||
        !canManageSite_(operator, aSiteId)
      ) {
        continue;
      }

      candidateSiteIds[aSiteId] = true;

      var reviewStatus =
        String(aRow[14] || "").trim();

      var workdayDecision =
        String(aRow[10] || "").trim();

      if (
        reviewStatus !== "已確認" ||
        workdayDecision === "不計出工" ||
        workdayDecision === "未核定" ||
        workdayDecision === ""
      ) {
        continue;
      }

      if (!attendanceBySite[aSiteId]) {
        attendanceBySite[aSiteId] = {};
      }

      var employeeId =
        String(aRow[2] || "").trim();

      if (employeeId !== "") {
        attendanceBySite[aSiteId][employeeId] = true;
      }
    }
  }

  if (targetSiteId !== "") {
    candidateSiteIds[targetSiteId] = true;
  }

  var existingByKey = {};
  var siteDailyLastRow =
    siteDailySheet.getLastRow();

  if (siteDailyLastRow >= 2) {

    var siteDailyValues =
      siteDailySheet
        .getRange(2, 1, siteDailyLastRow - 1, 20)
        .getValues();

    for (var k = 0; k < siteDailyValues.length; k++) {

      var sdRow = siteDailyValues[k];
      var sdDate = formatReportDate_(sdRow[1]);
      var sdSiteId = String(sdRow[2] || "").trim();

      existingByKey[
        sdDate + "|" + sdSiteId
      ] = {
        row: k + 2,
        values: sdRow
      };
    }
  }

  var siteIds =
    Object.keys(candidateSiteIds).sort();

  var now = new Date();
  var updatedCount = 0;
  var lockedCount = 0;

  for (var s = 0; s < siteIds.length; s++) {

    var siteId = siteIds[s];
    var site = getSiteById_(siteId);

    if (!site) {
      continue;
    }

    var reports =
      confirmedReportsBySite[siteId] || [];

    var reporterMap = {};
    var workLines = [];
    var issueLines = [];
    var helpLines = [];
    var tomorrowLines = [];

    for (var r = 0; r < reports.length; r++) {

      var reportRow = reports[r];
      var employeeId = String(reportRow[2] || "").trim();
      var employeeName = String(reportRow[3] || "").trim();

      if (employeeId !== "") {
        reporterMap[employeeId] = true;
      }

      var locationText =
        [
          String(reportRow[9] || "").trim(),
          String(reportRow[10] || "").trim(),
          String(reportRow[11] || "").trim()
        ]
        .filter(function(value) { return value !== ""; })
        .join(" / ");

      var category = String(reportRow[12] || "").trim();
      var workItem = String(reportRow[13] || "").trim();
      var completed = String(reportRow[14] || "").trim();

      var workText =
        [
          employeeName,
          locationText,
          category,
          workItem,
          completed
        ]
        .filter(function(value) { return value !== ""; })
        .join("｜");

      pushUniqueText_(workLines, workText);

      var issue = String(reportRow[18] || "").trim();
      if (issue !== "" && issue !== "無") {
        pushUniqueText_(
          issueLines,
          (employeeName ? employeeName + "：" : "") + issue
        );
      }

      var needHelp = String(reportRow[20] || "").trim();
      var helpContent = String(reportRow[21] || "").trim();

      if (needHelp === "是" && helpContent !== "") {
        pushUniqueText_(
          helpLines,
          (employeeName ? employeeName + "：" : "") + helpContent
        );
      }

      var tomorrow = String(reportRow[19] || "").trim();
      if (tomorrow !== "") {
        pushUniqueText_(tomorrowLines, tomorrow);
      }
    }

    var workerCount =
      Object.keys(attendanceBySite[siteId] || {}).length;

    var reporterCount =
      Object.keys(reporterMap).length;

    var itemCount = reports.length;

    var workSummary =
      workLines.length > 0
        ? workLines.join("\n")
        : "無已確認回報";

    var issueSummary =
      issueLines.length > 0
        ? issueLines.join("\n")
        : "無";

    var helpSummary =
      helpLines.length > 0
        ? helpLines.join("\n")
        : "無";

    var tomorrowSummary =
      tomorrowLines.length > 0
        ? tomorrowLines.join("\n")
        : "未填";

    var key = targetDate + "|" + siteId;
    var existing = existingByKey[key];

    if (existing) {

      var existingStatus =
        String(existing.values[13] || "").trim();

      if (existingStatus === "已確認") {
        lockedCount++;
        continue;
      }

      siteDailySheet
        .getRange(existing.row, 1, 1, 20)
        .setValues([[
          existing.values[0] || createId_("SDR"), // A 日報ID
          parseReportDate_(targetDate),             // B 日期
          siteId,                                   // C 工地ID
          site.name,                                // D 工地名稱
          site.foremanId || "",                    // E 主要負責人ID
          site.foremanName || "",                  // F 主要負責人姓名
          workerCount,                              // G 出工人數
          reporterCount,                            // H 回報人數
          itemCount,                                // I 工作項目數
          workSummary,                              // J 今日施工摘要
          issueSummary,                             // K 異常／問題摘要
          helpSummary,                              // L 需協助事項
          tomorrowSummary,                          // M 明日預定工作
          "待確認",                                // N 日報狀態
          "",                                      // O 確認人ID
          "",                                      // P 確認人姓名
          "",                                      // Q 確認時間
          "",                                      // R 確認備註
          existing.values[18] || now,               // S 建立時間
          now                                       // T 最後修改時間
        ]]);

    } else {

      siteDailySheet.appendRow([
        createId_("SDR"),
        parseReportDate_(targetDate),
        siteId,
        site.name,
        site.foremanId || "",
        site.foremanName || "",
        workerCount,
        reporterCount,
        itemCount,
        workSummary,
        issueSummary,
        helpSummary,
        tomorrowSummary,
        "待確認",
        "",
        "",
        "",
        "",
        now,
        now
      ]);
    }

    updatedCount++;
  }

  return jsonResponse_({
    success: true,
    message:
      "已彙整 " + updatedCount +
      " 份工地日報" +
      (lockedCount > 0
        ? "；另有 " + lockedCount + " 份已確認日報維持鎖定"
        : ""),
    updatedCount: updatedCount,
    lockedCount: lockedCount
  });
}


function handleAdminSiteDailyReportList_(data) {

  var operator =
    getOperatorEmployee_(data.userId);

  assertSiteDailyReportManager_(operator);

  var targetDate =
    normalizeReportDateText_(data.date);

  var targetSiteId =
    safeText_(data.siteId);

  if (
    targetSiteId !== "" &&
    !canManageSite_(operator, targetSiteId)
  ) {
    throw new Error("你沒有權限管理這個工地的工地日報");
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("工地日報");

  if (!sheet) {
    throw new Error("找不到「工地日報」");
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return jsonResponse_({ success: true, reports: [] });
  }

  var values =
    sheet.getRange(2, 1, lastRow - 1, 20).getValues();

  var reports = [];

  for (var i = 0; i < values.length; i++) {

    var row = values[i];
    var dateText = formatReportDate_(row[1]);
    var siteId = String(row[2] || "").trim();

    if (dateText !== targetDate) {
      continue;
    }

    if (targetSiteId !== "" && siteId !== targetSiteId) {
      continue;
    }

    if (!canManageSite_(operator, siteId)) {
      continue;
    }

    reports.push(siteDailyReportRowToObject_(row));
  }

  reports.sort(function(a, b) {
    return a.siteName > b.siteName ? 1 : -1;
  });

  return jsonResponse_({
    success: true,
    reports: reports
  });
}


function handleAdminSiteDailyReportFinalize_(data) {

  var operator =
    getOperatorEmployee_(data.userId);

  assertSiteDailyReportManager_(operator);

  var dailyReportId = safeText_(data.dailyReportId);
  var note = safeText_(data.note);

  if (dailyReportId === "") {
    throw new Error("沒有收到工地日報ID");
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("工地日報");

  if (!sheet) {
    throw new Error("找不到「工地日報」");
  }

  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error("找不到指定的工地日報");
  }

  var values =
    sheet.getRange(2, 1, lastRow - 1, 20).getValues();

  var foundRow = 0;
  var found = null;

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || "").trim() === dailyReportId) {
      foundRow = i + 2;
      found = values[i];
      break;
    }
  }

  if (!found) {
    throw new Error("找不到指定的工地日報");
  }

  var siteId = String(found[2] || "").trim();

  if (!canManageSite_(operator, siteId)) {
    throw new Error("你沒有權限確認這個工地的工地日報");
  }

  var status = String(found[13] || "").trim();

  if (status !== "待確認") {
    throw new Error(
      "這份工地日報目前狀態為「" + status + "」，只有「待確認」可以確認"
    );
  }

  var now = new Date();

  sheet.getRange(foundRow, 14).setValue("已確認");
  sheet.getRange(foundRow, 15).setValue(operator.employeeId);
  sheet.getRange(foundRow, 16).setValue(operator.name);
  sheet.getRange(foundRow, 17).setValue(now);
  sheet.getRange(foundRow, 18).setValue(note);
  sheet.getRange(foundRow, 20).setValue(now);

  return jsonResponse_({
    success: true,
    message: "工地日報已確認",
    dailyReportId: dailyReportId,
    status: "已確認"
  });
}


function siteDailyReportRowToObject_(row) {
  return {
    dailyReportId: String(row[0] || "").trim(),
    date: formatReportDate_(row[1]),
    siteId: String(row[2] || "").trim(),
    siteName: String(row[3] || "").trim(),
    managerId: String(row[4] || "").trim(),
    managerName: String(row[5] || "").trim(),
    workerCount: Number(row[6] || 0),
    reporterCount: Number(row[7] || 0),
    itemCount: Number(row[8] || 0),
    workSummary: String(row[9] || "").trim(),
    issueSummary: String(row[10] || "").trim(),
    helpSummary: String(row[11] || "").trim(),
    tomorrowPlan: String(row[12] || "").trim(),
    status: String(row[13] || "").trim(),
    confirmedById: String(row[14] || "").trim(),
    confirmedByName: String(row[15] || "").trim(),
    confirmedAt: formatSiteDailyDateTime_(row[16]),
    confirmNote: String(row[17] || "").trim(),
    createdAt: formatSiteDailyDateTime_(row[18]),
    updatedAt: formatSiteDailyDateTime_(row[19])
  };
}


function pushUniqueText_(list, text) {
  var value = String(text || "").trim();

  if (value === "") {
    return;
  }

  if (list.indexOf(value) === -1) {
    list.push(value);
  }
}


function parseReportDate_(dateText) {
  var parts = String(dateText || "").split("-");

  if (parts.length !== 3) {
    throw new Error("日期格式錯誤");
  }

  return new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2])
  );
}


function formatSiteDailyDateTime_(value) {
  if (!value) {
    return "";
  }

  var date = value instanceof Date
    ? value
    : new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm"
  );
}

/*******************************************************
 * Module 6：工程進度 V1
 *
 * 權限：
 * OWNER / ADMIN
 *   - 可管理全部工地進度
 *   - 可維護工程位置設定、工程項目設定
 *
 * SITE_MANAGER
 *   - 僅可讀取 / 更新 / 確認自己負責工地的進度
 *   - 不可修改共用主檔設定
 *
 * 重要原則：
 * 1. 工程進度使用「工地 + 位置 + 工程項目」唯一鍵
 * 2. 更新時不累加百分比，而是保存最新狀態
 * 3. 每次修改都先寫入「工程進度異動紀錄」
 * 4. 重要進度不可無痕覆寫
 *******************************************************/


/*******************************************************
 * 每日回報 → 工程進度串接 V1
 *******************************************************/
function ensureDailyReportProgressColumns_(sheet) {

  var headers = [
    "工程位置ID",
    "工程項目代碼",
    "進度同步狀態",
    "進度同步時間",
    "對應進度ID",
    "進度同步備註",
    "是否連動工程進度"
  ];

  var current =
    sheet.getRange(1, 31, 1, 7).getValues()[0];

  var changed = false;

  for (var i = 0; i < headers.length; i++) {
    if (String(current[i] || "").trim() === "") {
      current[i] = headers[i];
      changed = true;
    }
  }

  if (changed) {
    sheet.getRange(1, 31, 1, 7).setValues([current]);
  }
}

function validateDailyReportProgressLocation_(siteId, locationId) {

  var location =
    getProgressLocationById_(locationId);

  if (!location) {
    throw new Error("找不到指定的工程位置");
  }

  if (location.siteId !== siteId) {
    throw new Error("工程位置與工地不相符");
  }

  var status =
    String(location.status || "").trim();

  if (
    status !== "" &&
    status !== "啟用"
  ) {
    throw new Error("此工程位置目前未啟用");
  }

  return location;
}

function validateDailyReportProgressItem_(itemCode) {

  var item =
    getProgressItemByCode_(itemCode);

  if (!item) {
    throw new Error("找不到指定的工程項目");
  }

  if (
    String(item.status || "").trim() !== "啟用"
  ) {
    throw new Error("此工程項目目前未啟用");
  }

  return item;
}

function handleDailyReportProgressOptions_(data) {

  var employee =
    getOperatorEmployee_(data.userId);

  var siteId = safeText_(data.siteId);

  if (siteId === "") {
    throw new Error("請選擇工地");
  }

  var site = getSiteById_(siteId);

  if (!site) {
    throw new Error("找不到指定工地");
  }

  if (
    String(site.status || "").trim() !== "施工中"
  ) {
    throw new Error("此工地目前不是施工中狀態");
  }

  var locations =
    getProgressLocations_(siteId)
      .filter(function(row) {
        var status = String(row.status || "").trim();
        return status === "" || status === "啟用";
      });

  var items =
    getProgressItems_()
      .filter(function(row) {
        return String(row.status || "").trim() === "啟用";
      });

  return jsonResponse_({
    success: true,
    siteId: siteId,
    employeeId: employee.employeeId,
    locations: locations,
    items: items
  });
}

function findProgressCurrentRow_(siteId, locationId, itemCode) {

  var sheet = getProgressSheet_("工程進度");
  var rows = sheet.getDataRange().getValues();

  for (var i = 1; i < rows.length; i++) {
    if (
      String(rows[i][1] || "").trim() === siteId &&
      String(rows[i][3] || "").trim() === locationId &&
      String(rows[i][7] || "").trim() === itemCode
    ) {
      return {
        sheet: sheet,
        rowIndex: i,
        sheetRow: i + 1,
        row: rows[i]
      };
    }
  }

  return {
    sheet: sheet,
    rowIndex: -1,
    sheetRow: -1,
    row: null
  };
}

function syncConfirmedDailyReportToProgress_(reportId, operator) {

  var report = getDailyReportById_(reportId);

  if (!report) {
    throw new Error("找不到指定的每日回報");
  }

  if (report.status !== "已確認") {
    throw new Error("只有已確認的每日回報可以同步工程進度");
  }

  var reportSheet =
    SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName("每日回報");

  ensureDailyReportProgressColumns_(reportSheet);

  // V1.2：只有使用者明確選擇「是」才允許連動工程進度。
  // 舊資料沒有 AK 欄值，一律視為「否」，避免部署後意外改動既有進度。
  if (report.linkProgress !== "是") {
    reportSheet.getRange(report.row, 33).setValue("僅工作紀錄");
    reportSheet.getRange(report.row, 34).setValue(new Date());
    reportSheet.getRange(report.row, 36).setValue(
      "此工作項目未選擇連動工程進度"
    );
    return {
      success: true,
      status: "僅工作紀錄",
      message: "此工作項目僅作工作紀錄，未異動工程進度",
      progressId: ""
    };
  }

  if (
    report.progressSyncStatus === "已同步" ||
    report.progressSyncStatus === "無變更"
  ) {
    return {
      success: true,
      status: report.progressSyncStatus,
      message:
        report.progressSyncStatus === "已同步"
          ? "工程進度先前已同步"
          : "工程進度內容沒有變更",
      progressId: report.linkedProgressId || ""
    };
  }

  if (
    !report.locationId ||
    !report.itemCode
  ) {
    reportSheet.getRange(report.row, 33).setValue("未對應");
    reportSheet.getRange(report.row, 34).setValue(new Date());
    reportSheet.getRange(report.row, 36).setValue(
      "舊版自由文字回報或尚未選擇標準工程位置／工程項目，不自動猜測對應"
    );

    return {
      success: true,
      status: "未對應",
      message: "此回報未設定標準工程位置／項目，因此未同步工程進度",
      progressId: ""
    };
  }

  if (
    report.progress === "" ||
    report.progress === null ||
    report.progress === undefined
  ) {
    reportSheet.getRange(report.row, 33).setValue("不需同步");
    reportSheet.getRange(report.row, 34).setValue(new Date());
    reportSheet.getRange(report.row, 36).setValue(
      "每日回報未填進度百分比，今日完成數量不直接累加到工程進度"
    );

    return {
      success: true,
      status: "不需同步",
      message: "未填進度百分比，因此未異動工程進度",
      progressId: ""
    };
  }

  var location =
    validateDailyReportProgressLocation_(
      report.siteId,
      report.locationId
    );

  var item =
    validateDailyReportProgressItem_(
      report.itemCode
    );

  var current =
    findProgressCurrentRow_(
      report.siteId,
      report.locationId,
      report.itemCode
    );

  var afterPercent =
    Math.max(0, Math.min(100, Number(report.progress)));

  if (isNaN(afterPercent)) {
    throw new Error("每日回報進度百分比格式錯誤");
  }

  var afterStatus =
    getProgressStatusFromPercent_(afterPercent);

  var now = new Date();
  var progressId = "";

  if (current.row) {

    var oldRow = current.row;
    progressId = String(oldRow[0] || "").trim();
    var beforePercent = Number(oldRow[13] || 0);
    var beforeStatus = String(oldRow[14] || "").trim();

    if (
      Number(beforePercent) === Number(afterPercent) &&
      beforeStatus === afterStatus
    ) {
      reportSheet.getRange(report.row, 33).setValue("無變更");
      reportSheet.getRange(report.row, 34).setValue(now);
      reportSheet.getRange(report.row, 35).setValue(progressId);
      reportSheet.getRange(report.row, 36).setValue(
        "每日回報進度與目前工程進度相同，未建立重複異動紀錄"
      );

      return {
        success: true,
        status: "無變更",
        message: "工程進度內容沒有變更",
        progressId: progressId
      };
    }

    var actualStart = oldRow[17] || "";
    var actualEnd = oldRow[18] || "";

    if (
      afterPercent > 0 &&
      !actualStart
    ) {
      actualStart = formatDate_(now);
    }

    if (afterPercent >= 100) {
      actualEnd = actualEnd || formatDate_(now);
    } else {
      actualEnd = "";
    }

    appendProgressAudit_({
      progressId: progressId,
      siteId: report.siteId,
      locationId: report.locationId,
      itemCode: report.itemCode,
      changeType: "更新",
      beforePercent: oldRow[13],
      afterPercent: afterPercent,
      beforeStatus: oldRow[14],
      afterStatus: afterStatus,
      beforeQty: oldRow[12],
      afterQty: oldRow[12],
      beforeStart: oldRow[17],
      afterStart: actualStart,
      beforeEnd: oldRow[18],
      afterEnd: actualEnd,
      reason: "每日回報確認後同步進度",
      sourceReportId: report.reportId,
      operator: operator,
      note: "來源：每日回報"
    });

    var updated = oldRow.slice(0, 30);
    updated[2] = report.siteName || updated[2];
    updated[4] = location.zone;
    updated[5] = location.floor;
    updated[6] = location.unit;
    updated[8] = item.category;
    updated[9] = item.workItem;
    updated[10] = item.unit;
    updated[13] = afterPercent;
    updated[14] = afterStatus;
    updated[17] = actualStart;
    updated[18] = actualEnd;
    updated[21] = report.reportId;
    updated[22] = "每日回報";
    updated[23] = operator.employeeId;
    updated[24] = operator.name;
    updated[25] = now;
    updated[26] = "待確認";
    updated[27] = "";
    updated[28] = "";
    updated[29] = "由已確認每日回報同步";

    current.sheet
      .getRange(current.sheetRow, 1, 1, 30)
      .setValues([updated]);

  } else {

    progressId = createId_("PRG");

    var actualStartNew =
      afterPercent > 0
        ? formatDate_(now)
        : "";

    var actualEndNew =
      afterPercent >= 100
        ? formatDate_(now)
        : "";

    appendProgressAudit_({
      progressId: progressId,
      siteId: report.siteId,
      locationId: report.locationId,
      itemCode: report.itemCode,
      changeType: "建立",
      beforePercent: "",
      afterPercent: afterPercent,
      beforeStatus: "",
      afterStatus: afterStatus,
      beforeQty: "",
      afterQty: 0,
      beforeStart: "",
      afterStart: actualStartNew,
      beforeEnd: "",
      afterEnd: actualEndNew,
      reason: "每日回報確認後建立工程進度",
      sourceReportId: report.reportId,
      operator: operator,
      note: "來源：每日回報"
    });

    current.sheet.appendRow([
      progressId,
      report.siteId,
      report.siteName,
      location.locationId,
      location.zone,
      location.floor,
      location.unit,
      item.itemCode,
      item.category,
      item.workItem,
      item.unit,
      0,
      0,
      afterPercent,
      afterStatus,
      "",
      "",
      actualStartNew,
      actualEndNew,
      report.foremanId || "",
      report.foremanName || "",
      report.reportId,
      "每日回報",
      operator.employeeId,
      operator.name,
      now,
      "待確認",
      "",
      "",
      "由已確認每日回報同步"
    ]);
  }

  reportSheet.getRange(report.row, 33).setValue("已同步");
  reportSheet.getRange(report.row, 34).setValue(now);
  reportSheet.getRange(report.row, 35).setValue(progressId);
  reportSheet.getRange(report.row, 36).setValue(
    "已由每日回報進度百分比同步；今日完成數量未做累加"
  );

  return {
    success: true,
    status: "已同步",
    message: "工程進度已同步並轉為待確認",
    progressId: progressId
  };
}

/*******************************************************
 * 工程進度首頁資料
 *******************************************************/
function handleAdminProgressBootstrap_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressManager_(
    operator
  );

  var sites =
    getProgressManageableSites_(
      operator
    );

  var locations =
    getProgressLocations_(
      ""
    );

  var items =
    getProgressItems_();

  if (
    String(operator.permission || "")
      .trim()
      .toUpperCase()
    === "SITE_MANAGER"
  ) {

    var allowed = {};

    for (
      var i = 0;
      i < sites.length;
      i++
    ) {

      allowed[
        String(sites[i].siteId)
      ] = true;

    }

    locations =
      locations.filter(
        function (item) {

          return !!allowed[
            String(item.siteId)
          ];

        }
      );

  }

  return jsonResponse_({

    success: true,

    operator: {
      employeeId:
        operator.employeeId,
      name:
        operator.name,
      permission:
        operator.permission
    },

    sites:
      sites,

    locations:
      locations,

    items:
      items

  });

}


/*******************************************************
 * 新增 / 更新工程位置
 * OWNER / ADMIN only
 *******************************************************/
function handleAdminProgressLocationSave_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressMasterManager_(
    operator
  );

  var siteId =
    String(
      data.siteId || ""
    ).trim();

  var site =
    getSiteById_(
      siteId
    );

  if (!site) {

    throw new Error(
      "找不到指定工地"
    );

  }

  var zone =
    cleanProgressText_(
      data.zone
    );

  var floor =
    cleanProgressText_(
      data.floor
    );

  var unit =
    cleanProgressText_(
      data.unit
    );

  if (
    zone === "" &&
    floor === "" &&
    unit === ""
  ) {

    throw new Error(
      "棟別／區域、樓層、戶別至少需要填寫一項"
    );

  }

  var sheet =
    getProgressSheet_(
      "工程位置設定"
    );

  var locationId =
    String(
      data.locationId || ""
    ).trim();

  var now =
    new Date();

  var status =
    cleanProgressText_(
      data.status
    ) || "啟用";

  var sortOrder =
    Number(
      data.sortOrder || 0
    );

  if (
    isNaN(sortOrder)
  ) {

    sortOrder = 0;

  }

  var displayName =
    [zone, floor, unit]
      .filter(
        function (v) {
          return v !== "";
        }
      )
      .join(" / ");

  if (
    locationId !== ""
  ) {

    var dataRows =
      sheet
        .getDataRange()
        .getValues();

    for (
      var i = 1;
      i < dataRows.length;
      i++
    ) {

      if (
        String(dataRows[i][0])
          .trim()
        === locationId
      ) {

        sheet
          .getRange(
            i + 1,
            2,
            1,
            13
          )
          .setValues([[
            site.siteId,
            site.name,
            zone,
            floor,
            unit,
            displayName,
            sortOrder,
            data.effectiveDate || dataRows[i][8] || "",
            data.expiryDate || "",
            status,
            dataRows[i][11] || operator.employeeId,
            dataRows[i][12] || now,
            cleanProgressText_(data.note)
          ]]);

        return jsonResponse_({

          success: true,
          message:
            "工程位置已更新",
          locationId:
            locationId

        });

      }

    }

    throw new Error(
      "找不到要更新的工程位置"
    );

  }

  locationId =
    createId_(
      "LOC"
    );

  sheet.appendRow([

    locationId,
    site.siteId,
    site.name,
    zone,
    floor,
    unit,
    displayName,
    sortOrder,
    data.effectiveDate || "",
    data.expiryDate || "",
    status,
    operator.employeeId,
    now,
    cleanProgressText_(data.note)

  ]);

  return jsonResponse_({

    success: true,
    message:
      "工程位置已建立",
    locationId:
      locationId

  });

}


/*******************************************************
 * 新增 / 更新工程項目
 * OWNER / ADMIN only
 *******************************************************/
function handleAdminProgressItemSave_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressMasterManager_(
    operator
  );

  var category =
    cleanProgressText_(
      data.category
    );

  var workItem =
    cleanProgressText_(
      data.workItem
    );

  if (
    category === "" ||
    workItem === ""
  ) {

    throw new Error(
      "工程類別與工作項目不可空白"
    );

  }

  var unit =
    cleanProgressText_(
      data.unit
    ) || "項";

  var weight =
    Number(
      data.defaultWeight
    );

  if (
    isNaN(weight) ||
    weight <= 0
  ) {

    weight = 1;

  }

  var sortOrder =
    Number(
      data.sortOrder || 0
    );

  if (
    isNaN(sortOrder)
  ) {

    sortOrder = 0;

  }

  var includeTotal =
    String(
      data.includeTotal
    ).trim();

  if (
    includeTotal === ""
  ) {

    includeTotal = "是";

  }

  var status =
    cleanProgressText_(
      data.status
    ) || "啟用";

  var sheet =
    getProgressSheet_(
      "工程項目設定"
    );

  var itemCode =
    String(
      data.itemCode || ""
    ).trim();

  var now =
    new Date();

  if (
    itemCode !== ""
  ) {

    var rows =
      sheet
        .getDataRange()
        .getValues();

    for (
      var i = 1;
      i < rows.length;
      i++
    ) {

      if (
        String(rows[i][0])
          .trim()
        === itemCode
      ) {

        sheet
          .getRange(
            i + 1,
            2,
            1,
            11
          )
          .setValues([[
            category,
            workItem,
            unit,
            weight,
            sortOrder,
            cleanProgressText_(data.scope) || "全部",
            includeTotal,
            status,
            rows[i][9] || operator.employeeId,
            rows[i][10] || now,
            cleanProgressText_(data.note)
          ]]);

        return jsonResponse_({

          success: true,
          message:
            "工程項目已更新",
          itemCode:
            itemCode

        });

      }

    }

    throw new Error(
      "找不到要更新的工程項目"
    );

  }

  itemCode =
    createProgressItemCode_(
      category
    );

  sheet.appendRow([

    itemCode,
    category,
    workItem,
    unit,
    weight,
    sortOrder,
    cleanProgressText_(data.scope) || "全部",
    includeTotal,
    status,
    operator.employeeId,
    now,
    cleanProgressText_(data.note)

  ]);

  return jsonResponse_({

    success: true,
    message:
      "工程項目已建立",
    itemCode:
      itemCode

  });

}


/*******************************************************
 * 讀取工程進度
 *******************************************************/
function handleAdminProgressList_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressManager_(
    operator
  );

  var siteId =
    String(
      data.siteId || ""
    ).trim();

  if (
    siteId !== "" &&
    !canManageSite_(
      operator,
      siteId
    )
  ) {

    throw new Error(
      "你沒有這個工地的工程進度管理權限"
    );

  }

  var locationId =
    String(
      data.locationId || ""
    ).trim();

  var sheet =
    getProgressSheet_(
      "工程進度"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  var result = [];

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i][0] || "")
        .trim()
      === ""
    ) {

      continue;

    }

    var rowSiteId =
      String(rows[i][1] || "")
        .trim();

    if (
      siteId !== "" &&
      rowSiteId !== siteId
    ) {

      continue;

    }

    if (
      locationId !== "" &&
      String(rows[i][3] || "")
        .trim()
      !== locationId
    ) {

      continue;

    }

    if (
      !canManageSite_(
        operator,
        rowSiteId
      )
    ) {

      continue;

    }

    result.push(
      progressRowToObject_(
        rows[i]
      )
    );

  }

  return jsonResponse_({

    success: true,
    records:
      result

  });

}


/*******************************************************
 * 新增 / 更新工程進度
 *******************************************************/
function handleAdminProgressUpsert_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressManager_(
    operator
  );

  var siteId =
    String(
      data.siteId || ""
    ).trim();

  var locationId =
    String(
      data.locationId || ""
    ).trim();

  var itemCode =
    String(
      data.itemCode || ""
    ).trim();

  if (
    siteId === "" ||
    locationId === "" ||
    itemCode === ""
  ) {

    throw new Error(
      "工地、工程位置、工程項目不可空白"
    );

  }

  if (
    !canManageSite_(
      operator,
      siteId
    )
  ) {

    throw new Error(
      "你沒有這個工地的工程進度管理權限"
    );

  }

  var site =
    getSiteById_(
      siteId
    );

  var location =
    getProgressLocationById_(
      locationId
    );

  if (
    !location ||
    location.siteId !== siteId
  ) {

    throw new Error(
      "工程位置與工地不相符"
    );

  }

  if (
    String(location.status)
      .trim()
    !== "啟用"
  ) {

    throw new Error(
      "此工程位置目前未啟用"
    );

  }

  var item =
    getProgressItemByCode_(
      itemCode
    );

  if (!item) {

    throw new Error(
      "找不到工程項目"
    );

  }

  if (
    String(item.status)
      .trim()
    !== "啟用"
  ) {

    throw new Error(
      "此工程項目目前未啟用"
    );

  }

  var plannedQty =
    parseProgressNumber_(
      data.plannedQty,
      0
    );

  var completedQty =
    parseProgressNumber_(
      data.completedQty,
      0
    );

  if (
    plannedQty < 0 ||
    completedQty < 0
  ) {

    throw new Error(
      "計畫數量與完成數量不可小於 0"
    );

  }

  var progressPercent;

  // 若前端明確提供目前進度百分比，優先採用人工判定值。
  // 未提供時才依計畫數量 / 完成數量自動計算，保留既有行為。
  var hasExplicitProgressPercent =
    data.progressPercent !== null &&
    data.progressPercent !== undefined &&
    String(data.progressPercent).trim() !== "";

  if (
    hasExplicitProgressPercent
  ) {

    progressPercent =
      parseProgressNumber_(
        data.progressPercent,
        0
      );

  } else if (
    plannedQty > 0
  ) {

    progressPercent =
      Math.round(
        completedQty /
        plannedQty *
        10000
      ) / 100;

  } else {

    progressPercent = 0;

  }

  progressPercent =
    Math.max(
      0,
      Math.min(
        100,
        progressPercent
      )
    );

  var status =
    cleanProgressText_(
      data.progressStatus
    );

  if (
    status === ""
  ) {

    status =
      getProgressStatusFromPercent_(
        progressPercent
      );

  }

  var sheet =
    getProgressSheet_(
      "工程進度"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  var existingRow = -1;

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i][1] || "").trim()
        === siteId &&
      String(rows[i][3] || "").trim()
        === locationId &&
      String(rows[i][7] || "").trim()
        === itemCode
    ) {

      existingRow =
        i;

      break;

    }

  }

  var now =
    new Date();

  var sourceReportId =
    cleanProgressText_(
      data.sourceReportId
    );

  var sourceType =
    cleanProgressText_(
      data.sourceType
    ) || "手動更新";

  var planStart =
    data.planStart || "";

  var planEnd =
    data.planEnd || "";

  var actualStart =
    data.actualStart || "";

  var actualEnd =
    data.actualEnd || "";

  if (
    progressPercent > 0 &&
    actualStart === ""
  ) {

    if (
      existingRow >= 0 &&
      rows[existingRow][17]
    ) {

      actualStart =
        rows[existingRow][17];

    } else {

      actualStart =
        formatDate_(now);

    }

  }

  if (
    progressPercent >= 100 &&
    actualEnd === ""
  ) {

    if (
      existingRow >= 0 &&
      rows[existingRow][18]
    ) {

      actualEnd =
        rows[existingRow][18];

    } else {

      actualEnd =
        formatDate_(now);

    }

  }

  if (
    progressPercent < 100 &&
    status !== "已完成"
  ) {

    actualEnd =
      "";

  }

  var foremanId =
    cleanProgressText_(
      data.responsibleEmployeeId
    ) ||
    site.foremanId ||
    "";

  var foremanName =
    cleanProgressText_(
      data.responsibleEmployeeName
    ) ||
    site.foremanName ||
    "";

  if (
    existingRow >= 0
  ) {

    var oldRow =
      rows[
        existingRow
      ];

    appendProgressAudit_({

      progressId:
        String(oldRow[0] || ""),
      siteId:
        siteId,
      locationId:
        locationId,
      itemCode:
        itemCode,
      changeType:
        "更新",
      beforePercent:
        oldRow[13],
      afterPercent:
        progressPercent,
      beforeStatus:
        oldRow[14],
      afterStatus:
        status,
      beforeQty:
        oldRow[12],
      afterQty:
        completedQty,
      beforeStart:
        oldRow[17],
      afterStart:
        actualStart,
      beforeEnd:
        oldRow[18],
      afterEnd:
        actualEnd,
      reason:
        cleanProgressText_(
          data.changeReason
        ) || "工程進度更新",
      sourceReportId:
        sourceReportId,
      operator:
        operator,
      note:
        cleanProgressText_(
          data.note
        )

    });

    sheet
      .getRange(
        existingRow + 1,
        1,
        1,
        30
      )
      .setValues([[
        oldRow[0],
        site.siteId,
        site.name,
        location.locationId,
        location.zone,
        location.floor,
        location.unit,
        item.itemCode,
        item.category,
        item.workItem,
        item.unit,
        plannedQty,
        completedQty,
        progressPercent,
        status,
        planStart || oldRow[15] || "",
        planEnd || oldRow[16] || "",
        actualStart,
        actualEnd,
        foremanId,
        foremanName,
        sourceReportId || oldRow[21] || "",
        sourceType,
        operator.employeeId,
        operator.name,
        now,
        "待確認",
        "",
        "",
        cleanProgressText_(data.note)
      ]]);

    return jsonResponse_({

      success: true,
      message:
        "工程進度已更新",
      progressId:
        String(oldRow[0])

    });

  }

  var progressId =
    createId_(
      "PRG"
    );

  appendProgressAudit_({

    progressId:
      progressId,
    siteId:
      siteId,
    locationId:
      locationId,
    itemCode:
      itemCode,
    changeType:
      "建立",
    beforePercent:
      "",
    afterPercent:
      progressPercent,
    beforeStatus:
      "",
    afterStatus:
      status,
    beforeQty:
      "",
    afterQty:
      completedQty,
    beforeStart:
      "",
    afterStart:
      actualStart,
    beforeEnd:
      "",
    afterEnd:
      actualEnd,
    reason:
      cleanProgressText_(
        data.changeReason
      ) || "建立工程進度",
    sourceReportId:
      sourceReportId,
    operator:
      operator,
    note:
      cleanProgressText_(
        data.note
      )

  });

  sheet.appendRow([

    progressId,
    site.siteId,
    site.name,
    location.locationId,
    location.zone,
    location.floor,
    location.unit,
    item.itemCode,
    item.category,
    item.workItem,
    item.unit,
    plannedQty,
    completedQty,
    progressPercent,
    status,
    planStart,
    planEnd,
    actualStart,
    actualEnd,
    foremanId,
    foremanName,
    sourceReportId,
    sourceType,
    operator.employeeId,
    operator.name,
    now,
    "待確認",
    "",
    "",
    cleanProgressText_(data.note)

  ]);

  return jsonResponse_({

    success: true,
    message:
      "工程進度已建立",
    progressId:
      progressId

  });

}


/*******************************************************
 * 確認工程進度
 *******************************************************/
function handleAdminProgressConfirm_(data) {

  var operator =
    getOperatorEmployee_(
      data.userId
    );

  assertProgressManager_(
    operator
  );

  var progressId =
    String(
      data.progressId || ""
    ).trim();

  if (
    progressId === ""
  ) {

    throw new Error(
      "缺少工程進度ID"
    );

  }

  var sheet =
    getProgressSheet_(
      "工程進度"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i][0] || "")
        .trim()
      !== progressId
    ) {

      continue;

    }

    var siteId =
      String(rows[i][1] || "")
        .trim();

    if (
      !canManageSite_(
        operator,
        siteId
      )
    ) {

      throw new Error(
        "你沒有這個工地的工程進度確認權限"
      );

    }

    if (
      String(rows[i][26] || "")
        .trim()
      === "已確認"
    ) {

      return jsonResponse_({

        success: true,
        message:
          "此工程進度已確認",
        progressId:
          progressId

      });

    }

    sheet
      .getRange(
        i + 1,
        27,
        1,
        3
      )
      .setValues([[
        "已確認",
        operator.employeeId,
        new Date()
      ]]);

    appendProgressAudit_({

      progressId:
        progressId,
      siteId:
        siteId,
      locationId:
        String(rows[i][3] || ""),
      itemCode:
        String(rows[i][7] || ""),
      changeType:
        "確認",
      beforePercent:
        rows[i][13],
      afterPercent:
        rows[i][13],
      beforeStatus:
        rows[i][14],
      afterStatus:
        rows[i][14],
      beforeQty:
        rows[i][12],
      afterQty:
        rows[i][12],
      beforeStart:
        rows[i][17],
      afterStart:
        rows[i][17],
      beforeEnd:
        rows[i][18],
      afterEnd:
        rows[i][18],
      reason:
        cleanProgressText_(
          data.note
        ) || "工程進度確認",
      sourceReportId:
        String(rows[i][21] || ""),
      operator:
        operator,
      note:
        cleanProgressText_(
          data.note
        )

    });

    return jsonResponse_({

      success: true,
      message:
        "工程進度已確認",
      progressId:
        progressId

    });

  }

  throw new Error(
    "找不到指定工程進度"
  );

}


/*******************************************************
 * 工程進度權限
 *******************************************************/
function assertProgressManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    )
      .trim()
      .toUpperCase();

  if (
    permission === "OWNER" ||
    permission === "ADMIN" ||
    permission === "SITE_MANAGER"
  ) {

    return true;

  }

  throw new Error(
    "你的系統權限不能管理工程進度"
  );

}


/*******************************************************
 * 工程位置 / 工程項目主檔權限
 *******************************************************/
function assertProgressMasterManager_(
  operator
) {

  var permission =
    String(
      operator.permission || ""
    )
      .trim()
      .toUpperCase();

  if (
    permission === "OWNER" ||
    permission === "ADMIN"
  ) {

    return true;

  }

  throw new Error(
    "只有 OWNER / ADMIN 可以修改工程位置或工程項目設定"
  );

}


/*******************************************************
 * 取得可管理工地
 *******************************************************/
function getProgressManageableSites_(
  operator
) {

  var sheet =
    getProgressSheet_(
      "工地資料表"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  var result = [];

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    var siteId =
      String(rows[i][0] || "")
        .trim();

    if (
      siteId === ""
    ) {

      continue;

    }

    var status =
      String(rows[i][11] || "")
        .trim();

    if (
      status !== "" &&
      status !== "施工中" &&
      status !== "啟用"
    ) {

      continue;

    }

    if (
      !canManageSite_(
        operator,
        siteId
      )
    ) {

      continue;

    }

    result.push({

      siteId:
        siteId,
      name:
        String(rows[i][1] || "")
          .trim(),
      foremanId:
        String(rows[i][6] || "")
          .trim(),
      foremanName:
        String(rows[i][7] || "")
          .trim(),
      status:
        status

    });

  }

  return result;

}


/*******************************************************
 * 取得工程位置清單
 *******************************************************/
function getProgressLocations_(
  siteId
) {

  var sheet =
    getProgressSheet_(
      "工程位置設定"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  var targetSiteId =
    String(
      siteId || ""
    ).trim();

  var result = [];

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i][0] || "")
        .trim()
      === ""
    ) {

      continue;

    }

    if (
      targetSiteId !== "" &&
      String(rows[i][1] || "")
        .trim()
      !== targetSiteId
    ) {

      continue;

    }

    result.push({

      locationId:
        String(rows[i][0] || "")
          .trim(),
      siteId:
        String(rows[i][1] || "")
          .trim(),
      siteName:
        String(rows[i][2] || "")
          .trim(),
      zone:
        String(rows[i][3] || "")
          .trim(),
      floor:
        String(rows[i][4] || "")
          .trim(),
      unit:
        String(rows[i][5] || "")
          .trim(),
      name:
        String(rows[i][6] || "")
          .trim(),
      sortOrder:
        Number(rows[i][7] || 0),
      status:
        String(rows[i][10] || "")
          .trim()

    });

  }

  result.sort(
    function (a, b) {

      return (
        a.sortOrder -
        b.sortOrder
      );

    }
  );

  return result;

}


/*******************************************************
 * 取得工程項目清單
 *******************************************************/
function getProgressItems_() {

  var sheet =
    getProgressSheet_(
      "工程項目設定"
    );

  var rows =
    sheet
      .getDataRange()
      .getValues();

  var result = [];

  for (
    var i = 1;
    i < rows.length;
    i++
  ) {

    if (
      String(rows[i][0] || "")
        .trim()
      === ""
    ) {

      continue;

    }

    result.push({

      itemCode:
        String(rows[i][0] || "")
          .trim(),
      category:
        String(rows[i][1] || "")
          .trim(),
      workItem:
        String(rows[i][2] || "")
          .trim(),
      unit:
        String(rows[i][3] || "")
          .trim(),
      defaultWeight:
        Number(rows[i][4] || 1),
      sortOrder:
        Number(rows[i][5] || 0),
      scope:
        String(rows[i][6] || "")
          .trim(),
      includeTotal:
        String(rows[i][7] || "")
          .trim(),
      status:
        String(rows[i][8] || "")
          .trim()

    });

  }

  result.sort(
    function (a, b) {

      if (
        a.category !== b.category
      ) {

        return a.category
          .localeCompare(
            b.category,
            "zh-Hant"
          );

      }

      return (
        a.sortOrder -
        b.sortOrder
      );

    }
  );

  return result;

}


/*******************************************************
 * 找工程位置
 *******************************************************/
function getProgressLocationById_(
  locationId
) {

  var list =
    getProgressLocations_(
      ""
    );

  var target =
    String(
      locationId
    ).trim();

  for (
    var i = 0;
    i < list.length;
    i++
  ) {

    if (
      list[i].locationId
      === target
    ) {

      return list[i];

    }

  }

  return null;

}


/*******************************************************
 * 找工程項目
 *******************************************************/
function getProgressItemByCode_(
  itemCode
) {

  var list =
    getProgressItems_();

  var target =
    String(
      itemCode
    ).trim();

  for (
    var i = 0;
    i < list.length;
    i++
  ) {

    if (
      list[i].itemCode
      === target
    ) {

      return list[i];

    }

  }

  return null;

}


/*******************************************************
 * 工程進度列 -> 物件
 *******************************************************/
function progressRowToObject_(
  row
) {

  return {

    progressId:
      String(row[0] || ""),
    siteId:
      String(row[1] || ""),
    siteName:
      String(row[2] || ""),
    locationId:
      String(row[3] || ""),
    zone:
      String(row[4] || ""),
    floor:
      String(row[5] || ""),
    unit:
      String(row[6] || ""),
    itemCode:
      String(row[7] || ""),
    category:
      String(row[8] || ""),
    workItem:
      String(row[9] || ""),
    measureUnit:
      String(row[10] || ""),
    plannedQty:
      Number(row[11] || 0),
    completedQty:
      Number(row[12] || 0),
    progressPercent:
      Number(row[13] || 0),
    progressStatus:
      String(row[14] || ""),
    planStart:
      row[15] || "",
    planEnd:
      row[16] || "",
    actualStart:
      row[17] || "",
    actualEnd:
      row[18] || "",
    responsibleEmployeeId:
      String(row[19] || ""),
    responsibleEmployeeName:
      String(row[20] || ""),
    sourceReportId:
      String(row[21] || ""),
    sourceType:
      String(row[22] || ""),
    updatedById:
      String(row[23] || ""),
    updatedByName:
      String(row[24] || ""),
    updatedAt:
      row[25] || "",
    confirmStatus:
      String(row[26] || ""),
    confirmedById:
      String(row[27] || ""),
    confirmedAt:
      row[28] || "",
    note:
      String(row[29] || "")

  };

}


/*******************************************************
 * 工程進度異動紀錄
 *******************************************************/
function appendProgressAudit_(
  info
) {

  var sheet =
    getProgressSheet_(
      "工程進度異動紀錄"
    );

  sheet.appendRow([

    createId_(
      "PRA"
    ),
    info.progressId || "",
    info.siteId || "",
    info.locationId || "",
    info.itemCode || "",
    info.changeType || "",
    info.beforePercent,
    info.afterPercent,
    info.beforeStatus || "",
    info.afterStatus || "",
    info.beforeQty,
    info.afterQty,
    info.beforeStart || "",
    info.afterStart || "",
    info.beforeEnd || "",
    info.afterEnd || "",
    info.reason || "",
    info.sourceReportId || "",
    info.operator
      ? info.operator.employeeId
      : "",
    info.operator
      ? info.operator.name
      : "",
    new Date(),
    info.note || ""

  ]);

}


/*******************************************************
 * 取得工作表
 *******************************************************/
function getProgressSheet_(
  name
) {

  var sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(
        name
      );

  if (!sheet) {

    throw new Error(
      "找不到「" +
      name +
      "」"
    );

  }

  return sheet;

}


/*******************************************************
 * 百分比 -> 進度狀態
 *******************************************************/
function getProgressStatusFromPercent_(
  percent
) {

  var p =
    Number(
      percent || 0
    );

  if (
    p >= 100
  ) {

    return "已完成";

  }

  if (
    p > 0
  ) {

    return "施工中";

  }

  return "未開始";

}


/*******************************************************
 * 數字轉換
 *******************************************************/
function parseProgressNumber_(
  value,
  fallback
) {

  if (
    value === "" ||
    value === null ||
    typeof value === "undefined"
  ) {

    return Number(
      fallback || 0
    );

  }

  var number =
    Number(
      value
    );

  if (
    isNaN(number)
  ) {

    throw new Error(
      "工程進度數值格式錯誤"
    );

  }

  return number;

}


/*******************************************************
 * 清理文字
 *******************************************************/
function cleanProgressText_(
  value
) {

  if (
    value === null ||
    typeof value === "undefined"
  ) {

    return "";

  }

  return String(
    value
  ).trim();

}


/*******************************************************
 * 產生工程項目代碼
 *******************************************************/
function createProgressItemCode_(
  category
) {

  var prefix =
    String(
      category || "ITEM"
    )
      .replace(
        /\s+/g,
        ""
      )
      .substring(
        0,
        4
      )
      .toUpperCase();

  if (
    prefix === ""
  ) {

    prefix =
      "ITEM";

  }

  return (
    prefix +
    "-" +
    Utilities
      .getUuid()
      .replace(
        /-/g,
        ""
      )
      .substring(
        0,
        8
      )
      .toUpperCase()
  );

}

// LINE / LIFF 初始化與 bootstrap
// 畫面載入
    // ==========================================

    window.onload = async function () {

      setButtons(false);

      document
        .getElementById("siteSelect")
        .disabled =
        true;

      document
        .getElementById("locationBtn")
        .disabled =
        true;


      try {

        showStatus(
          "正在初始化 LINE...",
          "normal"
        );


        if (
          typeof liff ===
          "undefined"
        ) {

          throw new Error(
            "LIFF SDK 載入失敗"
          );

        }


        // ======================================
        // LIFF 初始化
        // ======================================

        await liff.init({

          liffId: LIFF_ID

        });


        // ======================================
        // 必須由 LINE App 開啟
        // ======================================

        if (!liff.isInClient()) {

          throw new Error(
            "請從 LINE App 開啟打卡系統"
          );

        }


        // ======================================
        // 登入
        // ======================================

        if (!liff.isLoggedIn()) {

          liff.login();

          return;

        }


        showStatus(
          "正在取得 LINE 身分...",
          "normal"
        );


        // ======================================
        // LINE Profile
        // ======================================

        const profile =
          await liff.getProfile();


        userId =
          profile.userId;


        userName =
          profile.displayName;


        document
          .getElementById(
            "displayName"
          )
          .innerText =
          userName +
          "，辛苦了！";


        if (profile.pictureUrl) {

          const picture =
            document.getElementById(
              "pictureUrl"
            );


          picture.src =
            profile.pictureUrl;


          picture.style.display =
            "block";

        }


        // ======================================
        // 從 GAS V2 讀取員工 + 工地
        // ======================================

        showStatus(
          "正在讀取員工與工地資料...",
          "normal"
        );


        const result =
          await callApi({

            action:
              "bootstrap",

            userId:
              userId

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "無法讀取系統資料"
          );

        }


        employee =
          result.employee;


        sites =
          result.sites || [];


        settings =
          result.settings || {};


        // ======================================
        // 管理權限入口
        // ======================================

        updateAdminEntry();


        // ======================================
        // 顯示員工資料
        // ======================================

        document
          .getElementById(
            "employeeInfo"
          )
          .innerText =
          (
            employee.grade ||
            "未設定級職"
          ) +
          " ｜ " +
          (
            employee.permission ||
            "未設定權限"
          );


        // ======================================
        // 工地選單
        // ======================================

        renderSites();

        renderDailyReportSites();

        setDefaultDailyReportDate();


        if (
          sites.length === 0
        ) {

          throw new Error(
            "目前沒有施工中的工地"
          );

        }


        document
          .getElementById(
            "siteSelect"
          )
          .disabled =
          false;


        document
          .getElementById(
            "locationBtn"
          )
          .disabled =
          false;


        showStatus(
          "✅ 身分確認成功，正在取得 GPS...",
          "success"
        );


        // ======================================
        // 自動取得 GPS
        // ======================================

        await refreshLocation();


      } catch (error) {

        console.error(error);


        document
          .getElementById(
            "displayName"
          )
          .innerText =
          "⚠️ 無法使用打卡系統";


        showStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


        setButtons(false);

      }

    };


    // ==========================================

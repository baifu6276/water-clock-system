// 系統設定
    // ==========================================

    const LIFF_ID =
      "2011467618-lNiVqxsV";


    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbzrmID3lIBP2bxM_qC4nLiEOBEcROB3sFRH9eZsHt--A6o4VZpvuf63pzW0ku4j-TTd0w/exec";


    // ==========================================

    // 每日回報 → 工程進度串接採獨立模組，避免改寫既有每日回報核心。
    window.addEventListener(
      "load",
      function() {
        if (document.querySelector('script[data-daily-report-progress-link="1"]')) {
          return;
        }

        const script = document.createElement("script");
        script.src = "js/daily-report-progress-link.js";
        script.dataset.dailyReportProgressLink = "1";
        script.async = false;
        script.addEventListener(
          "error",
          function() {
            console.error("每日回報工程進度串接模組載入失敗");
          },
          { once: true }
        );
        document.head.appendChild(script);
      },
      { once: true }
    );

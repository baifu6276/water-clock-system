// 系統共用狀態與工具
// 系統資料
    // ==========================================

    let userId = "";

    let userName = "";

    let employee = null;

    let sites = [];

    let settings = {};

    let currentPosition = null;

    let currentDistance = null;

    let gpsAllowed = false;

    let sending = false;


    // ==========================================

// 防止 HTML 注入
    // ==========================================

    function escapeHtml(
      text
    ) {

      return String(
        text ??
        ""
      )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&#039;"
      );

    }

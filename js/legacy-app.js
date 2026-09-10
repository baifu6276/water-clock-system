// ==========================================
    // 系統設定
    // ==========================================

    const LIFF_ID =
      "2011467618-lNiVqxsV";


    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbzrmID3lIBP2bxM_qC4nLiEOBEcROB3sFRH9eZsHt--A6o4VZpvuf63pzW0ku4j-TTd0w/exec";


    // ==========================================
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
    // 顯示工地
    // ==========================================

    function renderSites() {

      const select =
        document.getElementById(
          "siteSelect"
        );


      select.innerHTML =
        "";


      sites.forEach(
        function (site) {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            site.siteId;


          option.innerText =
            site.name;


          select.appendChild(
            option
          );

        }
      );


      select.onchange =
        function () {

          updateGpsDisplay();

        };

    }


    // ==========================================
    // 取得目前選擇工地
    // ==========================================

    function getSelectedSite() {

      const siteId =
        document
          .getElementById(
            "siteSelect"
          )
          .value;


      return sites.find(
        function (site) {

          return (
            String(
              site.siteId
            ) ===
            String(
              siteId
            )
          );

        }
      );

    }


    // ==========================================
    // 重新取得 GPS
    // ==========================================

    function refreshLocation() {

      return new Promise(
        function (
          resolve,
          reject
        ) {

          currentPosition =
            null;

          currentDistance =
            null;

          gpsAllowed =
            false;


          setButtons(false);


          document
            .getElementById(
              "gpsBox"
            )
            .innerHTML =
            `
              <div class="gps-title">
                📡 正在取得目前位置...
              </div>
            `;


          if (
            !navigator.geolocation
          ) {

            showGpsError(
              "此裝置不支援 GPS 定位"
            );

            reject(
              new Error(
                "此裝置不支援 GPS 定位"
              )
            );

            return;

          }


          navigator
            .geolocation
            .getCurrentPosition(

              function (
                position
              ) {

                currentPosition = {

                  lat:
                    position.coords.latitude,

                  lng:
                    position.coords.longitude,

                  accuracy:
                    position.coords.accuracy

                };


                updateGpsDisplay();


                resolve();

              },


              function (
                error
              ) {

                console.error(
                  "GPS Error",
                  error
                );


                let message =
                  "無法取得 GPS 定位";


                if (
                  error.code ===
                  1
                ) {

                  message =
                    "定位權限被拒絕，請允許 LINE 使用定位";

                }


                if (
                  error.code ===
                  2
                ) {

                  message =
                    "目前無法取得定位，請到戶外或稍後再試";

                }


                if (
                  error.code ===
                  3
                ) {

                  message =
                    "取得定位逾時，請再試一次";

                }


                showGpsError(
                  message
                );


                reject(
                  new Error(
                    message
                  )
                );

              },


              {

                enableHighAccuracy:
                  true,

                timeout:
                  15000,

                maximumAge:
                  0

              }

            );

        }
      );

    }


    // ==========================================
    // GPS 顯示
    // ==========================================

    function updateGpsDisplay() {

      const site =
        getSelectedSite();


      if (
        !site ||
        !currentPosition
      ) {

        setButtons(false);

        return;

      }


      const siteLat =
        Number(
          site.lat
        );


      const siteLng =
        Number(
          site.lng
        );


      if (
        isNaN(siteLat) ||
        isNaN(siteLng)
      ) {

        showGpsError(
          "這個工地尚未設定 GPS"
        );

        return;

      }


      currentDistance =
        Math.round(
          calculateDistance(
            currentPosition.lat,
            currentPosition.lng,
            siteLat,
            siteLng
          )
        );


      const radius =
        Number(
          site.radius ||
          settings.gpsRadius ||
          100
        );


      gpsAllowed =
        currentDistance <=
        radius;


      let statusHtml =
        "";


      if (gpsAllowed) {

        statusHtml =
          `
            <div class="gps-ok">
              ✅ 位於打卡範圍內
            </div>
          `;

      } else {

        const mode =
          String(
            settings.gpsMode ||
            "BLOCK"
          )
          .toUpperCase();


        if (
          mode ===
          "ALLOW_WITH_FLAG"
        ) {

          statusHtml =
            `
              <div class="gps-warn">
                ⚠️ 已超出工地範圍，
                系統目前允許異常打卡
              </div>
            `;

        } else {

          statusHtml =
            `
              <div class="gps-error">
                ❌ 已超出工地打卡範圍
              </div>
            `;

        }

      }


      document
        .getElementById(
          "gpsBox"
        )
        .innerHTML =
        `

          <div class="gps-title">
            📍 ${escapeHtml(
              site.name
            )}
          </div>

          <div>
            目前距離工地：
            <b>
              ${currentDistance}
              公尺
            </b>
          </div>

          <div>
            允許範圍：
            <b>
              ${radius}
              公尺
            </b>
          </div>

          <div>
            GPS 精度：
            約 ±${Math.round(
              currentPosition
                .accuracy
            )} 公尺
          </div>

          ${statusHtml}

        `;


      updateButtons();

    }


    // ==========================================
    // GPS 錯誤
    // ==========================================

    function showGpsError(
      message
    ) {

      gpsAllowed =
        false;


      document
        .getElementById(
          "gpsBox"
        )
        .innerHTML =
        `
          <div class="gps-error">
            ❌
            ${escapeHtml(
              message
            )}
          </div>
        `;


      setButtons(false);

    }


    // ==========================================
    // 打卡
    // ==========================================

    function checkIn(
      type
    ) {

      if (sending) {

        return;

      }


      if (!userId) {

        showStatus(
          "❌ 尚未取得 LINE 身分",
          "error"
        );

        return;

      }


      const site =
        getSelectedSite();


      if (!site) {

        showStatus(
          "❌ 請先選擇工地",
          "error"
        );

        return;

      }


      if (!currentPosition) {

        showStatus(
          "❌ 尚未取得 GPS 定位",
          "error"
        );

        return;

      }


      const mode =
        String(
          settings.gpsMode ||
          "BLOCK"
        )
        .toUpperCase();


      if (
        !gpsAllowed &&
        mode ===
        "BLOCK"
      ) {

        showStatus(
          "❌ 目前不在允許打卡範圍內",
          "error"
        );

        return;

      }


      let workContent =
        document
          .getElementById(
            "workContent"
          )
          .value
          .trim();


      if (!workContent) {

        workContent =
          "未填寫";

      }


      sending =
        true;


      setButtons(false);


      showStatus(
        "⏳ 正在處理" +
        type +
        "打卡...",
        "normal"
      );


      const data = {

        action:
          "clock",

        userId:
          userId,

        siteId:
          site.siteId,

        type:
          type,

        lat:
          currentPosition.lat,

        lng:
          currentPosition.lng,

        workContent:
          workContent

      };


      sendToGoogle(
        data,
        type,
        site
      );

    }


    // ==========================================
    // 傳送到 GAS
    // ==========================================

    async function sendToGoogle(
      data,
      type,
      site
    ) {

      try {

        const result =
          await callApi(
            data
          );


        if (!result.success) {

          throw new Error(
            result.message ||
            "打卡失敗"
          );

        }


        let message =
          "✅ " +
          (
            result.message ||
            type +
            "打卡成功"
          );


        message +=
          "\n\n工地：" +
          (
            result.siteName ||
            site.name
          );


        if (
          result.distance !==
          undefined
        ) {

          message +=
            "\n距離：" +
            result.distance +
            " 公尺";

        }


        if (
          type ===
          "下班" &&
          result.workHours !==
          undefined
        ) {

          message +=
            "\n本段工時：" +
            result.workHours +
            " 小時";

        }


        showStatus(
          message,
          "success"
        );


        document
          .getElementById(
            "workContent"
          )
          .value =
          "";


        // 成功後重新取得位置
        try {

          await refreshLocation();

        } catch (
          gpsError
        ) {

          console.error(
            gpsError
          );

        }


      } catch (error) {

        console.error(
          "傳送錯誤",
          error
        );


        showStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        sending =
          false;


        updateButtons();

      }

    }


    // ==========================================
    // 呼叫 GAS API
    // ==========================================

    async function callApi(
      data
    ) {

      const response =
        await fetch(
          GAS_URL,
          {

            method:
              "POST",

            headers: {

              "Content-Type":
                "text/plain;charset=utf-8"

            },

            body:
              JSON.stringify(
                data
              ),

            redirect:
              "follow"

          }
        );


      if (!response.ok) {

        throw new Error(
          "伺服器連線失敗"
        );

      }


      const text =
        await response.text();


      try {

        return JSON.parse(
          text
        );

      } catch (error) {

        console.error(
          "API 原始回覆：",
          text
        );


        throw new Error(
          "伺服器回傳格式錯誤"
        );

      }

    }



    // ==========================================
    // 每日回報 V1.1 - 多工作項目
    // ==========================================

    let dailyReportItemCounter = 0;

    let dailyReportEditingReportId = "";

    let dailyReportEditingOriginal = null;


    function setDefaultDailyReportDate() {

      const input =
        document.getElementById(
          "dailyReportDate"
        );


      if (
        !input ||
        input.value
      ) {

        return;

      }


      const now =
        new Date();


      const year =
        now.getFullYear();


      const month =
        String(
          now.getMonth() + 1
        )
        .padStart(
          2,
          "0"
        );


      const day =
        String(
          now.getDate()
        )
        .padStart(
          2,
          "0"
        );


      input.value =
        year +
        "-" +
        month +
        "-" +
        day;


      ensureDailyReportFirstItem();

    }


    function renderDailyReportSites() {

      const select =
        document.getElementById(
          "dailyReportSite"
        );


      if (!select) {

        return;

      }


      select.innerHTML =
        "";


      sites.forEach(
        function(site) {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            site.siteId;


          option.innerText =
            site.name;


          select.appendChild(
            option
          );

        }
      );


      const clockSite =
        document.getElementById(
          "siteSelect"
        );


      if (
        clockSite &&
        clockSite.value
      ) {

        select.value =
          clockSite.value;

      }


      ensureDailyReportFirstItem();

    }


    function ensureDailyReportFirstItem() {

      const wrap =
        document.getElementById(
          "dailyReportItems"
        );


      if (
        !wrap ||
        wrap.children.length > 0
      ) {

        return;

      }


      addDailyReportItem();

    }


    function addDailyReportItem(
      preset = {}
    ) {

      const wrap =
        document.getElementById(
          "dailyReportItems"
        );


      if (!wrap) {

        return;

      }


      if (
        wrap.children.length >= 20
      ) {

        showDailyReportStatus(
          "❌ 一次最多新增20個工作項目",
          "error"
        );

        return;

      }


      dailyReportItemCounter++;


      const id =
        dailyReportItemCounter;


      const card =
        document.createElement(
          "div"
        );


      card.className =
        "daily-report-item-editor";


      card.dataset.itemId =
        String(
          id
        );


      card.innerHTML =
        `
          <div class="daily-report-item-header">
            <div class="daily-report-item-title">
              工作項目 ${wrap.children.length + 1}
            </div>

            <button
              type="button"
              class="btn-report-remove"
              onclick="removeDailyReportItem(this)"
            >
              移除此項
            </button>
          </div>

          <div class="daily-report-grid">

            <div class="daily-report-field">
              <label>
                工程類別 *
              </label>
              <select
                class="dr-category"
              >
                <option value="">請選擇</option>
                <option value="給水">給水</option>
                <option value="排水">排水</option>
                <option value="消防">消防</option>
                <option value="電氣">電氣</option>
                <option value="弱電">弱電</option>
                <option value="其他">其他</option>
              </select>
            </div>

            <div class="daily-report-field">
              <label>
                工作項目 *
              </label>
              <input
                class="dr-work-item"
                type="text"
                placeholder="例如：冷熱水配管"
              >
            </div>

          </div>

          <div class="daily-report-field">
            <label>
              今日完成內容 *
            </label>
            <textarea
              class="dr-completed"
              placeholder="例如：完成浴室及廚房給水配管"
            ></textarea>
          </div>

          <div class="daily-report-grid">

            <div class="daily-report-field">
              <label>
                今日完成數量
              </label>
              <input
                class="dr-quantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="例如：1"
              >
            </div>

            <div class="daily-report-field">
              <label>
                單位
              </label>
              <input
                class="dr-quantity-unit"
                type="text"
                placeholder="例如：戶、處、米"
              >
            </div>

            <div class="daily-report-field">
              <label>
                進度百分比
              </label>
              <input
                class="dr-progress"
                type="number"
                min="0"
                max="100"
                step="1"
                placeholder="0～100"
              >
            </div>

            <div class="daily-report-field">
              <label>
                是否需協助
              </label>
              <select
                class="dr-need-help"
                onchange="updateDailyReportItemHelp(this)"
              >
                <option value="否">否</option>
                <option value="是">是</option>
              </select>
            </div>

          </div>

          <div class="daily-report-field">
            <label>
              異常／問題
            </label>
            <textarea
              class="dr-issue"
              placeholder="沒有問題可留白"
            ></textarea>
          </div>

          <div
            class="daily-report-field dr-help-wrap"
            style="display:none;"
          >
            <label>
              協助內容 *
            </label>
            <textarea
              class="dr-help-content"
              placeholder="請說明需要什麼協助"
            ></textarea>
          </div>
        `;


      wrap.appendChild(
        card
      );


      if (preset.category) {
        card.querySelector(".dr-category").value = preset.category;
      }

      if (preset.workItem) {
        card.querySelector(".dr-work-item").value = preset.workItem;
      }

      if (preset.completedContent) {
        card.querySelector(".dr-completed").value = preset.completedContent;
      }

      refreshDailyReportItemTitles();

    }


    function removeDailyReportItem(
      button
    ) {

      const wrap =
        document.getElementById(
          "dailyReportItems"
        );


      if (
        !wrap ||
        wrap.children.length <= 1
      ) {

        showDailyReportStatus(
          "❌ 至少要保留一個工作項目",
          "error"
        );

        return;

      }


      const card =
        button.closest(
          ".daily-report-item-editor"
        );


      if (card) {

        card.remove();

      }


      refreshDailyReportItemTitles();

    }


    function refreshDailyReportItemTitles() {

      const cards =
        document.querySelectorAll(
          "#dailyReportItems .daily-report-item-editor"
        );


      cards.forEach(
        function(card, index) {

          const title =
            card.querySelector(
              ".daily-report-item-title"
            );


          if (title) {

            title.innerText =
              "工作項目 " +
              (index + 1);

          }

        }
      );

    }


    function updateDailyReportItemHelp(
      select
    ) {

      const card =
        select.closest(
          ".daily-report-item-editor"
        );


      if (!card) {

        return;

      }


      const wrap =
        card.querySelector(
          ".dr-help-wrap"
        );


      if (wrap) {

        wrap.style.display =
          select.value === "是"
            ? "block"
            : "none";

      }

    }


    function collectDailyReportItems() {

      const cards =
        Array.from(
          document.querySelectorAll(
            "#dailyReportItems .daily-report-item-editor"
          )
        );


      return cards.map(
        function(card, index) {

          const category =
            card.querySelector(
              ".dr-category"
            ).value;


          const workItem =
            card.querySelector(
              ".dr-work-item"
            ).value.trim();


          const completedContent =
            card.querySelector(
              ".dr-completed"
            ).value.trim();


          const quantity =
            card.querySelector(
              ".dr-quantity"
            ).value;


          const quantityUnit =
            card.querySelector(
              ".dr-quantity-unit"
            ).value.trim();


          const progress =
            card.querySelector(
              ".dr-progress"
            ).value;


          const issue =
            card.querySelector(
              ".dr-issue"
            ).value.trim();


          const needHelp =
            card.querySelector(
              ".dr-need-help"
            ).value;


          const helpContent =
            card.querySelector(
              ".dr-help-content"
            ).value.trim();


          if (!category) {
            throw new Error(
              "工作項目 " +
              (index + 1) +
              "：請選擇工程類別"
            );
          }


          if (!workItem) {
            throw new Error(
              "工作項目 " +
              (index + 1) +
              "：請填寫工作項目"
            );
          }


          if (!completedContent) {
            throw new Error(
              "工作項目 " +
              (index + 1) +
              "：請填寫今日完成內容"
            );
          }


          if (
            progress !== "" &&
            (
              Number(progress) < 0 ||
              Number(progress) > 100
            )
          ) {
            throw new Error(
              "工作項目 " +
              (index + 1) +
              "：進度百分比必須介於0～100"
            );
          }


          if (
            needHelp === "是" &&
            !helpContent
          ) {
            throw new Error(
              "工作項目 " +
              (index + 1) +
              "：需要協助時請填寫協助內容"
            );
          }


          return {
            category,
            workItem,
            completedContent,
            quantity,
            quantityUnit,
            progress,
            issue,
            needHelp,
            helpContent
          };

        }
      );

    }


    async function submitDailyReportBatch() {

      const date =
        document
          .getElementById(
            "dailyReportDate"
          )
          .value;


      const siteId =
        document
          .getElementById(
            "dailyReportSite"
          )
          .value;


      if (!date) {

        showDailyReportStatus(
          "❌ 請選擇回報日期",
          "error"
        );

        return;

      }


      if (!siteId) {

        showDailyReportStatus(
          "❌ 請選擇工地",
          "error"
        );

        return;

      }


      let items;


      try {

        items =
          collectDailyReportItems();

      } catch (error) {

        showDailyReportStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );

        return;

      }


      if (
        items.length === 0
      ) {

        showDailyReportStatus(
          "❌ 請至少新增一個工作項目",
          "error"
        );

        return;

      }


      const button =
        document.getElementById(
          "dailyReportSubmitButton"
        );


      button.disabled =
        true;


      const isEditingReturned =
        dailyReportEditingReportId !== "";


      if (
        isEditingReturned &&
        items.length !== 1
      ) {

        showDailyReportStatus(
          "❌ 修改退回回報時只能保留1個工作項目",
          "error"
        );

        button.disabled =
          false;

        return;

      }


      showDailyReportStatus(
        isEditingReturned
          ? "⏳ 正在重新提交修正後的每日回報..."
          : (
              "⏳ 正在一次提交 " +
              items.length +
              " 個工作項目..."
            ),
        "normal"
      );


      try {

        const payload =
          isEditingReturned
            ? {

                action:
                  "dailyReportUpdateReturned",

                userId:
                  userId,

                reportId:
                  dailyReportEditingReportId,

                workArea:
                  document
                    .getElementById(
                      "dailyReportArea"
                    )
                    .value
                    .trim(),

                floor:
                  document
                    .getElementById(
                      "dailyReportFloor"
                    )
                    .value
                    .trim(),

                unit:
                  document
                    .getElementById(
                      "dailyReportUnit"
                    )
                    .value
                    .trim(),

                tomorrowPlan:
                  document
                    .getElementById(
                      "dailyReportTomorrow"
                    )
                    .value
                    .trim(),

                category:
                  items[0].category,

                workItem:
                  items[0].workItem,

                completedContent:
                  items[0].completedContent,

                quantity:
                  items[0].quantity,

                quantityUnit:
                  items[0].quantityUnit,

                progress:
                  items[0].progress,

                issue:
                  items[0].issue,

                needHelp:
                  items[0].needHelp,

                helpContent:
                  items[0].helpContent

              }
            : {

                action:
                  "dailyReportCreateBatch",

                userId:
                  userId,

                date:
                  date,

                siteId:
                  siteId,

                workArea:
                  document
                    .getElementById(
                      "dailyReportArea"
                    )
                    .value
                    .trim(),

                floor:
                  document
                    .getElementById(
                      "dailyReportFloor"
                    )
                    .value
                    .trim(),

                unit:
                  document
                    .getElementById(
                      "dailyReportUnit"
                    )
                    .value
                    .trim(),

                tomorrowPlan:
                  document
                    .getElementById(
                      "dailyReportTomorrow"
                    )
                    .value
                    .trim(),

                items:
                  items

              };


        const result =
          await callApi(
            payload
          );


        if (!result.success) {

          throw new Error(
            result.message ||
            "每日回報提交失敗"
          );

        }


        showDailyReportStatus(
          "✅ " +
          (
            result.message ||
            "每日回報已提交"
          ),
          "success"
        );


        if (
          isEditingReturned
        ) {

          finishReturnedDailyReportEdit();

        } else {

          resetDailyReportItemsAfterSubmit();

        }


        await loadOwnDailyReports(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showDailyReportStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        button.disabled =
          false;

      }

    }


    async function loadOwnDailyReports(
      showLoading = true
    ) {

      const date =
        document
          .getElementById(
            "dailyReportDate"
          )
          .value;


      const list =
        document.getElementById(
          "dailyReportList"
        );


      const button =
        document.getElementById(
          "dailyReportListButton"
        );


      button.disabled =
        true;


      if (showLoading) {

        showDailyReportStatus(
          "⏳ 正在讀取當日回報...",
          "normal"
        );

      }


      try {

        const result =
          await callApi({

            action:
              "dailyReportListOwn",

            userId:
              userId,

            date:
              date

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "讀取每日回報失敗"
          );

        }


        renderOwnDailyReports(
          result.reports || []
        );


        if (showLoading) {

          showDailyReportStatus(
            "✅ 已讀取 " +
            (
              result.reports || []
            ).length +
            " 筆當日回報",
            "success"
          );

        }


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          "";


        showDailyReportStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        button.disabled =
          false;

      }

    }


    function renderOwnDailyReports(
      reports
    ) {

      const list =
        document.getElementById(
          "dailyReportList"
        );


      if (
        !reports ||
        reports.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              當日尚未提交每日回報
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      reports.forEach(
        function(item) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "daily-report-card";


          const locationText =
            [
              item.workArea,
              item.floor,
              item.unit
            ]
            .filter(
              Boolean
            )
            .join(
              " / "
            ) ||
            "未填";


          const quantityText =
            item.quantity === "" ||
            item.quantity === null ||
            item.quantity === undefined
              ? "未填"
              : (
                  item.quantity +
                  (
                    item.quantityUnit
                      ? " " +
                        item.quantityUnit
                      : ""
                  )
                );


          const progressText =
            item.progress === "" ||
            item.progress === null ||
            item.progress === undefined
              ? "未填"
              : item.progress + "%";


          card.innerHTML =
            `
              <div class="daily-report-card-title">
                ${escapeHtml(
                  item.siteName || ""
                )}
                ｜${escapeHtml(
                  item.category || ""
                )}
              </div>

              <div>
                日期：
                ${escapeHtml(
                  item.date || ""
                )}
              </div>

              <div>
                工作位置：
                ${escapeHtml(
                  locationText
                )}
              </div>

              <div>
                工作項目：
                ${escapeHtml(
                  item.workItem || ""
                )}
              </div>

              <div>
                今日完成：
                ${escapeHtml(
                  item.completedContent || ""
                )}
              </div>

              <div>
                完成數量：
                ${escapeHtml(
                  String(
                    quantityText
                  )
                )}
              </div>

              <div>
                進度：
                ${escapeHtml(
                  String(
                    progressText
                  )
                )}
              </div>

              <div>
                異常／問題：
                ${escapeHtml(
                  item.issue || "無"
                )}
              </div>

              <div>
                是否需協助：
                ${escapeHtml(
                  item.needHelp || "否"
                )}
              </div>

              ${
                item.needHelp === "是"
                  ? `
                    <div>
                      協助內容：
                      ${escapeHtml(
                        item.helpContent || ""
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                回報狀態：
                <b>
                  ${escapeHtml(
                    item.status || ""
                  )}
                </b>
              </div>

              ${
                item.status === "退回修正"
                  ? `
                    <div class="returned-note">
                      退回原因：
                      ${escapeHtml(
                        item.reviewNote || "未填寫"
                      )}
                    </div>

                    <button
                      class="btn-report-edit-returned"
                      onclick='startReturnedDailyReportEdit(
                        ${JSON.stringify(item).replace(/'/g, "&#39;")}
                      )'
                    >
                      修改並重新提交
                    </button>
                  `
                  : ""
              }

              ${
                item.status === "已確認" &&
                item.reviewerName
                  ? `
                    <div>
                      審核人：
                      ${escapeHtml(
                        item.reviewerName
                      )}
                    </div>
                  `
                  : ""
              }

              <div>
                回報時間：
                ${escapeHtml(
                  item.reportedAt || ""
                )}
              </div>
            `;


          list.appendChild(
            card
          );

        }
      );

    }



    function startReturnedDailyReportEdit(
      item
    ) {

      dailyReportEditingReportId =
        item.reportId || "";


      dailyReportEditingOriginal =
        item;


      const dateInput =
        document.getElementById(
          "dailyReportDate"
        );


      const siteSelect =
        document.getElementById(
          "dailyReportSite"
        );


      dateInput.value =
        item.date || "";


      siteSelect.value =
        item.siteId || "";


      dateInput.disabled =
        true;


      siteSelect.disabled =
        true;


      document
        .getElementById(
          "dailyReportArea"
        )
        .value =
        item.workArea || "";


      document
        .getElementById(
          "dailyReportFloor"
        )
        .value =
        item.floor || "";


      document
        .getElementById(
          "dailyReportUnit"
        )
        .value =
        item.unit || "";


      document
        .getElementById(
          "dailyReportTomorrow"
        )
        .value =
        item.tomorrowPlan || "";


      const wrap =
        document.getElementById(
          "dailyReportItems"
        );


      wrap.innerHTML =
        "";


      dailyReportItemCounter =
        0;


      addDailyReportItem();


      const card =
        wrap.querySelector(
          ".daily-report-item-editor"
        );


      card.querySelector(
        ".dr-category"
      ).value =
        item.category || "";


      card.querySelector(
        ".dr-work-item"
      ).value =
        item.workItem || "";


      card.querySelector(
        ".dr-completed"
      ).value =
        item.completedContent || "";


      card.querySelector(
        ".dr-quantity"
      ).value =
        item.quantity === "" ||
        item.quantity === null ||
        item.quantity === undefined
          ? ""
          : item.quantity;


      card.querySelector(
        ".dr-quantity-unit"
      ).value =
        item.quantityUnit || "";


      card.querySelector(
        ".dr-progress"
      ).value =
        item.progress === "" ||
        item.progress === null ||
        item.progress === undefined
          ? ""
          : item.progress;


      card.querySelector(
        ".dr-issue"
      ).value =
        item.issue || "";


      card.querySelector(
        ".dr-need-help"
      ).value =
        item.needHelp || "否";


      card.querySelector(
        ".dr-help-content"
      ).value =
        item.helpContent || "";


      updateDailyReportItemHelp(
        card.querySelector(
          ".dr-need-help"
        )
      );


      document
        .getElementById(
          "dailyReportAddItemButton"
        )
        .style.display =
        "none";


      const submitButton =
        document.getElementById(
          "dailyReportSubmitButton"
        );


      submitButton.innerText =
        "重新提交修正";


      document
        .getElementById(
          "dailyReportCancelEditButton"
        )
        .style.display =
        "block";


      const banner =
        document.getElementById(
          "dailyReportEditingBanner"
        );


      banner.style.display =
        "block";


      banner.innerText =
        "目前正在修改被退回的回報\n退回原因：" +
        (
          item.reviewNote ||
          "未填寫"
        );


      showDailyReportStatus(
        "✏️ 已載入退回內容，修改完成後按「重新提交修正」",
        "normal"
      );


      document
        .getElementById(
          "dailyReportSection"
        )
        .scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

    }


    function cancelReturnedDailyReportEdit() {

      finishReturnedDailyReportEdit();


      showDailyReportStatus(
        "已取消修改退回回報",
        "normal"
      );

    }


    function finishReturnedDailyReportEdit() {

      dailyReportEditingReportId =
        "";


      dailyReportEditingOriginal =
        null;


      const dateInput =
        document.getElementById(
          "dailyReportDate"
        );


      const siteSelect =
        document.getElementById(
          "dailyReportSite"
        );


      dateInput.disabled =
        false;


      siteSelect.disabled =
        false;


      document
        .getElementById(
          "dailyReportArea"
        )
        .value =
        "";


      document
        .getElementById(
          "dailyReportFloor"
        )
        .value =
        "";


      document
        .getElementById(
          "dailyReportUnit"
        )
        .value =
        "";


      document
        .getElementById(
          "dailyReportTomorrow"
        )
        .value =
        "";


      document
        .getElementById(
          "dailyReportAddItemButton"
        )
        .style.display =
        "block";


      document
        .getElementById(
          "dailyReportSubmitButton"
        )
        .innerText =
        "一次提交全部工作項目";


      document
        .getElementById(
          "dailyReportCancelEditButton"
        )
        .style.display =
        "none";


      const banner =
        document.getElementById(
          "dailyReportEditingBanner"
        );


      banner.style.display =
        "none";


      banner.innerText =
        "";


      resetDailyReportItemsAfterSubmit();

    }


    function resetDailyReportItemsAfterSubmit() {

      const wrap =
        document.getElementById(
          "dailyReportItems"
        );


      if (wrap) {

        wrap.innerHTML =
          "";

      }


      dailyReportItemCounter =
        0;


      addDailyReportItem();

    }


    function showDailyReportStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "dailyReportStatusMsg"
        );


      if (!el) {

        return;

      }


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }


    // ==========================================
    // 每日回報審核 V1
    // ==========================================

    function setDefaultDailyReportReviewDate() {

      const input =
        document.getElementById(
          "dailyReportReviewDate"
        );


      if (
        !input ||
        input.value
      ) {

        return;

      }


      const now =
        new Date();


      input.value =
        now.getFullYear() +
        "-" +
        String(
          now.getMonth() + 1
        ).padStart(
          2,
          "0"
        ) +
        "-" +
        String(
          now.getDate()
        ).padStart(
          2,
          "0"
        );

    }


    function renderDailyReportReviewSites() {

      const select =
        document.getElementById(
          "dailyReportReviewSite"
        );


      if (!select) {

        return;

      }


      select.innerHTML =
        `
          <option value="">
            全部可管理工地
          </option>
        `;


      const permission =
        String(
          employee?.permission || ""
        )
        .trim()
        .toUpperCase();


      sites.forEach(
        function(site) {

          if (
            permission === "SITE_MANAGER" &&
            String(
              site.foremanId || ""
            ).trim() !==
            String(
              employee.employeeId || ""
            ).trim()
          ) {

            return;

          }


          const option =
            document.createElement(
              "option"
            );


          option.value =
            site.siteId;


          option.innerText =
            site.name;


          select.appendChild(
            option
          );

        }
      );

    }


    async function loadDailyReportReviews(
      showLoading = true
    ) {

      const date =
        document
          .getElementById(
            "dailyReportReviewDate"
          )
          .value;


      const siteId =
        document
          .getElementById(
            "dailyReportReviewSite"
          )
          .value;


      const list =
        document.getElementById(
          "dailyReportReviewList"
        );


      if (!date) {

        showDailyReportReviewStatus(
          "❌ 請先選擇日期",
          "error"
        );

        return;

      }


      const button =
        document.getElementById(
          "dailyReportReviewListButton"
        );


      button.disabled =
        true;


      if (showLoading) {

        showDailyReportReviewStatus(
          "⏳ 正在讀取每日回報...",
          "normal"
        );

      }


      try {

        const result =
          await callApi({

            action:
              "adminDailyReportReviewList",

            userId:
              userId,

            date:
              date,

            siteId:
              siteId

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "讀取每日回報失敗"
          );

        }


        renderDailyReportReviewList(
          result.reports || []
        );


        if (showLoading) {

          showDailyReportReviewStatus(
            "✅ 已讀取 " +
            (
              result.reports || []
            ).length +
            " 筆每日回報",
            "success"
          );

        }


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          "";


        showDailyReportReviewStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        button.disabled =
          false;

      }

    }


    function renderDailyReportReviewList(
      reports
    ) {

      const list =
        document.getElementById(
          "dailyReportReviewList"
        );


      if (
        !reports ||
        reports.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              此日期沒有可管理的每日回報
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      reports.forEach(
        function(item, index) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "daily-report-review-card";


          const noteId =
            "dailyReportReviewNote_" +
            index;


          const actionable =
            item.status === "已提交";


          const locationText =
            [
              item.workArea,
              item.floor,
              item.unit
            ]
            .filter(
              Boolean
            )
            .join(
              " / "
            ) ||
            "未填";


          const quantityText =
            item.quantity === "" ||
            item.quantity === null ||
            item.quantity === undefined
              ? "未填"
              : (
                  item.quantity +
                  (
                    item.quantityUnit
                      ? " " +
                        item.quantityUnit
                      : ""
                  )
                );


          const progressText =
            item.progress === "" ||
            item.progress === null ||
            item.progress === undefined
              ? "未填"
              : item.progress + "%";


          card.innerHTML =
            `
              <div class="daily-report-card-title">
                ${escapeHtml(
                  item.siteName || ""
                )}
                ｜${escapeHtml(
                  item.employeeName || ""
                )}
                ｜${escapeHtml(
                  item.category || ""
                )}
              </div>

              <div>
                狀態：
                <b>
                  ${escapeHtml(
                    item.status || ""
                  )}
                </b>
              </div>

              <div>
                工作位置：
                ${escapeHtml(
                  locationText
                )}
              </div>

              <div>
                工作項目：
                ${escapeHtml(
                  item.workItem || ""
                )}
              </div>

              <div>
                今日完成：
                ${escapeHtml(
                  item.completedContent || ""
                )}
              </div>

              <div>
                完成數量：
                ${escapeHtml(
                  String(
                    quantityText
                  )
                )}
              </div>

              <div>
                進度：
                ${escapeHtml(
                  String(
                    progressText
                  )
                )}
              </div>

              <div>
                異常／問題：
                ${escapeHtml(
                  item.issue || "無"
                )}
              </div>

              <div>
                明日預定：
                ${escapeHtml(
                  item.tomorrowPlan || "未填"
                )}
              </div>

              <div>
                是否需協助：
                ${escapeHtml(
                  item.needHelp || "否"
                )}
              </div>

              ${
                item.needHelp === "是"
                  ? `
                    <div>
                      協助內容：
                      ${escapeHtml(
                        item.helpContent || ""
                      )}
                    </div>
                  `
                  : ""
              }

              ${
                item.reviewNote
                  ? `
                    <div>
                      上次審核備註：
                      ${escapeHtml(
                        item.reviewNote
                      )}
                    </div>
                  `
                  : ""
              }

              <div class="daily-report-field">
                <label for="${noteId}">
                  審核備註
                </label>

                <textarea
                  id="${noteId}"
                  ${actionable ? "" : "disabled"}
                  placeholder="確認可留白；退回修正必填原因"
                ></textarea>
              </div>

              <div class="daily-report-review-actions">

                <button
                  class="btn-report-confirm"
                  ${actionable ? "" : "disabled"}
                  onclick="reviewDailyReport(
                    '${escapeJsString(
                      item.reportId
                    )}',
                    'CONFIRM',
                    '${noteId}'
                  )"
                >
                  ${
                    item.status === "已確認"
                      ? "已確認"
                      : "確認回報"
                  }
                </button>

                <button
                  class="btn-report-return"
                  ${actionable ? "" : "disabled"}
                  onclick="reviewDailyReport(
                    '${escapeJsString(
                      item.reportId
                    )}',
                    'RETURN',
                    '${noteId}'
                  )"
                >
                  ${
                    item.status === "退回修正"
                      ? "已退回"
                      : "退回修正"
                  }
                </button>

              </div>
            `;


          list.appendChild(
            card
          );

        }
      );

    }


    async function reviewDailyReport(
      reportId,
      actionType,
      noteId
    ) {

      const note =
        document
          .getElementById(
            noteId
          )
          .value
          .trim();


      if (
        actionType === "RETURN" &&
        !note
      ) {

        showDailyReportReviewStatus(
          "❌ 退回修正時，請先填寫審核備註",
          "error"
        );

        return;

      }


      const actionText =
        actionType === "CONFIRM"
          ? "確認這筆每日回報"
          : "退回這筆每日回報修正";


      const ok =
        window.confirm(
          "確定要" +
          actionText +
          "嗎？"
        );


      if (!ok) {

        return;

      }


      showDailyReportReviewStatus(
        "⏳ 正在處理每日回報...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminDailyReportReviewAction",

            userId:
              userId,

            reportId:
              reportId,

            actionType:
              actionType,

            note:
              note

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "每日回報審核失敗"
          );

        }


        showDailyReportReviewStatus(
          "✅ " +
          (
            result.message ||
            "每日回報審核完成"
          ),
          "success"
        );


        await loadDailyReportReviews(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showDailyReportReviewStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );

      }

    }


    function showDailyReportReviewStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "dailyReportReviewStatusMsg"
        );


      if (!el) {

        return;

      }


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }


    // ==========================================
    // 管理員補卡 V1
    // ==========================================

    function updateAdminEntry() {

      const permission =
        String(
          employee?.permission || ""
        )
        .trim()
        .toUpperCase();


      const allowed =
        [
          "OWNER",
          "ADMIN",
          "SITE_MANAGER"
        ]
        .includes(
          permission
        );


      document
        .getElementById(
          "adminEntry"
        )
        .style.display =
        allowed
          ? "block"
          : "none";

    }


    function openAdminPanel() {

      document
        .querySelector(
          ".card"
        )
        .style.display =
        "none";


      document
        .getElementById(
          "adminPanel"
        )
        .style.display =
        "block";


      renderFullMakeupSites();

      renderReviewSites();

      setDefaultReviewDate();

      renderDailyReportReviewSites();

      setDefaultDailyReportReviewDate();

      updateDailySettlementAccess();

      setDefaultDailySettlementDate();

      updatePayrollAccess();

      setDefaultPayrollMonth();

      loadOpenSegments();

    }


    function closeAdminPanel() {

      document
        .getElementById(
          "adminPanel"
        )
        .style.display =
        "none";


      document
        .querySelector(
          ".card"
        )
        .style.display =
        "block";

    }





    // ==========================================
    // 薪資結算 V1
    // ==========================================

    function updatePayrollAccess() {

      const permission =
        String(
          employee?.permission || ""
        )
        .trim()
        .toUpperCase();


      const allowed =
        [
          "OWNER",
          "ADMIN"
        ]
        .includes(
          permission
        );


      const section =
        document.getElementById(
          "payrollSection"
        );


      if (section) {

        section.style.display =
          allowed
            ? "block"
            : "none";

      }

    }


    function setDefaultPayrollMonth() {

      const input =
        document.getElementById(
          "payrollMonth"
        );


      if (
        !input ||
        input.value
      ) {

        return;

      }


      const now =
        new Date();


      const month =
        String(
          now.getMonth() + 1
        )
        .padStart(
          2,
          "0"
        );


      input.value =
        now.getFullYear() +
        "-" +
        month;

    }


    async function refreshPayroll() {

      const month =
        document
          .getElementById(
            "payrollMonth"
          )
          .value;


      if (!month) {

        showPayrollStatus(
          "❌ 請先選擇結算月份",
          "error"
        );

        return;

      }


      setPayrollButtons(
        false
      );


      showPayrollStatus(
        "⏳ 正在重新彙總薪資...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminPayrollRefresh",

            userId:
              userId,

            month:
              month

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "薪資彙總失敗"
          );

        }


        showPayrollStatus(
          "✅ 薪資彙總完成\n新增：" +
          Number(
            result.created || 0
          ) +
          " 筆\n更新：" +
          Number(
            result.updated || 0
          ) +
          " 筆\n未變更：" +
          Number(
            result.unchanged || 0
          ) +
          " 筆\n已結算鎖定：" +
          Number(
            result.locked || 0
          ) +
          " 筆",
          "success"
        );


        await loadPayrolls(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showPayrollStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setPayrollButtons(
          true
        );

      }

    }


    async function loadPayrolls(
      showLoading = true
    ) {

      const month =
        document
          .getElementById(
            "payrollMonth"
          )
          .value;


      const list =
        document.getElementById(
          "payrollList"
        );


      if (!month) {

        showPayrollStatus(
          "❌ 請先選擇結算月份",
          "error"
        );

        return;

      }


      if (showLoading) {

        showPayrollStatus(
          "⏳ 正在讀取薪資資料...",
          "normal"
        );

      }


      list.innerHTML =
        `
          <div class="admin-empty">
            正在讀取...
          </div>
        `;


      setPayrollButtons(
        false
      );


      try {

        const result =
          await callApi({

            action:
              "adminPayrollList",

            userId:
              userId,

            month:
              month

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "讀取薪資失敗"
          );

        }


        renderPayrolls(
          result.payrolls || []
        );


        if (showLoading) {

          showPayrollStatus(
            "✅ 已讀取 " +
            (
              result.payrolls || []
            ).length +
            " 筆薪資資料",
            "success"
          );

        }


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          `
            <div class="admin-empty">
              讀取失敗
            </div>
          `;


        showPayrollStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setPayrollButtons(
          true
        );

      }

    }


    function renderPayrolls(
      payrolls
    ) {

      const list =
        document.getElementById(
          "payrollList"
        );


      if (
        !payrolls ||
        payrolls.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              這個月份目前沒有可結算薪資資料
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      payrolls.forEach(
        function(item, index) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "payroll-card";


          const additionId =
            "payrollAddition_" +
            index;


          const deductionId =
            "payrollDeduction_" +
            index;


          const noteId =
            "payrollNote_" +
            index;


          const buttonId =
            "payrollFinalize_" +
            index;


          const finalized =
            item.status ===
            "已結算";


          const previewPay =
            Number(
              item.baseSalary || 0
            ) +
            Number(
              item.overtimeSalary || 0
            ) +
            Number(
              item.otherAdditions || 0
            ) -
            Number(
              item.otherDeductions || 0
            );


          card.innerHTML =
            `
              <div class="payroll-title">
                ${escapeHtml(
                  item.employeeName ||
                  item.employeeId
                )}
              </div>

              <div class="payroll-meta">

                <div>
                  結算月份：
                  <b>
                    ${escapeHtml(
                      item.month || ""
                    )}
                  </b>
                </div>

                <div>
                  員工ID：
                  ${escapeHtml(
                    item.employeeId || ""
                  )}
                </div>

                <div>
                  級職：
                  ${escapeHtml(
                    item.grade || ""
                  )}
                </div>

                <div>
                  薪資制：
                  ${escapeHtml(
                    item.salaryType || ""
                  )}
                </div>

                <div>
                  薪資單價：
                  ${formatMoney(
                    item.salaryRate
                  )}
                </div>

              </div>

              <div class="payroll-summary">

                <div>
                  出工日數：
                  <b>
                    ${Number(
                      item.workdays || 0
                    )}
                  </b>
                </div>

                <div>
                  加班日數：
                  <b>
                    ${Number(
                      item.overtimeDays || 0
                    )}
                  </b>
                </div>

                <div>
                  基本薪資：
                  <b>
                    ${formatMoney(
                      item.baseSalary
                    )}
                  </b>
                </div>

                <div>
                  加班薪資：
                  <b>
                    ${formatMoney(
                      item.overtimeSalary
                    )}
                  </b>
                </div>

                <div>
                  其他加項：
                  <b>
                    ${formatMoney(
                      item.otherAdditions
                    )}
                  </b>
                </div>

                <div>
                  其他扣項：
                  <b>
                    ${formatMoney(
                      item.otherDeductions
                    )}
                  </b>
                </div>

              </div>

              <div class="payroll-total">
                目前應發薪資：
                ${formatMoney(
                  item.grossPay ??
                  previewPay
                )}
              </div>

              ${
                item.salaryType ===
                "月薪"
                  ? `
                    <div class="payroll-warning">
                      ⚠️ 月薪員工的加班、缺勤、請假與未滿月計算規則尚未正式定案。V1 目前先保留主幹，不作最終法規薪資判定。
                    </div>
                  `
                  : ""
              }

              <div class="review-tags">

                <span class="review-tag ${
                  finalized
                    ? "success"
                    : "warn"
                }">
                  ${escapeHtml(
                    item.status ||
                    "待結算"
                  )}
                </span>

              </div>

              <div class="payroll-form">

                <label for="${additionId}">
                  其他加項
                </label>

                <input
                  id="${additionId}"
                  type="number"
                  min="0"
                  step="1"
                  value="${Number(
                    item.otherAdditions || 0
                  )}"
                  ${finalized ? "disabled" : ""}
                >

                <label for="${deductionId}">
                  其他扣項
                </label>

                <input
                  id="${deductionId}"
                  type="number"
                  min="0"
                  step="1"
                  value="${Number(
                    item.otherDeductions || 0
                  )}"
                  ${finalized ? "disabled" : ""}
                >

                <label for="${noteId}">
                  結算備註
                </label>

                <textarea
                  id="${noteId}"
                  placeholder="例如：2026/09 薪資測試"
                  ${finalized ? "disabled" : ""}
                >${escapeHtml(
                  item.note || ""
                )}</textarea>

                <button
                  id="${buttonId}"
                  class="btn-payroll-finalize"
                  ${finalized ? "disabled" : ""}
                  onclick="finalizePayroll(
                    '${escapeJsString(
                      item.settlementId
                    )}',
                    '${additionId}',
                    '${deductionId}',
                    '${noteId}',
                    '${buttonId}'
                  )"
                >
                  ${
                    finalized
                      ? "已完成結算"
                      : item.status === "退回修正"
                        ? "重新確認薪資結算"
                        : "確認薪資結算"
                  }
                </button>

                ${
                  finalized
                    ? `
                      <button
                        class="btn-payroll-return"
                        onclick="returnPayrollForCorrection(
                          '${escapeJsString(
                            item.settlementId
                          )}'
                        )"
                      >
                        退回修正
                      </button>
                    `
                    : ""
                }

              </div>
            `;


          list.appendChild(
            card
          );

        }
      );

    }


    async function finalizePayroll(
      settlementId,
      additionId,
      deductionId,
      noteId,
      buttonId
    ) {

      const otherAdditions =
        Number(
          document
            .getElementById(
              additionId
            )
            .value || 0
        );


      const otherDeductions =
        Number(
          document
            .getElementById(
              deductionId
            )
            .value || 0
        );


      const note =
        document
          .getElementById(
            noteId
          )
          .value
          .trim();


      if (
        otherAdditions < 0 ||
        otherDeductions < 0
      ) {

        showPayrollStatus(
          "❌ 加項與扣項不能是負數",
          "error"
        );

        return;

      }


      const ok =
        window.confirm(
          "確定要正式完成這筆薪資結算嗎？\n\n" +
          "其他加項：" +
          formatMoney(
            otherAdditions
          ) +
          "\n" +
          "其他扣項：" +
          formatMoney(
            otherDeductions
          ) +
          "\n\n" +
          "正式結算後，重新彙總不會直接覆蓋這筆歷史薪資。"
        );


      if (!ok) {

        return;

      }


      const button =
        document.getElementById(
          buttonId
        );


      button.disabled =
        true;


      showPayrollStatus(
        "⏳ 正在完成薪資結算...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminPayrollFinalize",

            userId:
              userId,

            settlementId:
              settlementId,

            otherAdditions:
              otherAdditions,

            otherDeductions:
              otherDeductions,

            note:
              note

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "薪資結算失敗"
          );

        }


        showPayrollStatus(
          "✅ " +
          (
            result.message ||
            "薪資已正式結算"
          ) +
          "\n應發薪資：" +
          formatMoney(
            result.grossPay || 0
          ),
          "success"
        );


        await loadPayrolls(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showPayrollStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


        button.disabled =
          false;

      }

    }


    async function returnPayrollForCorrection(
      settlementId
    ) {

      const reason =
        window.prompt(
          "請輸入退回修正原因：\n\n例如：加項輸入錯誤、扣款需要調整、出勤資料修正"
        );


      if (
        reason === null
      ) {

        return;

      }


      const cleanReason =
        String(
          reason
        ).trim();


      if (
        cleanReason === ""
      ) {

        showPayrollStatus(
          "❌ 退回修正原因必填",
          "error"
        );

        return;

      }


      const ok =
        window.confirm(
          "確定要把這筆已結算薪資退回修正嗎？\n\n原因：" +
          cleanReason +
          "\n\n系統會保留修正紀錄，不會刪除原資料。"
        );


      if (!ok) {

        return;

      }


      setPayrollButtons(
        false
      );


      showPayrollStatus(
        "⏳ 正在退回薪資修正...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminPayrollReturnForCorrection",

            userId:
              userId,

            settlementId:
              settlementId,

            reason:
              cleanReason

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "退回修正失敗"
          );

        }


        showPayrollStatus(
          "✅ " +
          (
            result.message ||
            "薪資已退回修正"
          ),
          "success"
        );


        await loadPayrolls(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showPayrollStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setPayrollButtons(
          true
        );

      }

    }



    function formatMoney(
      value
    ) {

      const number =
        Number(
          value || 0
        );


      return "NT$ " +
        number.toLocaleString(
          "zh-TW",
          {
            maximumFractionDigits: 0
          }
        );

    }


    function setPayrollButtons(
      enabled
    ) {

      const refreshButton =
        document.getElementById(
          "payrollRefreshButton"
        );


      const listButton =
        document.getElementById(
          "payrollListButton"
        );


      if (refreshButton) {

        refreshButton.disabled =
          !enabled;

      }


      if (listButton) {

        listButton.disabled =
          !enabled;

      }

    }


    function showPayrollStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "payrollStatusMsg"
        );


      if (!el) {

        return;

      }


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }



    // ==========================================
    // 出勤日結 V1
    // ==========================================

    function updateDailySettlementAccess() {

      const permission =
        String(
          employee?.permission || ""
        )
        .trim()
        .toUpperCase();


      const allowed =
        [
          "OWNER",
          "ADMIN"
        ]
        .includes(
          permission
        );


      const section =
        document.getElementById(
          "dailySettlementSection"
        );


      if (section) {

        section.style.display =
          allowed
            ? "block"
            : "none";

      }

    }


    function setDefaultDailySettlementDate() {

      const input =
        document.getElementById(
          "dailySettlementDate"
        );


      if (
        !input ||
        input.value
      ) {

        return;

      }


      const reviewDate =
        document.getElementById(
          "reviewDate"
        );


      if (
        reviewDate &&
        reviewDate.value
      ) {

        input.value =
          reviewDate.value;

        return;

      }


      const now =
        new Date();


      const pad =
        function(value) {

          return String(
            value
          )
          .padStart(
            2,
            "0"
          );

        };


      input.value =
        now.getFullYear() +
        "-" +
        pad(
          now.getMonth() + 1
        ) +
        "-" +
        pad(
          now.getDate()
        );

    }


    async function refreshDailySettlement() {

      const date =
        document
          .getElementById(
            "dailySettlementDate"
          )
          .value;


      if (!date) {

        showDailySettlementStatus(
          "❌ 請先選擇日結日期",
          "error"
        );

        return;

      }


      setDailySettlementButtons(
        false
      );


      showDailySettlementStatus(
        "⏳ 正在重新彙總出勤日結...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminDailySettlementRefresh",

            userId:
              userId,

            date:
              date

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "出勤日結彙總失敗"
          );

        }


        showDailySettlementStatus(
          "✅ 日結彙總完成\n新增：" +
          Number(
            result.created || 0
          ) +
          " 筆\n更新：" +
          Number(
            result.updated || 0
          ) +
          " 筆\n未變更：" +
          Number(
            result.unchanged || 0
          ) +
          " 筆",
          "success"
        );


        await loadDailySettlements(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showDailySettlementStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setDailySettlementButtons(
          true
        );

      }

    }


    async function loadDailySettlements(
      showLoading = true
    ) {

      const date =
        document
          .getElementById(
            "dailySettlementDate"
          )
          .value;


      const list =
        document.getElementById(
          "dailySettlementList"
        );


      if (!date) {

        showDailySettlementStatus(
          "❌ 請先選擇日結日期",
          "error"
        );

        return;

      }


      if (showLoading) {

        showDailySettlementStatus(
          "⏳ 正在讀取出勤日結...",
          "normal"
        );

      }


      list.innerHTML =
        `
          <div class="admin-empty">
            正在讀取...
          </div>
        `;


      setDailySettlementButtons(
        false
      );


      try {

        const result =
          await callApi({

            action:
              "adminDailySettlementList",

            userId:
              userId,

            date:
              date

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "讀取出勤日結失敗"
          );

        }


        renderDailySettlements(
          result.settlements || []
        );


        if (showLoading) {

          showDailySettlementStatus(
            "✅ 已讀取 " +
            (
              result.settlements || []
            ).length +
            " 筆日結資料",
            "success"
          );

        }


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          `
            <div class="admin-empty">
              讀取失敗
            </div>
          `;


        showDailySettlementStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setDailySettlementButtons(
          true
        );

      }

    }


    function renderDailySettlements(
      settlements
    ) {

      const list =
        document.getElementById(
          "dailySettlementList"
        );


      if (
        !settlements ||
        settlements.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              這個日期目前沒有出勤日結資料
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      settlements.forEach(
        function(item, index) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "daily-settlement-card";


          const workdayId =
            "dailyWorkday_" +
            index;


          const overtimeId =
            "dailyOvertime_" +
            index;


          const noteId =
            "dailyNote_" +
            index;


          const buttonId =
            "dailyFinalize_" +
            index;


          const reviewReady =
            item.siteReviewStatus ===
            "全部已確認";


          const statusClass =
            item.settlementStatus ===
            "已日結"
              ? "success"
              : "warn";


          card.innerHTML =
            `
              <div class="daily-settlement-title">
                ${escapeHtml(
                  item.employeeName ||
                  item.employeeId
                )}
              </div>

              <div class="daily-settlement-meta">

                <div>
                  日期：
                  <b>
                    ${escapeHtml(
                      item.date
                    )}
                  </b>
                </div>

                <div>
                  員工ID：
                  ${escapeHtml(
                    item.employeeId
                  )}
                </div>

                <div>
                  薪資制：
                  ${escapeHtml(
                    item.salaryType ||
                    "未設定"
                  )}
                </div>

              </div>

              <div class="daily-settlement-highlight">

                <div>
                  當日工地數：
                  <b>
                    ${Number(
                      item.siteCount || 0
                    )}
                  </b>
                </div>

                <div>
                  工作區段數：
                  <b>
                    ${Number(
                      item.segmentCount || 0
                    )}
                  </b>
                </div>

                <div>
                  當日總工時：
                  <b>
                    ${Number(
                      item.totalHours || 0
                    )}
                    小時
                  </b>
                </div>

              </div>

              <div class="review-tags">

                <span class="review-tag ${
                  reviewReady
                    ? "success"
                    : "warn"
                }">
                  ${escapeHtml(
                    item.siteReviewStatus ||
                    "尚有待審核"
                  )}
                </span>

                <span class="review-tag ${
                  item.makeupStatus ===
                  "有補卡"
                    ? "warn"
                    : ""
                }">
                  ${escapeHtml(
                    item.makeupStatus ||
                    "無補卡"
                  )}
                </span>

                <span class="review-tag ${
                  item.abnormalStatus ===
                  "有異常"
                    ? "error"
                    : "success"
                }">
                  ${escapeHtml(
                    item.abnormalStatus ||
                    "正常"
                  )}
                </span>

                <span class="review-tag ${statusClass}">
                  ${escapeHtml(
                    item.settlementStatus ||
                    "待日結"
                  )}
                </span>

              </div>

              <div class="daily-settlement-form">

                <label for="${workdayId}">
                  最終出工日數
                </label>

                <select id="${workdayId}">
                  <option value="1">
                    1 日
                  </option>
                  <option value="0.5">
                    0.5 日
                  </option>
                  <option value="0">
                    0 日
                  </option>
                </select>

                <label for="${overtimeId}">
                  最終加班日數
                </label>

                <select id="${overtimeId}">
                  <option value="0">
                    0
                  </option>
                  <option value="0.5">
                    0.5 日
                  </option>
                </select>

                <label for="${noteId}">
                  日結備註
                </label>

                <textarea
                  id="${noteId}"
                  placeholder="例如：跨 SITE001、SITE002，合併認定 1 日"
                >${escapeHtml(
                  item.note || ""
                )}</textarea>

                <button
                  id="${buttonId}"
                  class="btn-daily-settlement"
                  ${reviewReady ? "" : "disabled"}
                  onclick="finalizeDailySettlement(
                    '${escapeJsString(
                      item.settlementId
                    )}',
                    '${workdayId}',
                    '${overtimeId}',
                    '${noteId}',
                    '${buttonId}'
                  )"
                >
                  ${
                    reviewReady
                      ? "確認日結"
                      : "工地尚未全部確認"
                  }
                </button>

              </div>
            `;


          list.appendChild(
            card
          );


          const workdaySelect =
            document.getElementById(
              workdayId
            );


          if (
            item.workdayCount === 0 ||
            item.workdayCount === 0.5 ||
            item.workdayCount === 1
          ) {

            workdaySelect.value =
              String(
                item.workdayCount
              );

          } else {

            workdaySelect.value =
              "1";

          }


          const overtimeSelect =
            document.getElementById(
              overtimeId
            );


          if (
            item.overtimeCount === 0 ||
            item.overtimeCount === 0.5
          ) {

            overtimeSelect.value =
              String(
                item.overtimeCount
              );

          } else {

            overtimeSelect.value =
              "0";

          }

        }
      );

    }


    async function finalizeDailySettlement(
      settlementId,
      workdayId,
      overtimeId,
      noteId,
      buttonId
    ) {

      const workdayCount =
        Number(
          document
            .getElementById(
              workdayId
            )
            .value
        );


      const overtimeCount =
        Number(
          document
            .getElementById(
              overtimeId
            )
            .value
        );


      const note =
        document
          .getElementById(
            noteId
          )
          .value
          .trim();


      const ok =
        window.confirm(
          "確定要完成這筆出勤日結嗎？\n\n" +
          "出工日數：" +
          workdayCount +
          "\n" +
          "加班日數：" +
          overtimeCount
        );


      if (!ok) {

        return;

      }


      const button =
        document.getElementById(
          buttonId
        );


      button.disabled =
        true;


      showDailySettlementStatus(
        "⏳ 正在完成出勤日結...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminDailySettlementFinalize",

            userId:
              userId,

            settlementId:
              settlementId,

            workdayCount:
              workdayCount,

            overtimeCount:
              overtimeCount,

            note:
              note

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "出勤日結失敗"
          );

        }


        showDailySettlementStatus(
          "✅ " +
          (
            result.message ||
            "出勤日結已完成"
          ),
          "success"
        );


        await loadDailySettlements(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showDailySettlementStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


        button.disabled =
          false;

      }

    }


    function setDailySettlementButtons(
      enabled
    ) {

      const refreshButton =
        document.getElementById(
          "dailySettlementRefreshButton"
        );


      const listButton =
        document.getElementById(
          "dailySettlementListButton"
        );


      if (refreshButton) {

        refreshButton.disabled =
          !enabled;

      }


      if (listButton) {

        listButton.disabled =
          !enabled;

      }

    }


    function showDailySettlementStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "dailySettlementStatusMsg"
        );


      if (!el) {

        return;

      }


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }


    // ==========================================
    // 出勤審核 V1
    // ==========================================

    function setDefaultReviewDate() {

      const input =
        document.getElementById(
          "reviewDate"
        );


      if (
        !input ||
        input.value
      ) {

        return;

      }


      const now =
        new Date();


      const pad =
        function(value) {

          return String(
            value
          )
          .padStart(
            2,
            "0"
          );

        };


      input.value =
        now.getFullYear() +
        "-" +
        pad(
          now.getMonth() + 1
        ) +
        "-" +
        pad(
          now.getDate()
        );

    }


    function renderReviewSites() {

      const select =
        document.getElementById(
          "reviewSiteId"
        );


      if (!select) {

        return;

      }


      const currentValue =
        select.value;


      select.innerHTML =
        `
          <option value="">
            全部可管理工地
          </option>
        `;


      sites.forEach(
        function(site) {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            site.siteId;


          option.innerText =
            site.name;


          select.appendChild(
            option
          );

        }
      );


      if (currentValue) {

        select.value =
          currentValue;

      }

    }


    async function refreshAttendanceReview() {

      const date =
        document
          .getElementById(
            "reviewDate"
          )
          .value;


      const siteId =
        document
          .getElementById(
            "reviewSiteId"
          )
          .value;


      if (!date) {

        showReviewStatus(
          "❌ 請先選擇審核日期",
          "error"
        );

        return;

      }


      setReviewButtons(
        false
      );


      showReviewStatus(
        "⏳ 正在重新彙總出勤資料...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminAttendanceReviewRefresh",

            userId:
              userId,

            date:
              date,

            siteId:
              siteId

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "出勤彙總失敗"
          );

        }


        showReviewStatus(
          "✅ 彙總完成\n新增：" +
          Number(
            result.created || 0
          ) +
          " 筆\n更新：" +
          Number(
            result.updated || 0
          ) +
          " 筆",
          "success"
        );


        await loadAttendanceReviews(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showReviewStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setReviewButtons(
          true
        );

      }

    }


    async function loadAttendanceReviews(
      showLoading = true
    ) {

      const date =
        document
          .getElementById(
            "reviewDate"
          )
          .value;


      const siteId =
        document
          .getElementById(
            "reviewSiteId"
          )
          .value;


      const list =
        document.getElementById(
          "attendanceReviewList"
        );


      if (!date) {

        showReviewStatus(
          "❌ 請先選擇審核日期",
          "error"
        );

        return;

      }


      if (showLoading) {

        showReviewStatus(
          "⏳ 正在讀取出勤審核...",
          "normal"
        );

      }


      list.innerHTML =
        `
          <div class="admin-empty">
            正在讀取...
          </div>
        `;


      setReviewButtons(
        false
      );


      try {

        const result =
          await callApi({

            action:
              "adminAttendanceReviewList",

            userId:
              userId,

            date:
              date,

            siteId:
              siteId

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "讀取出勤審核失敗"
          );

        }


        renderAttendanceReviews(
          result.reviews || []
        );


        if (showLoading) {

          showReviewStatus(
            "✅ 已讀取 " +
            (
              result.reviews || []
            ).length +
            " 筆審核資料",
            "success"
          );

        }


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          `
            <div class="admin-empty">
              讀取失敗
            </div>
          `;


        showReviewStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        setReviewButtons(
          true
        );

      }

    }


    function renderAttendanceReviews(
      reviews
    ) {

      const list =
        document.getElementById(
          "attendanceReviewList"
        );


      if (
        !reviews ||
        reviews.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              這個日期目前沒有可審核的出勤資料
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      reviews.forEach(
        function(review, index) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "review-card";


          const workdayId =
            "reviewWorkday_" +
            index;


          const overtimeId =
            "reviewOvertime_" +
            index;


          const noteId =
            "reviewNote_" +
            index;


          const approveId =
            "reviewApprove_" +
            index;


          const returnId =
            "reviewReturn_" +
            index;


          const statusClass =
            review.reviewStatus ===
            "已確認"
              ? "success"
              : (
                  review.reviewStatus ===
                  "退回修正"
                    ? "error"
                    : "warn"
                );


          card.innerHTML =
            `
              <div class="review-card-title">
                ${escapeHtml(
                  review.employeeName ||
                  review.employeeId
                )}
              </div>

              <div class="review-meta">
                <div>
                  日期：
                  <b>
                    ${escapeHtml(
                      review.date
                    )}
                  </b>
                </div>

                <div>
                  工地：
                  <b>
                    ${escapeHtml(
                      review.siteName
                    )}
                  </b>
                </div>

                <div>
                  員工ID：
                  ${escapeHtml(
                    review.employeeId
                  )}
                </div>

                <div>
                  工作區段：
                  ${Number(
                    review.segmentCount || 0
                  )}
                  段
                </div>

                <div>
                  工地總工時：
                  <b>
                    ${Number(
                      review.totalHours || 0
                    )}
                    小時
                  </b>
                </div>

                <div>
                  負責人：
                  ${escapeHtml(
                    review.managerName ||
                    "尚未指定"
                  )}
                </div>
              </div>

              <div class="review-tags">

                <span class="review-tag ${statusClass}">
                  ${escapeHtml(
                    review.reviewStatus ||
                    "待審核"
                  )}
                </span>

                <span class="review-tag ${
                  review.makeupStatus ===
                  "有補卡"
                    ? "warn"
                    : ""
                }">
                  ${escapeHtml(
                    review.makeupStatus ||
                    "無補卡"
                  )}
                </span>

                <span class="review-tag ${
                  review.abnormalStatus ===
                  "有異常"
                    ? "error"
                    : "success"
                }">
                  ${escapeHtml(
                    review.abnormalStatus ||
                    "正常"
                  )}
                </span>

              </div>

              <div class="review-form">

                <label for="${workdayId}">
                  出工認定
                </label>

                <select id="${workdayId}">
                  <option value="整日">
                    整日
                  </option>
                  <option value="半日">
                    半日
                  </option>
                  <option value="不計出工">
                    不計出工
                  </option>
                </select>

                <label for="${overtimeId}">
                  加班認定
                </label>

                <select id="${overtimeId}">
                  <option value="無">
                    無
                  </option>
                  <option value="半日">
                    半日
                  </option>
                  <option value="待確認">
                    待確認
                  </option>
                </select>

                <label for="${noteId}">
                  審核備註
                </label>

                <textarea
                  id="${noteId}"
                  placeholder="例如：已與現場確認；或退回修正原因"
                >${escapeHtml(
                  review.note || ""
                )}</textarea>

                <div class="review-button-row">

                  <button
                    id="${approveId}"
                    class="btn-review-approve"
                    onclick="submitAttendanceReview(
                      '${escapeJsString(
                        review.reviewId
                      )}',
                      '已確認',
                      '${workdayId}',
                      '${overtimeId}',
                      '${noteId}',
                      '${approveId}',
                      '${returnId}'
                    )"
                  >
                    確認出勤
                  </button>

                  <button
                    id="${returnId}"
                    class="btn-review-return"
                    onclick="submitAttendanceReview(
                      '${escapeJsString(
                        review.reviewId
                      )}',
                      '退回修正',
                      '${workdayId}',
                      '${overtimeId}',
                      '${noteId}',
                      '${approveId}',
                      '${returnId}'
                    )"
                  >
                    退回修正
                  </button>

                </div>

              </div>
            `;


          list.appendChild(
            card
          );


          const workdaySelect =
            document.getElementById(
              workdayId
            );


          if (
            [
              "整日",
              "半日",
              "不計出工"
            ]
            .includes(
              review.workdayDecision
            )
          ) {

            workdaySelect.value =
              review.workdayDecision;

          } else {

            workdaySelect.value =
              "整日";

          }


          const overtimeSelect =
            document.getElementById(
              overtimeId
            );


          if (
            [
              "無",
              "半日",
              "待確認"
            ]
            .includes(
              review.overtimeDecision
            )
          ) {

            overtimeSelect.value =
              review.overtimeDecision;

          } else {

            overtimeSelect.value =
              "無";

          }

        }
      );

    }


    async function submitAttendanceReview(
      reviewId,
      reviewStatus,
      workdayId,
      overtimeId,
      noteId,
      approveId,
      returnId
    ) {

      const workdayDecision =
        document
          .getElementById(
            workdayId
          )
          .value;


      const overtimeDecision =
        document
          .getElementById(
            overtimeId
          )
          .value;


      const note =
        document
          .getElementById(
            noteId
          )
          .value
          .trim();


      if (
        reviewStatus ===
        "退回修正" &&
        !note
      ) {

        showReviewStatus(
          "❌ 退回修正時，審核備註必填",
          "error"
        );

        return;

      }


      let confirmText =
        "";


      if (
        reviewStatus ===
        "已確認"
      ) {

        confirmText =
          "確定要確認這筆出勤嗎？\n\n" +
          "出工認定：" +
          workdayDecision +
          "\n" +
          "加班認定：" +
          overtimeDecision;

      } else {

        confirmText =
          "確定要退回修正嗎？\n\n" +
          "原因：" +
          note;

      }


      if (
        !window.confirm(
          confirmText
        )
      ) {

        return;

      }


      const approveButton =
        document.getElementById(
          approveId
        );


      const returnButton =
        document.getElementById(
          returnId
        );


      approveButton.disabled =
        true;

      returnButton.disabled =
        true;


      showReviewStatus(
        "⏳ 正在儲存出勤審核...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminAttendanceReviewApprove",

            userId:
              userId,

            reviewId:
              reviewId,

            reviewStatus:
              reviewStatus,

            workdayDecision:
              workdayDecision,

            overtimeDecision:
              overtimeDecision,

            note:
              note

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "出勤審核儲存失敗"
          );

        }


        showReviewStatus(
          "✅ " +
          (
            result.message ||
            "出勤審核已更新"
          ),
          "success"
        );


        await loadAttendanceReviews(
          false
        );


      } catch (error) {

        console.error(
          error
        );


        showReviewStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


        approveButton.disabled =
          false;

        returnButton.disabled =
          false;

      }

    }


    function setReviewButtons(
      enabled
    ) {

      const refreshButton =
        document.getElementById(
          "reviewRefreshButton"
        );


      const listButton =
        document.getElementById(
          "reviewListButton"
        );


      if (refreshButton) {

        refreshButton.disabled =
          !enabled;

      }


      if (listButton) {

        listButton.disabled =
          !enabled;

      }

    }


    function showReviewStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "reviewStatusMsg"
        );


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }


    function renderFullMakeupSites() {

      const select =
        document.getElementById(
          "fullSiteId"
        );


      if (!select) {

        return;

      }


      const currentValue =
        select.value;


      select.innerHTML =
        `
          <option value="">
            請選擇工地
          </option>
        `;


      sites.forEach(
        function (site) {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            site.siteId;


          option.innerText =
            site.name;


          select.appendChild(
            option
          );

        }
      );


      if (currentValue) {

        select.value =
          currentValue;

      }

    }


    async function submitFullMakeup() {

      const employeeId =
        document
          .getElementById(
            "fullEmployeeId"
          )
          .value
          .trim();


      const siteId =
        document
          .getElementById(
            "fullSiteId"
          )
          .value;


      const startTime =
        document
          .getElementById(
            "fullStartTime"
          )
          .value;


      const endTime =
        document
          .getElementById(
            "fullEndTime"
          )
          .value;


      const workContent =
        document
          .getElementById(
            "fullWorkContent"
          )
          .value
          .trim();


      const reason =
        document
          .getElementById(
            "fullReason"
          )
          .value
          .trim();


      if (!employeeId) {

        showAdminStatus(
          "❌ 請輸入員工ID",
          "error"
        );

        return;

      }


      if (!siteId) {

        showAdminStatus(
          "❌ 請選擇工地",
          "error"
        );

        return;

      }


      if (!startTime) {

        showAdminStatus(
          "❌ 請選擇補上班時間",
          "error"
        );

        return;

      }


      if (!endTime) {

        showAdminStatus(
          "❌ 請選擇補下班時間",
          "error"
        );

        return;

      }


      if (!reason) {

        showAdminStatus(
          "❌ 補卡原因必填",
          "error"
        );

        return;

      }


      const startDate =
        new Date(
          startTime
        );


      const endDate =
        new Date(
          endTime
        );


      if (
        isNaN(
          startDate.getTime()
        ) ||
        isNaN(
          endDate.getTime()
        )
      ) {

        showAdminStatus(
          "❌ 日期時間格式錯誤",
          "error"
        );

        return;

      }


      if (
        endDate.getTime() <=
        startDate.getTime()
      ) {

        showAdminStatus(
          "❌ 下班時間必須晚於上班時間",
          "error"
        );

        return;

      }


      const site =
        sites.find(
          function (item) {

            return (
              String(
                item.siteId
              ) ===
              String(
                siteId
              )
            );

          }
        );


      const ok =
        window.confirm(
          "確定建立完整補卡嗎？\n\n" +
          "員工ID：" +
          employeeId +
          "\n" +
          "工地：" +
          (
            site
              ? site.name
              : siteId
          ) +
          "\n" +
          "上班：" +
          formatDisplayDateTime(
            startTime
          ) +
          "\n" +
          "下班：" +
          formatDisplayDateTime(
            endTime
          ) +
          "\n\n原因：" +
          reason
        );


      if (!ok) {

        return;

      }


      const button =
        document.getElementById(
          "fullMakeupButton"
        );


      button.disabled =
        true;


      showAdminStatus(
        "⏳ 正在建立完整補卡...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminMakeup",

            userId:
              userId,

            makeupType:
              "補完整區段",

            employeeId:
              employeeId,

            siteId:
              siteId,

            startTime:
              startTime,

            endTime:
              endTime,

            workContent:
              workContent,

            reason:
              reason

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "完整補卡失敗"
          );

        }


        showAdminStatus(
          "✅ " +
          (
            result.message ||
            "完整補卡成功"
          ) +
          "\n本段工時：" +
          result.workHours +
          " 小時",
          "success"
        );


        document
          .getElementById(
            "fullEmployeeId"
          )
          .value =
          "";


        document
          .getElementById(
            "fullStartTime"
          )
          .value =
          "";


        document
          .getElementById(
            "fullEndTime"
          )
          .value =
          "";


        document
          .getElementById(
            "fullWorkContent"
          )
          .value =
          "";


        document
          .getElementById(
            "fullReason"
          )
          .value =
          "";


        await loadOpenSegments();


      } catch (error) {

        console.error(
          error
        );


        showAdminStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


      } finally {

        button.disabled =
          false;

      }

    }


    async function loadOpenSegments() {

      const list =
        document.getElementById(
          "openSegmentList"
        );


      list.innerHTML =
        `
          <div class="admin-empty">
            正在讀取未完成工作區段...
          </div>
        `;


      showAdminStatus(
        "",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminOpenSegments",

            userId:
              userId

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "無法讀取未完成工作區段"
          );

        }


        renderOpenSegments(
          result.openSegments || []
        );


      } catch (error) {

        console.error(
          error
        );


        list.innerHTML =
          `
            <div class="admin-empty">
              讀取失敗
            </div>
          `;


        showAdminStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );

      }

    }


    function renderOpenSegments(
      segments
    ) {

      const list =
        document.getElementById(
          "openSegmentList"
        );


      if (
        !segments ||
        segments.length === 0
      ) {

        list.innerHTML =
          `
            <div class="admin-empty">
              ✅ 目前沒有未完成的工作區段
            </div>
          `;

        return;

      }


      list.innerHTML =
        "";


      segments.forEach(
        function (
          segment,
          index
        ) {

          const card =
            document.createElement(
              "div"
            );


          card.className =
            "open-segment";


          const inputId =
            "makeupEndTime_" +
            index;


          const reasonId =
            "makeupReason_" +
            index;


          const buttonId =
            "makeupButton_" +
            index;


          card.innerHTML =
            `
              <div class="open-segment-title">
                ${escapeHtml(
                  segment.employeeName ||
                  segment.employeeId
                )}
              </div>

              <div class="open-segment-info">
                <div>
                  工地：
                  <b>
                    ${escapeHtml(
                      segment.siteName
                    )}
                  </b>
                </div>

                <div>
                  上班時間：
                  <b>
                    ${escapeHtml(
                      formatDisplayDateTime(
                        segment.startTime
                      )
                    )}
                  </b>
                </div>

                <div>
                  工作內容：
                  ${escapeHtml(
                    segment.workContent ||
                    "未填寫"
                  )}
                </div>

                <div>
                  區段ID：
                  ${escapeHtml(
                    segment.segmentId
                  )}
                </div>
              </div>

              <div class="makeup-form">

                <label
                  for="${inputId}"
                >
                  補下班時間
                </label>

                <input
                  id="${inputId}"
                  type="datetime-local"
                  value="${escapeHtml(
                    suggestEndTime(
                      segment.startTime
                    )
                  )}"
                >

                <label
                  for="${reasonId}"
                >
                  補卡原因（必填）
                </label>

                <textarea
                  id="${reasonId}"
                  placeholder="例如：員工昨日離場時忘記按下班"
                ></textarea>

                <button
                  id="${buttonId}"
                  class="makeup-submit"
                  onclick="submitMakeupClockOut(
                    '${escapeJsString(
                      segment.segmentId
                    )}',
                    '${inputId}',
                    '${reasonId}',
                    '${buttonId}'
                  )"
                >
                  確認補下班
                </button>

              </div>
            `;


          list.appendChild(
            card
          );

        }
      );

    }


    async function submitMakeupClockOut(
      segmentId,
      inputId,
      reasonId,
      buttonId
    ) {

      const endTime =
        document
          .getElementById(
            inputId
          )
          .value;


      const reason =
        document
          .getElementById(
            reasonId
          )
          .value
          .trim();


      if (!endTime) {

        showAdminStatus(
          "❌ 請選擇補下班時間",
          "error"
        );

        return;

      }


      if (!reason) {

        showAdminStatus(
          "❌ 補卡原因必填",
          "error"
        );

        return;

      }


      const ok =
        window.confirm(
          "確定要補下班嗎？\n\n" +
          "補下班時間：" +
          formatDisplayDateTime(
            endTime
          ) +
          "\n\n" +
          "補卡原因：" +
          reason
        );


      if (!ok) {

        return;

      }


      const button =
        document.getElementById(
          buttonId
        );


      button.disabled =
        true;


      showAdminStatus(
        "⏳ 正在寫入補卡紀錄...",
        "normal"
      );


      try {

        const result =
          await callApi({

            action:
              "adminMakeup",

            userId:
              userId,

            makeupType:
              "補下班",

            segmentId:
              segmentId,

            endTime:
              endTime,

            reason:
              reason

          });


        if (!result.success) {

          throw new Error(
            result.message ||
            "補卡失敗"
          );

        }


        showAdminStatus(
          "✅ " +
          (
            result.message ||
            "補下班成功"
          ) +
          "\n本段工時：" +
          result.workHours +
          " 小時",
          "success"
        );


        await loadOpenSegments();


      } catch (error) {

        console.error(
          error
        );


        showAdminStatus(
          "❌ " +
          (
            error.message ||
            error
          ),
          "error"
        );


        button.disabled =
          false;

      }

    }


    function showAdminStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "adminStatus"
        );


      if (!message) {

        el.style.display =
          "none";

        el.innerText =
          "";

        return;

      }


      el.style.display =
        "block";

      el.innerText =
        message;


      if (
        type === "success"
      ) {

        el.className =
          "status-success";

      } else if (
        type === "error"
      ) {

        el.className =
          "status-error";

      } else {

        el.className =
          "status-normal";

      }

    }


    function suggestEndTime(
      startValue
    ) {

      const start =
        new Date(
          startValue
        );


      if (
        isNaN(
          start.getTime()
        )
      ) {

        return "";

      }


      // 預設建議同一天 17:00。
      // 只是方便輸入，管理者仍需確認實際離場時間。
      const suggested =
        new Date(
          start
        );


      suggested.setHours(
        17,
        0,
        0,
        0
      );


      if (
        suggested.getTime() <=
        start.getTime()
      ) {

        suggested.setTime(
          start.getTime() +
          60 * 60 * 1000
        );

      }


      return toDateTimeLocalValue(
        suggested
      );

    }


    function toDateTimeLocalValue(
      date
    ) {

      const pad =
        function (
          value
        ) {

          return String(
            value
          )
          .padStart(
            2,
            "0"
          );

        };


      return (
        date.getFullYear() +
        "-" +
        pad(
          date.getMonth() + 1
        ) +
        "-" +
        pad(
          date.getDate()
        ) +
        "T" +
        pad(
          date.getHours()
        ) +
        ":" +
        pad(
          date.getMinutes()
        )
      );

    }


    function formatDisplayDateTime(
      value
    ) {

      if (!value) {

        return "";

      }


      const date =
        new Date(
          value
        );


      if (
        isNaN(
          date.getTime()
        )
      ) {

        return String(
          value
        )
        .replace(
          "T",
          " "
        );

      }


      const pad =
        function (
          number
        ) {

          return String(
            number
          )
          .padStart(
            2,
            "0"
          );

        };


      return (
        date.getFullYear() +
        "/" +
        pad(
          date.getMonth() + 1
        ) +
        "/" +
        pad(
          date.getDate()
        ) +
        " " +
        pad(
          date.getHours()
        ) +
        ":" +
        pad(
          date.getMinutes()
        )
      );

    }


    function escapeJsString(
      text
    ) {

      return String(
        text ?? ""
      )
      .replace(
        /\\/g,
        "\\\\"
      )
      .replace(
        /'/g,
        "\\'"
      )
      .replace(
        /\r/g,
        ""
      )
      .replace(
        /\n/g,
        "\\n"
      );

    }


    // ==========================================
    // 按鈕控制
    // ==========================================

    function updateButtons() {

      const site =
        getSelectedSite();


      const mode =
        String(
          settings.gpsMode ||
          "BLOCK"
        )
        .toUpperCase();


      const canClock =
        (
          !sending &&
          !!userId &&
          !!site &&
          !!currentPosition &&
          (
            gpsAllowed ||
            mode ===
            "ALLOW_WITH_FLAG"
          )
        );


      setButtons(
        canClock
      );

    }


    function setButtons(
      enabled
    ) {

      document
        .getElementById(
          "btnIn"
        )
        .disabled =
        !enabled;


      document
        .getElementById(
          "btnOut"
        )
        .disabled =
        !enabled;

    }


    // ==========================================
    // 計算 GPS 距離
    // ==========================================

    function calculateDistance(
      lat1,
      lng1,
      lat2,
      lng2
    ) {

      const R =
        6371000;


      const toRad =
        function (
          value
        ) {

          return (
            value *
            Math.PI /
            180
          );

        };


      const dLat =
        toRad(
          lat2 - lat1
        );


      const dLng =
        toRad(
          lng2 - lng1
        );


      const a =
        Math.sin(
          dLat / 2
        ) *
        Math.sin(
          dLat / 2
        )
        +
        Math.cos(
          toRad(
            lat1
          )
        ) *
        Math.cos(
          toRad(
            lat2
          )
        ) *
        Math.sin(
          dLng / 2
        ) *
        Math.sin(
          dLng / 2
        );


      const c =
        2 *
        Math.atan2(
          Math.sqrt(a),
          Math.sqrt(
            1 - a
          )
        );


      return (
        R * c
      );

    }


    // ==========================================
    // 顯示訊息
    // ==========================================

    function showStatus(
      message,
      type
    ) {

      const el =
        document.getElementById(
          "statusMsg"
        );


      el.innerText =
        message;


      el.className =
        "";


      if (
        type ===
        "success"
      ) {

        el.classList.add(
          "status-success"
        );

      } else if (
        type ===
        "error"
      ) {

        el.classList.add(
          "status-error"
        );

      } else {

        el.classList.add(
          "status-normal"
        );

      }

    }


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

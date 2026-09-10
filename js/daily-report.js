// 每日回報與審核
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

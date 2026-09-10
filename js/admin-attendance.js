// 管理後台：補卡、出勤審核、出勤日結
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

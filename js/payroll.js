// 薪資結算
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

# 人員身分與加入申請基礎層（第一批）

本批沒有部署 GAS、建立正式 Sheet 或執行 migration。沒有核准、離職、回任、停職、重綁或薪資寫入功能。

## 正式來源

`Code.gs` 搬入自使用者提供的正式 `Code_v3_4_3_progress_percent_override.txt`。
原始檔 SHA-256：`8afc109fb41c98682f1bc3d0a7ab7406587d03d3d4df597d8f5eecd934399e73`。
來源內較舊的版本註解／health 字串原樣保留。唯一變更是 `doPost` 開頭的新 action 分流；測試以雜湊確認其餘來源完整。

## 部署前置條件（人工處理）

1. 在原 Apps Script 專案 Script Properties 設定 `LINE_LOGIN_CHANNEL_ID`，值為目前 LIFF 所屬 LINE Login channel 的 ID，不能填 LIFF ID。這不是 secret。本方案不需要 channel secret。
2. 確認目前 LIFF 已啟用 `openid` scope，可取得 `liff.getIDToken()`。不改現有 LIFF ID 或 GAS Web App URL。
3. 由管理員在原 Spreadsheet 準備四張空表，第一列依 `EmployeeLifecycleStore.gs` 的 `EMPLOYEE_TABLES_` headers，完整且同序：員工加入申請 A:Q、員工任職紀錄 A:U、員工LINE綁定紀錄 A:N、員工異動紀錄 A:R。程式只驗證、不自動建立表；不改員工資料表 A:L。不要加入額外非空欄位。
4. 四個 `.gs` 檔須同時置入同一個原有、綁定 Spreadsheet 的 GAS 專案，使用 V8 runtime；更新既有 Web App deployment。保留原部署設定，不新增另一個 endpoint。
5. 先確認 GAS 設定／部署，再發布 frontend；新 frontend 的登入需要 `identityBootstrap`，後端未部署會阻止登入，不以舊信任模式繞過失敗。必須實機驗證既有員工登入，再驗證新人申請。

LINE token 僅放本次請求記憶體，不寫 Sheet、audit、sessionStorage 或 log。使用 LINE 官方驗證端點及 `client_id`，檢查 issuer、audience、sub、expiry；不能用前端 decoded profile 代替。
參考：[LINE ID token verify](https://developers.line.biz/en/reference/line-login/#verify-id-token)、[LIFF 使用者資料安全](https://developers.line.biz/en/docs/liff/using-user-profile/)。

## 新 action 契約

全部維持 POST、`text/plain;charset=utf-8`、JSON body、`redirect: "follow"`。共同欄位為 `action`、`idToken`；忽略前端 userId／employeeId／role。

| action | 額外 request 欄位 | 成功回應 |
|---|---|---|
| identityBootstrap | 無 | success, state, employee（最小 ID／姓名／權限或 null） |
| employeeApplicationSubmit | requestId, type=`NEW_EMPLOYEE`, name, phone, note | success, application |
| employeeApplicationListOwn | 無 | success, applications |
| employeeApplicationCancel | requestId, applicationId, expectedVersion（整數） | success, application |
| employeeLifecycleBaselineDryRun | 無 | success, dryRun, duplicateEmployeeIds, duplicateLineUids, blankEmployeeId, blankLineUid, unknownStatus, noOwner, eligibleEmploymentCount, eligibleBindingCount, exceptions |

application 只回傳 applicationId/type/name/phone/note/status/createdAt/cancelledAt/version，不回傳 LINE identity 或 request hash。
requestId 為 16–100 字元英數／底線／連字號，前端使用 UUID。錯誤格式為 `success:false, code, message`，驗證錯誤另有 `state:AUTH_ERROR`，不會降級成 UNREGISTERED。

## 鎖、重試與資料完整性

- 新 action 在舊 dispatcher 全域鎖之前識別，LINE 驗證在無鎖時執行；舊 action 及其鎖原樣保留。
- 申請／取消在驗證後取得短 ScriptLock，重新查員工與綁定，再做 requestId/hash、version、本人範圍檢查及 Sheet 寫入。
- 變更新增 STARTED audit intent、寫申請、追加 COMPLETED audit。若中途失敗，以原 requestId 恢復；before/after image 與版本不符則拒絕，不覆寫不明變更。
- 相同 requestId 相同內容不重複寫入；不同內容回 REQUEST_CONFLICT。另一個 requestId 遇到既有待審申請只記接收紀錄 `APPLICATION_SUBMIT_EXISTING`，不新增申請，不提升版本。
- 同一身分有未完成 intent 時，其他變更回 OPERATION_PENDING。前端保留未確認的業務請求於 sessionStorage，只由使用者按「重試前次操作」重送，不儲存 token、不自動重送。關閉視窗／清除儲存會失去前端重試資料；需管理員查 audit 的原 requestId 處理，不應另建申請或手動覆寫版本。
- baseline 僅強驗證後的在職 OWNER/ADMIN 可用，全程只讀。`noOwner` 表示沒有在職 OWNER。缺到職日保持未知；既有任職／綁定列不重建。此批不提供 baseline 正式套用工具。
- 舊員工以主檔 LINE 欄匹配；有正式綁定紀錄時以有效綁定為準，衝突 fail closed。此批不建立綁定，也不實作重綁；未來重綁需同步處理 legacy API 相容性後才可開放。
- 舊 attendance/payroll/daily report/progress action 尚未改為 token 驗證，不能宣稱本批已完成全系統強授權或歷史薪資保護改造。

## 本機測試

`node tests/employee-foundation.test.cjs`

`node tests/employee-foundation-browser.cjs`（需環境提供 Playwright；可用 `PLAYWRIGHT_MODULE` 指定模組路徑、`CHROME_PATH` 指定 Chrome。）

測試只使用虛構資料與記憶體 Sheet，瀏覽器攔截全部網路。未執行真實 LINE verify、正式 GAS 寫入或 migration。真實 LIFF openid、GAS 執行授權、Sheet 格式與部署版本仍需上線前人工小量驗證。

## 安全診斷（需另行人工更新部署）

原本的 `AUTH_ERROR` 同時涵蓋 LINE 連線、HTTP、token 拒絕及 claims 檢查，不能單憑此代碼確認根因。GAS catch 後正常回傳 JSON，因此 execution completed 不是驗證成功證據。main 的獨立測試頁也把拋出的例外統一轉成 REQUEST_FAILED，可能是 fetch、HTTP 或 JSON 解析失敗，不能當成第二次 token 拒絕的證據。

新後端保留原 `code`／`state`，另加固定白名單語意的 `diagnosticCode`：

- `LINE_CHANNEL_ID_MISSING`：Script Property 未設定；不是 LIFF ID，必須是該 LIFF 所屬 LINE Login channel ID。
- `LINE_TOKEN_MISSING_OR_INVALID`：輸入缺少或不符合既有基本限制。
- `LINE_VERIFY_NETWORK_ERROR`：UrlFetch／取得狀態發生例外，包含可能的授權或配額問題，無法單靠此碼進一步辨別。
- `LINE_VERIFY_HTTP_ERROR`：非 200／400／401（例如 429、5xx），不輸出原始 body。
- `LINE_TOKEN_REJECTED`：400／401 未提供可對應的已知拒絕原因。
- `LINE_AUDIENCE_MISMATCH`、`LINE_ISSUER_MISMATCH`、`LINE_TOKEN_EXPIRED`：成功 claims 檢查或 LINE 官方精確 error_description 對應。未知描述不猜測分類。
- `LINE_SUB_MISSING`、`LINE_VERIFY_MALFORMED_RESPONSE`：缺有效 sub 或 JSON／claims 格式不符。
- `BACKEND_SCHEMA_ERROR`、`BACKEND_IDENTITY_CONFLICT`、`BACKEND_LOOKUP_ERROR`、`BACKEND_INTERNAL_ERROR`：資料表、身分衝突、查詢或其他新流程錯誤。

前端另區分 `GAS_NETWORK_ERROR`、`GAS_HTTP_ERROR`、`GAS_NON_JSON_RESPONSE`、`GAS_RESPONSE_INVALID`。只顯示內建訊息，未知 code 不原樣顯示。沒有新增 log、token 雜湊、token 儲存或原始 LINE 回應輸出。

人工更新 GAS 時只需更新 `EmployeeIdentity.gs`（新增 employeeAuthFailure_、更新 verifyLiffIdentity_）與 `EmployeeApplication.gs` 的 handleEmployeeFoundation_（分階段及診斷欄位）。本輪沒有變更 Code.gs、employeeFoundationRequest_ 或 LifecycleStore；既有 dispatcher 分流仍需已部署。

main 現有測試頁是自含 inline API 的版本，與此 feature 的共用 identity.js 版本不同。之後必須另行批准更新其 inline identityBootstrap fetch／catch 及 fail 顯示：接收 diagnosticCode、只用安全訊息對照、區分四種 GAS transport 錯誤。不要直接把 feature 頁面覆蓋到 main 而遺漏其 js/identity.js 相依，也不要為測試改動正式登入流程。本輪不修改 main、不部署 GAS。

### UrlFetch 例外細分類

原 LINE_VERIFY_NETWORK_ERROR 也可能是缺 scope、未授權、配額或參數例外，不能證明網路故障。本次只增加 employeeUrlFetchDiagnostic_，以暫存的例外訊息比對固定服務語句，回傳下列固定代碼；不輸出／儲存／雜湊例外訊息或 token。未知或本地化語句一律泛化，不保證所有 GAS 例外都能細分。

| diagnosticCode | 意義／下一步 |
|---|---|
| LINE_VERIFY_PERMISSION_ERROR | 授權／權限訊息；檢查原專案 manifest 的 oauthScopes 是否包含 `https://www.googleapis.com/auth/script.external_request`（若明列 scopes），及部署執行身分是否已完成新增 scope 授權。保留其他既有 scopes。 |
| LINE_VERIFY_QUOTA_ERROR | 配額、呼叫頻率或服務使用限制訊息；檢查對應執行帳號的限制，不自動重試。 |
| LINE_VERIFY_CONNECTIVITY_ERROR | DNS、連線、逾時或 SSL 訊息；不關閉憑證驗證，不換 URL。 |
| LINE_VERIFY_REQUEST_ERROR | GAS 回報參數／方法簽章不符；核對正式部署檔案。 |
| LINE_VERIFY_FETCH_ERROR | 無法安全識別的例外，仍拒絕驗證，不能推斷是網路問題。 |

repo 沒有 appsscript.json，不能据此推斷線上 manifest 有或沒有 external_request。未新增猜測的 manifest，也未修改權限政策。字串 form payload、method post、contentType 與 muteHttpExceptions 用法符合 [UrlFetchApp 文件](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)。muteHttpExceptions 只讓 HTTP 錯誤回應不拋例外，不能略過執行授權／配額。配額例外參見 [Google 文件](https://developers.google.com/apps-script/guides/services/quotas)。

GAS_HTTP_ERROR 是瀏覽器 fetch 得到非成功 HTTP 狀態時產生。新後端 catch 回傳的是 ContentService JSON，沒有設定非 2xx；LINE_VERIFY_* 不會被程式直接轉成 GAS_HTTP_ERROR。部署／Google 前端／重新導向鏈或平台層失敗仍可能影響 HTTP；Completed 也不能證明瀏覽器成功收到 JSON。需要該次 HTTP 狀態等證據再判斷，不變更 Web App URL 或存取政策。

本次手動替換 GAS 只需 EmployeeIdentity.gs（新 helper 與 verifyLiffIdentity_ catch），更新原 deployment 的版本。EmployeeApplication.gs、Code.gs、store 不變。現有 main 測試頁尚無以上五個新代碼白名單，僅更新 GAS 時可能回退顯示 AUTH_ERROR；需另行授權只擴充 main 測試頁的安全訊息表，才能在手機看見細分類。本輪只更新 feature 前端對照表，未修改 main。

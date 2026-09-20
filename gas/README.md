# 人員身分與加入申請基礎層（第一批）

## 生命週期 Phase 2：狀態異動後端（未部署）

新增 `EmployeeLifecycleMutation.gs`，並更新 `EmployeeApplication.gs` 分流、`EmployeeLifecycleRead.gs` 安全投影。此批不提供前端，不改 Code.gs 舊 action／鎖、LINE verify、manifest 或既有薪資算法。

| action | 允許原狀態 | 新狀態 |
|---|---|---|
| `employeeLifecycleSuspend` | 在職 | 停職 |
| `employeeLifecycleLeave` | 在職 | 留停 |
| `employeeLifecycleResume` | 停職、留停 | 在職 |
| `employeeLifecycleTerminate` | 在職、停職、留停 | 離職 |

共用請求：`action, idToken, employeeId, requestId, expectedVersion, reason, effectiveDate`。employeeId 是永久主鍵；requestId 沿用 16–100 位英數／底線／連字號；expectedVersion 是正整數，取 Phase 1 `lifecycle.currentEmployment.version`，即「員工任職紀錄」U 欄，不是主檔或申請版本。reason 必填、最多 1000 字；日期嚴格使用 YYYY-MM-DD，依 Asia/Taipei 判定今天，只接受今天或過去，未來回 `FUTURE_EFFECTIVE_DATE_UNSUPPORTED`。日期不得早於已知任職開始日或本任職已完成的狀態異動；未知歷史日期保持空白，不猜測。

成功回應僅含 `success, employeeId, previousStatus, employeeStatus, effectiveDate, version, recoveryStatus:"COMPLETED"`。API 不回傳 LINE UID/sub、token、request hash、原始 audit、例外或 LINE 回應。既有 POST text/plain;charset=utf-8 與 redirect follow 不變。

### 權限與資料前置檢查

- 每次先在鎖外驗證真實 ID token，再於 ScriptLock 內重新解析在職 OWNER／ADMIN。OWNER 可管理四種角色；ADMIN 絕不可異動 OWNER。目標角色只讀主檔 G 欄，不採用 payload 的權限宣稱。
- 停職／留停／離職 OWNER 前，鎖內必須確認另有可經目前登入綁定解析的在職 OWNER；未完成生命週期操作的候選人不算可用。否則 `LAST_OWNER_REQUIRED`。
- 停職／留停／離職前，沿用 `getActiveSites_()`：工地資料表 L=施工中、G=主要領班員工 ID。任何角色的實際負責人都須先交接，否則 `SITE_HANDOFF_REQUIRED`；不清除／改派工地。
- 同上三操作沿用 `findOpenWorkSegment_()`：工作區段 C=員工 ID、J 有上班時間、K 無下班時間即阻擋，回 `OPEN_ATTENDANCE_REQUIRED`。不自動下班、補登或修改歷史。復職不改工地／出勤。
- 缺任職或 LINE 綁定基線回 `BASELINE_REQUIRED`。多個開放期間、重複任職 ID、主檔與期間狀態不一致回 `EMPLOYMENT_CONFLICT`。不建立期間、員工、日期或綁定；舊員工須等另行授權的受控 baseline 工具，現有 dry-run 保持只讀。
- 必須有唯一、目前有效且與主檔及驗證 channel 一致的綁定；不明確則 `BINDING_RECOVERY_REQUIRED`。綁定表本批完全不寫，主檔 J 的非在職狀態透過既有 identity／授權模型阻擋使用。復職只恢復同一任職期間，不恢復失效綁定、不提供回任／重綁。

### 最小寫入、版本與恢復

只有員工主檔 J（離職時 I:J）、原任職紀錄及 append-only 異動紀錄會寫入。主檔 A:H、K:L 不變；任職 ID／序號不變；停職／留停不關閉期間，復職清除本期停權時間，離職填 endDate、terminationReason、terminatedBy、terminatedAt。停權生效時間記實際操作時間，effectiveDate 記申報業務日期。每次成功邏輯異動任職版本只加一，不刷新出勤／薪資／報表／進度，已結算薪資不重新計算。

順序：先 append STARTED（format:2，安全主檔業務快照＋任職前後像＋原成功結果），停權類先改主檔再改任職；復職先改任職再啟用主檔；逐階段 flush，讀回一致後 append COMPLETED。業務快照不複製 LINE 綁定；audit 操作人 LINE 身分仍依已批准 schema 保存，token 永不持久化／hash／log。

同操作人、同 requestId／內容回原結果，或只補可證明缺少的 checkpoint；相同 requestId 改內容為 `REQUEST_CONFLICT`。新請求過期版本為 `VERSION_CONFLICT`；不允許的轉換為 `INVALID_STATUS_TRANSITION`。同員工未完成操作阻擋其他請求；快照有不明差異或重複列為 `RECOVERY_REQUIRED`。Sheets 日曆 Date／ISO 僅在日期比較時正規化，不覆寫未知歷史。重試仍重新檢查操作人及目標權限、綁定與未完成步驟的交接／出勤條件。

**中斷限制：**Sheets 並非跨表交易，失敗可能已部分生效。保留原 requestId、完整業務欄位與 expectedVersion，由原在職管理員取得新 token 後明確重試。若管理員對自己停職／留停／離職，主檔停權後便失去重試資格；或其他原因失權，也不提供認證例外。此時保留 STARTED，需授權管理員人工核對，不能清除 audit、換 requestId 或自動接管。本批未實作強制修復工具。這是已知需操作介面提示的限制。

另行部署時，在原 GAS 專案新增 `EmployeeLifecycleMutation.gs`，替換 `EmployeeApplication.gs`、`EmployeeLifecycleRead.gs`，其餘檔案保留。由使用者更新原 Web App 新版本，URL／scope／executeAs／access 不變。本輪沒有部署、操作正式 Sheet 或 migration。舊 API 仍有原本 userId 信任限制；本批不宣稱已完成全站強驗證或歷史薪資取值改造。

離線檢查：`node tests/employee-foundation.test.cjs`（47 組；Phase 2 包含矩陣及 32 個寫入前／後失敗案例）、三支既有瀏覽器 mock 回歸測試。正式小量寫入驗收尚待另行授權；legacy 員工缺基線時預期拒絕，不能拿正式資料臨時製造基線。

## 身分基礎層驗收與操作備忘

使用者已回報原 Web App 原址更新至版本 40 後，真實 LIFF 初始化、LINE 環境、ID token 取得與在職員工的 identityBootstrap 均成功，結果為 ACTIVE_EMPLOYEE；本輪未重新呼叫正式 API。先前 editor probe 的權限錯誤，在明列 scopes 並由部署帳號重新授權後，變為 HTTP_RESPONSE_RECEIVED／400，確認該次問題是 UrlFetch 授權。此紀錄不保存員工姓名、ID、LINE sub 或 token。

- UrlFetchApp 需要 `script.external_request`；目前 manifest 同時保留既有試算表需求 `spreadsheets.currentonly`，與使用者確認成功的線上設定一致。
- 新增／調整 scope 後，原部署帳號須先在 editor 手動執行 `employeeIdentityEditorConnectivityTest()`，依提示完成新 scope 授權。
- probe 僅用固定假資料，不經 API、未讀寫 Sheet；HTTP_RESPONSE_RECEIVED 加上假資料 400／401 表示可取得 LINE HTTP 回應，不表示假 token 有效。
- 授權與 probe 成功後，將**現有 Web App deployment**更新至新版本，保留原 /exec URL；不必另建 deployment。
- 正式驗證仍由 LINE server-side verify 判定真 token，再檢查 issuer／audience／expiry／sub；identityBootstrap 只讀。token／原始 LINE 回應不記錄或持久化；申請與 audit 中必要的 verified sub 關聯依原核准 schema 保留，並非所有 sub 都禁止儲存。
- 這段紀錄只驗收身分基礎層。管理員審核後端已於後續批次新增，尚未部署或真實寫入驗證，詳見下方審核操作章節。下方診斷排查說明保留歷程。

目前授權修復請以本文末「完整 scope 盤點與人工授權順序」為準；前面的診斷段落保留排查經過。

本批沒有部署 GAS、建立正式 Sheet 或執行 migration。審核只處理真正新人，不提供離職、回任、停職、重綁或既有員工薪資異動。

## 管理員加入申請審核（backend-only，未部署）

新增 `EmployeeApplicationAdmin.gs`；`EmployeeApplication.gs` 擴充 action 分流與未完成審核保護。`Code.gs`、強驗證 helper、四表 schema、manifest、正式 frontend 均不變。尚未提供管理 UI，亦未對正式資料做寫入測試。

### Action 契約

三個 action 共用既有 POST `text/plain;charset=utf-8`、JSON、`redirect:"follow"`，必須提供真實 `idToken`。token 只交給 LINE verify，不寫 audit、hash、log 或 response。

| action | 額外參數 | 回應 |
|---|---|---|
| `employeeApplicationAdminList` | `status` 可省略（預設待審核），允許四種既有申請狀態 | `success, applications`；既有公開申請欄位加 `reviewedAt, reviewReason, recoveryRequired`，無 LINE sub／Channel ID／薪資／request hash |
| `employeeApplicationApprove` | `requestId, applicationId, expectedVersion, grade, salaryType, salaryAmount, systemRole, hireDate, adminNote` | `success, application, employeeId` |
| `employeeApplicationReject` | `requestId, applicationId, expectedVersion, adminNote`（必填拒絕原因） | `success, application, employeeId:""` |

`requestId` 沿用 16–100 字元規則；`expectedVersion` 為正整數。`salaryType` 只接受既有「日薪／月薪」，`salaryAmount` 為非負有限數字，`hireDate` 為有效 `YYYY-MM-DD`；grade 必填，不把級職當系統權限。核准的 adminNote 可省略。姓名、手機、LINE 身分來自原申請，不採用前端傳來的 employeeId／name／LINE UID。此階段不增加未來到職權限排程或薪資算法。

在職 OWNER 可授予全部四種角色；在職 ADMIN 可授予 ADMIN／SITE_MANAGER／EMPLOYEE，不能授予 OWNER。SITE_MANAGER／EMPLOYEE／非在職者不能列出、核准、拒絕。每次 server-side verify 後解析目前主檔，寫入取鎖後再讀一次角色與身分。LINE UrlFetch 不持鎖；舊 API 鎖行為不變。

### 核准順序與恢復

1. 驗證管理員、解析輸入後，在 ScriptLock 內重新讀取申請、版本、schema、歷史关联與 request 收據。只接受 `NEW_EMPLOYEE`／待審核。相同姓名／手機不自動合併。
2. 依主檔、申請、任職、綁定及 audit 中所有 `EMP` 數字尾碼的最大值加一，至少三位補零，例如 `EMP099 → EMP100`。STARTED 中保留的 employeeId 也不重用。既有非此格式 ID 原樣保留，未知到職歷史不猜、不 migration；格式依 repo EMP001 慣例，未讀正式 Sheet 做編號盤點。
3. 寫入 `STARTED` audit：原申請快照、預定五表相關資料、穩定新 ID、業務請求摘要與原始成功結果。audit 的 `afterJson` 在審核 action 使用 `format:1` bundle，其他舊 action 格式不變。保留必要 LINE 關聯與人事快照供追溯，因此 Sheet/audit 僅限授權管理員存取；不含 token。
4. 新增任職紀錄（任職序號 1、到職日及級職／薪資／角色快照），再新增有效 LINE 綁定。
5. 更新申請為已核准，版本加一，填審核人／時間／核定員工 ID。
6. 最後 append 一筆在職員工主檔 A:L：ID、LINE UID、申請姓名、級職、薪資制、薪資金額、權限、到職日、空離職日、在職、申請電話、管理備註。不更新舊員工列或欄位。
7. 再讀檢查一致後 append `COMPLETED` audit，回傳保存的成功結果。

拒絕只寫 STARTED → 申請已拒絕／版本加一 → COMPLETED，不建立員工、任職或綁定。

Google Sheets 沒有跨表原子交易。本實作逐階段 flush；同一 requestId／同一內容重試時，僅補缺少的 checkpoint，精確符合快照的列直接跳過，最後補 COMPLETED。已完成重試回原結果，不採後來被改動的申請。不明差異、重複列、缺少較早 checkpoint 或損壞 intent 回 `RECOVERY_REQUIRED`，不覆寫。日期型別只在比對日曆欄位時正規化為台灣日期。

若員工主檔已建立而 COMPLETED 寫入失敗，必要業務表與 STARTED 均已存在，員工可被既有登入流程辨識；原審核請求重試只補完成收據。若更早失敗尚未建立主檔，綁定不足的身分會 fail closed。這不是回滾交易；不可手動刪除 checkpoint 後換新 requestId。

同 requestId 不同業務內容回 `REQUEST_CONFLICT`；過期版本回 `VERSION_CONFLICT`；已核准／拒絕／取消回 `APPLICATION_NOT_PENDING`。已有 LINE 歷史主檔／綁定／核准申請，或已有任職關聯，回 `IDENTITY_CONFLICT`／`LINE_BINDING_CONFLICT`／`EMPLOYMENT_CONFLICT`，交由人工處理，不自動回任。權限及輸入錯誤使用 `FORBIDDEN`／`INVALID_ROLE_ASSIGNMENT`／`INVALID_APPROVAL_DATA`。寫入失敗使用固定安全錯誤，無 raw exception。

未完成審核會阻擋其他 request 審核及申請人取消。原管理員保留原 requestId、完整業務參數及 expectedVersion，取得新有效 token 後明確重試；不自動重送。若仍 RECOVERY_REQUIRED 或原管理員已失權，由授權管理員人工核對 audit 與五表；本批沒有強制接管／修復 API，不要清除 audit、覆寫狀態或另建員工。舊 API 尚有 userId 信任限制，未在本批擴改。

### 人工測試前準備

在原 Apps Script 專案**新增** `EmployeeApplicationAdmin.gs`，並**完整替換** `EmployeeApplication.gs`，兩者必須一起更新。保留現有 Code、EmployeeIdentity、EmployeeLifecycleStore 及 manifest；不用新增 scopes、不改 URL/access/executeAs。確認五張既有 Sheet 表頭正確，不新增表、不搬遷舊列。由使用者另行更新既有 Web App 的新版本後，才以授權的小量案例測核准／拒絕與原 requestId 重試。本輪未代為部署、操作 Sheets 或提供正式 UI。

離線測試：`node tests/employee-foundation.test.cjs`（28 組，含每個 checkpoint 寫入前／後失敗注入、角色矩陣、鎖競爭、原 action 契約與強驗證），以及既有兩支模擬瀏覽器測試。mock 不能證明 Google 真實跨表 I/O、日期欄格式與部署權限，需後續小量實機確認。

## 生命週期管理 Phase 1：唯讀清單／詳細狀態（未部署）

新增 `EmployeeLifecycleRead.gs`，`EmployeeApplication.gs` 僅追加兩個 action 分流。仍使用 server-side LINE ID token verify，再解析在職員工，僅 OWNER／ADMIN 可用。ADMIN 可檢視 OWNER；這不授予修改 OWNER 的權限。沒有新 scope、寫入、Sheet 建立、migration、baseline 建立或既有 API 契約變更。

| action | 請求欄位 | 成功回應 |
|---|---|---|
| `employeeLifecycleAdminList` | `action, idToken` | `{success:true, employees:[{employee,lifecycle,warnings}]}` |
| `employeeLifecycleAdminDetail` | `action, idToken, employeeId`（必填非空字串） | `{success:true, employee,lifecycle,warnings,employments,lineBindings,changes}` |

保持 POST `text/plain;charset=utf-8`、JSON 與 `redirect:"follow"`。以 employeeId 精確匹配，不以姓名／手機匹配。找不到目標回 `EMPLOYEE_NOT_FOUND`；重複主檔 ID 的 detail 回 `IDENTITY_CONFLICT`；缺少／錯誤輸入回 `VALIDATION_ERROR`；表頭或缺表回 `SCHEMA_ERROR`；讀取階段非預期例外轉為固定 `STORAGE_ERROR`。身分驗證流程既有的 AUTH_ERROR／安全 diagnostic 不变，不回原始例外。

- `employee`：employeeId、name、grade、salaryType、salaryAmount、systemRole、hireDate、terminationDate、employeeStatus、phone；detail 另有 note。主檔 A:L 映射沿用正式來源，跳過 B 欄 LINE UID。沒有改主檔 helper 或表頭。
- `lifecycle`：baselineStatus、openEmploymentCount、currentEmployment、activeBindingCount、hasActiveLineBinding、bindingStatus。currentEmployment 僅於恰有一筆可確認未結束任職時提供；無綁定紀錄時 hasActiveLineBinding 為 null、bindingStatus 為 UNKNOWN，不以主檔 UID 假造基線。
- `employments`：employmentId、sequence、startDate、endDate、grade、salaryType、salaryAmount、systemRole、status、disabledAt、baselineDate、createdAt、terminatedAt。使用 `EMPLOYEE_TABLES_` 現有欄名映射，不另猜索引。
- `lineBindings`：僅 status、active、validFrom、validTo、sourceType、reason。不回 bindingId、Channel ID、LINE UID/sub。active 表示該綁定列依「有效」與起迄時間在讀取當下有效，不代表完整登入授權；仍須檢查 warnings 與強驗證結果。
- `changes`：changeType、effectiveDate、effectiveAt、before、after、operatorEmployeeId、operatorName、timestamp、reason、phase。只解析已存在的申請快照及核准 bundle v1，抽取白名單業務值；不回 raw JSON、requestId/hash、operatorSub、token、綁定或申請識別。未知快照格式只回空業務物件，壞 JSON 另附 AUDIT_VALUES_UNAVAILABLE。operatorName 為目前主檔唯一匹配姓名，並非歷史姓名快照。STARTED／COMPLETED 保留階段，不假裝未完成操作已成功。

**基線與一致性：** 無任職／綁定／員工異動紀錄的既有員工標示 LEGACY_NOT_BASELINED，未知日期保持空白，不因此判定損壞。已有部分紀錄但缺其他資料會回缺漏警告，可能是未完成基線或操作，必須人工確認。只有結束日期空白且狀態為在職／停職／留停的任職列計入未結束任職；停止／恢復狀態的寫入尚未實作。另檢查多筆未結束任職、在職無未結束任職、離職仍有未結束任職、主檔／任職狀態不符、多個有效綁定、跨員工重複 LINE、主檔／綁定不符、無法辨識狀態／日期及未完成 audit。warnings 只有固定 code/message，不附原始資料；不自動修復。

唯讀操作不取得 ScriptLock。讀取多表可能與另一個合法寫入交錯，警告是當次觀察，不是交易快照或修改許可；遇到暫時不一致先重新讀取。未來狀態、回任、薪資異動必須在寫入鎖內重新驗證角色、最後 OWNER、唯一任職／綁定與版本；不得拿此回應直接當作寫入授權。本批不提供這些 write-policy／mutation action，也不重算薪資。

人工測試前，於原 GAS 專案新增 `EmployeeLifecycleRead.gs` 並替換 `EmployeeApplication.gs`，保留其他來源及 manifest。使用者另行更新原 deployment 才能呼叫新 action；本輪沒有部署或操作 Sheets。六個 `.gs` 須同處原專案。管理回應含薪資與手機，僅供授權管理員使用，不應放公開 log／公開頁面。

## 正式來源說明

`Code.gs` 搬入自使用者提供的正式 `Code_v3_4_3_progress_percent_override.txt`。
原始檔 SHA-256：`8afc109fb41c98682f1bc3d0a7ab7406587d03d3d4df597d8f5eecd934399e73`。
來源內較舊的版本註解／health 字串原樣保留。唯一變更是 `doPost` 開頭的新 action 分流；測試以雜湊確認其餘來源完整。

## 部署前置條件（人工處理）

1. 在原 Apps Script 專案 Script Properties 設定 `LINE_LOGIN_CHANNEL_ID`，值為目前 LIFF 所屬 LINE Login channel 的 ID，不能填 LIFF ID。這不是 secret。本方案不需要 channel secret。
2. 確認目前 LIFF 已啟用 `openid` scope，可取得 `liff.getIDToken()`。不改現有 LIFF ID 或 GAS Web App URL。
3. 由管理員在原 Spreadsheet 準備四張空表，第一列依 `EmployeeLifecycleStore.gs` 的 `EMPLOYEE_TABLES_` headers，完整且同序：員工加入申請 A:Q、員工任職紀錄 A:U、員工LINE綁定紀錄 A:N、員工異動紀錄 A:R。程式只驗證、不自動建立表；不改員工資料表 A:L。不要加入額外非空欄位。
4. 六個 `.gs` 檔須同時置入同一個原有、綁定 Spreadsheet 的 GAS 專案，使用 V8 runtime；更新既有 Web App deployment。保留原部署設定，不新增另一個 endpoint。
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
- 舊員工以主檔 LINE 欄匹配；有正式綁定紀錄時以有效綁定為準，衝突 fail closed。新人核准建立新綁定；既有員工不自動 migration，也不實作重綁。未來重綁需同步處理 legacy API 相容性後才可開放。
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

## 完整 scope 盤點與人工授權順序

實測 editor probe 回傳 PERMISSION_ERROR + EXTERNAL_REQUEST_SCOPE_MENTIONED，證明當次執行缺 UrlFetch 授權；不能据此斷言「没有 oauthScopes 就是錯誤」。GAS 原本可自動偵測 scopes，也可能是執行帳號尚未重新授權。新增顯式 scopes 後，它是完整需求清單，不會自動補入未列出的服務。

### 原始碼盤點

檢查 repository 全部四個 GAS 檔案：Code.gs、EmployeeIdentity.gs、EmployeeApplication.gs、EmployeeLifecycleStore.gs；没有 clasp 設定或其他 GAS 子專案。GAS 原始碼集中在 gas/，故 manifest 版控於 gas/appsscript.json；手動貼到線上專案的 appsscript.json，不是建立 gas 子資料夾，也不放 GitHub Pages 根目錄。

| 實際服務 | 實際方法／用途 | 所需 OAuth |
|---|---|---|
| SpreadsheetApp | getActiveSpreadsheet、flush；衍生 Spreadsheet/Sheet/Range 的 getSheetByName、getDataRange、getRange、getLastRow、getLastColumn、getValues、appendRow、setValue、setValues、clearContent | spreadsheets.currentonly |
| UrlFetchApp | fetch：LINE verify 與假資料 editor probe | script.external_request |
| PropertiesService | getScriptProperties().getProperty：讀 channel ID | 無額外 OAuth scope |
| LockService | getScriptLock、waitLock、tryLock、releaseLock | 無額外 OAuth scope |
| Utilities | formatDate、getUuid、computeDigest（业务 request hash）、DigestAlgorithm/Charset 列舉 | 無額外 OAuth scope |
| ContentService | createTextOutput、setMimeType、MimeType.JSON | 無額外 OAuth scope |
| Session | 僅 getScriptTimeZone，沒有讀使用者 email | 無額外 OAuth scope，不加 userinfo.email |
| console | 編輯器診斷固定安全 JSON | 無額外 OAuth scope |

沒有 DriveApp、HtmlService、ScriptApp、GmailApp、MailApp、CalendarApp、DocumentApp、SlidesApp、FormApp、CacheService、Jdbc、Maps、LanguageApp 或進階 Drive/Sheets API 呼叫。照片牆／Drive 仍未實作於目前 GAS，不能先加未来權限。JSON、Date、Math 等是 JavaScript 內建，不是 Google OAuth 服務。

出勤、薪資、每日回報、工地日報、工程進度均於 Code.gs 讀寫目前試算表；人員申請/audit/store 同樣讀寫目前試算表。沒有 SpreadsheetApp.openById/openByUrl/create、copyTo 另一檔或 Drive 操作。故使用支援這些方法的較窄 spreadsheets.currentonly，而非全 spreadsheets 或 readonly（既有模組必須寫入）。原本就依賴 getActiveSpreadsheet 的執行環境，此批不改其綁定／檔案選擇方式。

完整 manifest 見同目錄 appsscript.json。只新增 oauthScopes 兩項；其餘欄位完全沿用使用者提供的線上 manifest。沒有改 URL、executeAs、access 或 runtime。

### Google 官方依據

- [明列 scopes 與最小權限](https://developers.google.com/apps-script/concepts/scopes)
- [SpreadsheetApp.getActiveSpreadsheet 的 currentonly 選項](https://developers.google.com/apps-script/reference/spreadsheet/spreadsheet-app#getActiveSpreadsheet())
- [Sheet.appendRow 授權](https://developers.google.com/apps-script/reference/spreadsheet/sheet#appendRow(Object))、[Range 讀寫授權](https://developers.google.com/apps-script/reference/spreadsheet/range)
- [UrlFetchApp 的 external_request 要求](https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app)
- [Session.getScriptTimeZone](https://developers.google.com/apps-script/reference/base/session#getScriptTimeZone())
- [PropertiesService](https://developers.google.com/apps-script/reference/properties/properties-service)、[LockService](https://developers.google.com/apps-script/reference/lock/lock-service)、[Utilities](https://developers.google.com/apps-script/reference/utilities/utilities)、[ContentService](https://developers.google.com/apps-script/reference/content/content-service)
- [重新授權與未驗證畫面](https://developers.google.com/apps-script/guides/services/authorization)、[Web App 執行身分](https://developers.google.com/apps-script/guides/web)

### 操作步驟（不需改任何 Sheet）

1. 留在目前原 GAS 專案，確認右上角是原 Web App 的部署帳號。USER_DEPLOYING 使用部署者授權；不同帳號在 editor 成功不能保證部署者也有權限。
2. 若目前已開 appsscript.json，直接保留一份舊內容，再用本 repo gas/appsscript.json 完整內容替換；若未顯示，開左側齒輪「專案設定」，勾選顯示 appsscript.json，再回編輯器打開。不要刪除其他 .gs。
3. 儲存。確認 executeAs 仍為 USER_DEPLOYING、access 仍為 ANYONE_ANONYMOUS、timezone/runtime 不變。這一輪只需替換 manifest；若 editor probe 已存在，不用重新貼任何 .gs。
4. 上方函式選單選 employeeIdentityEditorConnectivityTest，按「執行」。不選 doPost，不貼 token。這是最新已儲存原始碼的 editor 執行，不必先部署。
5. 若帳號尚未授權所需 scopes，執行時應出現「需要授權／檢視權限」。選原部署帳號，核對目前試算表存取及外部服務連線需求後允許。已經授權過可能不再提示；不要為了強迫彈窗而撤銷整個正式專案權限。
6. 若出現「Google hasn't verified this app」，僅在確認是自己管理的原專案、帳號、合理權限，且頁面提供進階入口時，選「進階」→「前往〔自己的專案名稱〕（不安全）」→核對並允許。若專案名稱不符、要求郵件/Drive 等非預期權限，或顯示 blocked／沒有入口，停止，交由 Workspace 管理員／專案管理員確認；不繞過組織政策。
7. 授權完成後必要時再按一次執行。看安全 JSON：預期 success:true、category:HTTP_RESPONSE_RECEIVED，400/401 是假資料正常拒絕。這只證明 editor 外部請求可取得回應，尚未證明真 token、Sheet 授權或 Web App 都正常。
8. 若仍 PERMISSION_ERROR，先儲存並重新整理 editor，檢查同一個原部署帳號、manifest scopes 拼寫及外部連線是否獲允許；不要把錯誤當成成功或直接加全 Drive 權限。
9. probe 成功後，右上「部署」→「管理部署」→選目前正式 Web App →鉛筆編輯→版本選「新版本」→部署。使用同一筆 deployment，保留存取與執行設定；核對 /exec URL 與原本完全相同。不要按建立另一個新 deployment。
10. 從 LINE 重新開啟既有身分測試頁，重試只讀 identityBootstrap。在職且資料對應正確時預期 ACTIVE_EMPLOYEE 與本人姓名/員工ID；新人則 UNREGISTERED 或 APPLICATION_PENDING，其他狀態依資料正常呈現，不强制在職。
11. 同時以既有正式介面做只讀載入確認：出勤、薪資、每日回報、工地日報、工程進度清單；不要按刷新結算／儲存／確認等寫入按鈕。明列 scopes 改變授權範圍，應確認所有既有模組的 Sheet 讀取仍正常。正式寫入回歸另以已授權的小量案例驗證。

### 執行模式與完成標準

ANYONE_ANONYMOUS 只代表不要求呼叫者 Google 登入，不會免除部署帳號的 OAuth 授權，也不會把訪客當成員工。新 actions 仍須驗證 LINE ID token；舊 API 原有 userId 信任限制不在本輪擴改。外部請求與試算表操作使用部署者權限與相應配額，設定保持不變。

本次 scope 集合對 repo 現有程式是完整最小集合；若線上另有未版控的其他 .gs／library，不能宣稱涵蓋未知程式。本機 mock 不執行 Google OAuth，無法保證真實 scope 授權結果。必須等部署帳號重新授權、probe 成功、原 deployment 更新、真 LINE 身分及既有 Sheet 模組載入通過，才可稱授權問題已解決。GAS_HTTP_ERROR、Sheet schema、LINE token 拒絕等若仍出現，須分別追查。

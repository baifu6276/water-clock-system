# T3 Production Read-Only Acceptance Record / T4 Readiness Assessment

文件日期：2026-09-24。狀態：本機草稿，等待人工 review；commit / push / PR / merge / deploy 全部 HOLD。

**T3 唯讀驗收：PASS。EMP001 首次真實 Migration：NOT READY。**

後續規格草稿：[T4 Controlled Migration Specification](transport-v2-t4-controlled-migration-spec.md)。其中的 server permit、T4 route、client journal、v4 audit 為待實作設計，不是本文件受查版本已有功能，也不解除 Production Migration HOLD。後續重新核對補充：既有 migration 忽略未知 request keys，未實作 strict key allowlist；snapshot 無 TTL，另一位 actor 的資料不一定在目標 snapshot 內，須另做授權／permit 檢查。

## 1. 範圍與證據來源

本輪僅檢查程式、歷史與既有離線測試，新增此文件。沒有呼叫 production API、執行真實 migration、修復資料或寫入 Sheets。測試中的 migration 呼叫僅作用於記憶體 mock。

- Production 證據：使用者提供的 iPhone / LINE 驗收結果，非本輪重新實測。
- GitHub main：PR #10 merge commit `b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5`。唯讀 GitHub PR/compare 查詢確認已合併，與本地 diagnostics HEAD `c41c2564fc4352ca6a842402903a705bd9025251` 的檔案比較為空。
- 本地 Transport 檢查及文件所在分支：`codex/transport-redirect-diagnostics`，上述 `c41c256...`，未切換或修改 main。
- GAS / foundation 測試來源：另一既有 checkout 的 `feature/employee-identity-v1`，commit `c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd`。main 的受查 tree 不含這些 GAS 原始碼；不可混稱全部已進 main。
- 已部署 GAS V44 與此 feature 原始碼的逐檔一致性：**NOT VERIFIED**。唯讀真機成功不能證明所有寫入分支與受查原始碼完全一致。
- 本文件不保存 token、LINE UID/sub、原始回應、完整上游 URL 或實際 snapshot hash；姓名與薪資個資不重複抄入可提交文件。

## 2. T3 Production closure

| 項目 | 使用者提供的真機證據 | 判定與界線 |
| --- | --- | --- |
| 環境 | iPhone / LINE；Worker version `b7f72c2f`；Transport `t3-2-status-only`；GAS V44 | 使用既有 deployment；本輪未操作平台 |
| Identity | LIFF 初始化成功、在 LINE 內、ID token 可取得；HTTP 200；`ACTIVE_EMPLOYEE`、EMP001；姓名符合驗收；error 無 | PASS；不保存 token |
| Diagnostics | `transportStage`、`redirectDiagnostic` 均為 `—` | 此次未發生 transport error |
| EMP001 baseline dry-run | `LEGACY_NOT_BASELINED`、`eligible=true`、`bindingSource=PRESENT`、ADMIN；級職與薪資欄位符合人工驗收 | PASS；eligible 是當時預覽結果，不是寫入授權 |
| 未知日期 | hireDate 空白；`HIRE_DATE_UNKNOWN`；snapshotVersion 格式有效 | 不推定歷史到職日；不把 baselineDate 當到職日 |
| Request status | 本地 `status-probe-<UUID>`；`NOT_OBSERVED`、historicalCompletion=false、currentConsistency=UNKNOWN、兩項 Allowed=false | PASS；只代表本次查詢沒有可見的原操作證據，不代表可以新增或重送 migration |
| 寫入 | 此次驗收未執行 migration / business write | T4 仍 HOLD |

已驗證唯讀路徑：LINE → LIFF → Worker → GAS → LINE 強驗證 → 員工解析 → dry-run / original-request status → UI。

先前 HTTP 502 / `UPSTREAM_REDIRECT_DENIED`，correlation `bf8a3c96-1272-4777-80c9-53c3d54b8245`：**OBSERVED / NOT REPRODUCED / MONITOR**。之後同一安全政策成功，不等於 **RESOLVED ROOT CAUSE**。不推定 Google hostname 改變，不放寬 allowlist。再次發生時僅收集既有固定 redirectDiagnostic / transportStage 與安全 correlation；不收集 Location、query、token 或 body。

## 3. Code / test evidence 索引

以下 GAS 與 foundation tests 連結固定在受查 feature commit，Transport 固定在 main merge commit。

- **R**：[relay.mjs](https://github.com/baifu6276/water-clock-system/blob/b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5/transport-v2/worker/relay.mjs)，routes、parseRequest、EMP001 gate；只開 identity、dry-run、status。
- **U**：[client.js](https://github.com/baifu6276/water-clock-system/blob/b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5/transport-v2/live-test/client.js)，preview/status validation、status-probe UUID、狀態訊息；沒有 migration request builder。
- **D**：[Code.gs L86](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/Code.gs#L86)、[EmployeeApplication.gs L7](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeApplication.gs#L7)：early dispatcher、逐次 token 驗證、鎖內重讀、固定錯誤。
- **I**：[EmployeeIdentity.gs L68](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeIdentity.gs#L68)：verifyLiffIdentity_、employeeContext_、employeeIdentityState_。
- **A**：[EmployeeApplicationAdmin.gs L2](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeApplicationAdmin.gs#L2)：employeeRequireReviewer_、recovery、canonical row helpers。
- **M**：[EmployeeLifecycleMutation.gs L30](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeLifecycleMutation.gs#L30)：employeeLifecycleTarget_，ADMIN 不可處理 OWNER；period date normalization。
- **S**：[EmployeeLifecycleStore.gs](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeLifecycleStore.gs)：schema L2；requestId L71；ScriptLock L75；row write L81；audit append L98；dry-run L147。
- **B**：[EmployeeLifecycleBaseline.gs](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/gas/EmployeeLifecycleBaseline.gs)：state/hash L9–18；decode/inspect L22–48；eligibility L50–72；preview L74–84；finish L85–94；migrate L95–133；read-only status L135 起。
- **F**：[employee-foundation.test.cjs](https://github.com/baifu6276/water-clock-system/blob/c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd/tests/employee-foundation.test.cjs)：mock L12–63；baseline L642–692；status L695–805。

## 4. T4 Readiness Matrix

PASS 限於表中所述程式與已執行 mock 證據，不等於 production migration 驗收。狀態僅用 PASS / PARTIAL / BLOCKED / NOT IMPLEMENTED / NOT VERIFIED。

| # | 問題 | 狀態 | 結論與 evidence |
| --- | --- | --- | --- |
| 1 | 唯一合法 caller | PARTIAL | GAS 接受經 LINE 驗證、在職 OWNER/ADMIN；目標另做角色檢查。並非「只能透過 Worker」：既有 /exec dispatcher 可直接接受合法管理員請求，沒有 Worker 專用憑證 gate。T4 唯一受控操作入口尚無實作。D/I/A/M，F648。 |
| 2 | 每次 token 驗證 | PASS | handleEmployeeFoundation_ 每次呼叫 verifyLiffIdentity_；LINE server-side verify、issuer/audience/expiry/sub 檢查，token 不入 audit/hash。驗證在寫入鎖外。D16、I68–100；F45/74。 |
| 3 | ACTIVE + OWNER/ADMIN | PASS | reviewer 檢查身分狀態及角色，寫入鎖內再次 employeeContext_；不信任 payload role/employeeId 作為操作者。D27–30、A2、F648/654/656。 |
| 4 | 禁止 SITE_MANAGER | PASS | reviewer 拒絕 SITE_MANAGER / EMPLOYEE；authority mock 涵蓋四角色。A2、F648。 |
| 5 | 只能 EMP001 | BLOCKED | 現行 Worker 的唯讀 lifecycle routes 限 EMP001，且拒絕 migration。GAS employeeBaselineId_ 只做字串長度/非空檢查，可處理其他合法目標；不是 EMP001 專用 write gate。不能把唯讀限制推論為 T4 寫入限制。R、B2、F648。 |
| 6 | 使用 dry-run snapshot | PARTIAL | expectedSnapshotVersion 必須 64 位小寫 hex，並與目前完整 state hash 比對；無 token 型 preview receipt，也不能證明人真的看過預覽。現有 T3 UI 只驗證格式，未建立 T4 確認/保存流程。B18/98/110、U、F655/668。 |
| 7 | snapshot 過期/資料變更 | PASS | 無時間 TTL；資料變更即 VERSION_CONFLICT（新操作），已 STARTED 則重建原 snapshot 不符時 RECOVERY_REQUIRED。純時間經過不會單獨使 snapshot 失效。B43–47/110、F668/685。 |
| 8 | requestId 來源/重試 | PARTIAL | 後端要求 caller 提供，格式 `[A-Za-z0-9_-]{16,100}`，不代產。status-probe ID 不可當 migration ID。T4 client 保存原 ID/原內容與明確確認尚未實作；原請求重送可能補寫，不是唯讀。S71、B97/103–108、U183、F674/680。 |
| 9 | requestHash 內容 | PASS | SHA-256(JSON) 固定序列：LEGACY_BASELINE、verified sub、verified channelId、目標 employeeId、expectedSnapshotVersion、trim(reason)、true。requestId 是查詢 key，不在 hash；token 不在其中。B100、S67。 |
| 10 | 同 ID 不同內容 | PASS | 以 operatorSub + requestId 查 audit，action/hash 不符 REQUEST_CONFLICT，不写入。這是操作者範圍，不是全域唯一鍵；跨 actor 同 ID 的 status 另 fail closed。B102–104、F674/769。 |
| 11 | 同 ID 同內容 | PARTIAL | 完整回執可回傳原完成結果；STARTED 可能補完缺少 checkpoint。已 COMPLETED 分支僅 decode 回執，未走 status 的完整一致性驗證，不能代表當前資料無漂移。B105–108、F674/680。 |
| 12 | STARTED 無 COMPLETED | PARTIAL | inspect 驗證回執、逐筆 image、去除本操作 checkpoint 後原 snapshot；可證明的缺步驟由相同原寫入請求補完，矛盾即 RECOVERY_REQUIRED。無自動背景修復，但重送會產生寫入。B32–48/85–93、F680/685。 |
| 13 | 有 employment 無 binding | PASS | exact image 匹配後 bindingDone=false；status=STARTED/PARTIAL。原請求可接續，但 status 絕不授權接續。B40–48/89、F680/730。 |
| 14 | 有 binding 無 employment | PASS | inspect 明確拒絕，RECOVERY_REQUIRED；不倒推/補造任職。B42、F736。 |
| 15 | STARTED 後失敗 | PASS | 可能留下 STARTED 或部分 business rows；8 個 setValues 前/持久化後拋錯 checkpoint mock 已驗證。不能假設錯誤代表未寫入。B131/85–93、F680。 |
| 16 | rollback | NOT IMPLEMENTED | 沒有 rollback，也不是跨表 transaction。採 append/checkpoint + 驗證後續作。B85–93。 |
| 17 | 鎖種類/範圍 | PASS | getScriptLock，tryLock(5000)，涵蓋鎖內 relookup、eligibility、hash/receipt 檢查、audit/business writes、flush，finally release。LINE UrlFetch 在鎖外；status 獨立 tryLock(1000)，不 flush。沒有 UserLock/DocumentLock。S75、D16/27、B135 起；F21/45/783/794。 |
| 18 | TOCTOU/併發 | PARTIAL | 合作使用同 ScriptLock 的 writer 可序列化；鎖內重新查 actor/target 並比較 snapshot。人工 Sheets 編輯不受此鎖保護；真正兩個 migration 同時送出未有專屬測試。F656/668/794 不能替代 write-vs-write 測試。 |
| 19 | afterVersion 可靠性 | PARTIAL | STARTED 就記錄 beforeVersion=0/afterVersion=1，是預定基線版本，不是 commit marker；成功回應 version=1 也不表示目前表格仍為 v1。須檢查 COMPLETED + actual state。B19/130、F736/754。 |
| 20 | COMPLETED 寫入順序 | PASS | 正常執行先 append/flush employment，再 binding，再重新讀取 inspect 確認兩筆後 append COMPLETED。非跨表原子性；flush/外部競爭故障另缺測試。B85–93、F680。 |
| 21 | 五種 status | PASS | NOT_OBSERVED / STARTED / COMPLETED / RECOVERY_REQUIRED / UNKNOWN；區分 historicalCompletion 與 currentConsistency。lock busy=UNKNOWN，資料/回執矛盾 fail closed。B135 起、F730–794。 |
| 22 | status 授權 retry | PASS | status 只讀，UI 明確禁止由結果推導新增或重送權。UNKNOWN/NOT_OBSERVED 也不授權。U206 起、F695/783。 |
| 23 | 兩個 Allowed=false | PASS | employeeBaselineStatusResult_ 統一設定 recoveryAllowed=false、newRequestAllowed=false；client validation 拒絕 true；status tests 檢查所有結果。B136、U166、F695。 |
| 24 | Worker timeout 但 GAS 完成 | NOT IMPLEMENTED | T3 可查原 requestId 的 status；但尚無 T4 原請求保存與端到端結果不明流程。未來應保留 ID/原內容、停止寫入、查 status；COMPLETED/MATCHED 才是歷史完成且目前匹配的證據。不能拿新 status-probe ID 查原寫入。 |
| 25 | 未收到回應直接重送 | BLOCKED | 不允許由 timeout 或 status 直接推導重送。先原 ID 唯讀查詢；未知/矛盾停止，人工審查。即使後端支援 idempotent resume，仍須另行批准。現有 recovery/generic error 有「原請求重試」文字，不能當 T4 操作授權。A8、D45、B103–108。 |
| 26 | silent overwrite/repair/retry | PARTIAL | baseline 不改員工主檔，不覆蓋已有任職/binding，不自動 network retry；但相同原寫入請求可自動補缺少 checkpoint，UI 未有專用確認流程。不得稱為「任何重送都不寫入」。B85–93、F674/680。 |
| 27 | Legacy immutable evidence | PARTIAL | 主檔 A:L 不被此操作修改；不等於主檔不可變。beforeJson 只有起始 state label，非完整 A:L 快照。snapshot hash 不能重建原資料；afterJson 保存選定繼承值，未有完整不可竄改 archive。B115–130、F663。 |
| 28 | 跨表稽核關聯 | PASS | employeeId 永久主鍵；employmentId/bindingId、LEGACY_BASELINE source、requestId/hash、actor、phase、版本與 afterJson 串接；startDate 未知仍保留空白。可追溯，不是簽章或防竄改證明。B115–130、F663/680。 |
| 29 | hireDate 空白 | PASS | 可 migration：startDate=''，baselineDate 為當天，note 說明未知與序號非首次入職。HIRE_DATE_UNKNOWN 是 preview warning，未另以此枚舉持久化；語意由空日期 + note 保留。不猜歷史。B82/116–119、F663。 |
| 30 | salary/role/grade 改變 | PARTIAL | hash 包含完整 master A:L，因此新操作比較可擋三者變更；role 可能先被目標授權擋。salary drift 及 actor role 改變有 mock，target grade/role 各別測例不足。B9–18/110、M30、F656/668。 |

## 5. Failure injection / recovery coverage

| 情境 | 狀態 | 已有證據 / 缺口 |
| --- | --- | --- |
| A before STARTED | TESTED | F680 audit 第一次 setValues 持久化前 throw；原請求再送只建立一組記錄。 |
| B after STARTED / before employment | TESTED | F680 audit 持久化後 throw / employment 寫入前 throw。 |
| C after employment / before binding | TESTED | F680 employment 持久化後 / binding 寫入前 throw。 |
| D after binding / before COMPLETED | TESTED | F680 binding 持久化後 / 第二次 audit 寫入前 throw。 |
| E after COMPLETED response lost | PARTIAL | F680 COMPLETED 已持久化後 throw + replay，status 的 completed coverage；尚無 T4 Worker/client 寫入後 timeout/斷線/重新整理端到端測試。 |
| F duplicate same request | TESTED | F674/680 sequential replay 不重複 rows/audit。 |
| G duplicate different payload | TESTED | F674 同 ID 不同 reason=REQUEST_CONFLICT；hash 其餘欄位由程式確認，宜補各欄變體。 |
| H concurrent migration | MISSING | F794 是 status-vs-write；其他 approval concurrency 不等於同員工雙 migration。mock lock 非真實平行執行。 |
| I stale snapshot | TESTED | F668 salary、UID、任職、binding、audit、duplicate identity 改變被擋。 |
| J permission changed | PARTIAL | F656 actor role 在鎖前改變被擋；target role/grade 在 preview 後及 partial recovery 時需補。 |
| K employee state changed | PARTIAL | F654 actor 離職後被擋；target status 在 preview 後／取得鎖前改變需獨立測例。 |
| L LINE binding changed | PARTIAL | F668 target UID/cross binding 變更；F766 status actor 重綁不可接管舊請求；migration actor 在驗證後/鎖前重綁與 partial recovery 尚未完整涵蓋。 |

其他應補：flush throw/持久性不明（mock flush 為 no-op）、半列/截斷資料及手動跨表競爭、EMP001 ADMIN 自身 baseline（F689 為 OWNER self-case）、COMPLETED 捷徑遇缺失/漂移/損毀回執時與 status 語意一致性、保存原 requestId 後重新整理仍不自動重送、無 token/body/audit 外洩。此輪只列缺口，不改測試或程式。

## 6. Recovery model

模型是「持久化意圖 + 可驗證 checkpoint + 同原請求續作」，不是 transaction/rollback。

1. 新操作：重新驗證 LINE → 鎖內重查 actor/target → snapshot/eligibility → STARTED → employment → binding → read-back → COMPLETED。
2. 結果不明：停止任何寫入；保留原 requestId 及原確認內容，不生成替代 ID，不重送 migration，不把 status-probe 當原操作。
3. 以原 requestId 唯讀查 status；UNKNOWN 只表示此刻不能判定；NOT_OBSERVED 也可能是不可見/actor 已變更，不等於未寫入。
4. STARTED/ABSENT、PARTIAL、MATCHED 都不是續作授權。STARTED/MATCHED 可能是兩筆 business rows 已有但 COMPLETED 尚缺。
5. COMPLETED/MATCHED 表示可見回執證明歷史完成且当前比對一致；仍不授權新操作。COMPLETED 後正常 lifecycle 變更可導致 RECOVERY_REQUIRED + historicalCompletion=true + CONFLICT，不應當成需要還原舊值。
6. 矛盾或未知：人工檢視受權限保護的回執與資料；沒有自動 repair/delete/rollback。只有另行批准且原 actor、ID、hash、snapshot/checkpoint 都符合，才可能使用原寫入請求補完；本輪禁止。

已 COMPLETED 的 migrate 捷徑比 status 驗證弱：B105–106 decode 後即回成功，未重做完整 receipt/current-state inspect。因此成功 replay 只能視為歷史回執，不可宣稱目前一致。T4 前應決定最小一致性修正或明確契約，補損毀/漂移測試，另行 review。

## 7. Auditability（技術可追溯性，非 ISO 認證）

| 項目 | 狀態 | 依據 / 限制 |
| --- | --- | --- |
| who | PASS | verified actor 的 operatorId/operatorSub，非前端自報；sub 僅受保護後端 audit，不公開顯示。 |
| what / employeeId | PASS | LEGACY_BASELINE、target employeeId、任職與 binding image。 |
| when | PASS | server operatedAt/effectiveAt/baselineDate；未知歷史到職時間不補造。 |
| requestId | PASS | intent/completion 連結，actor 範圍 idempotency；不是全球唯一或外部簽章。 |
| beforeVersion / afterVersion | PARTIAL | 0→1 是 baseline 的意圖/版本；STARTED 時不代表完成，後續 lifecycle 版本另查。 |
| reason / phase / source | PASS | 原因、STARTED/COMPLETED、LEGACY_BASELINE，繼承 LINE 的 reason 明示未驗證目標 token。 |
| historical completion | PARTIAL | status 嚴格查回執與當前一致性，能區分歷史完成；migrate replay 捷徑較弱。 |
| 完整舊資料證據 | PARTIAL | afterJson 保存繼承值與 snapshot hash，但 beforeJson 非完整 A:L archive；主檔可被之後變更。 |
| 防竄改與完整長期 audit chain | NOT IMPLEMENTED | 未有不可變儲存/簽章；後續合法 lifecycle 更動會保守標 conflict，而非完整驗證整條 chain。 |

這些能力不能宣稱取得 ISO 9001 認證或符合全部標準。

## 8. P0 / P1 / P2 與下一個最小階段

- **P0（T4 放行 gate；不是宣稱 T3 有已知漏洞）**：未批准/未實作 EMP001 專用受控寫入入口與不明結果流程。GAS 本身可被合法管理員直接呼叫處理其他目標，不能依靠 Worker 唯讀限制聲稱全域 EMP001-only。需先確定 T4 server-side 範圍及唯一操作途徑；本輪不新增 gate 或 route。
- **P1**：migration 專屬併發、response lost、flush failure、actor/target 變更缺測；COMPLETED replay 與 status 的一致性保證不同；通用「原請求重試」訊息與 T4 HOLD 操作指引有落差；V44 寫入路徑與受查 source 一致性未核對；舊主檔完整證據/人工復核保存方案未定。
- **P2**：更多裝置/重複唯讀觀察、將 feature 既有 README/ADR 的舊驗收敘述在後續文件整理時同步；redirect incident 維持 MONITOR，不因本次成功關閉 root-cause 調查。

**建議下一個最小階段：T4 preflight specification + offline recovery hardening。** 先人工 review 此文件，明確 EMP001-only server gate、原 requestId 保存/確認規則、結果不明只查狀態、何時可由誰批准原請求續作；再另行授權補上述離線測試與最小修正。對齊已部署 source、確認安全保存與人工 read-back checklist 後重新 readiness review。此建議不授權 migration、部署或平台操作。

## 9. 本輪實際離線測試

以下 PowerShell commands 已执行；沒有真實 API/Sheets 寫入。既有測試中的所有 migration/failure injection 使用 mock。

原 feature checkout 工作目錄：`D:\Users勿刪\User\Documents\GitHub\water-clock-system`：

```powershell
node tests/employee-foundation.test.cjs | Select-Object -Last 5
exit $LASTEXITCODE
```

exit 0，89 組通過（含 35 組 status）；沒有失敗。此 suite 含 GAS/JS/inline syntax、既有 dispatcher regression、identity/authorization/idempotency/recovery。

diagnostics worktree 工作目錄：`C:\Users\User\AppData\Local\Temp\water-clock-redirect-diagnostics`：

```powershell
$env:EMPLOYEE_FOUNDATION_FIXTURE='D:\Users勿刪\User\Documents\GitHub\water-clock-system\tests\employee-foundation.test.cjs'
node --test --test-isolation=none transport-v2/tests/relay.test.mjs | Select-Object -Last 9
exit $LASTEXITCODE
```

exit 0，194 passed / 0 failed / 0 skipped。

```powershell
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node transport-v2/tests/live-test.cjs
```

exit 0，157 browser scenarios 通過：14 T1 + 38 T3 + 9 LIFF init + 24 timeout-stage + 30 status + 42 redirect diagnostics。瀏覽器使用離線 mock/intercept，沒有 production request。

這些測試證明已涵蓋案例的行為，**不是 production 寫入驗收，也不是 redirect incident root-cause 證明**。

## 10. Stop

只有此本機文件草稿新增；不 stage、不 commit、不 push、不 PR、不 merge、不 deploy。沒有修改 Worker/GAS/frontend/tests，沒有操作 LINE/Cloudflare/GAS/Sheets，沒有真實 employeeLifecycleBaselineMigrate。等待人工 review。

# T4 safety changes — 本機人工 review 記錄

本輪只實作／離線驗證；**Production Migration、commit、push、PR、merge、deploy 全部 HOLD**。

## 基準與範圍

- 從最新 `origin/main` `b92f9f91eea65b6064ae0e10c54c93db1e5f9dc5` 建立獨立 `codex/t4-safety` worktree。沒有 rebase 舊 feature，也沒有修改 main。
- 兩份已批准文件從 diagnostics worktree 原樣複製，SHA-256 檢查相同。此補充文件記錄實作差異，不覆寫批准規格。
- `gas/EmployeeLifecycleBaseline.gs` 原始來源：feature commit `c1c9d30a21cba7a0cd700f61a93e1e6b4beab3fd` 同名檔；加入本輪 gate/v4/consistency 修改。`gas/EmployeeBaselineControl.gs` 為新 helper。
- **這不是完整 GAS deployment bundle**。依賴上述固定版本的 Code、EmployeeIdentity、EmployeeLifecycleStore、EmployeeApplication、EmployeeApplicationAdmin、EmployeeLifecycleRead、EmployeeLifecycleMutation。避免把舊 feature 的正式 frontend 或其他 business logic 複製進 main；這些依賴未修改。
- 真正已部署 V44 與此依賴版本是否相符仍 NOT VERIFIED。任何未來部署前須人工逐檔核對；本轮不部署，也不把原始碼存在當成部署一致性的證據。

## 安全實作

1. Worker 新增 `/employee-baseline-migrate`，僅接受精確 action、七 keys、EMP001。只有環境值 `T4_CONTROLLED_MIGRATION_ENABLED` **字串** `true` 才開啟；缺省關閉。不修改任何 Worker 設定檔或平台設定。
2. 啟用時版本為 `t4-safety-1`；未啟用保持 `t3-2-status-only`。原 T1/T3 頁只增加版本相容，不增加 write action。redirect allowlist、限制、20秒deadline、無retry/fallback保持不變。
3. GAS 對 direct /exec 也執行 strict keys/EMP001/verified ACTIVE OWNER或ADMIN/target role限制；使用既有dispatcher鎖內relookup。沿用實際欄位 **expectedSnapshotVersion**；不接受 snapshotVersion alias。
4. 新私有 Script Property `T4_EMP001_BASELINE_CONTROL`：缺省deny。精確綁定 actor、role、requestId/hash/snapshot及人工批准reference。ARMED→CLAIMED先持久化並讀回，才可能寫Sheets；claim acknowledgement不明也不自動重送。
5. 新操作、續作及 completed replay 分流。partial 必須同原 ID/hash/snapshot、v4 intent、精確checkpoint與另行批准的 RECOVER_ORIGINAL permit。狀態查詢永遠不授權寫入。v3 partial **不開放T4續作**，仍可唯讀查。
6. completed replay 共用完整 status evidence 檢查，偏離即conflict/recovery-required，0新business effect。
7. v4 beforeJson保存原主檔A:L image；afterJson保存固定employment/binding/snapshot/source/approvalReference與HIRE_DATE_UNKNOWN。原主檔不改，歷史日期不猜。v3 parser及歷史status維持相容。
8. 新隔離頁 `transport-v2/controlled-test/`：自行LIFF初始化，沿用現有config。身分→fresh dry-run→原因/確認→固定UUID原請求→一次submit→只讀status。reload或timeout後不提供新request/retry/recovery按鈕。
9. localStorage僅保存action、EMP001、requestId、PREPARED/SUBMITTING、attemptMayHaveStarted；不保存token、sub、hash、reason、薪資或raw回應。journal異常fail closed；跨tab變動停止寫入；serverpermit才是最終授權。

## 精確批准流程／保守差異

- `employeeBaselineControlPrepare_(plan)`、`employeeBaselineControlClose_(requestId, approvalReference)` 是 editor-only 私有 helper；不在任何 action dispatcher 中。不是新人審核API，不會取得或接受真實LINE token。
- plan 的精確keys：operatorId、approvedBy、approvalReference、requestId、expectedSnapshotVersion、reason、mode。mode僅INITIAL或RECOVER_ORIGINAL；reference僅固定格式的私人維運證據編號，不是token。
- helper依部署維護者的可信操作執行 OWNER/ADMIN 的人工批准；從server資料解析actor與角色，不能宣稱輸入的 approvedBy 已經過LINE登入審核。真正migration每次仍verify呼叫者token並在鎖內重查。
- INITIAL claim後未觀察STARTED：只允許人工對**同原ID/內容**重新批准一代INITIAL；不可從NOT_OBSERVED自動推導。
- CLOSED是此首例的終止狀態；本輪不提供「撤銷後改成另一個新ID」便利流程，也不實作刪ledger或解除舊操作。比規格可選的未送出草稿重建更保守。若未來需重建run，須另行人工review。
- ledger在同一private property中邏輯追加，容量不足fail closed，不剪除歷史。非不可竄改日誌；manual approval reference、操作內容與snapshot需存私人run record，不放公開repo。UI不匯出snapshot/hash；維護者未來須從受保護server預覽核對，不能以新snapshot替代原操作。
- 規格A2曾寫Browser→Worker `redirect:follow`；檢查實際T3 client是 **redirect:error**。本輪新T4沿用較嚴格的error，避免token被browser自動轉送；Worker→GAS仍manual→合法GET。未改既有正式GAS API的text/plain + redirect follow契約。
- UI沒有人工recovery按鈕；helper只提供server放行機制。真的續作仍需另行核准、專用操作程序，不是本輪可執行事項。

## 永久測試與故障注入

- `foundation-fixture.cjs` 只讀本機Git物件中固定ref的既有GAS/測試；不fetch、不建立測試員工、不依賴工作樹的任意最新檔案。缺該物件時明確失敗，不偷偷跳過。供人工review時須保留此repo既有feature物件。
- 完整foundation 89組執行：舊mutation用舊程式生成v3 fixture；其中原有35組status套用本輪current reader/decode/inspection。T4 migration另由永久新測試驗證，沒有宣稱旧89組全都在跑新的write語意。
- `t4-gas.test.cjs`：角色/strict-input/permit/snapshot；雙GAS context共享Sheets與ScriptLock模擬併發；各setValues持久化前/後故障；property claim、read-back、flush故障；manual-only resume；v3兼容；v4audit；completed drift；只讀status無flush/write。
- `t4-relay.test.mjs`：預設關閉、exact route/action/keys、其他write拒絕、no retry；GAS完成但POST headers/redirect GET/final body卡住；timeout前未被server觀察且原POST延遲完成。所有外部請求均mock。
- `t4-browser.cjs`：OWNER/ADMIN、禁止角色/DOMforce、double click、timeout/network/invalid response、原ID不變、5status、storage失敗/跨tab/reload、textContent惡意HTML與privacy。
- `t4-static.cjs`：JS/GAS parse、2頁HTML結構/ID/handler、正式frontend/config零差異。

## 本輪實際執行結果

工作目錄均為 T4 worktree；以下為最終驗證命令。測試期間也曾有沙箱spawn限制、fixture harness跨VM/目錄列舉問題及舊cache版本assertion；均修正測試執行方式或對應assertion後重跑。它們不列作SKIPPED，也不拿先前歷史PASS替代本輪結果。

```powershell
node transport-v2/tests/foundation-fixture.cjs
node --test --test-isolation=none transport-v2/tests/t4-gas.test.cjs transport-v2/tests/t4-relay.test.mjs
$env:EMPLOYEE_FOUNDATION_FIXTURE='D:\Users勿刪\User\Documents\GitHub\water-clock-system\tests\employee-foundation.test.cjs'
node --test --test-isolation=none transport-v2/tests/relay.test.mjs
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
node transport-v2/tests/live-test.cjs
node transport-v2/tests/t4-browser.cjs
$env:PYTHON_BIN='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
node transport-v2/tests/t4-static.cjs
git diff --check
```

| Suite | 最終結果 |
| --- | --- |
| Employee foundation compatibility | 89組PASS，含35組current status |
| T4 GAS + Relay | 119 passed / 0 failed / 0 skipped |
| Existing Relay | 194 passed / 0 failed / 0 skipped |
| T1/T3 browser | 158 PASS = 14 T1 + 38 T3 + 9 LIFF + 24 timeout + 31 status + 42 redirect |
| T4 browser | 26情境PASS |
| Syntax/static | 10 JS檔 + 2 GAS檔解析PASS；2 HTML結構PASS；production scope/隱私static PASS |
| Diff | tracked與untracked whitespace/scope檢查；沒有stage |

新增案例均為離線證據，不是Production migration或故障根因證明。未執行CONTROLLED PRODUCTION測試：**HOLD / NOT RUN**，不混入offline skipped統計。

## 人工 security review 與尚待事項

- 無generic write proxy、role信任、未知欄位ignore、automaticretry/recovery、timeout換ID、wildcard、token/log leakage、silentoverwrite或destructiverollback。
- T4 baseline的worker/GAS均限EMP001；既有其他業務API不在本輪重構範圍，不能誇稱整個GAS從此只能寫EMP001。
- root index.html、production js/css、LIFF ID、GAS URL、原live-test/config均未改；T3頁仍只有三個唯讀action。
- 本機程式未發現待修的P0安全繞過；需人工逐檔review，不等於部署放行。
- P1 production gates：V44/source逐檔核對、部署後scope/權限驗證、私人run record/備份與真機唯讀preflight尚未完成；不得執行migration。
- P2限制：ScriptLock不能封住外部人工Sheets改動；兩個context/barrier模擬不是Google服務真實平行執行；Properties/Sheets沒有transaction；容量滿/不明結果保守停止。

本輪以 **READY FOR HUMAN CODE REVIEW** 為交付目的；不commit/push/PR/merge/deploy，不操作Cloudflare/LINE/GAS或正式Sheets。所有write函式只在離線mock中執行。

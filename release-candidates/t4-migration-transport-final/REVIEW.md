# T4 one-operation transport / runner — offline review candidate

Migration = HOLD。此文件不是 deploy、flag、permit 或 Migration approval。

## A. Source provenance / scope

- Worktree branch：`codex/t4-migration-transport-final`，base `08359639eda194a2c6183e715d6d5bb44878c086`。
- Worker 唯一主體：`6f3921f2bbea6d175c8bcac3888b09e231f44774:transport-v2/worker/relay.mjs`，t3-4-gas-read-diag；原 bytes 保存在 `evidence/t3-4-relay.mjs`。
- `4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4` 的 Worker 僅參考 default-deny route 設計，保存在 `evidence/t4-reference-relay.mjs`；沒有拿它替換 t3-4 主體。
- GAS 固定 V48：`release-candidates/gas-t4-control-no-flush/sources/` 11 檔全部不改，SHA-256 `df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5`。
- Read frontend compatibility 以本機已知、上一輪驗收的 `e6078e4fd12811ed42d48840656c721765c2ede7` 為基底。沒有連線確認 current main；未來整合必須先核對當時 main 差異，不得覆蓋成舊檔。
- Production V48、Worker 433ff291、ARMED property、三條 read acceptance 是使用者提供的現況，本輪沒有重新驗證。沒有複製完整 Production property、requestHash、raw response 或私有證據。
- 只新增 `release-candidates/t4-migration-transport-final/**` 和 `transport-v2/t4-migration-runner/**`。既有 GAS、Worker、read frontend、正式首頁/config 完全沒有修改。

## B. Exact Worker diff

完整、可機械核對的 diff：`evidence/worker.patch`。

變更僅有：版本與註解；第四條固定 route；strict string flag gate；exact 7-key / fixed-value validator；controlled payload 七欄重建；migration 回應不帶 GAS read diagnostics。

`timingDiagnostics`、`limitedText`、`configuration`、redirect/fetch/body/deadline loop、error/reply 路徑逐段相同，永久測試核對。保留 global 20000 ms、performance.now、timeout snapshot freeze、late continuation guard、size limits 16384/65536 bytes、manual redirect、最多 3 hops、HTTPS exact hostname / components 限制。POST 轉 GET 後不送 body/token/headers/cookies。

## C–E. Routes, gate, diagnostics, payload

| Route | Action | Gate |
|---|---|---|
| /identity | identityBootstrap | 原 read contract |
| /employee-read | employeeLifecycleBaselineDryRun | 原 EMP001 read contract |
| /employee-operation-status | employeeLifecycleBaselineRequestStatus | 原 EMP001 read contract |
| /employee-baseline-migrate | employeeLifecycleBaselineMigrate | flag + exact single-operation contract |

只有 `env.T4_CONTROLLED_MIGRATION_ENABLED === "true"` 開啟第四條。ABSENT、布林 true/false、`false`、`TRUE`、`1`、數字、空值、前後空白等都 PATH_DENIED；沒有修改環境設定或新增預設開啟的配置。

Worker 僅控制 transport scope，GAS 仍負責 LINE token、在職、OWNER/ADMIN、EMP001、snapshot、requestId/hash、ARMED permit 與 mode。前端確認文字與版本 header 都不是 server authorization。

Read routes 繼續注入 `_transportDiagnostics`，只輸出重建的安全 `_gasReadDiagnostics`。Write request 絕不注入 metadata；瀏覽器自帶該欄位會 REQUEST_INVALID。Write response 也去除 read diagnostics，其餘 GAS business JSON 沿用原 transport 契約。

送給 GAS 的 migration JSON **精確七欄**（下列 token 只是文件 placeholder）：

```json
{
  "action": "employeeLifecycleBaselineMigrate",
  "idToken": "<current LIFF ID token; memory only>",
  "employeeId": "EMP001",
  "requestId": "c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab",
  "expectedSnapshotVersion": "f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd",
  "reason": "建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。",
  "confirmed": true
}
```

固定 action / employee / requestId / snapshot / reason / confirmed 任一不符或 missing/extra key：REQUEST_INVALID；token 存在但形態不合法仍沿用 TOKEN_REQUIRED。不是僅 regex 驗證。requestHash 不由瀏覽器提供。

## F. Version / independent read compatibility patch

新版本固定 `t4-safety-2-gas-read-diag`，flag OFF/ON 都標示此 code artifact；版本本身不表示 write flag 已開。

`live-test/client.js` 相對 pinned frontend 只新增明確版本常數，加入已識別版本與 status capability 白名單；timing/GAS timing parser 完全不變。`index.html` 只更新固定 cache-buster `client.js?v=t4-safety-2-read-compat`。`config.js` byte-identical，僅作候選測試參照，不需要部署變更。

原 t1-1/t3-1/t3-2/t3-3/t3-4/t4-safety-1 邏輯保留，未知版本不新增 status capability。原 read-only UX 沒有寫入按鈕，只有獨立 runner 有本次 operation。

Diff 見 `evidence/frontend-client.js.patch`、`evidence/frontend-index.html.patch`；應獨立整合至當時 current main，保留任何合法新改動。Worker rollback 至 t3-4 時不需回滾相容前端。

## G–I. Runner state machine / unknown outcome / status

獨立 runner：`transport-v2/t4-migration-runner/index.html` + `client.js`。重用既有 dedicated T1 LIFF ID `2011467618-R76314It` 與固定 Worker origin；沒有 direct GAS URL、URL/query/input config、storage/cookie/log。

LIFF 初始化本身不發業務 API。人按「驗證身分與基線」後：

1. 確認在 LINE、logged in、ID token 可取得。
2. identity 必須 ACTIVE_EMPLOYEE / EMP001 / OWNER 或 ADMIN，且 header 為新 expected version。
3. 才讀 dry-run；必須 dryRun=true、EMP001、LEGACY_NOT_BASELINED、eligible=true，而且 snapshot **等於固定值**。
4. READY，顯示固定 requestId/snapshot/reason；只有輸入精確 `MIGRATE EMP001` 才可按送出。

```text
PRECHECK -> READY -> SUBMITTING -> SUCCESS
                             \-> WRITE_RESULT_UNKNOWN
attempted=true 後，不存在回 READY/PRECHECK 的轉移
SUCCESS/WRITE_RESULT_UNKNOWN -> STATUS_CHECKING
  -> STATUS_COMPLETED | STATUS_STARTED | STATUS_NOT_OBSERVED
  -> STATUS_RECOVERY_REQUIRED | WRITE_RESULT_UNKNOWN
```

`attempted=true` 在任何 await/token/fetch 前設置，永不 reset。handler 本身檢查授權與 latch；DOM 手动重新啟用按鈕無法繞過。每個 request 有 client 20-second deadline，fetch 與 JSON body 都受限。沒有 retry/fallback/background resend。

成功僅接受六個精確 keys/values：success=true、employeeId=EMP001、原 requestId、baselineState=RECORDED、version 數字 1、recoveryStatus=COMPLETED。缺欄、錯型別、額外欄、HTTP/business/network/timeout/error 均停止並鎖為 WRITE_RESULT_UNKNOWN，顯示「結果未知，僅能查原請求狀態」。安全錯誤碼只取固定 allowlist；不渲染 raw message/sub/token/response。

Status button 只在 attempted 後開放，每次都是人手觸發，同一固定 requestId，絕不生成新 ID。Status 接受新 Worker 或 rollback t3-4；migration prechecks 只接受新 version。

- COMPLETED + MATCHED + historical=true：顯示完成證據，不能再次寫入。
- STARTED：顯示部分／進行中證據，STOP，不續寫。
- NOT_OBSERVED：未觀察到 receipt，不代表可重送。
- UNKNOWN：STOP。
- RECOVERY_REQUIRED + CONFLICT：STOP，需另行批准人工 recovery。
- 不一致的 status contract（包含 allowed 欄位變 true）：安全視為未知，不增加寫入權限。

沒有 new request、recovery write、retry、close、claim 或可編輯的固定 operation 欄位。

**記憶體邊界：**每個 document lifetime 最多一次 write attempt。禁止 sessionStorage/localStorage/cookie，因此不能宣稱 reload/new tab 後仍有跨頁持久鎖。頁面明示送出後不得重新整理／重開／另開分頁重送；記憶體丟失時改用既有唯讀頁查原 ID。GAS claim/idempotency 是 server safety，但「未到 GAS」不能由 browser 證明；本 release 不提供人工重新開始/recovery authority。

## J. Offline tests / limits

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| t3-4 Relay regression，適配版本/第四 route 預期 | 273 | 0 | 0 |
| New fixed migration / deadline / privacy tests | 71 | 0 | 0 |
| Existing read frontend browser + cross-branch | 269 | 0 | 0 |
| One-shot runner browser | 56 | 0 | 0 |
| Actual Worker + patched read frontend compatibility | 10 | 0 | 0 |
| Actual pinned V48 GAS contract / deny-path integration | 7 | 0 | 0 |
| **Total** | **686** | **0** | **0** |

Runner 的 56 項包含 actual Worker + browser + fake GAS 組合。缺少 Production 員工私有 snapshot 原始資料，不能在離線重建指定 snapshot；沒有 mock 掉 GAS hash 演算法製造成功。actual V48 的 ADMIN/OWNER 組合案例因此預期 VERSION_CONFLICT，SITE_MANAGER/EMPLOYEE 預期 FORBIDDEN；均驗證 property 不變、Sheet 零寫入、lock released。成功 UI 是 strict contract mock，不是正式 Migration 成功證據。

所有 network 均 deny/intercept。Node mock 不連線；browser 所有 URLs（含 LIFF SDK）均攔截。TEST_RESULTS.json 記錄本輪實際 commands、exit codes、output hashes、counts；永遠不能以離線數字取代 Google/LINE/Cloudflare Production evidence。

開發中修正過測試對 CORS 錯誤的假設，沒有改 Worker 安全順序：flag OFF 的 PATH_DENIED 發生在 origin 接受前，不帶 exposed version header；browser 可能顯示版本不符／網路錯誤。Runner 統一鎖定未知，Node test 證明 Worker PATH_DENIED 且 upstream 0 次。沒有為了方便 UI 放寬 gate。

重跑：設定 PLAYWRIGHT_MODULE、CHROME_PATH、ROLLBACK_RELAY（見 TEST_RESULTS）後，執行 `python release-candidates/t4-migration-transport-final/tests/run.py`。隨後執行 static.cjs / finalize.py。舊 test 只調整明確版本、第四 route/default deny、固定 cache-buster；adapter diff 全部保存在 evidence。

## K. Hashes

見 `MANIFEST.json` 與 `HASHES.md`：固定 Worker 原始 blob、新 Worker、runner bundle、read frontend bundle、evidence bundle，以及各檔 SHA。Wrapper Prepare 原始檔沒有帶入 runner；沒有寫入任何 production property。

## L. Later release order — DESIGN ONLY, DO NOT EXECUTE

1. 人工 review 此 Worker candidate 的 diff、hash、default-deny 與 regression。
2. 人工 review temporary runner、memory latch 邊界、固定 operation；Migration 仍 HOLD。
3. 另行批准後整合/發布 read-frontend 相容 patch 與獨立 runner。先核對當時 current main、Pages source/產物/cache、既有 LIFF endpoint 是否能正確開啟這個 runner；本輪沒有更改 LIFF settings，不可假定 sibling path 已可從 LINE 開啟。任何所需 endpoint/integration 操作另行批准。
4. 另行批准後部署新 Worker；write flag 必須 ABSENT/OFF，GAS 維持 V48 原 sources。
5. 人工使用 read-only 頁驗證 identity/dry-run/status、transport timing 與 GAS timing，新 client 確實載入。
6. 只以 reviewed artifact 的離線 route tests + 人工唯讀核對 Worker version/config 確認 flag absent/default deny；**不以正式 migration POST 做探測**。若需要額外 preflight 工具必須另行審查。
7. 取得單獨、明確的 write flag enable 批准；確認同一 requestId/snapshot/approval 且 permit 未被其他操作更動。
8. 人工設 `T4_CONTROLLED_MIGRATION_ENABLED="true"`。這不是 Migration 本身的批准。
9. 人工重新開啟唯一 LIFF runner 分頁；不得沿用有任何 write attempt 的頁面或另開多分頁。
10. 人工按 precheck，先通過 identity。
11. 同一 precheck 接著通過 dry-run 與固定 snapshot 比對；任何失敗 STOP，不替換固定欄位。
12. 取得最終人工 **MIGRATION** 明確批准。
13. 輸入 MIGRATE EMP001，按唯一一次 migration。
14. 無論結果不 retry、不 reload/new tab 重送。
15. 觀察 completion 或決定 UNKNOWN handling 後，人工立即把 Worker flag 設 OFF。**此步不是自動的**；不依賴 browser 可以原子地關閉 flag。
16. 只用原 requestId 做人工唯讀 status。
17. 另行批准後人工核對 Sheets/audit/property evidence；不能用 UI SUCCESS 取代 evidence 核對。
18. 只有另行明確批准才能 close permit；本 runner 沒有該操作。
19. 移除或停用 temporary runner（另行發布批准）。
20. 視需要另行人工 rollback Worker 至固定 t3-4 artifact；GAS 不變。

任何權限、版本、snapshot、狀態、固定輸入、hash 不符合，STOP；不推導可以改 ID、re-arm、recovery 或繼續 migration。

## M. Rollback / response lost

送出前：關閉 write flag／回 t3-4 可阻止此 route。送出後：即使 timeout、flag OFF 或 Worker rollback，GAS 可能仍已收到並寫入；AbortController 不能撤銷 GAS 執行。

保留原 requestId、permit、audit、rows；status first，禁止 destructive rollback、刪資料或自動 recovery。Worker 回 t3-4 後 patched read UI 不需回滾；runner 仍可查原 status，但不再通過 migration prechecks。

## N–O. Review decision / residual gates

- P0：本次 code review 未發現新增 P0；ARMED 與正式資料狀態僅採用使用者提供資訊，未做 Production request。
- P1（release gates，非本輪放行）：Pages/LIFF runner launch 尚未實機驗證；current-main 整合要核對；跨 reload/tab 不能靠記憶體阻擋；開 flag 後至人工關 flag 不是 atomic；Production snapshot/permit/權限可能變動；request 可能已到 GAS 但 response lost。以上必須保留人工批准／停止／status-first。
- P2：flag-off 因既有 CORS 順序可能只顯示版本或網路錯誤，安全處理為未知且不重送；沒有為此擴大安全範圍。
- 適合進入人工 code review，不等於可以 deploy/enable/permit/migrate。新版本 rollback 相容性由離線測試證明，正式路徑仍待人工驗收。

零 stage / commit / push / PR / merge / deploy；零 Production request；零 GAS / Cloudflare / LINE / Sheets / Script Properties / permit 操作；Migration HOLD。

READY FOR HUMAN CODE REVIEW

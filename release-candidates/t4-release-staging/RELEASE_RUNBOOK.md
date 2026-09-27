# T4 release staging — 未來人工操作 runbook

**本文件不是任何 deploy、flag、permit、Migration 或平台操作的批准。Migration HOLD。**
本輪只建立本機候選。所有正式步驟需另行人工批准，任何證據不一致立即 STOP。

固定來源：
- main base：b9ad9f57f435e6780d465f5480b71dc24354d991
- reviewed artifact：53c60bdb2e0bc89d49ab02fd2221725e76f38adf
- 新 Worker version：t4-safety-2-gas-read-diag
- rollback Worker：6f3921f2bbea6d175c8bcac3888b09e231f44774:transport-v2/worker/relay.mjs，t3-4-gas-read-diag
- 固定 requestId：c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab
- 固定 snapshot：f9088e67ce48da2c79f7a76db16850105cfbb1d6f5fc5ebffc80a63f3a13dedd
- 固定 reason：建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。

| 階段 | 類型 | 未來人工步驟與 STOP 條件 |
|---|---|---|
| A Before PR | READ ONLY / SOURCE MUTATION | 核對當時 main 與指定 base 差異、五個 runtime bytes、config 零 diff、測試 evidence input hashes。先取得 commit/push/PR 批准。分清 runtime 5 檔與 tests/review evidence，不帶整套 candidate/GAS。 |
| B Before merge | READ ONLY / SOURCE MUTATION | 人工 review approve、正式 PR diff 與 CI 通過；另行批准 merge。main 如前進，重新整合及離線測試，不能用旧檔覆蓋合法改動。確認舊 test entrypoints 的版本期待已整理。 |
| C Pages publication | PLATFORM CONFIG / SOURCE MUTATION | 人工確認 Pages job 完成，下載/檢查產物中五條路徑（本輪未執行）。確認 read client 固定 cache-buster、新 dedicated runner LIFF 路徑；先只開頁、不執行業務 API。禁止把 read-only LIFF 改成 runner ID。Jekyll/Pages 實際 settings 需人工證據。 |
| D Worker deploy flag ABSENT | PLATFORM CONFIG / WRITE RISK | 另行批准 Cloudflare deploy；核對新 Worker exact hash、既有 GAS URL/allowed origins 不變；write flag 必須 ABSENT 或非精確字串 true。部署本身不能放行 migration。記錄前後版本與 rollback source，私有保存設定，不公開 secrets。 |
| E Read-only acceptance | READ ONLY / PLATFORM CONFIG | 另行批准有限次 identity → dry-run → status。每步成功才下一步。身分、EMP001、狀態、snapshot、requestId、診斷版本任一不符 STOP。不能以 offline mock 成功取代這些正式證據。 |
| F Flag enable approval | PLATFORM CONFIG / WRITE RISK | 人工核對正式備份、GAS V48 exact source、現有 permit 狀態、私人 approval record、固定 operation，另行批准才設定精確字串 true。不重新 Prepare、不建立新的 requestId、不改 snapshot/reason。 |
| G Final Migration approval | READ ONLY / WRITE RISK / IRREVERSIBLE/AMBIGUOUS | Migration 最終批准必須明確且針對這一次 EMP001 operation。確認誰操作、誰可立即關 flag、誰保存證據。沒有批准即 STOP；按鈕可按不代表批准。 |
| H Single write | WRITE RISK / IRREVERSIBLE/AMBIGUOUS | 人工用 dedicated LIFF 單一 document 做預檢，輸入精確 MIGRATE EMP001，最多點一次。不要重載、另開分頁、重開 LIFF。送出後任何不明結果一律停止寫入。保留原 requestId；不得換 ID。 |
| I Flag OFF | PLATFORM CONFIG / WRITE RISK | 送出一次後不論成功、失敗、逾時、斷線，指定人工操作員依已批准計畫關閉 flag。關 flag 不會取消已送到 GAS 的操作。 |
| J Status evidence | READ ONLY / IRREVERSIBLE/AMBIGUOUS | 只能查同一 requestId。COMPLETED/MATCHED 是完成證據但仍需 K；STARTED、UNKNOWN、NOT_OBSERVED、RECOVERY_REQUIRED 都不能重新送出。status 失敗只停止並人工處理，不自動 polling/retry。 |
| K Sheets/audit/property verification | READ ONLY | 另行人工核對 EMP001 主檔未改、任職/綁定基線、audit checkpoints、未知到職日仍空白、permit receipt 一致。只讀、不補寫、不刪資料；異常保留證據並 STOP。 |
| L Permit close | PLATFORM CONFIG / WRITE RISK / IRREVERSIBLE/AMBIGUOUS | 只有完成 K 且另行明確批准後，指定維運人員依已審查 V48 control helper 關閉 permit。本文件不授權 close/claim/recovery。不得重新 ARMED 或 destructive rollback。 |
| M Runner removal | SOURCE MUTATION / PLATFORM CONFIG | 完成後另行批准移除或下架臨時入口、處理快取，保留 Git/audit evidence。不得自行刪除歷史 artifact；即使下架，舊快取仍可能存在，server flag/permit 才是安全界線。 |
| N Worker rollback | PLATFORM CONFIG / IRREVERSIBLE/AMBIGUOUS | 先關 write flag，再另行批准部署 exact t3-4 rollback bytes。read frontend 不需 rollback，after-attempt status 可讀。rollback 不重設 runner latch、不恢復 permit、不改 GAS/Sheets，不代表 GAS 沒有執行。 |

## 必須一直保留的判斷

- NOT_OBSERVED != safe to retry
- timeout != failed write
- Worker rollback != GAS did not execute
- 一個 document 的 one-shot latch 不是跨 reload/tab 的持久鎖。
- 不可把本輪「fresh document」mock 情境當成正式重試流程。
- 不可用 Worker flag OFF 宣稱 GAS 全面停止寫入；V48 仍有原 migration 與業務函式。
- 固定 ID/hash 不是 secret 或授權；真正權限仍由 GAS 驗證 LINE token/在職角色/permit/snapshot。
- 本輪沒有改 LIFF/Cloudflare/GAS/Sheets 設定，沒有重新驗證使用者提供的 Production 現況。

## Offline preflight 與 online main gate 的分工

Offline preflight接受BASE ancestry及exact snapshot scope，不要求local main/origin/main等於BASE。
真正release前必須另行人工online確認remote main仍為b9ad9f57f435e6780d465f5480b71dc24354d991；若已前進，STOP / rebase-review，不能直接發布舊staging。
Commit前/後皆需同一preflight success=true，且finalized evidence的compatibilityEvidencePresent=true、disposableRemoved=true、所有inputs相符。
任何post-commit overlay也必須通過完整scope/hash；正式push gate仍另要求working tree clean。

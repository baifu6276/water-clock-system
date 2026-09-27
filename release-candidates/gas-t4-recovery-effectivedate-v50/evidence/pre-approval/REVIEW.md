# V50 forensic gate：NOT READY FOR HUMAN REVIEW

本輪停在 forensic gate；未建立 deployable V50 sources、未修改任何 runtime、未 stage／commit／push。
Production recovery HOLD。所有 Prepare／Sheet 行為只在離線記憶體 mock；沒有正式操作。

## Provenance

Branch：`codex/t4-recovery-effectivedate-v50`
Base／目前 HEAD：`0f3b154cff1e4788afb61c9684d792b2fb02531c`
來源：固定 commit 的 `release-candidates/gas-t4-recovery-channelid-v49/sources/`。
V49 bundle：`57e8a16ec0088d1bd4c024a453b60f3365b70c4c47247ec925c933117ba49cc0`
V49 Baseline：`d8151afe57bb85b9a3c3e9c31c833d38b8d8b0382e094754722a4951f7c89c2b`

## Date 根因已證明

Fixture 以原 V48 函式產生 INITIAL／CLAIMED gen1、1 STARTED、1 employment、1 binding、0 COMPLETED。
兩個指定 Sheet DATE 欄位的 getValues 值都是與 GAS VM 同 realm 的 JavaScript Date，非假冒 ISO 字串。
`employeeRowObject_` 真正執行 instanceof Date／toISOString，既有 period image 真正處理日期。
其他 timestamp 仍是 string，channelId 真正是 number。

- Cell DATE serial：46292；Taipei 日期：2026-09-27。
- audit effectiveDate 讀回：2026-09-26T16:00:00.000Z。
- employment baselineDate 讀回相同 ISO，再由原 period image 轉回 2026-09-27。
- afterJson employment.baselineDate：2026-09-27。
- V49 原 status：RECOVERY_REQUIRED／historicalCompletion=null／CONFLICT，Allowed 均 false。
- 提前拒絕的 exact predicate：`p.baselineDate !== intent.effectiveDate`。
- 後面的 Inspect 未在原 status 路徑被呼叫；單獨以相同 state/intent 執行則 employmentDone=true、bindingDone=true。
- 純資料表示反事實控制組：只將 audit effectiveDate 的 ISO 表示改回 calendar string；不改 runtime、不略過 status/Inspect，結果 STARTED／MATCHED。

`evidence/v49-forensic.json` 保存從原始函式 AST 產生的逐 logical predicate／guard 報告。
只在測試 harness 中 instrumentation；獨立評估 logical operands，保留其原組合結果，並與未 instrument 的 status 比較一致。
未走到的 Inspect 另列 independentInspect，不能誤稱它在原請求已執行。
個別 operand 的真假必須連同原 AND／OR guard 解讀；不可把未適用分支的獨立 true 當成實際拒絕。
報告不保存真實 token、LINE sub、完整 master、Production raw response。

## P1：指定負面驗收與既有 STARTED audit 時間規則不一致

在上面的 calendar-only 控制組再做一項改變：
STARTED audit `operatedAt` 由 2026-09-27T07:56:38.143Z 改成合法 ISO 2026-09-27T07:56:39.143Z。

真實 V49 runtime 的結果仍是 STARTED／MATCHED；離線 `employeeBaselineControlPrepare_(RECOVER_ORIGINAL)` 仍可建立 mock ARMED gen2。
原因：`employeeBaselineStatusEvidence_` 對 STARTED audit operatedAt 只有 `validTime(intent.operatedAt)`，沒有要求其等於 effectiveAt／createdAt。
相對地，binding operatedAt 有 `b.operatedAt !== p.createdAt`，同樣改動會被拒絕。
這是既有驗證語意，不是 Date 正規化造成；本輪尚未 patch。

任務明確要求 changed operatedAt 必須拒絕，而且 runtime 只能修 audit calendar-date 比較。
只修 effectiveDate 無法讓這個必要反例通過；若另加入 STARTED audit 時間一致性條件，會擴大本輪 runtime validation scope。
因此依「發現 P0/P1 或需 scope expansion 即停」停止，沒有假裝完成 V50，也沒有放寬測試預期。

需人工決定：
1. 是否另行批准僅 format-4 STARTED audit 加入 operatedAt === effectiveAt 的一致性 gate（COMPLETED operatedAt 仍沿用既有較晚時間規則）；或
2. 保留既有 audit operatedAt 有效時間規則，明確將本輪 changed operatedAt 負面驗收限定為已有 equality gate 的 binding operatedAt。

## 實際測試

```powershell
node --require ./release-candidates/gas-t4-control-no-flush/tests/deny-network.cjs release-candidates/gas-t4-recovery-effectivedate-v50/tests/forensic.cjs --record
node --require ./release-candidates/gas-t4-control-no-flush/tests/deny-network.cjs --test --test-reporter=tap release-candidates/gas-t4-recovery-effectivedate-v50/tests/forensic.test.cjs
```

Forensic probe exit 0：Date 根因證明通過。
永久測試：4 PASS／2 FAIL／0 SKIP；兩個 FAIL 是刻意保留的必要拒絕斷言，非可忽略的 expected-pass 測試。
詳見 `evidence/forensic-test-results.json`。

已通過：V48 真實型別模型重現 conflict、V49 exact predicate、calendar-only 因果控制、binding operatedAt 漂移拒絕。
未通過：valid-but-changed STARTED audit operatedAt 必須被 status 拒絕，以及它必須阻止 Prepare。

未執行 V50 recovery／post-COMPLETED／fresh INITIAL／完整 V44-V49 回歸；因已觸發人工停點，不把先前 867 PASS 當成 V50 結果。
本輪新 fixture 最初有一個缺閉括號的 SyntaxError，已修正後才產生以上正式 forensic 結果。

## 證據限制與安全停點

完整 Production snapshot/requestHash preimage 未取得；以合成 LINE sub／姓名／master，使用真正 SHA-256，結果明確不同於 Production hashes。
此為 Production-derived/de-identified invariant fixture，不是逐位元 Production 重播。
提供的 Production V49／flag ABSENT 狀態未重新連線驗證。

V50 bundle／modified runtime hash／commit／remote SHA：未產生。
沒有 PR、merge、deploy、Production request、Cloudflare／GAS／LINE／Sheets 操作，沒有 Script Property／Permit change、正式 recovery execution 或 Migration retry。

NOT READY FOR HUMAN REVIEW

# V49 T4 Legacy Baseline channelId recovery candidate

狀態：READY FOR HUMAN REVIEW。Migration HOLD；不得因本文件重送 migration。
本候選只供離線人工審查，沒有部署授權。

## 固定來源與範圍

- Branch：`codex/t4-recovery-channelid-v49`
- Base：`08359639eda194a2c6183e715d6d5bb44878c086`
- 十一檔來源：該 commit 的 `release-candidates/gas-t4-control-no-flush/sources/`
- 本次全部新增內容都位於 `release-candidates/gas-t4-recovery-channelid-v49/`。
- 11 個 sources 中只有 `EmployeeLifecycleBaseline.gs` 修改，其餘 10 檔逐位元相同。
- 未修改既有 `gas/`、Worker、frontend、config、固定來源候選或其他 runtime。
- `.gitattributes` 只讓本候選保持原始 bytes，不套用 CRLF 轉換。
- 沒有 stage、commit、push、PR、merge、deploy、Production request、Script Properties／permit／Sheets 操作。
- Worker flag ABSENT 是使用者提供的現況；本輪未連線核對或修改。

## 根因與精確 runtime 差異

V48 用 `JSON.stringify(a) === JSON.stringify(b)` 比較 persisted binding 與 STARTED intent。
Sheet round-trip 的 Number `2011467618` 和 intent String `"2011467618"` 因型別不同而不相等。
離線 fixture 使用原始 V48 真正的 INITIAL 流程，模擬 Sheet 數值 round-trip 後，確實重現留下
CLAIMED permit、STARTED audit、employment、binding，卻判定 RECOVERY_REQUIRED／CONFLICT。

完整 runtime patch 見 `evidence/runtime.patch`，總計 +12 / -1：

```diff
+// Comparison image only: preserve every field/type except a Sheets numeric channelId.
+// Do not trim/parse strings or mutate persisted rows or the audit intent.
+function employeeBaselineBindingImage_(binding) {
+  var image = Object.assign({}, binding);
+  if (typeof image.channelId === 'number' && Number.isSafeInteger(image.channelId) && image.channelId > 0) {
+    image.channelId = String(image.channelId);
+  }
+  return image;
+}
-      (b.length && !employeeReviewSame_(b[0], bundle.binding)) || (b.length && !p.length)) employeeReviewRecovery_();
+      (b.length && !(bundle.format === 4
+        ? employeeReviewSame_(employeeBaselineBindingImage_(b[0]), employeeBaselineBindingImage_(bundle.binding))
+        : employeeReviewSame_(b[0], bundle.binding))) || (b.length && !p.length)) employeeReviewRecovery_();
```

只在 v4/T4 baseline 比較影像中將正的安全整數 channelId 轉為字串；不 trim 或解析字串，不改 persisted row／intent。
v3 維持原嚴格比較。其他 key、值、型別、欄位集合及順序仍交由原比較處理。
`employeeReviewSame_`、`employeeRowObject_`、`employeeStoreRows_`、`employeeWriteRow_`、
`employeeReviewCanonical_`、dispatcher、身份驗證、lock、claim、Finish checkpoint／flush、diagnostics、snapshot/hash 算法都未改。

## Fixture 與證據限制（已人工接受）

使用使用者提供的 requestId、reason、employmentId、bindingId、時間、permit generation/history 與資料結構。
員工姓名、LINE sub 與完整 master 使用明確合成資料，所有 Google／LINE services 都是記憶體 mock。
使用真正 SHA-256 helper，沒有 hash stub、覆寫 hash、映射 Production hash，亦未讀取正式完整 master／LINE sub。
合成 fixture 的 snapshotVersion/requestHash 因此與 Production 提供值不同；測試明確斷言不同。

**這是 observed-shape、內部雜湊一致的合成資料差異重播，不是 Production 全資料逐位元重播。**
不能據此宣稱正式資料已修復、准許操作 permit，或准許重新傳送原 migration。

## V48 → V49 對照與完整 recovery

同一 fixture 先用 V48，之後只替換 candidate Baseline 函式：

| 檢查 | V48 | V49 |
|---|---|---|
| requestStatus | RECOVERY_REQUIRED | STARTED |
| historicalCompletion | false | false |
| currentConsistency | CONFLICT | MATCHED |
| recoveryAllowed | false | false |
| newRequestAllowed | false | false |
| 無新批准直接 migrate | 拒絕 | RECOVERY_APPROVAL_REQUIRED；零新增寫入 |

另行批准 RECOVER_ORIGINAL 的**離線**完整模擬：

1. CLAIMED／INITIAL／generation 1 → Prepare ARMED／RECOVER_ORIGINAL／generation 2。
2. 保留原兩筆 history、原 requestId、原合成 snapshot/hash、employeeId、reason、confirmed=true。
3. generation 2 claim 先持久化，才進入 Sheet checkpoint。
4. Finish 讀回判定 `employmentDone=true`、`bindingDone=true`。
5. employment 新增 **0**、binding 新增 **0**、員工主檔 A:L mutation **0**。
6. 只新增 **1** 筆 COMPLETED audit；原 STARTED 不變，除 auditId／phase／operatedAt 外的 receipt 欄位相同。
7. Final：COMPLETED／historicalCompletion=true／MATCHED；兩個 Allowed 仍 false。
8. 額外明確的離線 completed replay 測試不新增任何資料；runtime 未加自動 retry。

## Fail-closed 與 INITIAL

新增 69 個測試覆蓋：

- channelId 錯誤數字／字串／前導零／空白／正號／科學記號／小數／非正數／NaN／Infinity／null／undefined／bool／object／array／unsafe integer。
- bindingId、employeeId、LINE sub、version、timestamps、status、reason、operator、sourceType、applicationId、previousBindingId 改變。
- persisted/intended 欄位多餘／遺失；缺 employment 卻有 binding；重複 employment/binding。
- master／employment 改變、wrong requestHash、wrong requestId、second STARTED、malformed COMPLETED、snapshot mismatch、unknown audit、數值 intent channel。
- permit 不是 CLAIMED、錯誤 mode/generation/history/hash；reapproval 後 binding/master/permit/payload 改變。
- 所有拒絕案例不變更 mock Sheet／permit，鎖正常釋放；身份衝突可在公開 dispatcher 更早拒絕。
- 內部 status evidence 測試採先前可信 context 來單獨驗證比對錯誤；另檢查公開 migrate／editor Prepare 拒絕，不繞過正式授權。
- 原本缺 binding 但有 employment 仍是 STARTED／PARTIAL；依使用者確認保留既有另行核准後續作規則。無新批准時零寫入，不誤報 MATCHED／COMPLETED。
- Fresh INITIAL 的 string storage 及 number round-trip 均成功：LEGACY_NOT_BASELINED → ARMED gen1 → claim → STARTED → employment → binding → COMPLETED → RECORDED。
- INITIAL 主檔不變、未知到職日空白、warnings 保留；v3 不新增 numeric channel equivalence。

## 可重跑離線驗證

從本 worktree 根目錄執行：

```powershell
python release-candidates/gas-t4-recovery-channelid-v49/tests/run.py
node release-candidates/gas-t4-recovery-channelid-v49/tests/static.cjs
git diff --check
```

本輪 Python 實際使用：
`C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`。
Node：v24.19.0。

Runner 只用本機 git show 固定 ref 匯出測試依賴到 TemporaryDirectory，不複製舊 evidence 到本候選。
V48/V49 跑完全相同、未修改的既有五套 GAS 測試；V49 只在 temporary test tree 替換 11 個 sources。
新增差異測試的 V48 原始 service fixture 在替換前執行。所有執行載入 deny-network guard。
不需要 Cloudflare/GAS/LINE/Sheets、browser 或 production credentials。

| 已執行 suite | V48／參考 | V49 |
|---|---:|---:|
| V44 pinned reference | 89 | — |
| V48 wrapper（含固定 V48 hash） | 47 | — |
| Foundation | 82 | 82 |
| GAS diagnostics | 69 | 69 |
| T4 safety | 77 | 77 |
| Combined contract | 74 | 74 |
| Maintenance/no-flush | 29 | 29 |
| V48→V49 recovery／negative／INITIAL | — | 69 |

總計 **867 PASS／0 FAIL／0 SKIP**。V48 對照組及 V49 candidate 組分開列數；不把 TAP 內載入的參考 suite 再重複加總。
V48-only wrapper 的固定 hash 測試只對原 V48 執行，沒有改寫它的預期 hash 來假裝 V49 是 V48。
Worker／browser 未改動，本輪不重跑其網路／UI suites，也不把它們算為 SKIP 或 PASS。

靜態：11-file provenance／exact patch／scope PASS；9 GAS syntax、1 既有 HTML inline script、3 test JS syntax、JSON PASS。
普通 git diff 不包含 untracked，另逐檔 `git diff --no-index --check` 檢查新增 review/tests，runtime patch 對 V48 另外檢查。
固定舊 sources 的未改內容不重排、不重寫空白。
本輪開發期測試工具失敗與修正摘要保存在 `evidence/validation-history.json`；最終結果全部重新執行。

## Hash 與封存方式

- V48 bundle：`df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5`
- V49 bundle：`57e8a16ec0088d1bd4c024a453b60f3365b70c4c47247ec925c933117ba49cc0`
- V49 EmployeeLifecycleBaseline.gs：`d8151afe57bb85b9a3c3e9c31c833d38b8d8b0382e094754722a4951f7c89c2b`
- Evidence bundle：`20fae94b834d861c0ab5dea97f2c3f9bfa6ea83c9ca4777283266869a89c0218`

Bundle 算法：依相對 filename 排序，串接 UTF-8 filename + NUL + ASCII byte length + NUL + exact bytes，再 SHA-256。
`source-manifest.json` 列十一檔 base/candidate SHA 與 bytes。
`evidence/test-inputs.json` 綁定 source manifest、固定依賴與本輪 tests 的 hash。
`TEST_RESULTS.json`／`evidence/test-results.json` 保存實際命令、exit code、逐套計數、stdout/stderr digest。
`evidence/seal.json` 列 evidence 精確檔案、size/hash；不把自己納入 bundle，也不聲稱封存 REVIEW.md。
時間與測試程序 duration 可能讓重跑 output digest／evidence hash 更新；runtime bytes 不得因此更新。

## 檔案清單與停點

共 24 個新增檔案：

- `.gitattributes`
- `sources/` 十一檔：程式碼.gs、index.html、appsscript.json、EmployeeIdentity.gs、EmployeeLifecycleStore.gs、EmployeeApplication.gs、EmployeeApplicationAdmin.gs、EmployeeLifecycleRead.gs、EmployeeLifecycleMutation.gs、EmployeeLifecycleBaseline.gs、EmployeeBaselineControl.gs。
- `tests/recovery-fixture.cjs`、`tests/recovery.test.cjs`、`tests/static.cjs`、`tests/run.py`。
- `source-manifest.json`、`TEST_RESULTS.json`、`REVIEW.md`。
- `evidence/runtime.patch`、`evidence/test-inputs.json`、`evidence/test-results.json`、`evidence/validation-history.json`、`evidence/seal.json`。

P0/P1：本次窄範圍候選與離線測試未發現新的阻擋問題。
Production recovery 仍 HOLD：完整資料逐位元核對、人工 code review、部署與重新批准均未執行；不能把本候選視為 Production 放行。
P2／證據限制：mock 無法證明 Google Production 的所有型別／服務故障行為；只有 channelId 差異獲准正規化，其他漂移仍拒絕。
Script Properties 與 Sheet 並非 transaction，此候選沒有宣稱解決既有跨服務原子性。

READY FOR HUMAN REVIEW

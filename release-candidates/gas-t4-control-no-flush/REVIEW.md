# V48 micro-patch：Control maintenance lock without Sheet flush

狀態：READY FOR HUMAN CODE REVIEW。這是本機候選，不是已部署 V48。Migration = HOLD。

獨立 branch：`codex/t4-control-no-flush`。
固定 base：`5e272d981617d5940c88332aa7ba3bdead949b6a`。
來源是該 commit 的 `release-candidates/gas-t4-read-diagnostics/sources/` Git bytes，沒有從 Apps Script editor、main、optimization study 重組。

使用者提供的 Production 現況為 V47、Worker `433ff291 / t3-4-gas-read-diag`、read diagnostics 開啟、control property ABSENT、三條唯讀 acceptance 通過。本輪未連線驗證或改動這些狀態。

## A. Exact runtime diff

完整差異：[`evidence/control.patch`](evidence/control.patch)。只有 `EmployeeBaselineControl.gs` 改動，**+9 / -2**。

```diff
--- V47/EmployeeBaselineControl.gs
+++ V48/EmployeeBaselineControl.gs
@@ -83,13 +83,20 @@
   employeeBaselineControlPersist_(c); // Durable claim/read-back BEFORE any Sheet write.
   return c;
 }
+// Script-property maintenance only; migration keeps its existing flush/checkpoints.
+function employeeBaselineControlWithLock_(work) {
+  var lock = LockService.getScriptLock();
+  if (!lock.tryLock(5000)) employeeFailure_('BUSY', '目前忙碌中，請稍後重試。');
+  try { return work(); }
+  finally { lock.releaseLock(); }
+}
 // Editor-only operational authorization. Deployment maintainer records an explicit
 // OWNER/ADMIN approval reference. This is NOT a LINE-authenticated approval API.
 function employeeBaselineControlPrepare_(plan) {
   var keys = ['operatorId', 'approvedBy', 'approvalReference', 'requestId', 'expectedSnapshotVersion', 'reason', 'mode'];
   if (!plan || Array.isArray(plan) || Object.keys(plan).length !== keys.length || keys.some(function(k) { return !Object.prototype.hasOwnProperty.call(plan, k); }) ||
       !employeeBaselineApprovalRef_(plan.approvalReference) || ['INITIAL', 'RECOVER_ORIGINAL'].indexOf(plan.mode) < 0) employeeBaselineDenied_();
-  return employeeWithLock_(function() {
+  return employeeBaselineControlWithLock_(function() {
     var channel = PropertiesService.getScriptProperties().getProperty('LINE_LOGIN_CHANNEL_ID');
     var actor = employeeBaselineEditorActor_(plan.operatorId, channel);
     employeeBaselineEditorActor_(plan.approvedBy, channel);
@@ -130,7 +137,7 @@
 }
 function employeeBaselineControlClose_(requestId, approvalReference) {
   if (!employeeBaselineApprovalRef_(approvalReference)) employeeBaselineDenied_();
-  return employeeWithLock_(function() {
+  return employeeBaselineControlWithLock_(function() {
     var c = employeeBaselineControlRead_();
     if (!c || c.requestId !== requestId || c.state === 'CLOSED') employeeBaselineDenied_();
     // Closing only removes authority; never deletes evidence or rolls back rows.
```

## B–E. Semantics

- 新 private helper 使用相同 ScriptLock、5000 ms 與 `employeeFailure_('BUSY', ...)`；取得鎖後 `try return work()`，`finally releaseLock()`。沒有任何 Sheet 寫入或 flush，也沒有新增 dispatcher action。
- Prepare 的函式內容只替換 lock helper 名稱。仍在鎖內解析 actor / approvedBy、確認在職 OWNER/ADMIN 與 target scope、完整 snapshot、INITIAL 無 receipt/employment/binding、strict input、requestHash、property persist/readback；成功只建立 ARMED。
- Close 只替換 lock helper 名稱。仍使用原 requestId 和 approvalReference 驗證、更新 CLOSED、保留歷史及 evidence；不刪 Sheet、audit 或 property history。
- Claim 完全未改。`EmployeeLifecycleBaseline.gs`、`EmployeeApplication.gs`、`EmployeeLifecycleStore.gs` 和 dispatcher 全部 byte-identical。Migration 仍由原 `employeeWithLock_` 執行，在 Sheet write 之前完成 claim persist/readback。
- 12 個新舊 differential scenarios 比對完整事件順序、result、mock tables、property 和寫入次數。正常 migration 的 flush 為 STARTED audit、employment、binding、COMPLETED audit、shared finally，共 5 次；不是僅 finally 的 1 次。各 checkpoint 的 before/after persistence error 路徑也逐項相等。
- Wrapper 位於 `experiments/t4-initial-prepare-wrapper/`，不在 11 個部署檔。wrapper GS 與前輪 byte-identical；測試 target 改為本候選並要求零 flush。固定 EMP001、原 requestId、approvalReference、中文 reason；snapshot 取即時 preview，Prepare 重新驗證。不呼叫 migration/claim/close，不直接 setProperty、不產生新 requestId。

## F. Residual response-lost risk

no-flush 僅移除 maintenance 的不必要 Sheet flush 故障點，不提供 transaction 或 exactly-once 回應保證。

PropertiesService 在 persist 後拋例外、readback 不一致、releaseLock 失敗或 runtime termination，仍可能造成 caller 見到失敗但 ARMED/CLOSED 已存在。mock 的 before-release 與 after-release failure 均保留 property/evidence，分類為 **AMBIGUOUS**；不假稱 before-release failure 已釋放鎖。

這個分類是本機測試及維運解讀，不是新增 API 回應，也沒有吞掉 exception。未來遇到不確定結果：STOP，不重跑 wrapper/Prepare、不換 requestId；另行批准唯讀核對 property。不要自動 Close、刪 property、recovery 或 rollback。

## G. Executed offline tests

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Original V44 foundation | 89 | 0 | 0 |
| Combined candidate foundation | 82 | 0 | 0 |
| GAS diagnostics | 69 | 0 | 0 |
| T4 safety | 77 | 0 | 0 |
| Combined contract | 74 | 0 | 0 |
| Existing t3-4 Worker regression | 273 | 0 | 0 |
| Existing frontend browser | 261 | 0 | 0 |
| Existing cross-branch browser | 8 | 0 | 0 |
| GAS + Worker + frontend contract | 15 | 0 | 0 |
| New maintenance / differential | 29 | 0 | 0 |
| Updated wrapper | 47 | 0 | 0 |
| **Total** | **1024** | **0** | **0** |

既有 948 全部重新跑過，加上本輪 76。static/dependency、9 個 GAS syntax、HTML inline JS、manifest JSON、test JS/Python syntax、hash/scope、`git diff --check` 均 PASS；不將這些檢查另算測試數。

全部使用 in-memory GAS/Properties/Sheets mocks。Node suites 禁用真實 network；browser/cross-artifact 全部攔截 request。沒有真正 permit 或 migration。

命令、exit code、各 suite counts 與 output digest 見 `TEST_RESULTS.json`；evidence 保存相同結果並綁定 candidate hash。開發過程先修正兩個測試假設（BUSY 使用 employeeCode；migration 有多個 flush），沒有為此修改 runtime。Windows Worker checkout 的 CRLF 差异以既有 LF Git blob核對；未改 Worker。

重跑方式（環境路徑記錄於 TEST_RESULTS）：

```powershell
$env:FRONTEND_ROOT='C:\Users\User\AppData\Local\Temp\water-clock-gas-read-frontend'
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:ROLLBACK_RELAY='C:\Users\User\AppData\Local\Temp\water-clock-t3-timing-worker-release\transport-v2\worker\relay.mjs'
python release-candidates/gas-t4-control-no-flush/tests/run.py
python release-candidates/gas-t4-control-no-flush/tests/seal.py
python release-candidates/gas-t4-control-no-flush/tests/verify-review.py
```

Browser frontend 固定 `e6078e4fd12811ed42d48840656c721765c2ede7`，與舊 regression 相同。它與 Worker 只用於離線相容性測試，沒有建立新 frontend/Worker candidate。重跑後 output 時間 digest 可能不同，必須重新 seal，不可把不同結果冒充同一 evidence bundle。

## H. Hashes and exact old → new matrix

- Old candidate: `279af27a24eeeffebc7114cea795bdf9a0bef682cf2c2721d18ad94e50817449`
- New Control: `46a1e243c0c1eb788137f8300e7beb8b864a7341ac4dc3d8344b652f4a0789e9`
- New 11-file candidate: `df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5`
- Evidence bundle: `6ebc80d24c14b1e6ca4cf73cc9893019f209f46dd8dbf0a7bbc0e091b773ed23`
- Experimental wrapper: `a06e19735fb2cc1fcbd310df8c7fa9bc94d3232badfcae1ed2bdb5e8c6146f6e`

`source-manifest.json` 記錄完整逐檔 SHA、size/lines 與 evidenceFiles。Bundle 算法為排序 UTF-8 relative filename + NUL + ASCII byteLength + NUL + exact bytes，再 SHA-256；不是字串 hash 拼接。Evidence 只涵蓋該 manifest 列出的 evidence/ 檔案，不含自我引用的 manifest 或本 review 文件。

| File | Old SHA-256 | New SHA-256 | Status |
|---|---|---|---|
| EmployeeApplication.gs | aea7cfecb4ec247ba8b14aaa1d356014bf1066633598f392a01024ae0d31b0fb | aea7cfecb4ec247ba8b14aaa1d356014bf1066633598f392a01024ae0d31b0fb | UNCHANGED |
| EmployeeApplicationAdmin.gs | b5761d9ab6c5027766955f96bfb2765d0d84e6348b97b160d361bba277e4ca46 | b5761d9ab6c5027766955f96bfb2765d0d84e6348b97b160d361bba277e4ca46 | UNCHANGED |
| EmployeeBaselineControl.gs | 413e7834b104793a6534ea52fb56d445c9046b0e62e65c90a79ccca781a3ad9e | 46a1e243c0c1eb788137f8300e7beb8b864a7341ac4dc3d8344b652f4a0789e9 | MODIFIED |
| EmployeeIdentity.gs | c6d8dad46ee6e0b5ed31408b6f6a80144f8e017d623b06100fca3b21a3ee74cf | c6d8dad46ee6e0b5ed31408b6f6a80144f8e017d623b06100fca3b21a3ee74cf | UNCHANGED |
| EmployeeLifecycleBaseline.gs | 1f0de28ab189b68b7f9758fd430b5c648ce3d8f2a0ff407e492b43a33a0b875e | 1f0de28ab189b68b7f9758fd430b5c648ce3d8f2a0ff407e492b43a33a0b875e | UNCHANGED |
| EmployeeLifecycleMutation.gs | 7d3c454f37f9f0e1d60eaaa0415ae7c10f2fa1f44834fe571f3bc5199ecaf083 | 7d3c454f37f9f0e1d60eaaa0415ae7c10f2fa1f44834fe571f3bc5199ecaf083 | UNCHANGED |
| EmployeeLifecycleRead.gs | 602a7157ed5e9756947aa14ae546263b5593fed420f74b04e5a8e99c8cb3a56d | 602a7157ed5e9756947aa14ae546263b5593fed420f74b04e5a8e99c8cb3a56d | UNCHANGED |
| EmployeeLifecycleStore.gs | 40990ea7487a3588ee91b937b62ca91f4d461a51c3acb2de5893e015f171b951 | 40990ea7487a3588ee91b937b62ca91f4d461a51c3acb2de5893e015f171b951 | UNCHANGED |
| appsscript.json | 788d42fd367f154e0fc730f8953b842365de440f58560dc4333f723e0c8b44f3 | 788d42fd367f154e0fc730f8953b842365de440f58560dc4333f723e0c8b44f3 | UNCHANGED |
| index.html | 523048d4eae2135528794580ca57bdf93bddefcf550caf9fdeb0f9f650c63ff2 | 523048d4eae2135528794580ca57bdf93bddefcf550caf9fdeb0f9f650c63ff2 | UNCHANGED |
| 程式碼.gs | 7382764a0446a8937913789623516257ccb26c5162c155838be8d3d867fd1651 | 7382764a0446a8937913789623516257ccb26c5162c155838be8d3d867fd1651 | UNCHANGED |

## I–J. Review gate and remaining risks

- P0：本次 micro-patch 未發現新增 P0。
- P1：原 maintenance flush 故障點已移除並經離線測試。response-lost ambiguity 仍存在；不可把本 review 當作 permit approval 或 Production Migration 放行。
- P2：沒有本次需要額外擴充的程式問題；沒有加入 retry、recovery 自動化或 diagnostics。
- Runtime diff 與 10 檔 byte identity 已驗證。所有新增內容只在本 candidate 與 experiments wrapper；既有 tracked source、evidence、manifest 沒有修改。沒有 staged files。
- 沒有 stage、commit、push、PR、merge、deploy、Production request、GAS/Cloudflare/LINE/Sheets/Script Properties 操作、permit 或 migration。

READY FOR HUMAN CODE REVIEW

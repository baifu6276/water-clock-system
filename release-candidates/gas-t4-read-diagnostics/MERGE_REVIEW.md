# T4 Safety + GAS Read Diagnostics — human code review package

**READY FOR HUMAN CODE REVIEW。Migration HOLD。這不是部署／permit／正式資料操作批准。**

## A. 固定來源與重建

- 工作分支 `codex/t3-gas-read-diagnostics`，HEAD `6f3921f2bbea6d175c8bcac3888b09e231f44774`；只有本 candidate 為新檔，無 stage。
- BASE：上述 commit 的 `release-candidates/gas-v44-read-diagnostics/evidence/v44-sources/`，10 檔 bundle `22b66c3b9b31dd27b6eafa3b1d960995ee6e42becb199168cef09fb5c3e6a334`。
- READ：上述 commit 的 `release-candidates/gas-v44-read-diagnostics/sources/`，10 檔 bundle `ce7295e11cef5b381519920323470f60825394ed61466125f0ebe785e59dbdaa`。
- T4：`4319d3e9518ca4c4cbb83fd27d2ee9b148d43ff4` 的 `gas/EmployeeLifecycleBaseline.gs` 與 `gas/EmployeeBaselineControl.gs`。
- 已重算實際 Git blob 及保存的 V45 兩檔：Baseline `51693ec22f9d319bdcb67d5753e9f723d80fdab58fc440a46f2a4c4895d34787`；Control `413e7834b104793a6534ea52fb56d445c9046b0e62e65c90a79ccca781a3ad9e`，全部符合指定值。
- V44 八個原樣檔 + READ Application + T4 Baseline/Control 組成的 V45 對照層，另與保存的 V45 **全部 11 檔**逐檔 SHA 核對相同。沒有取用 current editor 或其他 feature runtime。
- `tests/assemble.py` 只讀本機固定 Git objects。無 fetch；來源不符會 assert 停止。依指定 ancestor 作 file-level three-way merge，沒有 branch merge。
- 舊 candidate、evidence、manifest、Worker、frontend 與 optimization study 均未改動；沒有 import/copy study prototype。

## B. Baseline 精確三方合併

唯一合併：`git merge-file --diff3 -p READ BASE T4`；exit 0，衝突 0，人工解衝突 0。

|類別|BASE hunk → layer hunk|內容|
|---|---|---|
|READ only|`-138,17 +138,23`|RequestStatus 第三參數 diagnostic；LOCK_WAIT、鎖內 EMPLOYEE_CONTEXT、ACTION_READ、revoke/re-expose|
|T4 only|`-16,17 +16,27`|result 帶原 requestId；decode 同時接受 v3/v4，嚴格驗證 v4 before/after image|
|T4 only|`-45,6 +55,7`|v4 before master A:L 與完整 current master 比對|
|T4 only|`-90,27 +101,30`|strict exact input；全 requestId 衝突檢查；完成重播驗證；INITIAL/RECOVER_ORIGINAL claim；拒絕新操作繞過|
|T4 only|`-125,9 +139,14`|v4 audit 完整主檔快照、批准 reference、warnings；寫入前驗證 proposed receipt|
|T4 only|`-179,7 +198,7`|原 v3 beforeJson exact check 僅限 v3；v4 由新增 decoder 驗證|
|overlapping|無|同檔不同 hunk；T4 RequestStatus 與 BASE 相同|
|conflict resolution|無|未手寫／重寫任何 runtime 函式|

完整 hunk evidence 在 `evidence/base-read.diff`、`base-t4.diff`、`t4-combined.diff`、`read-combined.diff`。
相對 T4 的 Baseline **只有** `-157,17 +157,23` diagnostics hunk；相對 READ 只有上述五個 T4 hunks（最後一處位移為 `-185,7 +204,7`）。
靜態檢查逐函式 exact source slice：RequestStatus 等於 READ；其他 Baseline 函式全部等於 T4。未改快照格式、排序、日期或合併讀取。

## C/D. 精確 11 檔及三張逐檔矩陣

|檔案|V44 → combined|V45/T4 → combined|V46/read → combined|
|---|---|---|---|
|EmployeeApplication.gs|MODIFIED|MODIFIED|UNCHANGED|
|EmployeeApplicationAdmin.gs|UNCHANGED|UNCHANGED|UNCHANGED|
|EmployeeBaselineControl.gs|ADDED|UNCHANGED|ADDED|
|EmployeeIdentity.gs|UNCHANGED|UNCHANGED|UNCHANGED|
|EmployeeLifecycleBaseline.gs|MODIFIED|MODIFIED|MODIFIED|
|EmployeeLifecycleMutation.gs|UNCHANGED|UNCHANGED|UNCHANGED|
|EmployeeLifecycleRead.gs|UNCHANGED|UNCHANGED|UNCHANGED|
|EmployeeLifecycleStore.gs|UNCHANGED|UNCHANGED|UNCHANGED|
|appsscript.json|UNCHANGED|UNCHANGED|UNCHANGED|
|index.html|UNCHANGED|UNCHANGED|UNCHANGED|
|程式碼.gs|UNCHANGED|UNCHANGED|UNCHANGED|

八個 V44 unchanged 檔 byte-identical。Application 逐 byte 等於 READ；Control 逐 byte 等於 T4。REMOVED=0。

## E. Read diagnostics 與等價性

- `_transportDiagnostics` 只接受 identityBootstrap / employeeLifecycleBaselineDryRun / employeeLifecycleBaselineRequestStatus。
- 舊 action set 與 Code dispatcher bytes 不變。write action 即使已有 ARMED permit，带 metadata 仍先回 VALIDATION_ERROR；不驗 token、不消耗 permit、不寫 Sheet。
- 五 stages、bucket、trace matching、flag 判斷、clock failure isolation、非管理員不公開 diagnostics 全沿用 READ Application。
- status 先等鎖，再 revoke，重新 employeeContext/reviewer 驗證，才重新 expose；未取得鎖回 UNKNOWN；釋放僅限已持有的鎖。
- 沒有 receipt 也先驗任職表 schema；錯誤表頭仍 SCHEMA_ERROR。等鎖間停職／降權／LINE 綁定改變皆拒絕且沒有 diagnostics。
- differential test 使用相同假時間／資料：完整 business JSON + diagnostics、主檔/helper 讀取次數相同；不將 helper 數當成 RPC 數。
- 比對含三個正常 action、空／缺表、錯誤表頭、資料讀取例外、重複 ID/UID、角色／狀態、salary string、未知日期、v3 完成／部分／衝突回執。
- **等價範圍：V46 原本支援的 legacy/v3 fixtures。** T4 新增 v4 receipt 的 status 支援是已批准功能，不宣稱對 V46 不支援的 v4 資料仍有相同結果；另以保存的 T4 reader 驗證 v4 business JSON 相同，diagnostics 只附加 metadata。
- 這些是離線 mock 等價／事件測試，不能推導真實併發交易性、效能或 timeout 根因。

## F. T4 寫入安全邊界

- migration strict keys 精確七個：action / idToken / employeeId / requestId / expectedSnapshotVersion / reason / confirmed。
- EMP001-only；server-verified active OWNER/ADMIN；ADMIN 不得操作 OWNER；lock 內 context/snapshot 重驗。
- control absent/malformed/mismatch → deny。無自動建 property、ARM、重試、recovery 或 destructive rollback。
- ORIGINAL requestId、actor、hash、snapshot 綁定；INITIAL / RECOVER_ORIGINAL 需伺服器 permit；ARMED → CLAIMED 的 property persist/readback 在任何 Sheet write 之前。
- CLAIMED、CLOSED 不允許新寫入；完整且一致的既有成功回執可唯讀重播，不能誤稱 CLAIMED 之後連成功查詢也一律拒絕。
- response lost 保留原 requestId，先 status read；NOT_OBSERVED／UNKNOWN 不授權任何新寫入或 recovery。
- 四個 checkpoint 的前／後失敗均保留 evidence，不刪除部分 row；v4 audit 完整 before A:L、after image、approvalReference、warnings。Sheet A:R header 不變，v3 歷史仍可讀；v3 partial 不偽裝成 T4 可 recovery。
- READ_DIAGNOSTICS_ENABLED 與 T4_EMP001_BASELINE_CONTROL 完全獨立。true/false/absent × ABSENT/ARMED/CLAIMED/CLOSED 的讀取測試不調 Prepare/Claim/Close、不寫 property、不 flush。
- 私人 editor control helpers 不在 dispatcher；不是 LINE approval API。這些函式只有明確人工維運程序才可使用；本輪沒有實際使用。
- 77 項既有 T4 測試保留競爭請求、獨立 VM 鎖、過期 snapshot、屬性寫入失敗、readback 不一致、quota、audit 衝突與手動續作測試。它們全部使用記憶體 service，沒有真 permit／migration。

## G. 實際測試結果

|Suite|PASS|FAIL|SKIP|執行對象|
|---|---:|---:|---:|---|
|V44 foundation/baseline/status|89 組|0|0|固定 V44 evidence；完整原 suite|
|Combined foundation/regression|82 組|0|0|完整九個 combined GS；已保存 V45 適配 suite，v3 synthetic rows，不偷用 legacy migration runtime|
|GAS read diagnostics|69|0|0|完整 combined GAS|
|T4 GAS safety / existing fixtures|77|0|0|完整 combined GAS|
|Combined differential / boundary|74|0|0|V46 reference 與 combined；另驗 v4 T4 semantics|
|Worker t3-4 relay|273|0|0|原 Worker，未改|
|Current frontend browser|261|0|0|e6078e4fd12811ed42d48840656c721765c2ede7，未改|
|既有 browser cross-branch|8|0|0|舊 t3-3 rollback artifact，未改|
|新增 candidate cross-artifact|15|0|0|combined GAS + t3-4 Worker + current frontend；所有 URL 攔截|

cross-artifact 含三條 reads、ADMIN/OWNER/EMPLOYEE、flag off、malformed/trace mismatch、schema error、lock busy／角色失效、timeout、redirect deny、Worker rollback、完整正確／錯誤 rollback order。

完整 commands / exit codes / browser 子群在 `TEST_RESULTS.json`；原測試來源 SHA 與必要的載入路徑適配在 `evidence/test-provenance.json`。
開發期修正：新增測試誤用 CONTROL_NOT_ARMED，依既有固定契約改成 CONTROLLED_MIGRATION_DENIED；scope 工具修正 Git 中文 quoting 與 --no-index 的正常 exit 1。候選 runtime 未因此修改。最終全套無未解決 failure。

重跑（設定現有本機路徑後）：

```powershell
$env:FRONTEND_ROOT='C:\Users\User\AppData\Local\Temp\water-clock-gas-read-frontend'
$env:PLAYWRIGHT_MODULE='C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\playwright'
$env:CHROME_PATH='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:ROLLBACK_RELAY='C:\Users\User\AppData\Local\Temp\water-clock-t3-timing-worker-release\transport-v2\worker\relay.mjs'
python release-candidates/gas-t4-read-diagnostics/tests/run.py
python release-candidates/gas-t4-read-diagnostics/tests/scope-check.py
python release-candidates/gas-t4-read-diagnostics/tests/finalize-evidence.py
```

## H. Dependency / static

- 9 GS syntax + 1 inherited HTML inline JS syntax；全部新 CJS parse；JSON manifest、scope、webapp 設定不變。
- 213 global symbols、209 functions；duplicate globals/functions=0；unresolved lexical runtime identifiers=0。
- T4 transitive dependency closure 49 symbols；doPost closure 206。詳 `evidence/dependency-closure.json`。
- AST lexical binding/reference 分析包含 function/block/catch/var scope；不是對 Apps Script 動態服務行為的形式證明。
- 固定 14-symbol `employeeProjectIntegrityCheck()` mock PASS，僅證明 function existence，不證明 editor 完整 source hash 或 active deployment identity。
- Dispatcher action set 不变；Control helper 無 action exposure。靜態 signature 掃描未發現新增真 token、secret 或實際 LINE UID。
- `git diff --check` PASS。因新目錄 untracked，另對全部 11 檔作 V44→candidate `git diff --no-index --check`，以及新 tests/docs whitespace 檢查；沒有 stage。

## I. 雜湊與檔案大小

Bundle：排序後 UTF-8 相對檔名 + NUL + ASCII byteLength + NUL + exact bytes，再 SHA-256。

- 11-file candidate：`279af27a24eeeffebc7114cea795bdf9a0bef682cf2c2721d18ad94e50817449`
- 五個固定 source inputs evidence bundle：`5daa2605f16210df79d194b21cd3fcd2a6433a4a0b0570514c86468c99bfe59a`
- evidence input hash 不涵蓋衍生 diff/reports；完整 review evidence 另在 manifest 的 reviewEvidenceBundleSha256 / reviewEvidenceFiles 中列明。
- 完整 12-file review evidence bundle：`5ac5730b6d3419e5ff7efbc968c0cd9b9f61682af250ec414243b72bacd12b15`。
- Worker 原 SHA：`2495e79ad32fb2fd5550b4980ad60a06a196d05f76c3fd6f29633548e5152461`，未更動；routes 仍僅 /identity、/employee-read、/employee-operation-status。

|檔案|bytes|lines|SHA-256|
|---|---:|---:|---|
|EmployeeApplication.gs|13438|214|`aea7cfecb4ec247ba8b14aaa1d356014bf1066633598f392a01024ae0d31b0fb`|
|EmployeeApplicationAdmin.gs|16421|246|`b5761d9ab6c5027766955f96bfb2765d0d84e6348b97b160d361bba277e4ca46`|
|EmployeeBaselineControl.gs|10284|141|`413e7834b104793a6534ea52fb56d445c9046b0e62e65c90a79ccca781a3ad9e`|
|EmployeeIdentity.gs|9931|215|`c6d8dad46ee6e0b5ed31408b6f6a80144f8e017d623b06100fca3b21a3ee74cf`|
|EmployeeLifecycleBaseline.gs|19285|235|`1f0de28ab189b68b7f9758fd430b5c648ce3d8f2a0ff407e492b43a33a0b875e`|
|EmployeeLifecycleMutation.gs|14548|196|`7d3c454f37f9f0e1d60eaaa0415ae7c10f2fa1f44834fe571f3bc5199ecaf083`|
|EmployeeLifecycleRead.gs|11207|132|`602a7157ed5e9756947aa14ae546263b5593fed420f74b04e5a8e99c8cb3a56d`|
|EmployeeLifecycleStore.gs|12077|179|`40990ea7487a3588ee91b937b62ca91f4d461a51c3acb2de5893e015f171b951`|
|appsscript.json|353|14|`788d42fd367f154e0fc730f8953b842365de440f58560dc4333f723e0c8b44f3`|
|index.html|2576|142|`523048d4eae2135528794580ca57bdf93bddefcf550caf9fdeb0f9f650c63ff2`|
|程式碼.gs|217032|14110|`7382764a0446a8937913789623516257ccb26c5162c155838be8d3d867fd1651`|

## J. Privacy / production 邊界

- 強 LINE verify 仍 server-side，外部驗證在長時間 ScriptLock 之外；不快取驗證／權限、不跳過完整主檔／schema 重查。
- diagnostics 只輸出固定 stage/bucket 與 Worker trace 關聯；不把 metadata 寫入 hash、audit、Sheets。
- token 不持久化或記錄；沒有新增 LINE sub／raw response／URL／secret 的 diagnostics。
- tests 中 token、actor、row 全是假資料。新 evidence 只有固定 source、差異、hash 與本機結果，不加入 Production response／截圖／私人 approval record。
- 人工提供的 Production 現況：GAS V46、Worker 433ff291/t3-4、read diagnostics=true。**本輪未連線核實。**
- Worker 無 write route 不代表 GAS 全面停寫；原 V44 業務 actions 仍存在。新 candidate 僅恢復指定 T4 migration gate。
- NO_SAFE_OPTIMIZATION_JUSTIFIED 結論保持；本 candidate 沒有 runtime 讀取優化。

## K. Rollback 限制

- 現在只做 code review，未產生新 deployment version，也未變更任何 Script Property。
- 若日後另行批准部署，應先保留完整 V46 source/version 與當時 control/evidence 狀態，保持 Worker readonly；不自動建立 permit。
- **沒有任何 T4 寫入之前**，可經人工批准把同一 GAS deployment ID 指回既有 V46；它仍支援 t3-4 diagnostics metadata。不要新建 URL。
- 已有 ARMED/CLAIMED 或任何 v4 checkpoint 時，不能宣稱簡單 rollback 安全：V46 沒有 T4 permit gate且不完整理解 v4；需先停止寫入、保存證據、人工核對。不得刪 row、audit 或 property 來「恢復乾淨」。
- Script Properties 不隨 GAS version rollback；Properties + Sheets 不是 transaction；response lost／UNKNOWN 仍只以原 requestId 做 status，禁止自動 retry。
- 不把 rollback 成 V46 視為 Migration 放行；三次人工唯讀成功也不是 migration 驗收。

## L/M. 風險與停點

- P0：未發現本次 candidate 合併引入的 P0；來源／雜湊／矩陣符合。
- P1（release gates）：仍需人工 source review、正式備份/evidence、私人 approval record、殘留 permit 核對、GAS 部署後 read-only preflight 與獨立最終 migration 批准。離線測試不能取代 Google production concurrency/partial-write evidence。
- P2：靜態分析、fake clock／服務 mock 有已明示限制；原 timeout 根因未證明，沒有加速或 timeout 修復宣稱。
- 本 candidate 僅 READY FOR HUMAN CODE REVIEW；Production Migration 繼續 HOLD。
- 零 stage、commit、push、PR、branch merge、deploy、Production request；零實際 GAS／Cloudflare／LINE／Sheets／Script Property／permit 操作。

## 實際完整命令

- `v44-foundation`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs release-candidates/gas-t4-read-diagnostics/tests/v44-foundation.cjs
  ```

- `combined-foundation`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs release-candidates/gas-t4-read-diagnostics/tests/foundation.test.cjs
  ```

- `gas-diagnostics`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs --test --test-reporter=tap release-candidates/gas-t4-read-diagnostics/tests/gas-diagnostics.test.cjs
  ```

- `t4-safety-fixtures`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs --test --test-reporter=tap release-candidates/gas-t4-read-diagnostics/tests/t4-gas.test.cjs
  ```

- `combined-contract`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs --test --test-reporter=tap release-candidates/gas-t4-read-diagnostics/tests/combined-contract.test.cjs
  ```

- `worker-t3-4`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE --require ./release-candidates/gas-t4-read-diagnostics/tests/deny-network.cjs --test --test-reporter=tap transport-v2/tests/relay.test.mjs
  ```

- `cross-artifact`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE release-candidates/gas-t4-read-diagnostics/tests/cross-artifact.cjs
  ```

- `static`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE release-candidates/gas-t4-read-diagnostics/tests/static.cjs
  ```

- `diff-check`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-diagnostics`

  ```text
  git diff --check
  ```

- `browser`：exit 0；cwd `C:\Users\User\AppData\Local\Temp\water-clock-gas-read-frontend`

  ```text
  C:\Users\User\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.EXE transport-v2/tests/live-test.cjs
  ```

READY FOR HUMAN CODE REVIEW

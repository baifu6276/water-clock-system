# T4 offline release staging — human review package

**READY FOR HUMAN REVIEW；不是 Production release / Migration 授權。Migration HOLD。**

## Provenance / scope

- Branch：codex/t4-release-staging
- Worktree：C:/Users/User/.codex/worktrees/t4-release-staging/water-clock-system
- Base / unchanged HEAD：b9ad9f57f435e6780d465f5480b71dc24354d991
- Reviewed artifact source：53c60bdb2e0bc89d49ab02fd2221725e76f38adf
- Runtime 五檔直接取固定 Git blobs，沒有為測試修改 runtime bytes。
- config.js 與 base Git blob exact byte-identical、git diff 為空；Windows checkout EOL stat 標記已刷新，未 stage 內容。
- 原 candidate branch 沒有修改。未 stage / commit / push / PR / merge / deploy。
- 沒有正式 Cloudflare/GAS/LINE/Pages/Sheets/Script Properties/permit/migration request。
- 指定 main base 原先不在本機，只有取得该 Git commit 的 source fetch；測試 runner 自身完全離線、不 fetch。

## Deployable runtime diff

| 路徑 | main → staging |
|---|---|
| transport-v2/worker/relay.mjs | +113 / -17 |
| transport-v2/live-test/client.js | +3 / -2 |
| transport-v2/live-test/index.html | +1 / -1 |
| transport-v2/t4-migration-runner/client.js | +166 / -0 |
| transport-v2/t4-migration-runner/index.html | +40 / -0 |

Runtime 合計 +323 / -20。
完整 runtime diff 在 RUNTIME.diff；正式 root index.html、js/、css/、gas/、config 不改。
Worker 將 main 既有 dormant generic T4 route 收斂為已 review 的單一固定 operation，同時整合 timing/GAS read diagnostics。
Read frontend 只新增 t4-safety-2-gas-read-diag capability 與固定 cache-buster；舊合法版本支援保留。
新增專用 runner 使用 QZYsTwb9；read-only 仍 R76314It。

## Exact SHA-256

- workerFile: `7f5994d15bf732b53f4566c3594ebb7e3707d1a9cb2115a032c04cb6c61c7600`
- workerBundle: `38e0dfaac30467bc829dcb75310e56518d34726aa7700549757fdbe42b217271`
- readFrontend: `fd9fc54d94f7154dc5d0ac8f2742a402cf48f4e8e8b05c5c48a832fee172f013`
- runner: `7a1d87607720c8f8c853a62aa8a6f3e9e19a28db0e11bc63bf98d07988ecf431`
- gas: `df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5`
- rollback: `172353c88ff9ed6b41b0640f5536b3a792ba9f8f1fbb22e1ad69131eb696bf68`

bundle 規則：relative filename 字串排序；每檔串接 UTF-8 name + NUL + ASCII byte length + NUL + bytes，再 SHA-256。
GAS 11 檔從 reviewed Git objects 驗證，只於暫存測試環境載入，不加入或修改 repo GAS runtime。

## Original runtime regression gate (2954)

| Suite | PASS | FAIL | SKIP |
|---|---:|---:|---:|
| Reviewed relay regression | 273 | 0 | 0 |
| Reviewed migration transport | 71 | 0 | 0 |
| Reviewed read browser | 269 | 0 | 0 |
| Reviewed runner browser | 56 | 0 | 0 |
| Reviewed version/rollback compatibility | 10 | 0 | 0 |
| Reviewed V48 contract/rejection | 7 | 0 | 0 |
| New Worker mutation/response/race | 1256 | 0 | 0 |
| Actual-runner model sequences | 1000 | 0 | 0 |
| Pages/E2E/rollback/privacy scenarios | 12 | 0 | 0 |
| Total | 2954 | 0 | 0 |

最終以 TEST_RESULTS.json 的 fullRun、exit codes、input hashes 為機器證據，preflight 必須重新驗證其與現有內容相符。
不是全 repo 每個歷史 suite 都執行；詳見 TEST_STRATEGY.md 的版本及 scope 說明。

- Model seed：0x54740002；1000 組、每組 49 或 50 events。失敗縮減器逐項刪除且重新檢查到固定點，產生 1-minimal reproduction；不宣稱全域最短。
- Mutation seed：0x54740001；1000 payload mutations + 200 response mutations；另20 valid controls、11 flag cases、3 duplicate-key、1 business passthrough characterization。
- Race：18 deadline cases（POST/GET/body ×19999/20000/20001×兩種回呼順序）及3 late-resolution；不改20秒、不retry。
- 同一document最多一次migration POST；錯誤/逾時/NOT_OBSERVED/UNKNOWN/STARTED/RECOVERY_REQUIRED/COMPLETED均不能重返READY。
- Token retrieval reentry、fetch期間double-click、force-enabled DOM、SUBMITTING期間status/precheck均受handler gate保護。
- Fake時計不是Cloudflare硬即時保證；先resolve後timer的既有順序語意有明確測試及說明。

## Privacy / Pages / rollback

- 使用actual staging runtime，LIFF/GAS/Worker/Pages全mock或攔截，Node另有deny-network guard；沒有以正式服務驗證。
- 五個Pages路徑、relative scripts、兩個LIFF ID、隔離client、query不可改config、無storage/cookie/service-worker都通過。
- flag OFF → fresh mock document flag ON → exactly one success → original status → t3-4 rollback status 流程通過；fresh document不是正式重試流程。
- rollback artifact exact hash已固定。read frontend identity/dry-run/status相容；未送出runner預檢fail closed，已attempted runner可status但不重寫。
- 指定sentinels未洩漏至UI/console/transport-error-body/headers/timing/URL/cookie/storage。
- 限制：Relay會轉送合法business JSON的其他欄位，並非通用response sanitizer；專門characterization明確保存此邊界，UI仍不render raw錯誤。

## Permanent tests vs evidence

建議永久保留更新後的2個既有test entrypoints及4個staging tests/fixture；reviewed其餘回歸由固定Git refs於TemporaryDirectory載入。
不把舊30+候選/evidence檔重複放入runtime PR。本輪review package 12檔與runtime/tests分開列在FILES.json。
run.py及preflight均可在本機重新執行；沒有平台操作指令。

## Checks / status

- Source provenance + exact runtime bytes + all hashes + LIFF separation + flag default deny + fixed contract + scope + syntax + test input provenance + git diff --check：由PREFLIGHT.json列出。
- JS已由node/VM語法解析及實際browser執行；HTML由browser解析、既有markup/static checks及Pages路徑模擬驗證，不宣稱W3C validator。
- Worktree預期dirty，保留23個content changes供review；staged檔案數0。config不在content changes中。
- 既有tracked diff用git diff --check；新增文字另檢查trailing whitespace與conflict markers。

## Findings / release decision

P0：本輪未發現。
P1 runtime：本輪離線測試未發現新的runtime blocker。
P1 release gates：真實Pages artifact、dedicated LIFF載入、Worker flag ABSENT部署、V48/permit/私人approval/備份證據仍需未來人工批准後驗收。不能現在release或migration。
P2：JSON重複key最後一值、business JSON passthrough、timer回呼順序、one-shot非跨document鎖、歷史controlled-test入口、外部Pages設定與cache限制；詳見FINDINGS.md。

最小PR候選已可人工review，未獲准commit/PR/merge/deploy。完整未來A–N流程在RELEASE_RUNBOOK.md；三條禁止推論：NOT_OBSERVED != safe to retry、timeout != failed write、Worker rollback != GAS did not execute。

READY FOR HUMAN REVIEW

## Preflight commit-state compatibility revision

本輪只修 review/test/evidence；五個 runtime bytes、6 個既有測試 bytes 與 config 都不改，FILES.json 仍精確23檔。

原問題：HEAD == BASE 使commit後必敗；scope只列3個modified runtime，漏掉2個新增runner；local main落後不能當offline failure。
新版以固定BASE作ancestry anchor，執行git merge-base --is-ancestor BASE HEAD。不以main/origin/main作判定。
BASE→working snapshot = git diff --name-only -z BASE -- 與 git ls-files --others --exclude-standard -z 的排序去重union。
5 runtime與6 tests均hard-coded精確allowlist，另12個inventory路徑限定review目錄。inventory不能加入第6個runtime或任意test路徑；actual set必須完全相等。
同時拒絕重複/不正規路徑、symlink、缺檔、額外檔與被working copy掩蓋的staged drift。

同一preflight輸出UNCOMMITTED_OVERLAY、COMMITTED_DESCENDANT或COMMITTED_WITH_OVERLAY；允許HEAD != BASE，仍維持exact source/hash、LIFF、固定operation、default deny等檢查。
本輪新增18個compatibility cases（4正向、14負向），與原2954項全套重跑；最終結果以TEST_RESULTS.json為準。
兩種核心snapshot比較runtimeFiles/testFiles/reviewFiles/changedFileCount/hashes/configUnchanged；不將暫存commit SHA放入被測source hash，避免循環。

### Evidence generation order / finalize
1. 固定code/runtime inputs，原9 suites全跑，保存2954結果與精確input hashes。
2. 用同一preflight先驗actual overlay，再複製23檔到BASE disposable worktree；只有disposable branch可stage/local commit。
3. 在clean committed descendant及隔離負向fixtures執行同一preflight，保存18項結果、pre/post JSON與input hashes。兼容性結果尚未產生時，preflight明確輸出compatibilityEvidencePresent=false；不假造已執行結果。
4. 恢復disposable到乾淨fixture commit，移除該worktree與local temp branch。
5. run.py --finalize必須證明temp已移除、input hashes未變；更新TEST_RESULTS / PREFLIGHT / MANIFEST。finalize後compatibilityEvidencePresent必須true。
6. 不hash TEST_RESULTS/PREFLIGHT/FILES自身；它們只保存inventory、被測code/runtime hashes及結果，沒有self-reference。

remote main == b9ad9f57f435e6780d465f5480b71dc24354d991 是未來人工online release gate，不是本機offline判定。本輪不查遠端；如未來remote main前進，STOP / rebase-review。
actual branch不stage、不commit、不push。暫存commit仅test fixture，不能當發布commit。Migration HOLD。

實際post-commit驗證另外發現舊RUNTIME.diff有兩行只含空白的context line；本輪將此evidence改為zero-context unified diff，保留相同五檔差異，不修改runtime，沒有略過git diff --check。Windows CRLF fixture狀態處理亦只影響disposable測試index。

## 本輪最終實測結果

完整九組runtime回歸2954 PASS，加上18項preflight compatibility tests，合計2972 PASS / 0 FAIL / 0 SKIP。
Actual UNCOMMITTED_OVERLAY與disposable COMMITTED_DESCENDANT皆12/12 PASS，23 scope / 5 runtime / 6 tests / 12 review、config ZERO DIFF、六組hash完全一致。
暫存驗證commit：0d82362ef86795a7cbca10bf4beab21d3297c3a2；暫存worktree已透過Codex archive移除，local temp branch已刪除（歸檔可恢復snapshot不屬於發布branch）。
finalize PASS；actual HEAD仍為BASE、staged 0，沒有actual commit或push。
開發過程fixture曾因Windows EOL stat及正向overlay加入EOF空白中止；最終修正後從完整九組回歸重新執行，未放寬任何gate。
本輪改動只在review目錄9個既有檔案：preflight.cjs、run.py、REVIEW.md、TEST_STRATEGY.md、RELEASE_RUNBOOK.md、RUNTIME.diff、TEST_RESULTS.json、PREFLIGHT.json、MANIFEST.json。
沒有runtime或六個permanent tests改動；FILES.json仍是原23檔inventory。

READY FOR HUMAN REVIEW

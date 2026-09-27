# T4 offline release staging — human review package

**READY FOR HUMAN REVIEW；不是 Production release / Migration 授權。Migration HOLD。**

## Provenance / scope

- Branch：codex/t4-release-staging
- Worktree：C:/Users/User/.codex/worktrees/t4-release-staging/water-clock-system
- Fixed BASE：b9ad9f57f435e6780d465f5480b71dc24354d991。Release branch 必須是此 BASE 的 descendant；exact current commit 由 Git history 取得。
- Reviewed artifact source：53c60bdb2e0bc89d49ab02fd2221725e76f38adf
- Runtime 五檔直接取固定 Git blobs，沒有為測試修改 runtime bytes。
- config.js 與 base Git blob exact byte-identical、git diff 為空；Windows checkout EOL stat 標記已刷新，未 stage 內容。
- Release commit/push 歷史以 Git 為準；此文件不硬寫 current HEAD，也不宣稱 branch 尚未提交。Evidence 不內嵌其 own containing commit SHA。
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
- 相對固定 BASE 的 exact release snapshot 是23檔；working tree 可為 clean committed descendant 或合法review overlay。即時 staged/dirty 狀態由 Git 判定，不由 committed evidence 宣稱。config不在content changes中。
- 既有tracked diff用git diff --check；新增文字另檢查trailing whitespace與conflict markers。

## Findings / release decision

P0：本輪未發現。
P1 runtime：本輪離線測試未發現新的runtime blocker。
P1 release gates：真實Pages artifact、dedicated LIFF載入、Worker flag ABSENT部署、V48/permit/私人approval/備份證據仍需未來人工批准後驗收。不能現在release或migration。
P2：JSON重複key最後一值、business JSON passthrough、timer回呼順序、one-shot非跨document鎖、歷史controlled-test入口、外部Pages設定與cache限制；詳見FINDINGS.md。

本候選供人工review；PR/merge/deploy仍需另行明確批准。完整未來A–N流程在RELEASE_RUNBOOK.md；三條禁止推論：NOT_OBSERVED != safe to retry、timeout != failed write、Worker rollback != GAS did not execute。

READY FOR HUMAN REVIEW

## Release evidence reproducibility

原始 evidence P1 有三個來源：run.py compatibility 將 source HEAD 限制為固定 BASE；finalize 將當時 preflight JSON 直接放在 PREFLIGHT.json 頂層；文件把過去 precommit 狀態描述成當前狀態。這不影響已審查 runtime，卻使 committed checkout 無法完整重跑且容易誤讀證據。

preflight 的安全 invariant 維持：固定 BASE ancestry、5 runtime / 6 permanent tests hard-coded allowlist、其餘12檔在review目錄、exact23 scope、六項hash、config ZERO DIFF、LIFF分離、固定operation與default deny。FILES.json只作inventory，不能擴張allowlist；staged drift不能被working bytes掩蓋。

run.py 的 source可為BASE overlay、clean committed descendant或合法committed overlay；compatibility一律先要求source preflight全數PASS，再複製exact23 snapshot至BASE disposable，驗證precommit、local fixture commit後clean descendant、working/staged overlay及14項負向。Actual source HEAD/index不可變；fixture commit僅供離線測試。

### Clean committed source 與新版 harness 的分離

本次無actual commit授權。為同時保留clean source與測試新版harness，先在外部暫存目錄執行新版run.py，透過 --source-root 指向乾淨已提交source、--output-dir 將結果寫在source外。所有runtime/tests/config/preflight從source讀取；executor的SHA-256與externalToSource另列，並不假稱舊commit內的run.py已修改。

TEST_RESULTS.json 的 committedSourceReproduction 保存該完整重跑的command、inputs、executor hash、source前後COMMITTED_DESCENDANT證據、fixture結果與finalize結果。完成後才把相同新版harness放回actual branch，再全跑一次驗證最終review overlay。兩次各自完整執行，不把測試數相加、不沿用先前2972結果。固定clean-source capture是歷史實證，不是文件所在commit的current HEAD。

新版harness日後正常commit後，直接在該checkout執行run.py即可；不需external mode、不需退回BASE。執行開頭先capture source preflight，產生測試結果可能讓review evidence變dirty，compatibility仍驗證合法snapshot，不把預期evidence更新誤判成祖先錯誤。

### Evidence schema / generation order

1. 先capture source狀態；若只是新改harness導致既有input evidence過期，必須完整重跑9 suites才能進compatibility，其他gate不可失敗。
2. 9 suites共2954項，保存完整commands、exit codes、input hashes；再執行19 compatibility cases（5正向、14負向）。
3. 複製source exact23檔到BASE disposable；先UNCOMMITTED_OVERLAY，再local fixture commit後COMMITTED_DESCENDANT。另測working/staged overlay、所有負向並恢復乾淨。
4. 移除disposable worktree/local branch後才finalize；驗證source HEAD未動、inputs/executor未變、temp已移除。External source全程保持clean。
5. PREFLIGHT.json為OFFLINE_PREFLIGHT_COMPATIBILITY_EVIDENCE，頂層無headSha/snapshotMode。sourceInitialValidation、sourceBeforeCompatibility、sourceCommittedCandidate、preCommitFixture、committedDescendantFixture、finalizedSnapshotValidation均為明確historical capture，使用capturedHeadSha/capturedSnapshotMode。
6. MANIFEST的sourceCommittedCandidate與disposableCommittedDescendant分開；不再用含糊postCommit。TEST_RESULTS保留兩次執行的來源與inputs，不hash evidence自身，避免self-reference。

本輪預期/驗收總数：2954 + 19 = 2973 PASS / 0 FAIL / 0 SKIP；實際機器結果以TEST_RESULTS.json與PREFLIGHT.json為準。Preflight的12 checks另列，不能當額外suite增加PASS數。

remote main等於固定BASE仍是獨立online人工release gate，不是offline判定。本輪不查遠端；未來main前進必須STOP / rebase-review。

本輪只修改review package。五個runtime、六個permanent tests、config bytes不變；不改actual branch index/history、不push，不操作任何Production/platform。Disposable local commit允許且僅測試用途；Migration HOLD。

READY FOR HUMAN REVIEW

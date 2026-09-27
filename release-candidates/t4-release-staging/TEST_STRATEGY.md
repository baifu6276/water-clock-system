# 最小永久測試與 evidence 分層

## A. 建議永久保留
- transport-v2/tests/staging-fixture.cjs：固定 operation 與本機 pinned Git 來源，無網路。
- staging-worker.test.mjs：精確 flag/payload、1,000 mutations、200 response cases、race/late resolution；包含對 JSON duplicate-key 與 business passthrough 的明確 characterization。
- staging-model.test.cjs：actual runner script + fake DOM/LIFF/fetch/timers，1,000 deterministic sequences，每組 49 或 50 個事件。oracle 獨立追蹤是否已跨越送出門檻；發現 failure 時縮減事件序列為 1-minimal reproduction（不宣稱全域最短）。
- staging-pages.cjs：actual staging HTML/config/client/Worker，加 request interception；12 個路徑、E2E、rollback、privacy 情境。
- 既有 reviewed Relay 273、migration 71、read browser 269、runner 56、compatibility 10 回歸不可丟棄。本 staging 已將 relay.test.mjs 與 live-test.cjs 對齊 reviewed regression（直接取 blobs，不刪測試）；run.py 讀取這兩個正式 tests 入口。其餘舊 t4-safety-1 suites 保留作歷史契約，不作新 fixed-operation release gate。

## B. 僅 release evidence
- 固定 reviewed commit 的 686 項測試由 run.py 讀 Git blobs 到系統 TemporaryDirectory；與 staging runtime 的 exact byte copies 組合。沒有把 30+ 既有 evidence 檔塞進正式 repo diff。
- V48 11-file GAS 與 mock factory 也只暫存載入，不更動 repo gas/，不連 Google。
- TEST_RESULTS.json 保存完整 commands、exit codes、counts、stdout/stderr digest 與輸入 hashes。暫存路徑可能因每次執行而改變；內容來源固定。
- 對真實 V48 的成功 hash 不做偽造：7 項 existing contract/rejection 檢查照舊，成功畫面用 transport/UI contract mock。
- 新增測試開發曾遇中文 Git path quoting 與錯誤 fixture bindingSource；修的是 harness，runtime bytes 未變。最終 full run 重新從零執行。

## C. 不帶入 Production PR
- 不複製 reviewed candidate 的整包 sources/evidence、optimization study、舊 T4 branch。
- 不包含臨時匯出的 GAS/rollback Worker/Playwright fixtures。
- 本 report/runbook 可供 review；是否另列 docs commit 由人工決定，不將它们當 deployable runtime。

## 執行
在 repo root 設定 PLAYWRIGHT_MODULE 與 CHROME_PATH 後：
```
python release-candidates/t4-release-staging/run.py
node release-candidates/t4-release-staging/preflight.cjs
```
run.py 自動由固定本機 Git refs 匯出所有依賴；不 fetch，不需要另一 worktree 未提交內容。
所有 browser URLs 包括 github.io/LINE SDK/Worker 均 route.fulfill 攔截；service worker blocked（新增 Pages test），沒有訪問公開網站。
Node fetch/http/https/net/tls/dgram 由 deny-network guard 阻擋（browser IPC 透過 Playwright pipe）。
檢查的是 fake service 下的邏輯；不包含 Cloudflare event-loop/Google ContentService/LIFF 真機或 Pages build artifact 驗證。

## Model / race interpretation
- 模型 seed 0x54740002；1,000 組，每組固定前綴覆蓋 authorized write/timeout/response、再 40 個 seeded events。
- 五種 write outcome × 五種 status outcome；DOM force-enable、double click、token retrieval reentry、SUBMITTING 中 status/precheck 都受 handler gate 阻擋。
- Worker seed 0x54740001；1,000 payload mutations、20 positive controls、200 upstream response mutations。
- POST/GET/final-body × 19999/20000/20001 × timer/resolve 兩種順序：18 項。另 3 項 late redirect/success/reader。
- timeout callback 先執行則凍結並拒絕晚到結果；mock 先 resolve 即使注入 now=20001 仍可能先成功。这是既有 timer callback 競爭語意，不宣稱硬即時 wall-clock SLA。無論順序都沒有第二次 write/retry。

## Preflight compatibility tests (run.py)

不新增第24檔；18項新增tests放在既有run.py。只有傳入已建立且乾淨、HEAD==BASE的disposable worktree，才可建立codex/t4-preflight-verify-local暫存branch/commit。
命令：python release-candidates/t4-release-staging/run.py --verification-worktree <disposable-worktree-absolute-path>
必須完整跑原2954 tests，不能以partial rerun執行compatibility。
移除disposable worktree及local temp branch後：python release-candidates/t4-release-staging/run.py --finalize
preflight不依賴當前branch名稱或main/origin/main；範圍來自固定allowlist + BASE ancestry + exact snapshot union。

4個正向：actual precommit、clean committed descendant、committed working overlay、committed staged overlay。
14個負向：非BASE後代、第6runtime、config異動、runner client缺失、runner index缺失、inventory自行放行production、runtime hash drift、錯誤dedicated LIFF、錯誤read LIFF、default write flag true、重複inventory、第24個review檔、stale evidence input hash、被working copy隱藏的staged config drift。
fixture mutations均只在disposable；actual code/runtime不被negative tests改寫。

預期總數2972 PASS / 0 FAIL / 0 SKIP；實際以TEST_RESULTS.json核對。preflight的12 checks不是額外計入2954/18測試總數。

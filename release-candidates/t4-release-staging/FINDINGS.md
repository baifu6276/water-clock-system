# Scope-limited read-only architecture / security findings

P0：本輪離線檢查未發現可繞過固定 operation / default flag / one-shot handler 的路徑。

P1 / release blockers（不擅自改 runtime）：
- **尚無此 staging 的 Production gates evidence**：實際 Pages artifact、dedicated LIFF client、Worker flag ABSENT 部署、V48 source/permit/私人 approval/備份需未來人工逐項核對。Migration 一直 HOLD。
- 無額外離線 runtime P1 blocker；永久 relay.test.mjs/live-test.cjs 已整合 reviewed tests，待人工 review。

P2 / contract and operational boundaries：
- 舊 t4-* suites 是 t4-safety-1 generic contract 的歷史測試，與本次 fixed-operation release 不同。未刪除或假稱已全部重跑；本輪以 run.py 明確的 9 suites 為 release gate，避免 glob 舊測試產生假警報。
- Worker 只清理 _gasReadDiagnostics；格式合法的 GAS business JSON 其餘欄位原樣轉送。離線 characterization 證明 success:false 搭配 PRIVATE_GAS_BODY 會留在 HTTP 200 business body；UI 不渲染/記錄該 raw 欄位。transport error body、headers/timing/console/DOM 在 adversarial tests 中未洩漏。不能將結果泛化為「任何後端 response 都被 Relay sanitizer 清洗」。正式後端須維持安全 response contract。
- JSON.parse 接受重複 key，最後一值生效；最後形成 exact operation 時 Worker 可放行，但 forward body 仍重建成唯一七欄。這是現有 contract，不暗改 parser。
- one-shot 只保護同一 document，無 storage 所以 reload/new-tab 不是持久鎖；需操作程序 + server permit。新 document 測試僅模擬，不能作為正式重試。
- Worker 20s 由 timer callback 執行順序決定；fake now 跨過 20s、但 timer 尚未執行而 response 先 resolve，可能成功。測試證明既有語意，沒有把 deadline 拉長或加入 retry。
- main 保留 transport-v2/controlled-test 舊入口，使用 storage 與不同 generic T4 UX；禁止拿來操作本次固定 Migration。它沒有另一個 Worker write route，且不因本 staging 自動移除；未來處置需另行批准。
- main 的 gas/ 僅歷史 T4 source fragments，不能當完整 V48 deploy bundle。本輪不改、不部署；V48 只從 reviewed commit 中完整 11 檔驗 hash。
- 多個既有正式/歷史頁保留 direct GAS references；本 staging runner 沒有 direct GAS URL。這不是全系統停寫方案。
- 此固定 main tree 沒有 .github workflow、wrangler config、_config.yml 或 .nojekyll。不能從 repo 證明 GitHub Pages 的外部設定/建置策略；本輪只做 URL 路徑與 browser relative import 模擬，不宣稱 Jekyll 複製/公開可達已驗收。
- read HTML cache-buster 已固定；runner 是新路徑，不新增 dynamic URL。後續修改 runner 若曾發佈需另行 cache review，本輪不改 hash。

沒有訪問任何 Production URL。取得指定 main commit 只有一次 Git fetch（使用者所需 base 本機原先不存在）；所有應用測試全離線。未 push / PR / merge / deploy / flag / GAS / LINE / Sheets / Script Properties / permit / migration。

# API Transport V2 — 隔離 T1／T3 唯讀測試

使用者已回報 T1 真機驗收通過：先前桌面直連 POST 為 HTTP 200，而 LIFF 直連 GAS 最終 ContentService 回應為 404；
透過 Relay 的 iPhone LINE WebView 回傳 transport `t1-1`、HTTP 200、ACTIVE_EMPLOYEE、EMP001。
這是使用者觀察到的驗收證據，未推測底層 Google 404 原因；僅證明已測唯讀傳輸，不證明寫入可靠性、不批准全面正式遷移。
本次新增 T3 原始碼版本 `t3-1`，未部署、未真機驗收。正式 frontend、GAS 與其他隔離頁皆未切換。不得自行部署。
使用者確認現行 Worker Logs／Traces 均關閉；本輪未操作 dashboard，不變更這些設定。

## 組成與操作契約

- `worker/relay.mjs`：無框架 Worker entry/core；測試注入 fetch，正式使用 Workers fetch。
- `worker/wrangler.example.json`：需另行批准後才可填寫／使用的設定範本，非自動部署設定。
- `live-test/`：獨立 LIFF 測試頁，只在使用者按「檢查身分」後呼叫 Relay。
- `tests/`：Node 原生單元測試與 Playwright 離線瀏覽器測試；所有外部呼叫皆替換／攔截。

Relay 明確路由矩陣（不可交叉使用）：

| HTTPS POST 路由 | 唯一 action | 允許欄位 |
|---|---|---|
| `/identity` | `identityBootstrap` | action、idToken |
| `/employee-read` | `employeeLifecycleBaselineDryRun` | action、idToken、employeeId；target 僅 EMP001 |

`/identity` body 只能有：

```json
{ "action": "identityBootstrap", "idToken": "REAL_TOKEN_ONLY_AT_RUNTIME" }
```

僅做 shape 檢查；GAS 才是 LINE token、員工與角色的最終驗證者。Relay 不解碼、不 hash token。
`/identity` 不接受 employeeId；兩條路由都拒絕 userId、LINE UID/sub、role、permission、授權結果、requestId、snapshotVersion、上游 URL 或任何額外參數。
輸入上限 16 KiB、token 長度上限 12,000 字元；上游解碼後串流回應上限 64 KiB。
20 秒 deadline 涵蓋讀取／上游／redirect／回應；頁面 25 秒中止。沒有 retry、fallback、queue 或 cache。

只向設定的 `https://script.google.com/macros/s/<deployment-id>/exec` POST，
`Content-Type: text/plain;charset=utf-8`。使用 `redirect: manual` 是有意的 server-side 安全措施：
最多 3 次 302/303，只允許 HTTPS `script.googleusercontent.com`、標準 port、無 userinfo/fragment。
後續一律 GET，無原 token body、cookie 或 Authorization header；307/308 拒絕，不重播 POST。
不接受非預期 Google host，也不臨時放寬規則；遇到不同 redirect 先收集安全分類證據。

最終上游必須 2xx 且為含 boolean `success` 的 JSON object。有效 GAS JSON 不改業務欄位，
無論 business success true/false 都保持 HTTP 200；metadata 放 response headers。
上游 HTTP／格式錯誤固定回 502，timeout 504；不轉交 Google HTML、Location、cookies 或原始例外。
其他拒絕回 400，設定／未預期內部錯誤回 500，格式：

```json
{ "success": false, "transportError": "UPSTREAM_HTTP_ERROR" }
```

回應 `Cache-Control: no-store`；每次隨機 UUID v4 `X-Correlation-Id`，
與業務 requestId 無關；新版 `X-Transport-Version: t3-1`（頁面仍識別舊 t1-1）。身分測試只顯示固定碼、狀態、
ACTIVE_EMPLOYEE 的 employeeId/name，使用 textContent；不顯示 raw response、sub、token。

## T3 EMP001 單人預覽

```json
{ "action": "employeeLifecycleBaselineDryRun", "idToken": "REAL_TOKEN_ONLY_AT_RUNTIME", "employeeId": "EMP001" }
```

缺少 employeeId 必須拒絕，避免意外進入 GAS 全員摘要分支；EMP001 限制只界定測試範圍，並非授權。
先手動 identityBootstrap，只有 ACTIVE_EMPLOYEE 且 employee.permission 為 OWNER/ADMIN 才可按
「檢查 EMP001 Legacy Baseline（唯讀）」。按鈕 handler 再檢查，DOM 強制啟用不能繞過。
GAS 每次驗證真實 token 與在職管理權限；Relay 不解析角色。UI 防連點，無自動讀取、重試、fallback。
任何預覽失敗後需重新驗證身分；重新驗證時清除舊預覽及管理資格。

client 從固定 config relayEndpoint 的 origin 派生 `/employee-read`，不修改瀏覽器 URL 或 LIFF query。
成功必須 success=true、dryRun=true、employeeId=EMP001。
只顯示 employeeId/name/employeeStatus/grade/salaryType/salaryAmount/systemRole/hireDate/bindingSource/baselineState/eligible/warnings。
薪資接受任意字串或有限數字，不解析／換算。bindingSource 僅 PRESENT/MISSING/DUPLICATE/CONFLICT；
baselineState 僅 LEGACY_NOT_BASELINED/ALREADY_BASELINED/CONFLICT；eligible 必須 boolean。
warnings 必須字串陣列；RECOVERY_REQUIRED、BASELINE_MANUAL_REVIEW_REQUIRED、BASELINE_LINE_IDENTITY_REQUIRED、HIRE_DATE_UNKNOWN
映射本地繁體中文，未知只顯示固定提示。
snapshotVersion 必須 64 位小寫 hex，只在處理回應時驗證；不放 state/DOM/log/storage，僅顯示「快照版本格式有效」。
其他回應欄位不渲染。薪資屬管理端敏感資料，不記錄 telemetry。沒有 migration 或其他寫入按鈕。

## 未來部署前設定（本輪不執行）

1. 經批准選定 Worker 與測試頁發布位置。GitHub Pages 是靜態服務；feature-only 檔案不等於已公開。
2. 伺服器 `GAS_UPSTREAM` 填入**現有** `js/config.js` 的 GAS_URL，不建立新 GAS deployment。
   僅操作者設定，前端不可指定；不更動 GAS URL、LIFF ID 或 GAS 業務。
3. `ALLOWED_ORIGINS` 是 JSON 陣列，正式範本只有 `https://baifu6276.github.io`，不含路徑、不含 wildcard。
   不允許 Origin 缺失或 `null`。OPTIONS 只許 POST + Content-Type。CORS 不是認證。
   localhost/.test/.example 只能在獨立 development 設定；不可帶進正式 origins。
4. `live-test/config.js` 已使用專用 T1 LIFF 與固定可信 HTTPS `/identity`，本輪不變。
   不從 query、使用者輸入或 localStorage 取得 endpoint，避免 token 被導向第三方。
5. 現在範本關閉 workers.dev、preview URLs、observability；未來發布需另行批准與設定。
   不需要 LINE Channel Secret 或 Google service-account key；Cloudflare 管理憑證不放 repo/頁面。
6. **公開前**檢查帳戶層 Workers Logs、Logpush、Tail、APM、tracing、代理/WAF logging：
   禁止 body/header/redirect URL 捕捉。程式沒有 console、外部 logging、儲存 binding。
   範本停用 observability 不代表可以控制供應商所有底層 access/security logs；需審查帳戶政策。
   URL query 被拒絕，正常 client 從不放 token 到 URL；無法保證替惡意 client 消除邊緣收到的 URL。
7. 公開前設定適當濫用防護／流量限制與告警，再做 T1 實機測試；CORS 不能防止非瀏覽器偽造 Origin。

新版預期成功：頁面 LIFF 初始化成功、token 是、transport t3-1、HTTP 200、正確 identity state；
在職者可顯示員工姓名。瀏覽器不接收 Google redirect（client 使用 redirect:error）。
若 Relay 仍遇 404，只回 UPSTREAM_HTTP_ERROR；不得宣布根因已解決。

## 離線檢查

```text
node --test --test-isolation=none transport-v2/tests/relay.test.mjs
node transport-v2/tests/live-test.cjs
node tests/employee-identity-live-test.cjs
```

Node 24；瀏覽器測試沿用 repo 的 `PLAYWRIGHT_MODULE`、`CHROME_PATH` 環境設定。
不得以未攔截網路的實機測試取代本輪離線測試。

## 已知限制

T1 iPhone 路徑已有使用者真機證據；T3、其他裝置／情境尚待驗收，Node mock 通過不等於新版已上線可用。
上游仍公開且受 GAS 配額限制；Relay 不修復舊 API 的 userId 信任，也不取代任何授權。
T1/T3 都沒有任何寫入 action；不能把此原型直接擴為全站代理。

參考：
- https://developers.cloudflare.com/workers/runtime-apis/request/ （manual redirect 避免敏感 header 自動跨域轉送）
- https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- https://developers.google.com/apps-script/guides/content#redirects

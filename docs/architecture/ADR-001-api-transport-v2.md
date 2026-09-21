# ADR-001：API Transport V2 T1 薄型 Relay

狀態：僅批准原型原始碼／離線測試；未部署，未正式採用。日期：2026-09-21。

## 證據與決策

同一 V42 /exec：桌面 Chrome POST 最終 200，LINE LIFF WebView POST 最終 404，
兩者皆 redirected=true、cors、script.googleusercontent.com；LIFF 請求已到 GAS，doPost completed。
identityBootstrap 也發生，非 Baseline 專屬。既有 TextOutput 回傳、序列化與 return 已確認正確。
底層 404 原因未證實，不推定 stale deployment。

採候選 A：LIFF → thin relay → 現有 GAS /exec；讓 ContentService redirect 在伺服器端處理。
T1 只容許 identityBootstrap。GAS 保留 LINE server-side verify、員工解析與業務權限；Relay 不是授權層。
**T1 真機成功是採用前提**，不能把 mock 通過當作 LIFF 修復完成。

## 未採方案

- 單一 frontend wrapper：可降低重複，但未移除失敗的 WebView redirect 路徑。
- GET：不能把 token／個資放 URL；也沒有現行身分 GET 契約。
- google.script.run：限定 HTMLService 頁面，不適用 Pages 直接呼叫；嵌入橋接增加 origin/login/LIFF 驗證範圍。
- 完整 API service：現在過重；若仍呼叫 /exec 本質也是 relay。後續可評估 Cloud Run／Functions，非 T1 必要。
- GitHub Pages：僅靜態託管，不能執行可信 proxy 或保管特權憑證。

## 邊界與安全

Relay 新增可接觸 token 與回應個資的信任邊界。只短暫處理、不儲存／hash／log、不 cache。
固定 upstream、精確 origin/action allowlist、HTTPS、逐次驗證 redirect、body/response size limit、deadline。
302/303 後 GET 不攜 token；307/308 fail closed。無 raw exception／HTML／URL 回傳，無 automatic retry。
CORS 不是 auth，GAS 永遠驗證 token；舊 userId API 的風險沒有因此消失。
Metadata 只使用獨立隨機 correlationId 與固定 transportVersion；未啟用伺服器 logs。
上游成功 JSON 保持語意，測試 UI 僅選取安全欄位，以 textContent 顯示。
完整設定／平台 logging 及公開前檢查見 `transport-v2/README.md`。

## 推進與回退

T1：隔離、唯讀，iOS/Android LINE + desktop 比對，包含成功、失效 token、timeout、非 JSON／HTTP 錯誤。
T2：identityBootstrap 才切 V2；T3：逐項開放人員唯讀 API。
T4：另行批准一個受控寫入，驗證 requestId/version/recovery、回應遺失與安全重試。
T5：其餘模組逐項遷移，先檢查 legacy 身分與冪等性、保留既有業務與 site scope。

本輪未改正式 transport；回退只需停止使用隔離測試。
之後按 action 固定選路，保留人工切回舊 adapter；禁止寫入失敗自動 fallback 或雙送。
未知寫入結果保留原 requestId/payload，先 read-back/recovery；無法安全回退則停用該操作。

## 尚待驗證

Cloudflare runtime 和 GAS redirect 真實相容性、LIFF 真機、平台自動 logs 與流量濫用控制。
GAS 配額／延遲仍存在；不新增任何雲端資源、DNS、LIFF 或 GAS 設定。

官方依據：
- https://developers.google.com/apps-script/guides/content#redirects
- https://developers.google.com/apps-script/guides/html/communication
- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://developers.cloudflare.com/workers/runtime-apis/request/

# Wrapper review target：V48 no-flush candidate

僅供本機離線 review。Migration HOLD；未批准實際執行 wrapper 或建立 permit。

`TEMP_T4_PREPARE.gs` 與上一輪 byte-identical；SHA-256：
`a06e19735fb2cc1fcbd310df8c7fa9bc94d3232badfcae1ed2bdb5e8c6146f6e`。

新的測試 target：`release-candidates/gas-t4-control-no-flush/sources/`；11-file SHA：
`df1fb07687cd7ed2c3fb66a9bd1ee0a65107050b3e5211c12ac99f62beaa81b5`。

固定 function：`employeeT4InitialPrepareOnce`。
固定 employee/operator/approvedBy：EMP001。
固定 requestId：`c9f21cdc-6da2-4a92-8fbb-06ffaa0d32ab`。
固定 approvalReference：`T4_EMP001_20260926_01`。
reason：建立 EMP001 Legacy Baseline，補建任職與 LINE 綁定基線；到職日未知維持空白。

snapshot 即時取自 preview，Prepare 在自己的 ScriptLock 內再次驗證。Wrapper 沒有直接 property write、migration、claim、close、token、LINE request、UUID 生成或 log。Wrapper 本身不在 deployable 11 檔內。

47 項 wrapper mock 測試 PASS；本候選 maintenance helper 不再造成 Sheet flush，原 no-flush 阻擋案例已轉為通過。29 項額外 maintenance/differential 測試與完整回歸結果見 candidate REVIEW.md。

仍不得自動重跑：PropertiesService / releaseLock / runtime termination 可能造成 property 已 ARMED 而 caller 收到 exception。這是 AMBIGUOUS，不等於 ABSENT。STOP，保留原 requestId，待另行批准後唯讀核對 property；禁止藉本報告建立真實 permit。

# 花東通勤

最新版本包含頁面內的更新週期、實際取回時間與資料過期說明，以及自訂地點／車次查詢。

吉安→瑞穗：4514（05:36）、306（06:29）；瑞穗→吉安：4537（16:20）、4543（17:26）；瑞穗→花蓮：431（16:27，不停吉安）。每次依當日官方車次頁重新取得時刻，並提供隔日資料。以上為 2026-09-14 核對班次，台鐵改點或車次異動時需調整 collector.mjs 的 configs。

## 免費部署

使用公開 GitHub 儲存庫、GitHub Actions 標準 Ubuntu runner 與 GitHub Pages。Settings → Pages → Source 選 GitHub Actions，執行「更新通勤資訊與網頁」。不需要 API 金鑰或付費服務。公開儲存庫的程式、班次設定和氣象資料均公開。

排程：台灣時間每天 05:07–07:57、15:07–18:57 每十分鐘一次，21:13 預抓隔日資訊。Actions 排程可能延遲或漏跑，不可保證即時；公開儲存庫長期無活動可能停用排程，請定期檢查 Actions。頁面每分鐘只下載 data.json，不會觸發爬取。手動重新擷取請至 Actions 執行 workflow_dispatch。

## 本機

Node.js 22+、pnpm 11.19.0：`pnpm install --frozen-lockfile`，`pnpm exec playwright install chromium`，`node collector.mjs`，`node server.mjs`。開啟 http://127.0.0.1:4173。

## 資料與限制

- 擷取全程透過 Playwright Chromium headless 載入官方公開頁面，讀取 DOM。不使用 stealth、代理輪替、指紋偽裝或 CAPTCHA 繞過。單序列存取、每頁間隔 2 秒、氣象快取 1 小時、隔日班次快取 6 小時；403/429 或驗證頁會停止該來源本輪存取。
- 台鐵資料日期、上下車站逐一核對；狀態欄空白保留 null，不推論為準點。尚未發車、行駛結束或官方不提供資訊時可能無準誤點。未來日期不會有當日運行動態。
- 氣象依 TableId3hr 的日期 headers 與 colspan 展開對應，僅取 tem-C 攝氏欄，避免誤混華氏；逐時溫度與跨時段降雨機率依原表欄位對應。
- 更新失敗保留先前成功資料與原始時間，不刷新成功時間。台鐵 15 分鐘、氣象 3 小時後顯示過期。GitHub runner 能否存取來源，仍須雲端首輪驗證。
- 官方網站結構、規則可能變動，解析失敗需維護；資料來自台鐵與中央氣象署，出發前以官方與車站公告為準。

官方文件：[GitHub Actions 費用](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[排程限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

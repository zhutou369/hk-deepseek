---
title: "DeepSeek API 密鑰申請、限流與 429 錯誤處理"
description: "說明 DeepSeek API Key 申請流程、常見限流規則、Token 用量觀察方式，以及遇到 429 Too Many Requests 時的實務處理。"
date: 2026-06-27
updated: 2026-06-29
featured: true
coverImage: "/static/posts/deepseek-api-key-cover.svg"
tags: ["posts"]
layout: "layouts/post.njk"
permalink: "/posts/deepseek-api-key-and-limits/index.html"
---

接入 DeepSeek API 前，先把密鑰管理與限流規則搞清楚，能避免上線後大量 429 錯誤；若已開始收到限流回應，可同步閱讀 [503/429 重試與熔斷策略](/posts/deepseek-api-retry-guide/)。

## API Key 申請與安全存放

![DeepSeek API Key 申請四步流程](/static/posts/deepseek-api-key-step.svg)

1. 登入 [DeepSeek 開發者平台](https://platform.deepseek.com)，建立專案並生成 API Key。
2. Key 只顯示一次，請立即存入密鑰管理服務（如 GitHub Secrets、Vault、雲端 Secret Manager）。
3. 不要把 Key 寫進前端 JavaScript 或公開 Git 倉庫。
4. 生產與測試環境使用不同 Key，方便輪換與追蹤用量。

## 理解限流（Rate Limit）

429 錯誤表示請求頻率或並發超出配額。常見限制維度包括：

- 每分鐘請求數（RPM）
- 每分鐘 Token 數（TPM）
- 單次請求最大 Token

開發階段建議：

- 在請求頭或回應中記錄 `x-ratelimit-*` 類字段（若平台提供）。
- 對批量任務加入隊列，而不是同時發送數百個請求。
- 長文本任務拆段處理，避免單次 Prompt 過大；撰寫 Prompt 時可參考 [提示詞入門](/posts/deepseek-prompt-basics/) 控制輸出長度。

## 429 發生時怎麼做

1. **立即停止重試風暴**：連續重試會讓限流時間更長。
2. **讀取 Retry-After**：若回應頭提供等待秒數，按指示延遲。
3. **指數退避**：例如 1s → 2s → 4s，並設定最大重試次數（3–5 次）。完整程式範例見 [重試與熔斷策略](/posts/deepseek-api-retry-guide/)。
4. **降級策略**：高峰期切換到更小模型或緩存相似問題的回答。

## 用量與成本觀察

- 記錄每次請求的 `prompt_tokens` 與 `completion_tokens`。
- 為不同功能模組分開統計，找出 Token 消耗異常的接口。
- 定期輪換 Key，並刪除不再使用的舊 Key。

## 上線前檢查清單

- [ ] Key 未暴露在前端或公開倉庫
- [ ] 已設定請求超時（建議 30–60 秒）
- [ ] 已實作 429/503 重試與熔斷（見 [重試指南](/posts/deepseek-api-retry-guide/)）
- [ ] 有基本日誌：狀態碼、耗時、Token 用量

敏感資料不便上雲時，可改用 [Ollama 本地部署](/posts/deepseek-ollama-local-setup/) 做 PoC；正式對外服務仍建議以 API 為主。更多香港本地化說明見 [本站首頁](/)。

完成以上步驟，API 接入會穩定許多，也能在流量高峰時保持可預期的錯誤處理。

## 相關教程

- [503/429 重試與熔斷策略](/posts/deepseek-api-retry-guide/)
- [提示詞入門與幻覺控制](/posts/deepseek-prompt-basics/)
- [網頁版登入故障排查](/posts/deepseek-web-login-troubleshoot/)
- [Ollama 本地部署 DeepSeek](/posts/deepseek-ollama-local-setup/)

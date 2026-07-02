---
title: "DeepSeek API 503/429 錯誤的重試與熔斷策略"
description: "實作 DeepSeek API 在 503 與 429 錯誤下的指數退避重試、最大重試次數與熔斷器模式，提升服務穩定性。"
date: 2026-06-27
updated: 2026-06-29
featured: true
coverImage: "/static/posts/deepseek-api-retry-cover.svg"
tags: ["posts"]
layout: "layouts/post.njk"
permalink: "/posts/deepseek-api-retry-guide/index.html"
---

503 與 429 都是暫時性錯誤，但處理方式不同：503 通常表示服務端暫時不可用，429 表示你的請求過快。兩者都需要重試，但不能無腦循環。接入前請先確認 [API 密鑰與限流配額](/posts/deepseek-api-key-and-limits/) 設定無誤。

## 錯誤區分

| 狀態碼 | 含義 | 是否適合重試 |
|--------|------|--------------|
| 503 | 服務暫時不可用 | 是，需退避 |
| 429 | 超出速率限制 | 是，需更長等待 |
| 401/403 | 認證或權限問題 | 否，檢查 Key |
| 400 | 請求格式錯誤 | 否，修正參數 |

401/403 時請回到 [API Key 申請與安全存放](/posts/deepseek-api-key-and-limits/) 檢查 Key 是否過期、環境是否混用。

## 指數退避重試（Exponential Backoff）

![503 與 429 指數退避重試時間軸](/static/posts/deepseek-api-retry-step.svg)

基本流程：

1. 首次失敗後等待 1 秒
2. 第二次等待 2 秒，第三次 4 秒
3. 加入隨機抖動（jitter），避免多個客戶端同時重試
4. 設定 `maxRetries = 3` 或 `5`，超過則返回友好錯誤

Python 伪代码示例：

```python
import random, time

def call_with_retry(fn, max_retries=4):
    for attempt in range(max_retries):
        try:
            return fn()
        except TemporaryAPIError as e:
            if attempt == max_retries - 1:
                raise
            wait = (2 ** attempt) + random.uniform(0, 0.5)
            time.sleep(wait)
```

## 熔斷器（Circuit Breaker）

連續失敗達到閾值時，暫停請求一段時間，避免把已過載的服務打得更忙。

典型參數：

- 失敗閾值：5 次連續 503/429
- 熔斷開啟時間：30–60 秒
- 半開狀態：允許 1 個探測請求，成功則恢復

## 429 的特殊處理

- 優先讀取 `Retry-After` 回應頭
- 若無該字段，429 的等待時間應比 503 更長
- 對批量任務使用隊列 + 固定並發（如同時最多 2 個請求）

網頁版登入若也出現 503，可能是同一高峰時段，可參考 [網頁版登入排查](/posts/deepseek-web-login-troubleshoot/)。

## 用戶端應有的降級方案

- 返回「服務繁忙，請稍後再試」而非 raw error
- 對可緩存問題（FAQ、固定模板）使用本地緩存
- 關鍵流程提供人工兜底入口

## 排查日誌關鍵字段

記錄以下字段，方便定位是平台高峰還是自己請求模式問題：

- HTTP 狀態碼
- 重試次數與每次等待時間
- 請求耗時
- 使用的模型與 Token 數

穩定的重試策略能把暫時性故障對用户的影響降到最低。若需離線兜底，可搭配 [本地 Ollama 部署](/posts/deepseek-ollama-local-setup/) 做降級推理。

## 相關教程

- [API 密鑰、限流與 429 處理](/posts/deepseek-api-key-and-limits/)
- [提示詞入門與幻覺控制](/posts/deepseek-prompt-basics/)
- [網頁版登入故障排查](/posts/deepseek-web-login-troubleshoot/)

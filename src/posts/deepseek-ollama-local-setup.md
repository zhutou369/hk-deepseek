---
title: "使用 Ollama 在本地運行 DeepSeek 模型"
description: "在 Windows 與 macOS 上透過 Ollama 拉取 DeepSeek 模型、檢查繁體輸出品質，並排查常見的記憶體不足問題。"
date: 2026-06-27
updated: 2026-06-29
featured: true
coverImage: "/static/posts/deepseek-ollama-cover.svg"
tags: ["posts"]
layout: "layouts/post.njk"
permalink: "/posts/deepseek-ollama-local-setup/index.html"
---

本地部署 DeepSeek 適合需要離線測試、敏感數據不便上雲，或想控制推理成本的場景。Ollama 是目前最簡單的入門方式之一。正式對外上線仍建議使用 [DeepSeek API](/posts/deepseek-api-key-and-limits/) 並做好 [限流重試](/posts/deepseek-api-retry-guide/)。

## 環境準備

- **macOS**：Apple Silicon 建議 16GB 記憶體以上；Intel Mac 需確認模型大小與 RAM。
- **Windows**：建議 NVIDIA 顯示卡 + 最新驅動；僅 CPU 也可運行小模型，但速度較慢。
- 硬碟預留至少 10–30GB，視模型大小而定。

## 安裝 Ollama

1. 前往 [Ollama 官網](https://ollama.com) 下載對應系統安裝包。
2. 安裝完成後，在終端執行 `ollama --version` 確認可用。
3. 首次拉取模型需下載數 GB 文件，請保持網絡穩定。

## 拉取 DeepSeek 模型

![Ollama 安裝與拉取 DeepSeek 模型步驟](/static/posts/deepseek-ollama-step.svg)

```bash
ollama pull deepseek-r1:7b
```

也可依硬體選擇其他標籤（如 1.5b、14b）。模型越大，效果通常越好，但 RAM/VRAM 需求更高。

測試對話：

```bash
ollama run deepseek-r1:7b
```

## 繁體中文輸出檢查

本地模型預設可能偏向簡體。可在 Prompt 開頭加入：

```
請使用香港繁體中文回答。若原文為英文，保留專有名詞英文。
```

若仍混用繁簡，可：

- 換用較新的模型版本
- 在 Prompt 中給出繁體輸出示例（Few-Shot），寫法見 [提示詞入門](/posts/deepseek-prompt-basics/)
- 後處理用 OpenCC 做繁簡轉換（僅作輔助）

## 常見問題

### OOM（記憶體不足）

- 改用更小模型（如 7b → 1.5b）
- 關閉其他佔用 GPU 的程式
- Windows 上確認使用的是 GPU 版 Ollama

### 速度很慢

- 確認是否在使用 GPU（任務管理器 / Activity Monitor 查看）
- 減少 `num_ctx` 上下文長度
- 批量任務改用 API 而非本地推理

### 回答質量不穩

- 提高 Prompt 约束（見 [提示詞入門教程](/posts/deepseek-prompt-basics/)）
- 對推理型任務使用 R1 系列；一般寫作用 V 系列可能更合適

## 何時該用本地，何時該用 API

| 場景 | 建議 |
|------|------|
| 敏感內部文件 | 本地 |
| 高並發線上服務 | API |
| 快速驗證 Prompt | 本地小模型 |
| 最強推理能力 | 雲端大模型 API |

本地部署的价值在於可控與可離線；上線服務仍建議以官方 API 為主。網頁版使用問題可另見 [登入排查](/posts/deepseek-web-login-troubleshoot/)。更多香港本地化教程見 [本站首頁](/)。

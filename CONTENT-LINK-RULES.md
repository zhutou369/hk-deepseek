# hk-deepseek.com 正文链接规则

手工写文章与 `autobot.js` 自动生成时均遵守本规则。

## 数量

| 类型 | 每篇建议 |
|------|----------|
| 站内内链 | **2～5 条** |
| 外链（官方） | **0～2 条** |
| 同一关键词精确匹配链接 | **最多 1 次** |

## 锚文本

- 用自然描述：`重试与熔断策略`、`API 密钥申请指南`
- 不要每段都把「DeepSeek 香港」链到首页
- 不要全篇 exact match 堆砌

## 可链站内 pillar（优先）

| 主题 | 路径 |
|------|------|
| API Key / 限流 / 429 | `/posts/deepseek-api-key-and-limits/` |
| 503/429 重试 / 熔断 | `/posts/deepseek-api-retry-guide/` |
| 提示词 | `/posts/deepseek-prompt-basics/` |
| 网页版登录 | `/posts/deepseek-web-login-troubleshoot/` |
| Ollama 本地 | `/posts/deepseek-ollama-local-setup/` |
| 站点首页 | `/` |

## 可链官方外链（同一域名每篇最多 1 次）

- https://platform.deepseek.com
- https://chat.deepseek.com
- https://ollama.com

## 禁止

- 每个「DeepSeek」都加链接
- 链到其它 `deepseek-*.com` 站群（友链区除外）
- 为 SEO 硬塞无关内链

## 写法示例

```markdown
接入前请先阅读 [API 密钥与限流配额](/posts/deepseek-api-key-and-limits/)。
若已出现 429，见 [重试与熔断策略](/posts/deepseek-api-retry-guide/)。
请前往 [DeepSeek 开放平台](https://platform.deepseek.com) 申请 Key。
```

## 主题对照（新文章选 2～3 条相关内链）

- **API / 限流 / Token** → api-key-and-limits、api-retry-guide、prompt-basics
- **登录 / 503 网页** → web-login-troubleshoot、api-retry-guide
- **Prompt / 幻觉** → prompt-basics、api-key-and-limits、ollama-local-setup
- **本地 / Ollama / 隐私** → ollama-local-setup、prompt-basics、api-key-and-limits
- **企业 / 客服 / RAG** → prompt-basics、api-key-and-limits、首页

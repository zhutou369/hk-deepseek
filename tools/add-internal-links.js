#!/usr/bin/env node
/**
 * 为 hk-deepseek.com 文章批量补站内 pillar 内链
 * 用法: node tools/add-internal-links.js [--dry-run]
 */

const fs = require("fs");
const path = require("path");

const POSTS_DIR = path.join(__dirname, "..", "src", "posts");
const DRY_RUN = process.argv.includes("--dry-run");

const PILLARS = [
  {
    path: "/posts/deepseek-api-key-and-limits/",
    label: "API 密鑰、限流與 429 處理",
    keywords: ["api", "429", "限流", "token", "密鑰", "密钥", "key", "rpm", "tpm", "配額", "配额", "用量", "platform"],
  },
  {
    path: "/posts/deepseek-api-retry-guide/",
    label: "503/429 重試與熔斷策略",
    keywords: ["503", "429", "重試", "重试", "retry", "熔斷", "熔断", "backoff", "退避", "circuit"],
  },
  {
    path: "/posts/deepseek-prompt-basics/",
    label: "提示詞入門與幻覺控制",
    keywords: ["提示詞", "提示词", "prompt", "幻覺", "幻觉", "few-shot", "指令", "約束", "约束", "rag"],
  },
  {
    path: "/posts/deepseek-web-login-troubleshoot/",
    label: "網頁版登入故障排查",
    keywords: ["登入", "登录", "login", "chat", "網頁", "网页", "cookie", "瀏覽器", "浏览器", "驗證碼", "验证码"],
  },
  {
    path: "/posts/deepseek-ollama-local-setup/",
    label: "Ollama 本地部署 DeepSeek",
    keywords: ["ollama", "本地", "離線", "离线", "私有化", "vllm", "顯示卡", "显卡", "gpu", "推理", "模型部署", "ram", "vram"],
  },
];

const DEFAULT_PILLARS = [
  PILLARS[0],
  PILLARS[2],
  PILLARS[4],
];

const SECTION_HEADER = "## 延伸閱讀";

function splitFrontMatter(raw) {
  if (!raw.startsWith("---")) return { fm: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: "", body: raw };
  return {
    fm: raw.slice(0, end + 4),
    body: raw.slice(end + 4).replace(/^\s+/, ""),
  };
}

function parseTitle(fm) {
  const m = fm.match(/^title:\s*"(.*)"/m);
  return m ? m[1] : "";
}

function parseDescription(fm) {
  const m = fm.match(/^description:\s*"(.*)"/m);
  return m ? m[1] : "";
}

function scorePillars(text) {
  const lower = text.toLowerCase();
  return PILLARS.map((p) => {
    let score = 0;
    for (const kw of p.keywords) {
      const re = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
      const hits = lower.match(re);
      if (hits) score += hits.length;
    }
    return { pillar: p, score };
  }).sort((a, b) => b.score - a.score);
}

function pickPillars(title, description, body, fileName) {
  const selfSlug = fileName.replace(/\.md$/, "");
  const haystack = `${title}\n${description}\n${body.slice(0, 2000)}`;
  const ranked = scorePillars(haystack).filter((x) => x.score > 0);

  const chosen = [];
  for (const { pillar } of ranked) {
    if (chosen.length >= 3) break;
    if (fileName.includes("deepseek-api-key-and-limits") && pillar.path.includes("api-key-and-limits")) continue;
    if (fileName.includes("deepseek-api-retry-guide") && pillar.path.includes("api-retry-guide")) continue;
    if (fileName.includes("deepseek-prompt-basics") && pillar.path.includes("prompt-basics")) continue;
    if (fileName.includes("deepseek-web-login-troubleshoot") && pillar.path.includes("web-login-troubleshoot")) continue;
    if (fileName.includes("deepseek-ollama-local-setup") && pillar.path.includes("ollama-local-setup")) continue;
    if (!chosen.some((c) => c.path === pillar.path)) chosen.push(pillar);
  }

  if (chosen.length < 2) {
    for (const p of DEFAULT_PILLARS) {
      if (chosen.length >= 3) break;
      if (!chosen.some((c) => c.path === p.path)) chosen.push(p);
    }
  }

  return chosen.slice(0, 3);
}

function buildSection(pillars) {
  const lines = pillars.map((p) => `- [${p.label}](${p.path})`);
  return `\n${SECTION_HEADER}\n\n若需進一步查閱，可先看本站以下教程：\n\n${lines.join("\n")}\n`;
}

function injectIntroLink(body, pillars) {
  if (/\]\(\/posts\//.test(body.split("\n").slice(0, 8).join("\n"))) return body;
  const first = pillars[0];
  if (!first) return body;
  const intro = `下文涉及 DeepSeek 實操細節；若你尚未完成基礎配置，可先閱讀 [${first.label}](${first.path})。\n\n`;
  const lines = body.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ")) {
      insertAt = i;
      break;
    }
    if (lines[i].trim() && !lines[i].startsWith("#")) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === 0 && lines[0]?.trim()) insertAt = 1;
  lines.splice(insertAt, 0, intro.trim(), "");
  return lines.join("\n");
}

const PILLAR_SKIP = new Set([
  "deepseek-api-key-and-limits.md",
  "deepseek-api-retry-guide.md",
  "deepseek-prompt-basics.md",
  "deepseek-web-login-troubleshoot.md",
  "deepseek-ollama-local-setup.md",
]);

function processFile(filePath) {
  const fileName = path.basename(filePath);
  if (PILLAR_SKIP.has(fileName)) {
    return { fileName, status: "skip-pillar" };
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const { fm, body } = splitFrontMatter(raw);

  if (body.includes(SECTION_HEADER)) {
    return { fileName, status: "skip-has-section" };
  }

  const title = parseTitle(fm);
  const description = parseDescription(fm);
  const pillars = pickPillars(title, description, body, fileName);
  if (!pillars.length) return { fileName, status: "skip-no-pillars" };

  let newBody = body.replace(new RegExp(`\\n${SECTION_HEADER}[\\s\\S]*$`), "").trimEnd();
  const hasInline = /\]\(\/posts\//.test(newBody);
  if (!hasInline) newBody = injectIntroLink(newBody, pillars);
  newBody += buildSection(pillars);

  const updated = `${fm}\n\n${newBody.replace(/^\n+/, "")}`;
  if (!DRY_RUN) fs.writeFileSync(filePath, updated.endsWith("\n") ? updated : `${updated}\n`, "utf-8");
  return { fileName, status: "updated", pillars: pillars.map((p) => p.path) };
}

const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
const results = files.map((f) => processFile(path.join(POSTS_DIR, f)));

const updated = results.filter((r) => r.status === "updated");
const skipped = results.filter((r) => r.status !== "updated");

console.log(DRY_RUN ? "DRY RUN\n" : "");
console.log(`处理完成: 更新 ${updated.length} 篇, 跳过 ${skipped.length} 篇`);
if (updated.length) {
  console.log("\n示例:");
  updated.slice(0, 5).forEach((r) => console.log(`  ${r.fileName} → ${r.pillars.join(", ")}`));
}

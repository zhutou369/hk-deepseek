const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const { passesFeaturedQuality } = require('./tools/featured-quality');

// ===== 多模型支持：DeepSeek 写正文（便宜量产） + Claude 重写开头 200 字（质量）=====
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

async function chatDeepSeek(prompt) {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
            model: DEEPSEEK_MODEL,
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        })
    });
    if (!resp.ok) throw new Error(`DeepSeek API ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('DeepSeek 返回內容為空');
    return text;
}

async function rewriteOpeningWithClaude(title, body) {
    const openingPrompt = buildOpeningPrompt(title, body);
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 800,
            messages: [{ role: 'user', content: openingPrompt }]
        })
    });
    if (!resp.ok) throw new Error(`Claude API ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    const data = await resp.json();
    const text = data && data.content && data.content[0] && data.content[0].text;
    if (!text || text.length < 60) throw new Error('Claude 開頭重寫結果過短');
    return spliceOpening(body, removeForbiddenPhrases(text.trim()));
}

function buildOpeningPrompt(title, body) {
    const paras = String(body || '').split(/\n\s*\n/);
    const opening = paras.slice(0, 2).join('\n\n');
    return `你是資深技術編輯。為文章《${title}》重寫開頭兩段（合計 150-220 字），要求：
1. 第一句必須含具體對象＋具體數字/日期/版本（只能使用原文已有的信息，嚴禁編造新數據）。
2. 第二句直接說明「這篇文章解決什麼問題、看完能做到什麼」。
3. 禁止：綜上所述、在當今數字化時代、隨著AI的發展、任何感嘆號、空話套話。
4. 保持香港繁體中文（zh-HK）語感。
只輸出重寫後的兩段正文，不要標題、不要任何解釋。

原文開頭：
${opening}`;
}

function spliceOpening(body, newOpening) {
    const paras = String(body || '').split(/\n\s*\n/);
    const rest = paras.slice(2).join('\n\n');
    return newOpening + (rest ? '\n\n' + rest : '');
}

async function generateArticleJson(ai, prompt, logLabel) {
    if (DEEPSEEK_KEY) {
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`${logLabel} (DeepSeek 嘗試第 ${attempt} 次)`);
                return parseJsonResponse(await chatDeepSeek(prompt));
            } catch (error) {
                console.warn(`⚠️ ${logLabel} DeepSeek 嘗試 ${attempt} 失敗: ${error.message}`);
            }
        }
        if (!process.env.GEMINI_API_KEY) throw new Error('DeepSeek 兩次失敗且無 Gemini 回退');
        console.warn('⚠️ DeepSeek 兩次失敗，回退 Gemini...');
    }
    return generateJsonWithRetry(ai, prompt, `${logLabel} (Gemini)`);
}

const SYSTEM_TAGS = new Set(['posts']);
const TAG_POOL = [
    'DeepSeek教學',
    'API整合',
    '私有化部署',
    '提示詞優化',
    'RAG實戰',
    '自動化工作流',
    '本地模型',
    'AI客服',
    '數據安全',
    'SEO優化',
    '香港中小企',
    '開源模型',
    'vLLM',
    'Ollama',
    'Gemini工作流'
];
const FORBIDDEN_PHRASES = [
    '綜上所述',
    '综上所述',
    '毋庸置疑',
    '在當今數字化時代',
    '在当今数字化时代',
    '業界領先',
    '业界领先',
    '全方位',
    '深度融合',
    '極致',
    '极致'
];

function pickDynamicTags(topic, todayStr, randomId) {
    const seedText = `${topic}-${todayStr}-${randomId}`;
    let seed = 0;
    for (const char of seedText) seed += char.charCodeAt(0);

    const shuffled = [...TAG_POOL].sort((a, b) => {
        const scoreA = (seed + a.charCodeAt(0) + a.length * 17) % 97;
        const scoreB = (seed + b.charCodeAt(0) + b.length * 17) % 97;
        return scoreA - scoreB;
    });

    return ['posts', ...shuffled.slice(0, 4)];
}

function stripCodeFence(text) {
    return String(text || '')
        .trim()
        .replace(/^```(?:json|markdown)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

const ARTICLE_JSON_SCHEMA = {
    type: 'object',
    properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        slug: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        body: { type: 'string' }
    },
    required: ['title', 'description', 'slug', 'tags', 'body']
};

const ARTICLE_JSON_CONFIG = {
    responseMimeType: 'application/json',
    responseJsonSchema: ARTICLE_JSON_SCHEMA
};

function parseJsonResponse(text) {
    const clean = stripCodeFence(text);
    try {
        return JSON.parse(clean);
    } catch (error) {
        const match = clean.match(/\{[\s\S]*\}/);
        if (!match) throw error;
        try {
            return JSON.parse(match[0]);
        } catch (innerError) {
            throw new Error(`JSON 解析失敗: ${innerError.message}`);
        }
    }
}

async function generateJsonWithRetry(ai, contents, logLabel) {
    const maxParseAttempts = 2;

    for (let parseAttempt = 1; parseAttempt <= maxParseAttempts; parseAttempt++) {
        const text = await generateWithRetry(ai, contents, logLabel, ARTICLE_JSON_CONFIG);
        try {
            return parseJsonResponse(text);
        } catch (error) {
            if (parseAttempt >= maxParseAttempts) throw error;
            console.warn(`⚠️ ${logLabel} JSON 格式異常，重新請求 Gemini... (${error.message})`);
        }
    }

    throw new Error('Gemini JSON 解析重試後仍失敗');
}

function slugify(value, fallback) {
    const slug = String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return slug || fallback;
}

function yamlEscape(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function removeForbiddenPhrases(value) {
    let output = String(value || '');
    for (const phrase of FORBIDDEN_PHRASES) {
        output = output.split(phrase).join('');
    }
    output = output.replace(/^隨著[^。\n]{0,40}(?:快速)?發展[，,。]\s*/i, '');
    output = output.replace(/^随着[^。\n]{0,40}(?:快速)?发展[，,。]\s*/i, '');
    output = output.replace(/^在當今[^。\n]{0,60}[，,。]\s*/i, '');
    output = output.replace(/^在当今[^。\n]{0,60}[，,。]\s*/i, '');
    return output.trim();
}

function normalizeArticle(article, currentTopic, todayStr, randomId, dynamicTags) {
    const safeArticle = article && typeof article === 'object' ? article : {};
    const title = removeForbiddenPhrases(safeArticle.title || currentTopic);
    const description = removeForbiddenPhrases(
        safeArticle.description || `圍繞${currentTopic}整理一篇偏實操的 DeepSeek 技術筆記。`
    );
    const slug = slugify(safeArticle.slug, `deepseek-${randomId}`);
    const aiTags = Array.isArray(safeArticle.tags) ? safeArticle.tags : [];
    const tags = [...new Set([...dynamicTags, ...aiTags])]
        .map(tag => String(tag || '').trim())
        .filter(Boolean)
        .filter(tag => tag.length <= 30)
        .slice(0, 7);
    const body = removeForbiddenPhrases(safeArticle.body || '');

    return {
        title,
        description,
        slug,
        tags: tags.length ? tags : ['posts'],
        body
    };
}

function buildMarkdown(article, todayStr, randomId, options = {}) {
    const permalink = `/posts/${todayStr}-${article.slug}-${randomId}/index.html`;
    const tags = JSON.stringify(article.tags);
    const featuredLine = options.featured ? 'featured: true\n' : '';

    return `---
title: "${yamlEscape(article.title)}"
description: "${yamlEscape(article.description)}"
date: ${todayStr}
generated: true
${featuredLine}tags: ${tags}
layout: "layouts/post.njk"
permalink: "${permalink}"
---

${article.body}
`;
}

async function generateWithRetry(ai, contents, logLabel, config = {}, model = 'gemini-2.5-flash') {
    let response;
    let retryCount = 0;
    const maxRetries = 3;
    const delay = (ms) => new Promise(res => setTimeout(res, ms));

    while (retryCount < maxRetries) {
        try {
            console.log(`${logLabel} (嘗試第 ${retryCount + 1} 次)`);
            response = await ai.models.generateContent({
                model,
                contents,
                config,
            });

            if (response && response.text) return response.text;
            throw new Error('Gemini 返回內容為空');
        } catch (error) {
            retryCount++;
            const errMsg = String(error.message || '').toLowerCase();
            if ((errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('429')) && retryCount < maxRetries) {
                console.warn('⚠️ Google 服務器正值流量高峰 (503/429)。原地等待 5 秒後自動重試...');
                await delay(5000);
            } else if (retryCount >= maxRetries) {
                throw error;
            } else {
                throw error;
            }
        }
    }

    throw new Error('Gemini API 重試後仍未返回內容');
}

async function runAutoBot() {
    // 1. 檢查環境變量中是否存在金鑰
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.warn("⚠️ [環境提示] 未檢測到 GEMINI_API_KEY 環境金鑰。打包階段跳過生成。");
        return; 
    }

    // 從命令列參數中獲取需要生成的文章篇數
    const args = process.argv.slice(2);
    let maxPosts = parseInt(args[0], 10) || 1;
    console.log(`🤖 收到發文指令，本次任務嘗試批量生成: ${maxPosts} 篇文章`);

    // 2. 初始化 Gemini 客戶端
    const ai = new GoogleGenAI({ apiKey: apiKey });

    // 將所有詞庫與圖片庫路徑對齊至新架構的 src 目錄下
    const jsonPath = path.join(__dirname, 'src', 'keywords.json');   
    const imagesPath = path.join(__dirname, 'src', 'images.txt'); 
    
    // 3. 檢查並讀取 JSON 關鍵詞文本
    if (!fs.existsSync(jsonPath)) {
        console.warn(`⚠️ 未找到詞庫文件: ${jsonPath}，跳過本次生成。`);
        return;
    }
    
    let keywords = [];
    try {
        keywords = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    } catch (e) {
        console.error("⚠️ 讀取或解析 keywords.json 失敗，請檢查JSON語法:", e.message);
        return;
    }
    
    if (!Array.isArray(keywords) || keywords.length === 0) {
        console.warn("⚠️ 關鍵詞庫為空或格式非陣列，請及時補充新選題！");
        return;
    }

    // 調整生成數量：如果輸入的數量大於詞庫剩餘詞量，以詞庫剩餘數量為準
    if (maxPosts > keywords.length) {
        console.log(`💡 提示：輸入的數量 ${maxPosts} 大於詞庫剩餘詞量 ${keywords.length}，將生成現存的全部文章。`);
        maxPosts = keywords.length;
    }

    // 循環批量生成
    for (let currentLoop = 0; currentLoop < maxPosts; currentLoop++) {
        console.log(`\n------------------ 正在處理第 ${currentLoop + 1} / ${maxPosts} 篇 ------------------`);

        // 4. 提取並準備隨機圖片連結
        let selectedImages = [];
        if (fs.existsSync(imagesPath)) {
            try {
                const allImages = fs.readFileSync(imagesPath, 'utf-8')
                    .split(/\r?\n/)
                    .map(line => line.trim()) 
                    .filter(line => line.length > 0 && (line.startsWith('http') || line.startsWith('/static/')));

                if (allImages.length >= 2) {
                    const shuffled = allImages.sort(() => 0.5 - Math.random());
                    selectedImages = shuffled.slice(0, 2);
                    console.log(`圖片配給成功: 1. ${selectedImages[0]} | 2. ${selectedImages[1]}`);
                } else if (allImages.length === 1) {
                    selectedImages = [allImages[0], allImages[0]];
                }
            } catch (e) {
                console.error("⚠️ 讀取 images.txt 失敗，本篇生成將不帶插圖:", e.message);
            }
        }

        // 5. 彈出並消費第一個關鍵詞
        const currentTopic = keywords.shift();
        console.log(`當前推文選題確定: [ ${currentTopic} ]`);

        // 🌟【終極修正】：手動提取香港時間的 年、月、日，死死拼裝成 11ty 唯一承認的 YYYY-MM-DD 國際標準！
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('zh-HK', {
            timeZone: 'Asia/Hong_Kong',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
        const parts = formatter.formatToParts(now);
        const year = parts.find(p => p.type === 'year').value;
        const month = parts.find(p => p.type === 'month').value;
        const day = parts.find(p => p.type === 'day').value;
        
        const todayStr = `${year}-${month}-${day}`; // 100% 輸出 2026-05-19，絕不翻車！
        const randomId = Math.floor(100 + Math.random() * 900); 

        // 6. 構造圖片指導 Prompt
        let imagePromptInstruction = '';
        if (selectedImages.length === 2) {
            imagePromptInstruction = `
    4. 【插圖嵌入要求】：
       請在撰寫文章正文時，將以下兩個圖片連結【嚴格、自然地】嵌入到不同的二級標題（##）或段落之間，提升排版豐富度。
       必須使用標準的 Markdown 圖片格式，且必須補充具有 SEO 價值、使用繁體中文的 alt 描述（嚴禁包含中文百分號或特殊字元）。
       
       圖片連結 1：${selectedImages[0]}
       圖片連結 2：${selectedImages[1]}
       
       例如嵌入格式：![DeepSeek 香港企業應用架構演示](${selectedImages[0]})
            `;
        }

        const dynamicTags = pickDynamicTags(currentTopic, todayStr, randomId);
        const visibleTags = dynamicTags.filter(tag => !SYSTEM_TAGS.has(tag)).join('、');

        // 7. 構造香港本地化 SEO Prompt 模板，首輪只輸出 JSON，方便二次潤色與程序校驗
        const prompt = `
    你是某技術博客的兼職作者，給普通用戶寫實操帖，不是寫白皮書。請針對主題 "${currentTopic}" 撰寫一篇使用【香港繁體中文】（zh-HK）的 DeepSeek 技術原創文章。
    
    【重要核心要求】：
    1. 標題像博客標題，不要「XXX技術白皮書」「XXX完整指南」這種官腔。
    2. 正文字數控制在 800 - 1500 字之間，段落長短錯落，不要每段都 3-4 句。
    3. 正文必須包含：①一個具體版本號或日期 ②至少 3 步操作步驟 ③一個「常見問題」小節。
    4. 至少一段用第一人稱，例如「我測試時發現…」「上週升級後…」。
    5. 禁止用詞：綜上所述、毋庸置疑、在當今數字化時代、業界領先、全方位、深度融合、極致、官方、站群、SEO 霸屏、友鏈機器人。
    6. 刪掉「在當今」「隨著…的快速發展」這類開頭。
    6.5. 技術斷言只允許基於官方公開信息（版本、價格、功能、報錯碼），嚴禁編造模型能力與數據；不確定的細節寫「以官方文檔為準」。
    7. 隨機選一種結構：
       A. 教程型（步驟+截圖描述）
       B. 評測型（3個維度打分+表格感描述）
       C. 問答型（5個FAQ）
       D. 快訊型（短，300-600字）
    8. 用「## 目錄」做大欄目，Tags 由站點聚合頁負責，不要在正文末尾硬塞標籤。
    9. 全篇保留可執行的技術信息，多用本地常用詞（如：教學、優化、中小企、網絡、顯示卡）。
    10. 請將主題翻譯為乾淨、地道、用連字符隔開的純英文 slug。
    11. 建議 Front Matter Tags：${visibleTags}。
    12. 【正文內鏈規則】每篇必須遵守：
       - 站內內鏈 2～5 條，錨文本用自然描述，禁止每個「DeepSeek」都加鏈。
       - 官方外鏈 0～2 條（platform.deepseek.com / chat.deepseek.com / ollama.com），同一域名最多 1 次。
       - 優先鏈到以下 pillar（按主題選 2～3 篇，必須相關）：
         /posts/deepseek-api-key-and-limits/
         /posts/deepseek-api-retry-guide/
         /posts/deepseek-prompt-basics/
         /posts/deepseek-web-login-troubleshoot/
         /posts/deepseek-ollama-local-setup/
       - 格式：[描述性錨文本](/posts/xxx/)，不要硬塞友鏈或站群域名。
    ${imagePromptInstruction}

    嚴格只輸出 JSON，不要使用 Markdown 代碼框，不要輸出 YAML。JSON 結構必須是：
    {
      "title": "文章標題",
      "description": "120字以內摘要",
      "slug": "english-url-slug",
      "tags": ["posts", "標籤1", "標籤2"],
      "body": "Markdown 正文，不包含 Front Matter，不包含 H1 標題"
    }
        `;

        try {
            const firstPassArticle = normalizeArticle(
                await generateArticleJson(ai, prompt, '首輪 JSON 文章'),
                currentTopic,
                todayStr,
                randomId,
                dynamicTags
            );
            console.log('🎉 首輪 JSON 文章生成成功，開始二次潤色。');

            const polishPrompt = `
    把下面文章改寫成貼吧/知乎網友風格：縮短 20% 官話，加 1-2 處自然口語，保留所有技術信息，輸出同樣 JSON。
    【角色】你是某技術博客的兼職作者，給普通用戶寫實操帖，不是寫白皮書。
    【硬性要求】
    - 標題像博客標題，不要「XXX技術白皮書」「XXX完整指南」這種官腔。
    - 正文必須包含：①一個具體版本號或日期 ②至少 3 步操作步驟 ③一個「常見問題」小節。
    - 至少一段用第一人稱（「我測試時發現…」「上週升級後…」）。
    - 禁止用詞：綜上所述、毋庸置疑、在當今數字化時代、業界領先、全方位、深度融合、極致、官方、站群、SEO 霸屏、友鏈機器人、全攻略、狂降。
    - 刪掉「在當今」「隨著…的快速發展」開頭。
    - 隨機替換部分連接詞，不要通篇都是「此外」「因此」「同時」。
    - 長度 800-1500 字，段落長短錯落，用「## 目錄」做大欄目。
    - 保留 JSON 字段：title、description、slug、tags、body；不要輸出代碼框。
    - 保留正文內 2～5 條站內 pillar 內鏈（/posts/deepseek-api-key-and-limits/ 等），錨文本自然，不要關鍵詞堆砌。

    待潤色 JSON：
    ${JSON.stringify(firstPassArticle, null, 2)}
            `;

            const polishedArticle = normalizeArticle(
                await generateArticleJson(ai, polishPrompt, '二次潤色'),
                currentTopic,
                todayStr,
                randomId,
                dynamicTags
            );

            // 開頭 200 字分層：Claude（有 key 時）> Gemini 2.5 Pro（用現有 key，零新增費用）> 保留原文
            let finalArticle = polishedArticle;
            const openingAttempt = async (label, fn) => {
                try {
                    console.log(`✍️ 使用 ${label} 重寫開頭 200 字...`);
                    const newBody = await fn();
                    if (newBody && newBody.length >= 60) {
                        finalArticle = { ...polishedArticle, body: newBody };
                        console.log(`✅ 開頭已由 ${label} 重寫`);
                    }
                } catch (e) {
                    console.warn(`⚠️ ${label} 開頭重寫失敗，保留原文開頭: ${e.message}`);
                }
            };
            if (ANTHROPIC_KEY) {
                await openingAttempt('Claude', async () =>
                    rewriteOpeningWithClaude(finalArticle.title, finalArticle.body));
            } else if (process.env.GEMINI_API_KEY) {
                await openingAttempt('Gemini 2.5 Pro', async () => {
                    const prompt2 = buildOpeningPrompt(finalArticle.title, finalArticle.body);
                    const text = await generateWithRetry(ai, prompt2, '開頭重寫 (Pro)', {}, 'gemini-2.5-pro');
                    return spliceOpening(finalArticle.body, removeForbiddenPhrases(stripCodeFence(text).trim()));
                });
            }

            // 自動精選已停用：此前「每天第一篇自動 featured」導致大量行業拼湊文進入 sitemap，
            // 是整站被判 scaled content abuse 的主因。升級收錄一律走 GSC 數據 + tools/promote-featured.js 手動操作。
            const shouldFeature = false;
            const articleContent = buildMarkdown(finalArticle, todayStr, randomId, { featured: shouldFeature });

            const fileName = `${todayStr}-post-${randomId}-${currentLoop}.md`;
            const outputDir = path.join(__dirname, 'src', 'posts'); 
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            fs.writeFileSync(path.join(outputDir, fileName), articleContent, 'utf-8');
            console.log(`✅ 第 ${currentLoop + 1} 篇文章已成功寫入本地磁碟: src/posts/${fileName}`);

        } catch (error) {
            console.error(`❌ 第 ${currentLoop + 1} 篇文章寫入磁碟時遭遇錯誤:`, error.message);
            keywords.unshift(currentTopic);
        }
    }

    try {
        fs.writeFileSync(jsonPath, JSON.stringify(keywords, null, 2), 'utf-8');
        console.log(`\n📉 詞庫整體更新完畢！剩餘可用關鍵詞數: ${keywords.length}`);
    } catch (e) {
        console.error("❌ 回寫 keywords.json 失敗:", e.message);
    }
}

runAutoBot();
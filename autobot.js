const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');

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
                    .filter(line => line.length > 0 && line.startsWith('http'));

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

        // 7. 構造終極 香港本地化 SEO Prompt 模板
        const prompt = `
    你是一個精通技術 SEO、網絡安全以及大模型基礎設施的香港本地權威科技博主。請針對主題 "${currentTopic}" 撰寫一篇深入、對用戶有極高價值、且全面使用【香港繁體中文】（zh-HK）的技術原創文章。
    
    【重要核心要求】：
    1. 請將本次的主題 "${currentTopic}" 翻譯為一個乾淨、地道、用連字符隔開的【純英文短語】，作為 URL 的別名（Slug）。
    2. 字数嚴格控制在 1200 - 2000 字之間。多用結構化列表、二級標題（##）、三級標題（###）。
    3. 全篇文本（包含標題 and 描述）必須使用正宗的香港繁體字，多使用本地常用詞（如：教學、優化、中小企、數字轉型、網絡、顯示卡）。
    4. 嚴格按以下 Markdown 格式輸出頭部元數據，禁止在最外層包含 \`\`\`markdown 包裹外殼，必须直接以 --- 開頭：

    ---
    title: "${currentTopic}"
    description: "針對${currentTopic}的專業技術解析與香港本地化實操指南。"
    date: ${todayStr}
    tags: ["posts"]
    layout: "layouts/post.njk"
    permalink: "/posts/${todayStr}-你的純英文短語-${randomId}/index.html"
    ---

    【注意】：請務必將上面 permalink 裡面的 "你的純英文短語" 换為你真正翻譯出來的英文 Slug。不要保留任何多餘的引號或括號。
    ${imagePromptInstruction}

    這裡開始寫文章正文。請多用二級標題（##）、三級標題（###）對內容進行多層級切分，保證極佳的 SEO 可讀性與結構性。
        `;

        // 智能抗併發自動重試機制
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        while (retryCount < maxRetries) {
            try {
                console.log(`正在連接 Gemini API 生產高質量繁體內容... (嘗試第 ${retryCount + 1} 次)`);
                
                response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });

                if (response && response.text) {
                    console.log("🎉 Gemini API 響應成功！已順利拿到繁體正文。");
                    break; 
                } else {
                    throw new Error("Gemini 返回內容為空");
                }
            } catch (error) {
                retryCount++;
                const errMsg = error.message.toLowerCase();
                if (errMsg.includes('503') || errMsg.includes('unavailable') || errMsg.includes('429')) {
                    if (retryCount < maxRetries) {
                        console.warn(`⚠️ Google 服務器正值流量高峰 (503/429)。原地等待 5 秒後自動重試...`);
                        await delay(5000); 
                    }
                } else {
                    throw error;
                }
            }
        }

        if (!response || !response.text) {
            console.error(`❌ 連續重試 ${maxRetries} 次後 Gemini API 依然處於高載狀態，將本期選題塞回詞庫，跳過本篇。`);
            keywords.unshift(currentTopic);
            continue; 
        }

        try {
            let articleContent = response.text;
            articleContent = articleContent.replace(/permalink:\s*["']?\/posts\/([^"'\n]+)["']?/g, 'permalink: "/posts/$1"');

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
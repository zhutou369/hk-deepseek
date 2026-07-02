const fs = require('fs');
const path = require('path');
const https = require('https');

const DOMAIN = process.env.BING_DOMAIN || 'hk-deepseek.com';
const BING_KEY = (process.env.INDEXNOW_KEY || '').trim();
const OUTPUT_DIR = path.join(__dirname, '..', '_site');

const BING_403_HELP = [
    '❌ IndexNow 403：Bing 尚未授权此域名。',
    '   验证文件可访问 ≠ API 已授权。请按以下步骤操作：',
    '   1. 打开 https://www.bing.com/webmasters 添加 hk-deepseek.com',
    '   2. 用 XML 文件 / Meta 标签 / DNS 完成所有权验证（勿仅用 Google 导入）',
    '   3. 在 Settings → IndexNow 生成 key，更新 GitHub Secret INDEXNOW_KEY',
    '   4. 确保 https://hk-deepseek.com/{key}.txt 内容仅为 key 本身（无换行）',
].join('\n');

function getAllHtmlFiles(dirPath, arrayOfFiles = []) {
    if (!fs.existsSync(dirPath)) return arrayOfFiles;
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            getAllHtmlFiles(fullPath, arrayOfFiles);
        } else if (file.endsWith('.html')) {
            arrayOfFiles.push(fullPath);
        }
    });
    return arrayOfFiles;
}

function toPublicUrl(relativePath) {
    let normalized = relativePath.replace(/\\/g, '/');
    if (normalized.endsWith('index.html')) {
        normalized = normalized.slice(0, -10);
    } else if (normalized.endsWith('.html')) {
        normalized = normalized.slice(0, -5);
    }
    return `https://${DOMAIN}/${normalized}`;
}

function postIndexNow(requestData) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.indexnow.org',
            path: '/IndexNow',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(requestData),
            },
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ statusCode: res.statusCode, body }));
        });

        req.on('error', reject);
        req.write(requestData);
        req.end();
    });
}

async function main() {
    if (!BING_KEY) {
        console.log('ℹ️ 未设置 INDEXNOW_KEY，跳过 Bing IndexNow 推送。');
        process.exit(0);
    }

    const htmlFiles = getAllHtmlFiles(OUTPUT_DIR);
    let urlList = htmlFiles.map((filePath) => {
        const relativePath = path.relative(OUTPUT_DIR, filePath);
        return toPublicUrl(relativePath);
    });

    urlList = urlList.filter(
        (url) => !url.includes('404') && !url.includes('admin') && !url.endsWith('.txt')
    );

    if (urlList.length === 0) {
        console.log('ℹ️ 未发现有效页面，无需推送。');
        process.exit(0);
    }

    console.log(`🚀 正在将 ${urlList.length} 个有效网域 URL 推送给必应集群...`);

    const requestData = JSON.stringify({
        host: DOMAIN,
        key: BING_KEY,
        keyLocation: `https://${DOMAIN}/${BING_KEY}.txt`,
        urlList,
    });

    const { statusCode, body } = await postIndexNow(requestData);

    if (statusCode === 200 || statusCode === 202) {
        console.log(`✅ [完美闭环] 必应 IndexNow 成功接收！状态码: ${statusCode}`);
        process.exit(0);
    }

    console.error(`❌ 推送失败，状态码: ${statusCode}, 响应: ${body}`);
    if (statusCode === 403 && body.includes('UserForbiddedToAccessSite')) {
        console.error(BING_403_HELP);
        console.error('⚠️  验证文件已在线，但 Bing 未授权 API。CI 将继续，请在 Bing Webmaster 完成站点验证后重试。');
        process.exit(0);
    }
    process.exit(1);
}

main().catch((err) => {
    console.error('❌ 自动化推送运行出错:', err.message);
    process.exit(1);
});

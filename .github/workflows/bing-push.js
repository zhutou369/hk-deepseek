const fs = require('fs');
const path = require('path');
const https = require('https');

// ======= 配置参数 =======
const DOMAIN = "hk-deepseek.com";
const BING_KEY = process.env.INDEXNOW_KEY; // 从 GitHub Secrets 读取你的 API Key
const OUTPUT_DIR = path.join(__dirname, '../../_site'); 

if (!BING_KEY) {
  console.error("❌ 错误: 未检测到环境变量 INDEXNOW_KEY，取消推送。");
  process.exit(1);
}

// 递归遍历 _site 获取所有 HTML 文件
function getAllHtmlFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  files.forEach((file) => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllHtmlFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.html')) {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

try {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error(`❌ 错误: 编译目录 ${OUTPUT_DIR} 不存在。`);
    process.exit(1);
  }

  const htmlFiles = getAllHtmlFiles(OUTPUT_DIR);
  
  // 转换为线上标准漂亮的 URL 格式
  let urlList = htmlFiles.map(filePath => {
    let relativePath = path.relative(OUTPUT_DIR, filePath).replace(/\\/g, '/');
    if (relativePath.endsWith('index.html')) {
      relativePath = relativePath.slice(0, -10);
    } else if (relativePath.endsWith('.html')) {
      relativePath = relativePath.slice(0, -5);
    }
    return `https://${DOMAIN}/${relativePath}`;
  });

  // 过滤内部特殊页面
  urlList = urlList.filter(url => !url.includes('404'));

  if (urlList.length === 0) {
    console.log("ℹ️ 未发现新页面，无需推送。");
    process.exit(0);
  }

  console.log(`🚀 站点已验证！正在将 ${urlList.length} 个页面直接推送到必应集群...`);

  // ======= 核心修改点：既然已验证，直接向 Bing 提交 =======
  const requestData = JSON.stringify({
    host: DOMAIN,
    key: BING_KEY,
    // 由于必应已验证，keyLocation 可以直接留空或指向任意合规路径，必应会自动匹配你后台的 Key
    keyLocation: `https://${DOMAIN}/${BING_KEY}.txt`, 
    urlList: urlList
  });

  const options = {
    hostname: 'api.indexnow.org',
    path: '/IndexNow',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(requestData)
    }
  };

  const req = https.request(options, (res) => {
    let responseBody = '';
    res.on('data', (chunk) => responseBody += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`✅ 必应 IndexNow 成功接收！站群自动化推送完成。`);
      } else {
        console.error(`❌ 推送失败，错误码: ${res.statusCode}, 响应: ${responseBody}`);
      }
    });
  });

  req.on('error', (e) => {
    console.error(`❌ 网络请求失败: ${e.message}`);
  });

  req.write(requestData);
  req.end();

} catch (err) {
  console.error("❌ 脚本运行出错:", err);
}
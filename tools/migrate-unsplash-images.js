const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT = path.join(__dirname, "..");
const IMAGES_TXT = path.join(ROOT, "src", "images.txt");
const OUT_DIR = path.join(ROOT, "src", "static", "images");
const POSTS_DIR = path.join(ROOT, "src", "posts");

function photoIdFromUrl(url) {
  const match = String(url).match(/photo-([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

function localPathForPhotoId(id) {
  return `/static/images/photo-${id}.jpg`;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          file.close();
          fs.unlinkSync(dest);
          return download(res.headers.location, dest).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
  });
}

async function ensureImage(url, map) {
  const id = photoIdFromUrl(url);
  if (!id) return null;
  if (map.has(id)) return map.get(id);

  const localPath = localPathForPhotoId(id);
  const dest = path.join(OUT_DIR, `photo-${id}.jpg`);
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    process.stdout.write(`Downloading photo-${id}.jpg ... `);
    await download(url.trim(), dest);
    console.log("ok");
  }
  map.set(id, localPath);
  return localPath;
}

function replaceUnsplashInText(text, map) {
  return text.replace(/https:\/\/images\.unsplash\.com\/photo-[a-z0-9-]+[^\s)\]"']*/gi, (url) => {
    const id = photoIdFromUrl(url);
    return id && map.has(id) ? map.get(id) : url;
  });
}

async function main() {
  if (!fs.existsSync(IMAGES_TXT)) {
    console.error("Missing", IMAGES_TXT);
    process.exit(1);
  }

  const lines = fs.readFileSync(IMAGES_TXT, "utf-8").split(/\r?\n/);
  const map = new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("http")) continue;
    try {
      await ensureImage(trimmed, map);
    } catch (err) {
      console.error(`Failed ${trimmed}:`, err.message);
    }
  }

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("http")) return line;
    const id = photoIdFromUrl(trimmed);
    return id && map.has(id) ? map.get(id) : line;
  });
  fs.writeFileSync(IMAGES_TXT, newLines.join("\n"), "utf-8");
  console.log(`Updated ${IMAGES_TXT} (${map.size} local images)`);

  const posts = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  let changed = 0;
  for (const file of posts) {
    const filePath = path.join(POSTS_DIR, file);
    const original = fs.readFileSync(filePath, "utf-8");
    const updated = replaceUnsplashInText(original, map);
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf-8");
      changed++;
    }
  }
  console.log(`Updated ${changed} post files`);

  const remaining = posts.reduce((count, file) => {
    const text = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
    return count + (text.match(/images\.unsplash\.com/g) || []).length;
  }, 0);
  console.log(`Remaining unsplash refs in posts: ${remaining}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const IMAGES_TXT = path.join(ROOT, "src", "images.txt");
const OUT_DIR = path.join(ROOT, "src", "static", "images");
const POSTS_DIR = path.join(ROOT, "src", "posts");

function photoIdFromUrl(url) {
  const match = String(url).match(/photo-([a-z0-9-]+)/i);
  return match ? match[1] : null;
}

function hashPick(id, pool) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

function localPool() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs
    .readdirSync(OUT_DIR)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => `/static/images/${f}`)
    .sort();
}

function resolveLocal(urlOrPath, pool, cache) {
  if (urlOrPath.startsWith("/static/")) return urlOrPath;
  const id = photoIdFromUrl(urlOrPath);
  if (!id) return pool[0];
  if (cache.has(id)) return cache.get(id);
  const file = path.join(OUT_DIR, `photo-${id}.jpg`);
  const local = fs.existsSync(file) ? `/static/images/photo-${id}.jpg` : hashPick(id, pool);
  cache.set(id, local);
  return local;
}

function replaceUnsplashInText(text, pool, cache) {
  return text.replace(/https:\/\/images\.unsplash\.com\/photo-[a-z0-9-]+[^\s)\]"']*/gi, (url) =>
    resolveLocal(url, pool, cache)
  );
}

function main() {
  const pool = localPool();
  if (!pool.length) {
    console.error("No local images in", OUT_DIR);
    process.exit(1);
  }
  const cache = new Map();

  const lines = fs.readFileSync(IMAGES_TXT, "utf-8").split(/\r?\n/);
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith("/static/")) return line;
    if (trimmed.startsWith("http")) return resolveLocal(trimmed, pool, cache);
    return line;
  });
  fs.writeFileSync(IMAGES_TXT, newLines.join("\n"), "utf-8");
  console.log(`images.txt: ${newLines.filter((l) => l.startsWith("/static/")).length} local paths`);

  const posts = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".md"));
  let changed = 0;
  for (const file of posts) {
    const filePath = path.join(POSTS_DIR, file);
    const original = fs.readFileSync(filePath, "utf-8");
    const updated = replaceUnsplashInText(original, pool, cache);
    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf-8");
      changed++;
    }
  }

  const remaining = posts.reduce((count, file) => {
    const text = fs.readFileSync(path.join(POSTS_DIR, file), "utf-8");
    return count + (text.match(/images\.unsplash\.com/g) || []).length;
  }, 0);

  console.log(`Updated ${changed} posts; remaining unsplash refs: ${remaining}`);
}

main();

#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src");
const key = (process.env.INDEXNOW_KEY || "").trim();

if (!key) {
  console.log("INDEXNOW_KEY not set, skip key file.");
  process.exit(0);
}

const content = key;
for (const dir of [SRC, path.join(ROOT, "_site")]) {
  if (!fs.existsSync(dir)) continue;
  const fp = path.join(dir, `${key}.txt`);
  fs.writeFileSync(fp, content, "utf8");
  console.log(`Wrote ${path.relative(ROOT, fp)}`);
}

const fs = require("fs");
const path = require("path");

const SVG_DIRS = [
  path.join(__dirname, "..", "src", "static", "posts"),
  path.join(__dirname, "..", "src", "static"),
];

function hasUtf8Bom(buf) {
  return buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
}

function isValidUtf8(buf) {
  const text = buf.toString("utf8");
  return Buffer.from(text, "utf8").equals(buf);
}

function collectSvgFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "images") continue;
      collectSvgFiles(fullPath, files);
    } else if (entry.name.endsWith(".svg")) {
      files.push(fullPath);
    }
  }
  return files;
}

function validateSvg(filePath) {
  const rel = path.relative(path.join(__dirname, ".."), filePath);
  const buf = fs.readFileSync(filePath);

  if (hasUtf8Bom(buf)) {
    return { ok: false, rel, error: "UTF-8 BOM is not allowed; save as UTF-8 without BOM" };
  }
  if (!isValidUtf8(buf)) {
    return { ok: false, rel, error: "File contains invalid UTF-8 byte sequences" };
  }

  const text = buf.toString("utf8");
  if (!/^\s*<svg[\s>]/i.test(text) || !/<\/svg>\s*$/i.test(text)) {
    return { ok: false, rel, error: "Missing or incomplete <svg> root element" };
  }

  const textBlocks = [...text.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)];
  for (const [, content] of textBlocks) {
    if (content.includes("<")) {
      return {
        ok: false,
        rel,
        error: `Unescaped '<' inside <text>; use &lt; for literal less-than signs`,
      };
    }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(content)) {
      return { ok: false, rel, error: "Control characters found inside <text> content" };
    }
  }

  const openText = (text.match(/<text\b[^/>]*>/gi) || []).length;
  const closeText = (text.match(/<\/text>/gi) || []).length;
  if (openText !== closeText) {
    return {
      ok: false,
      rel,
      error: `Mismatched <text> tags (${openText} open, ${closeText} close)`,
    };
  }

  return { ok: true, rel };
}

const files = [...new Set(SVG_DIRS.flatMap((dir) => collectSvgFiles(dir)))].sort();
let failed = 0;

for (const file of files) {
  const result = validateSvg(file);
  if (!result.ok) {
    console.error(`FAIL ${result.rel}: ${result.error}`);
    failed += 1;
  } else {
    console.log(`OK   ${result.rel}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} SVG file(s) failed validation.`);
  process.exit(1);
}

console.log(`\nAll ${files.length} SVG file(s) passed validation.`);

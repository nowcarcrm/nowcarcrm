const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const preferredPath = path.join(projectRoot, "public", "fonts", "NotoSansKR-Regular.ttf");
const source = preferredPath;

if (!fs.existsSync(source)) {
  throw new Error(`Font file not found: ${source}. Download Noto Sans KR first.`);
}

const outDir = path.join(projectRoot, "app", "(admin)", "_lib", "settlement", "fonts");
fs.mkdirSync(outDir, { recursive: true });

const base64 = fs.readFileSync(source).toString("base64");
const output = `export const NotoSansKR_Base64 = "${base64}";\n`;
const outPath = path.join(outDir, "NotoSansKR-base64.ts");
fs.writeFileSync(outPath, output);
console.log("Done. source:", source);
console.log("Done. file size:", base64.length);

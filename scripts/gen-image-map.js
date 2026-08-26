#!/usr/bin/env node
// assets/cards/*.webp から src/data/images.ts の静的 require() マップを再生成する。
// カード画像を追加・削除したら `node scripts/gen-image-map.js` を実行すること。
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets", "cards");
const outFile = path.join(__dirname, "..", "src", "data", "images.ts");

const files = fs
  .readdirSync(assetsDir)
  .filter((f) => /\.(webp|png|jpg)$/.test(f))
  .sort();

const lines = files.map((f) => {
  const id = f.replace(/\.(webp|png|jpg)$/, "");
  return `  ${JSON.stringify(id)}: require("@/assets/cards/${f}"),`;
});

const content = `// このファイルは scripts/gen-image-map.js により自動生成される。手で編集しないこと。
/* eslint-disable @typescript-eslint/no-require-imports */

export const cardImages: Record<string, number> = {
${lines.join("\n")}
};
`;

fs.writeFileSync(outFile, content);
console.log(`generated ${outFile} (${files.length} images)`);

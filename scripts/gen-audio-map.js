#!/usr/bin/env node
// assets/audio/ から src/data/audio.ts の静的 require() マップを再生成する。
// 効果音: *.wav → se マップ / BGM: bgm_*.mp3|m4a|wav → bgm マップ
// 音声ファイルを追加・削除したら `node scripts/gen-audio-map.js` を実行すること。
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets", "audio");
const outFile = path.join(__dirname, "..", "src", "data", "audio.ts");

const files = fs.readdirSync(assetsDir).filter((f) => /\.(wav|mp3|m4a)$/.test(f)).sort();

const se = [];
const bgm = [];
for (const f of files) {
  const id = f.replace(/\.(wav|mp3|m4a)$/, "");
  const line = `  ${JSON.stringify(id)}: require("@/assets/audio/${f}"),`;
  if (id.startsWith("bgm_")) bgm.push(line);
  else se.push(line);
}

const content = `// このファイルは scripts/gen-audio-map.js により自動生成される。手で編集しないこと。
/* eslint-disable @typescript-eslint/no-require-imports */

export const seAssets: Record<string, number> = {
${se.join("\n")}
};

export const bgmAssets: Record<string, number> = {
${bgm.join("\n")}
};
`;

fs.writeFileSync(outFile, content);
console.log(`generated ${outFile} (se: ${se.length}, bgm: ${bgm.length})`);

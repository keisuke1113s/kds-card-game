#!/usr/bin/env node
// assets/cards/*.webp から src/data/images.ts の静的 require() マップを再生成する。
// カード画像を追加・削除したら `node scripts/gen-image-map.js` を実行すること。
const fs = require("fs");
const path = require("path");

const outFile = path.join(__dirname, "..", "src", "data", "images.ts");

function mapFor(dir) {
  const abs = path.join(__dirname, "..", "assets", dir);
  return fs
    .readdirSync(abs)
    .filter((f) => /\.(webp|png|jpg)$/.test(f))
    .sort()
    .map((f) => {
      const id = f.replace(/\.(webp|png|jpg)$/, "");
      return `  ${JSON.stringify(id)}: require("@/assets/${dir}/${f}"),`;
    });
}

const full = mapFor("cards");
const thumbs = mapFor("cards_thumb");
const smalls = mapFor("cards_small");

const content = `// このファイルは scripts/gen-image-map.js により自動生成される。手で編集しないこと。
/* eslint-disable @typescript-eslint/no-require-imports */

// 原寸（868×1213）: 詳細表示（xl）用
export const cardImages: Record<string, number> = {
${full.join("\n")}
};

// 中サムネイル（300px幅）: 拡大表示（lg）用
export const cardThumbs: Record<string, number> = {
${thumbs.join("\n")}
};

// 小サムネイル（150px幅）: 盤面・手札・一覧（sm/md）用。
// 同時に何十枚も並ぶため、iOS Safariのメモリ制限で描画が落ちないよう軽量にする。
export const cardSmalls: Record<string, number> = {
${smalls.join("\n")}
};
`;

fs.writeFileSync(outFile, content);
console.log(
  `generated ${outFile} (full: ${full.length}, thumbs: ${thumbs.length}, smalls: ${smalls.length})`
);

#!/bin/bash
# Web版を GitHub Pages（gh-pages ブランチ）へデプロイする。
# 使い方: npm run deploy:pages
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== Web版をビルド =="
npx expo export -p web
touch dist/.nojekyll

echo "== gh-pages へプッシュ =="
TMP=$(mktemp -d)
cp -R dist/. "$TMP/"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="keisuke1113s" -c user.email="kei.soma@kds946.com" commit -q -m "Deploy web build $(date '+%Y-%m-%d %H:%M')"
git push -f https://github.com/keisuke1113s/kds-card-game.git gh-pages
cd - > /dev/null
rm -rf "$TMP"

echo "== 完了: https://keisuke1113s.github.io/kds-card-game/ （反映まで1〜2分） =="

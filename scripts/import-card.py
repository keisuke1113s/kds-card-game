#!/usr/bin/env python3
"""新カードのPDF（トンボ付き90×115mm規格）を取り込み、3解像度のWebPを生成する。

使い方:
  python3 scripts/import-card.py <カードID> <PDFファイル>
例:
  python3 scripts/import-card.py i_yamada "raw-cards/インストラクターカード（山田）.pdf"

処理内容（片岡カード差し替えで確立した手順の自動化）:
  1. PDFの1ページ目を350dpiで画像化
  2. 中央の63×88mm（868×1213px）を切り抜く
  3. assets/cards（原寸）/ cards_thumb（300×419）/ cards_small（150×210）にWebP保存
  4. node scripts/gen-image-map.js で画像マップを再生成

このあと必要な作業（手動）:
  - src/data/cards.ts にカード定義（名前・数値・効果）を追加する
"""

import subprocess
import sys
import tempfile
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("PIL (Pillow) が必要です: pip3 install Pillow")

ROOT = Path(__file__).resolve().parent.parent
FULL = (868, 1213)  # 63×88mm @ 350dpi
THUMB = (300, 419)
SMALL = (150, 210)


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    card_id, pdf_path = sys.argv[1], Path(sys.argv[2])
    if not pdf_path.exists():
        sys.exit(f"PDFが見つかりません: {pdf_path}")
    import re

    if not re.fullmatch(r"[ist]_[a-z0-9_]+", card_id):
        sys.exit(f"カードIDの形式が不正です（i_/s_/t_ で始まる小文字英数字）: {card_id}")

    with tempfile.TemporaryDirectory() as tmp:
        prefix = Path(tmp) / "page"
        subprocess.run(
            ["pdftoppm", "-r", "350", "-png", "-f", "1", "-l", "1", str(pdf_path), str(prefix)],
            check=True,
        )
        pages = sorted(Path(tmp).glob("page*.png"))
        if not pages:
            sys.exit("PDFの画像化に失敗しました")
        im = Image.open(pages[0]).convert("RGB")

    w, h = im.size
    if w < FULL[0] or h < FULL[1]:
        sys.exit(f"PDFの解像度が不足しています: {w}x{h}（必要: {FULL[0]}x{FULL[1]}以上）")
    left = (w - FULL[0]) // 2
    top = (h - FULL[1]) // 2
    card = im.crop((left, top, left + FULL[0], top + FULL[1]))

    outputs = [
        (ROOT / "assets" / "cards" / f"{card_id}.webp", card),
        (ROOT / "assets" / "cards_thumb" / f"{card_id}.webp", card.resize(THUMB, Image.LANCZOS)),
        (ROOT / "assets" / "cards_small" / f"{card_id}.webp", card.resize(SMALL, Image.LANCZOS)),
    ]
    for path, img in outputs:
        img.save(path, "WEBP", quality=85, method=6)
        print(f"書き出し: {path.relative_to(ROOT)} ({img.size[0]}x{img.size[1]})")

    subprocess.run(["node", str(ROOT / "scripts" / "gen-image-map.js")], check=True)
    print("画像マップを再生成しました (src/data/images.ts)")
    print(f"\n次の作業: src/data/cards.ts に {card_id} の定義（名前・数値・効果）を追加してください")


if __name__ == "__main__":
    main()

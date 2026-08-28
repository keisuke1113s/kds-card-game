#!/usr/bin/env python3
"""fal.ai (flux/schnell) でアプリのアート素材を生成する。

使い方:
  python3 scripts/gen-art.py bg_home     # ホーム背景 → assets/images/fx/bg_home.webp
  python3 scripts/gen-art.py particles   # 季節の粒子4種 → assets/images/particles/*.png
  python3 scripts/gen-art.py icon        # アイコン一式 → assets/images/icon.png ほか
  （省略で全部）
"""

import io
import json
import os
import sys
import urllib.request

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
IMAGES = os.path.join(ROOT, "assets", "images")

NO_TEXT = ", no text, no letters, no watermark, no logo"


def flux(prompt: str, key: str, size: str = "square_hd") -> Image.Image:
    body = json.dumps({"prompt": prompt, "image_size": size, "num_images": 1}).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/flux/schnell",
        data=body,
        headers={"Authorization": "Key " + key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    with urllib.request.urlopen(d["images"][0]["url"], timeout=180) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGB")


# ---------------------------------------------------------------- ホーム背景

def gen_bg_home(key: str) -> None:
    img = flux(
        "soft warm illustration background for a mobile card game home screen, "
        "cute japanese driving school with a small training course, tiny cars, "
        "bright sky with fluffy clouds, gentle pastel colors, plenty of calm sky area, "
        "flat anime background art style" + NO_TEXT,
        key,
        "portrait_16_9",
    )
    w = 720
    h = round(img.height * w / img.width)
    img = img.resize((w, h), Image.LANCZOS)
    out = os.path.join(IMAGES, "fx", "bg_home.webp")
    img.save(out, "WEBP", quality=80, method=6)
    print("bg_home.webp", img.size)


# ---------------------------------------------------------------- 季節の粒子

PARTICLES = {
    "particle_sakura": "a single cherry blossom petal, soft pink, flat illustration, centered",
    "particle_snow": "a single snowflake crystal, white and pale blue, flat illustration, centered",
    "particle_leaf": "a single japanese maple leaf, red orange autumn colors, flat illustration, centered",
    "particle_sparkle": "a single four pointed star sparkle, glowing warm yellow white, flat illustration, centered",
}


def keyout_green(img: Image.Image) -> Image.Image:
    """背景を透明にする。生成AIは「純緑」を守らないことがあるため、
    四隅の色を実際の背景色として採り、その色に近い画素を抜く"""
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def dist(p) -> float:
        return ((p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2) ** 0.5

    for y in range(h):
        for x in range(w):
            p = px[x, y]
            d = dist(p)
            if d < 60:
                px[x, y] = (p[0], p[1], p[2], 0)
            elif d < 110:
                # フチは距離に応じて半透明にしてなじませる
                px[x, y] = (p[0], p[1], p[2], int((d - 60) / 50 * 255))
    return rgba


def gen_particles(key: str) -> None:
    outdir = os.path.join(IMAGES, "particles")
    os.makedirs(outdir, exist_ok=True)
    for name, prompt in PARTICLES.items():
        img = flux(
            prompt + ", on a solid pure bright green background, simple, no shadow" + NO_TEXT,
            key,
            "square",
        )
        rgba = keyout_green(img)
        bbox = rgba.getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
        rgba.thumbnail((96, 96), Image.LANCZOS)
        out = os.path.join(outdir, f"{name}.png")
        rgba.save(out, "PNG")
        print(f"{name}.png", rgba.size)


# ---------------------------------------------------------------- アイコン一式

def gen_icon(key: str) -> None:
    art = flux(
        "flat vector style app icon artwork for a driving school trading card game, "
        "one cute smiling car holding playing cards, bold outlines, vibrant red yellow "
        "green blue colors, centered composition, simple background with soft radial glow"
        + NO_TEXT,
        key,
        "square_hd",
    )

    def save_resized(path: str, size: tuple[int, int], image: Image.Image) -> None:
        image.resize(size, Image.LANCZOS).save(path, "PNG")
        print(os.path.basename(path), size)

    def target_size(path: str, fallback: tuple[int, int]) -> tuple[int, int]:
        try:
            with Image.open(path) as im:
                return im.size
        except Exception:
            return fallback

    # 既存ファイルと同じ寸法で置き換える（app.json はそのまま使える）
    for fname, fallback in [
        ("icon.png", (1024, 1024)),
        ("splash-icon.png", (1024, 1024)),
        ("favicon.png", (48, 48)),
    ]:
        p = os.path.join(IMAGES, fname)
        save_resized(p, target_size(p, fallback), art)

    # Android: 前面はセーフゾーン（中央66%）に収めた透過画像、背景は無地
    fg_path = os.path.join(IMAGES, "android-icon-foreground.png")
    fg_size = target_size(fg_path, (1024, 1024))
    fg = Image.new("RGBA", fg_size, (0, 0, 0, 0))
    inner = round(fg_size[0] * 0.62)
    art_small = art.resize((inner, inner), Image.LANCZOS).convert("RGBA")
    # 角を丸くしてワッペン風に
    mask = Image.new("L", (inner, inner), 0)
    from PIL import ImageDraw

    ImageDraw.Draw(mask).rounded_rectangle([0, 0, inner, inner], radius=inner // 5, fill=255)
    fg.paste(art_small, ((fg_size[0] - inner) // 2, (fg_size[1] - inner) // 2), mask)
    fg.save(fg_path, "PNG")
    print("android-icon-foreground.png", fg_size)

    bg_path = os.path.join(IMAGES, "android-icon-background.png")
    bg_size = target_size(bg_path, (1024, 1024))
    Image.new("RGB", bg_size, (240, 246, 255)).save(bg_path, "PNG")
    print("android-icon-background.png", bg_size)

    mono_path = os.path.join(IMAGES, "android-icon-monochrome.png")
    mono_size = target_size(mono_path, (1024, 1024))
    mono = Image.new("RGBA", mono_size, (0, 0, 0, 0))
    white = Image.new("RGBA", (inner, inner), (255, 255, 255, 255))
    mono.paste(white, ((mono_size[0] - inner) // 2, (mono_size[1] - inner) // 2), mask)
    mono.save(mono_path, "PNG")
    print("android-icon-monochrome.png", mono_size)

    # PWA（iPhoneのホーム画面追加など）用のアイコンも同じ絵で揃える
    public = os.path.join(ROOT, "public")
    for fname, size in [
        ("apple-touch-icon.png", (180, 180)),
        ("icon-192.png", (192, 192)),
        ("icon-512.png", (512, 512)),
    ]:
        p = os.path.join(public, fname)
        save_resized(p, target_size(p, size), art)


def main() -> None:
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    targets = sys.argv[1:] or ["bg_home", "particles", "icon"]
    for t in targets:
        if t == "bg_home":
            gen_bg_home(key)
        elif t == "particles":
            gen_particles(key)
        elif t == "icon":
            gen_icon(key)
        else:
            sys.exit(f"不明な対象: {t}")


if __name__ == "__main__":
    main()

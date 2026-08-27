#!/usr/bin/env python3
"""fal.ai で演出用の背景素材を生成して assets/images/fx/ に書き出す。

使い方:
  ~/.fal_key に fal.ai のAPIキーを置いてから
  python3 scripts/gen-fx.py [名前...]   # 名前省略で全部

生成物はアプリに焼き込む（実行時にfal.aiを呼ぶことはしない）。
キーをリポジトリに入れないこと。
"""

import io
import json
import os
import sys
import urllib.request

from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "images", "fx")

COMMON = (
    ", high quality anime game effect background, no text, no letters,"
    " no characters, no people, no logo"
)

PROMPTS = {
    "fx_reach_gold": "anime manga speed lines effect background, radiating golden light rays from center, dramatic concentration lines, dark navy background, glowing sparkle particles" + COMMON,
    "fx_reach_red": "anime manga speed lines effect background, radiating red and crimson warning light rays from center, dramatic concentration lines, dark background, alarm atmosphere, glowing embers" + COMMON,
    "fx_victory": "celebration victory background, golden light burst from center, colorful confetti falling, sparkling star particles, rays of light, festive joyful atmosphere, deep blue background edges" + COMMON,
    "fx_defeat": "melancholic rainy night background, dark blue and gray tones, streaks of falling rain, faint soft bokeh lights, puddle reflections, sad quiet atmosphere" + COMMON,
    "fx_battle": "dramatic energy clash background, blue energy aura versus red energy aura colliding in the center with white lightning sparks, impact shockwave, dark arena" + COMMON,
    "fx_pack": "magical treasure reveal background, radiant warm golden glow from center, floating sparkles and star dust, soft light rays, mysterious dark violet edges" + COMMON,
    "fx_up": "uplifting power up effect background, streams of golden and emerald green light rising upward, ascending sparkles, hopeful bright energy, dark background at bottom" + COMMON,
    "fx_down": "power down effect background, heavy dark blue and purple energy sinking downward, falling gloomy streaks, ominous descending aura, dark atmosphere" + COMMON,
    "fx_janken": "dramatic showdown stage background, two spotlights from left and right crossing in the middle, purple and deep blue arena atmosphere, floating dust particles in light beams, tension" + COMMON,
}


def gen(key: str, name: str, prompt: str) -> None:
    body = json.dumps(
        {"prompt": prompt, "image_size": "portrait_16_9", "num_images": 1}
    ).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/flux/schnell",
        data=body,
        headers={"Authorization": "Key " + key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        d = json.load(r)
    with urllib.request.urlopen(d["images"][0]["url"], timeout=120) as r:
        img = Image.open(io.BytesIO(r.read())).convert("RGB")
    w = 720
    h = round(img.height * w / img.width)
    img = img.resize((w, h), Image.LANCZOS)
    img.save(os.path.join(OUT, f"{name}.webp"), "WEBP", quality=80, method=6)
    print(name, "ok", img.size)


def main() -> None:
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    names = sys.argv[1:] or list(PROMPTS)
    for name in names:
        if name not in PROMPTS:
            sys.exit(f"不明な名前: {name}（候補: {', '.join(PROMPTS)}）")
        gen(key, name, PROMPTS[name])


if __name__ == "__main__":
    main()

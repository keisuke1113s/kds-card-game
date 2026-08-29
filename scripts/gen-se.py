#!/usr/bin/env python3
"""fal.ai (stable-audio) で効果音を生成して assets/audio/*.wav を置き換える。

使い方:
  python3 scripts/gen-se.py [名前...]   # 名前省略で全部

生成後に頭の無音を自動で刈り、音量をならして書き出す。
気に入らない音は名前を指定して個別に再生成できる。
"""

import json
import os
import subprocess
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

# 名前: (プロンプト, 生成秒数, 最終的な最大秒数)
SES = {
    "cymbal": ("single bright crash cymbal hit with quick decay, celebratory finish accent, game sound effect", 2, 1.4),
    "comeback": ("dramatic comeback victory sting, tension riser resolving into triumphant heroic brass hit, epic reversal moment, game sound effect", 4, 2.6),
    "achievement": ("bright achievement unlock jingle, two ascending sparkling chime notes with a soft bell tail, rewarding, game sound effect", 3, 1.8),
    "tap": ("subtle short UI tap click, soft wooden tick, video game interface sound effect, single hit", 2, 0.5),
    "draw": ("quick single card swoosh whoosh, paper slide, game sound effect, single short sound", 2, 0.8),
    "play": ("card snapped down on a table, satisfying single slap with soft thud, game sound effect", 2, 0.8),
    "support": ("warm magical support chime, gentle sparkle bell arpeggio, short game sound effect", 3, 1.6),
    "hit": ("punchy impact hit with deep bass thump, game battle attack sound effect, single hit", 2, 0.9),
    "battle": ("dramatic battle start stinger, taiko drum hit with brass horn blast, short intense", 3, 2.0),
    "battle_win": ("short triumphant brass victory stinger, bright and heroic, game sound effect", 3, 2.0),
    "battle_lose": ("short descending sad trombone stinger, deflating, game sound effect", 3, 2.0),
    "battle_tie": ("metallic sword clash stinger, two forces colliding, short dramatic game sound effect", 3, 2.0),
    "advance": ("cheerful ascending level up chime, bright marimba and bells going up, positive game sound effect", 3, 1.6),
    "janken": ("single playful taiko drum don hit, japanese festival drum, short game sound effect", 2, 0.8),
    "janken_win": ("happy short win jingle, two bright chime notes, playful game sound effect", 3, 1.6),
    "janken_lose": ("comical womp womp short lose sound, muted trumpet, playful game sound effect", 3, 1.6),
    "chime": ("school chime bell ding dong ding dong, japanese school kin-kon-kan-kon chime, warm bell tones, short", 4, 3.0),
    "engine_start": ("car engine ignition and start, starter motor cranking then engine settles into gentle idle, short, realistic sound effect", 3, 2.0),
    "winker": ("car turn signal indicator clicking, two clean relay clicks tick tock, quiet interior, sound effect", 2, 1.0),
    "win": ("grand victory fanfare, celebratory brass and glockenspiel, short and joyful, game jingle", 5, 3.5),
    "lose": ("gentle melancholic defeat jingle, soft piano phrase, encouraging and warm, short game jingle", 5, 3.5),
}


def gen(name: str, prompt: str, seconds: int, max_sec: float, key: str) -> None:
    body = json.dumps({"prompt": prompt, "seconds_total": seconds}).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/stable-audio",
        data=body,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        data = json.loads(res.read())
    tmp = os.path.join(OUT, f"_{name}_raw")
    with urllib.request.urlopen(data["audio_file"]["url"], timeout=300) as res, open(tmp, "wb") as f:
        f.write(res.read())
    out = os.path.join(OUT, f"{name}.wav")
    # 頭の無音を刈る → 長さを制限 → 音量ならし → 終端を短くフェード
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", tmp,
            "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            f"atrim=0:{max_sec},"
            "loudnorm=I=-15:TP=-1,"
            f"afade=t=out:st={max(0.0, max_sec - 0.12)}:d=0.12",
            "-ac", "1", "-ar", "44100", out,
        ],
        check=True, capture_output=True,
    )
    os.remove(tmp)
    print(f"{name}.wav: {os.path.getsize(out) // 1024}KB")


def main() -> None:
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    names = sys.argv[1:] or list(SES)
    for name in names:
        prompt, seconds, max_sec = SES[name]
        print(f"生成中: {name}...")
        gen(name, prompt, seconds, max_sec, key)


if __name__ == "__main__":
    main()

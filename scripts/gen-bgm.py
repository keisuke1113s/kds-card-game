#!/usr/bin/env python3
"""fal.ai (stable-audio) でBGMを生成して assets/audio/ に書き出す。

使い方:
  ~/.fal_key に fal.ai のAPIキーを置いてから
  python3 scripts/gen-bgm.py [名前...]   # 名前省略で全部

生成物はアプリに焼き込む（実行時にfal.aiを呼ぶことはしない）。
キーをリポジトリに入れないこと。生成後は scripts/gen-audio-map.js を実行する。
"""

import json
import os
import subprocess
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

# 名前: (プロンプト, 秒数, 出力形式)
# ループ曲はmp3、効果音扱い（パック開封）はwav
TRACKS = {
    "bgm_home": (
        "cheerful upbeat video game main menu theme, bright marimba and plucky synth melody, "
        "bouncy rhythm, happy driving school adventure mood, seamless loop, instrumental",
        47, "mp3",
    ),
    "bgm_result_win": (
        "triumphant victory fanfare intro then relaxed happy celebration loop, brass hits, "
        "cheerful video game result screen music, warm and rewarding, instrumental",
        30, "mp3",
    ),
    "bgm_result_lose": (
        "melancholic gentle piano and soft strings, sad but warm video game defeat result screen, "
        "slow tempo, encouraging try-again mood, instrumental",
        30, "mp3",
    ),
    "bgm_reach": (
        "fast intense climactic video game music, urgent driving rhythm, racing heartbeat tension, "
        "final lap sirens feel, dramatic synth arpeggios, seamless loop, instrumental",
        40, "mp3",
    ),
    "bgm_lobby": (
        "chill lo-fi hip hop waiting room music, relaxed jazzy chords, soft beat, "
        "cozy lounge atmosphere, seamless loop, instrumental",
        47, "mp3",
    ),
    "bgm_janken": (
        "suspenseful drumroll build-up loop, taiko drums and snare roll, game show decision moment, "
        "playful tension, short seamless loop, instrumental",
        20, "mp3",
    ),
    "bgm_tutorial": (
        "gentle warm acoustic guitar and glockenspiel, friendly tutorial music, calm and welcoming, "
        "soft tempo, children TV show mood, seamless loop, instrumental",
        47, "mp3",
    ),
    "bgm_library": (
        "calm music box and soft pads, nostalgic collection gallery theme, dreamy and quiet, "
        "gentle sparkling melody, seamless loop, instrumental",
        47, "mp3",
    ),
    "bgm_replay": (
        "funky sports broadcast highlight theme, upbeat brass and electric bass groove, "
        "TV replay show energy, seamless loop, instrumental",
        40, "mp3",
    ),
    "pack_open": (
        "short magical celebratory jingle, rising sparkle glissando into bright fanfare hit, "
        "treasure chest opening reward sound, exciting, instrumental",
        6, "wav",
    ),
}


def gen(name: str, prompt: str, seconds: int, ext: str, key: str) -> None:
    body = json.dumps({"prompt": prompt, "seconds_total": seconds}).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/stable-audio",
        data=body,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=300) as res:
        data = json.loads(res.read())
    url = data["audio_file"]["url"]
    tmp = os.path.join(OUT, f"_{name}_raw")
    with urllib.request.urlopen(url, timeout=300) as res, open(tmp, "wb") as f:
        f.write(res.read())
    out = os.path.join(OUT, f"{name}.{ext}")
    if ext == "mp3":
        # 128kbps・音量ならし・端の無音を軽く整えてサイズを抑える
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp, "-af", "loudnorm=I=-16:TP=-1.5", "-b:a", "128k", out],
            check=True, capture_output=True,
        )
    else:
        subprocess.run(
            ["ffmpeg", "-y", "-i", tmp, "-af", "loudnorm=I=-14:TP=-1", "-ar", "44100", out],
            check=True, capture_output=True,
        )
    os.remove(tmp)
    size = os.path.getsize(out) / 1024
    print(f"{name}.{ext}: {size:.0f}KB")


def main() -> None:
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    names = sys.argv[1:] or list(TRACKS)
    for name in names:
        prompt, seconds, ext = TRACKS[name]
        print(f"生成中: {name} ({seconds}秒)...")
        gen(name, prompt, seconds, ext, key)


if __name__ == "__main__":
    main()

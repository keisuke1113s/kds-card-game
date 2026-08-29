#!/usr/bin/env python3
"""fal.ai (minimax TTS) で実況ボイスを生成して assets/audio/voice_*.wav に書き出す。

使い方:
  ~/.fal_key に fal.ai のAPIキーを置いてから
  python3 scripts/gen-voice.py [名前...]   # 名前省略で全部

生成物はアプリに焼き込む。生成後は scripts/gen-audio-map.js を実行する。
"""

import json
import os
import subprocess
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

VOICE_ID = "Japanese_SportsCoach"  # 熱血コーチ風。無ければ下のFALLBACKを使う
FALLBACK_VOICE_ID = "Japanese_KindLady"

# 名前: (セリフ, 話速)
LINES = {
    "voice_reach": ("リーチ！", 1.15),
    "voice_reach_opp": ("相手がリーチ！", 1.15),
    "voice_double": ("両者リーチ！運命の最終局面！", 1.2),
    "voice_lastbattle": ("ラストバトル！", 1.15),
    "voice_kessyaku": ("けっちゃくー！", 1.1),
    "voice_comeback": ("だいぎゃくてんー！", 1.1),
    "voice_fullline": ("フルライン！", 1.15),
    "voice_start": ("たいせん、かいし！", 1.0),
}


def gen(name: str, text: str, speed: float, key: str, voice_id: str) -> None:
    body = json.dumps(
        {
            "text": text,
            "language_boost": "Japanese",
            "voice_setting": {"voice_id": voice_id, "speed": speed},
        }
    ).encode()
    req = urllib.request.Request(
        "https://fal.run/fal-ai/minimax/speech-02-turbo",
        data=body,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        data = json.loads(res.read())
    tmp = os.path.join(OUT, f"_{name}_raw.mp3")
    with urllib.request.urlopen(data["audio"]["url"], timeout=120) as res, open(tmp, "wb") as f:
        f.write(res.read())
    out = os.path.join(OUT, f"{name}.wav")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", tmp,
            "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            "loudnorm=I=-14:TP=-1,"
            "afade=t=out:st=1.8:d=0.1,atrim=0:1.9",
            "-ac", "1", "-ar", "44100", out,
        ],
        check=True, capture_output=True,
    )
    os.remove(tmp)
    print(f"{name}.wav: {os.path.getsize(out) // 1024}KB")


def main() -> None:
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    names = sys.argv[1:] or list(LINES)
    for name in names:
        text, speed = LINES[name]
        print(f"生成中: {name} 「{text}」...")
        try:
            gen(name, text, speed, key, VOICE_ID)
        except Exception as e:
            print(f"  {VOICE_ID} で失敗（{e}）。{FALLBACK_VOICE_ID} で再試行")
            gen(name, text, speed, key, FALLBACK_VOICE_ID)


if __name__ == "__main__":
    main()

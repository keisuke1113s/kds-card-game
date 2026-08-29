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

# テンションを上げたいボイスの追加設定（感情・声の高さ）
EXTRA = {
    "voice_reach": {"emotion": "surprised", "pitch": 2},
    "voice_reach_opp": {"emotion": "surprised", "pitch": 2},
    "voice_double": {"emotion": "surprised", "pitch": 2},
    "voice_lastbattle": {"emotion": "surprised", "pitch": 2},
    "voice_kessyaku": {"emotion": "surprised", "pitch": 2},
    "voice_comeback": {"emotion": "surprised", "pitch": 2},
    "voice_fullline": {"emotion": "surprised", "pitch": 2},
    "voice_start": {"emotion": "surprised", "pitch": 2},
}

# 名前: (セリフ, 話速, 最大秒数)
LINES = {
    "voice_reach": ("リーチ！！", 1.2, 1.9),
    "voice_reach_opp": ("あいてがリーチ！！", 1.2, 2.2),
    "voice_double": ("りょうしゃリーチ！うんめいの、さいしゅうきょくめん！！", 1.2, 4.2),
    "voice_lastbattle": ("ラストバトルーー！！", 1.2, 2.2),
    "voice_kessyaku": ("けっちゃくううーーー！！", 1.2, 2.6),
    "voice_comeback": ("だいぎゃくてんだあーーー！！", 1.2, 3.0),
    "voice_fullline": ("フルライーン！！", 1.2, 2.0),
    "voice_start": ("たいせん、かいしー！！", 1.1, 2.2),
}


def gen(name: str, text: str, speed: float, max_sec: float, key: str, voice_id: str) -> None:
    voice_setting = {"voice_id": voice_id, "speed": speed}
    voice_setting.update(EXTRA.get(name, {}))
    body = json.dumps(
        {"text": text, "language_boost": "Japanese", "voice_setting": voice_setting}
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
            f"afade=t=out:st={max_sec - 0.1:.1f}:d=0.1,atrim=0:{max_sec}",
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
        text, speed, max_sec = LINES[name]
        print(f"生成中: {name} 「{text}」...")
        try:
            gen(name, text, speed, max_sec, key, VOICE_ID)
        except Exception as e:
            print(f"  {VOICE_ID} で失敗（{e}）。{FALLBACK_VOICE_ID} で再試行")
            gen(name, text, speed, max_sec, key, FALLBACK_VOICE_ID)


if __name__ == "__main__":
    main()

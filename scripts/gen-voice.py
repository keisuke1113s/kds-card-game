#!/usr/bin/env python3
"""fal.ai のTTSで実況ボイスを生成して assets/audio/voice_*.wav に書き出す。

使い方:
  ~/.fal_key に fal.ai のAPIキーを置いてから
  python3 scripts/gen-voice.py [名前...]   # 名前省略で全部

エンジンは ENGINE で切り替え:
  "eleven"  = ElevenLabs eleven-v3（イントネーション高品質・[excited]等の感情タグ対応）
  "minimax" = MiniMax speech-02-turbo（旧版）

生成物はアプリに焼き込む。生成後は scripts/gen-audio-map.js を実行する。
"""

import json
import os
import subprocess
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

ENGINE = "eleven"

# ElevenLabs eleven-v3 の声（実況らしい元気な男性声）
ELEVEN_VOICE = "Charlie"

VOICE_ID = "Japanese_KindLady"  # minimax用
FALLBACK_VOICE_ID = "Japanese_KindLady"

# テンションを上げたいボイスの追加設定（minimax用: 感情・声の高さ）
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

# ElevenLabs用のセリフ（[excited]/[shouting] は感情タグ。漢字OK・language_code=ja）
ELEVEN_LINES = {
    "voice_reach": "[excited] リーチ！！",
    "voice_reach_opp": "[excited] 相手がリーチ！！",
    "voice_double": "[shouting] 両者リーチ！運命の最終局面！！",
    "voice_lastbattle": "[shouting] ラストバトル！！",
    "voice_kessyaku": "[shouting] 決着ーーー！！",
    "voice_comeback": "[shouting] 大逆転だーーー！！",
    "voice_fullline": "[excited] フルライン！！",
    "voice_start": "[excited] 対戦、開始！！",
}

# 名前: (minimax用セリフ, 話速, 最大秒数)
LINES = {
    "voice_reach": ("リーチ！！", 1.2, 2.0),
    "voice_reach_opp": ("あいてがリーチ！！", 1.2, 2.4),
    "voice_double": ("りょうしゃリーチ！うんめいの、さいしゅうきょくめん！！", 1.2, 4.5),
    "voice_lastbattle": ("ラストバトルーー！！", 1.2, 2.4),
    "voice_kessyaku": ("けっちゃくううーーー！！", 1.2, 2.8),
    "voice_comeback": ("だいぎゃくてんだあーーー！！", 1.2, 3.2),
    "voice_fullline": ("フルライーン！！", 1.2, 2.2),
    "voice_start": ("たいせん、かいしー！！", 1.1, 2.4),
}


def tts_request(name: str, text: str, speed: float, key: str, voice_id: str) -> str:
    """TTSを呼んで音声URLを返す"""
    if ENGINE == "eleven":
        body = json.dumps(
            {"text": ELEVEN_LINES.get(name, text), "voice": ELEVEN_VOICE, "language_code": "ja"}
        ).encode()
        url = "https://fal.run/fal-ai/elevenlabs/tts/eleven-v3"
    else:
        voice_setting = {"voice_id": voice_id, "speed": speed}
        voice_setting.update(EXTRA.get(name, {}))
        body = json.dumps(
            {"text": text, "language_boost": "Japanese", "voice_setting": voice_setting}
        ).encode()
        url = "https://fal.run/fal-ai/minimax/speech-02-turbo"
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Authorization": f"Key {key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as res:
        data = json.loads(res.read())
    return data["audio"]["url"]


def gen(name: str, text: str, speed: float, max_sec: float, key: str, voice_id: str) -> None:
    audio_url = tts_request(name, text, speed, key, voice_id)
    tmp = os.path.join(OUT, f"_{name}_raw.mp3")
    with urllib.request.urlopen(audio_url, timeout=180) as res, open(tmp, "wb") as f:
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
    global ENGINE
    key = open(os.path.expanduser("~/.fal_key")).read().strip()
    names = sys.argv[1:] or list(LINES)
    for name in names:
        text, speed, max_sec = LINES[name]
        label = ELEVEN_LINES.get(name, text) if ENGINE == "eleven" else text
        print(f"生成中({ENGINE}): {name} 「{label}」...")
        try:
            gen(name, text, speed, max_sec, key, VOICE_ID)
        except Exception as e:
            print(f"  失敗（{e}）。minimaxで再試行")
            saved = ENGINE
            ENGINE = "minimax"
            try:
                gen(name, text, speed, max_sec, key, FALLBACK_VOICE_ID)
            finally:
                ENGINE = saved


if __name__ == "__main__":
    main()

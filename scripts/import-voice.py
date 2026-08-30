#!/usr/bin/env python3
"""自分で用意した音声ファイルを実況ボイスとして取り込む。

使い方:
  python3 scripts/import-voice.py <ボイス名> <音声ファイル>
  例: python3 scripts/import-voice.py voice_kessyaku ~/Desktop/けっちゃく.m4a

ボイス名の一覧:
  voice_start      対戦開始（VS表示）
  voice_reach      自分のリーチ
  voice_reach_opp  相手のリーチ
  voice_double     両者リーチ（運命の最終局面）
  voice_lastbattle ラストバトル
  voice_kessyaku   決着（最後のゲージ）
  voice_comeback   大逆転勝利
  voice_fullline   フルライン（場に5人）

m4a / mp3 / wav / mov などffmpegが読める形式なら何でもOK。
頭の無音カット・音量ならし・モノラル44.1kHz化を自動で行い、
assets/audio/<ボイス名>.wav に書き出す。
取り込み後は `node scripts/gen-audio-map.js` は不要（同名置き換えのため）。
"""

import os
import subprocess
import sys

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")

# ボイス名: 最大秒数（演出に収まる長さ。長すぎる素材は末尾をフェードで切る）
MAX_SEC = {
    "voice_start": 2.4,
    "voice_reach": 2.0,
    "voice_reach_opp": 2.4,
    "voice_double": 4.5,
    "voice_lastbattle": 2.4,
    "voice_kessyaku": 2.8,
    "voice_comeback": 3.2,
    "voice_fullline": 2.2,
}


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] not in MAX_SEC:
        print(__doc__)
        sys.exit(1)
    name = sys.argv[1]
    src = os.path.expanduser(sys.argv[2])
    if not os.path.exists(src):
        print(f"ファイルが見つかりません: {src}")
        sys.exit(1)
    max_sec = MAX_SEC[name]
    out = os.path.join(OUT, f"{name}.wav")
    subprocess.run(
        [
            "ffmpeg", "-y", "-i", src,
            "-af",
            "silenceremove=start_periods=1:start_threshold=-45dB,"
            "loudnorm=I=-14:TP=-1,"
            f"afade=t=out:st={max_sec - 0.1:.1f}:d=0.1,atrim=0:{max_sec}",
            "-ac", "1", "-ar", "44100", out,
        ],
        check=True,
    )
    print(f"取り込みました: {out}（{os.path.getsize(out) // 1024}KB）")
    print("アプリに反映するにはコミット＆デプロイしてください")


if __name__ == "__main__":
    main()

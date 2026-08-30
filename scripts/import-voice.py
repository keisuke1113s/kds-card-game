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
    "voice_battle": 2.4,       # バトル宣言
    "voice_battlewin": 2.2,    # バトル勝利
    "voice_tie": 2.0,          # 相打ち
    "voice_close": 2.2,        # 大接戦バトル
    "voice_flip": 2.2,         # 形勢逆転
    "voice_result_win": 3.2,   # 勝利リザルト
    "voice_result_lose": 3.2,  # 敗北リザルト
    "voice_kentei": 4.2,       # 卒業検定開始
    "voice_perfect": 3.0,      # 完全勝利
    "voice_setback": 4.4,      # 大幅に戻された
    "voice_lasthand": 1.8,     # 手札ラスト1枚
    "voice_decklow": 3.8,      # 山札残りわずか
    "voice_out": 3.0,          # 場外送り
    "voice_streak": 2.8,       # 連勝バナー
    "voice_heat_s": 2.6,       # 名勝負度S
    "voice_revenge": 3.8,      # 因縁の再戦
    "voice_janken": 1.6,
    "voice_janken_win": 1.6,
    "voice_janken_lose": 3.2,
    "voice_aiko": 2.0,
    "voice_mulligan": 1.6,
    "voice_support": 2.0,
    "voice_ability": 2.0,
    "voice_chain": 1.8,
    "voice_bigstep": 2.0,
    "voice_openfield": 3.0,
    "voice_wipedout": 2.0,
    "voice_longgame": 2.2,
    "voice_mikiwame": 3.2,
    # ---- 追加実況・第2弾 ----
    "voice_counter": 2.4,      # カウンター（防御側がサポートで逆転勝ち）
    "voice_holdout": 2.2,      # 守り切り（防御側のまま勝利）
    "voice_battlestreak": 2.8, # バトル3連勝
    "voice_ace": 2.2,          # エース登場（最高戦闘力）
    "voice_reinforce": 2.4,    # 怒涛の増援（1ターン2枚出し）
    "voice_gakka": 2.6,        # 学科修了
    "voice_ginou": 2.8,        # 技能修了
    "voice_bigsupport": 2.6,   # 強烈なサポート（+3以上）
    "voice_momentum": 2.4,     # 波に乗る（3ターン連続前進）
    "voice_pitstop": 2.4,      # 作戦タイム（休憩・抽選）
    # ---- 追加実況・第3弾 ----
    "voice_giantkill": 2.8,    # ジャイアントキリング
    "voice_mirror": 2.6,       # 同門対決
    "voice_topdeck": 2.4,      # 引いて即投入
    "voice_purebattle": 2.2,   # 真っ向勝負（サポート無し決着）
    "voice_sabotage": 2.4,     # 妨害成功（相手の教習を後退）
    "voice_chance": 2.6,       # 攻め時到来（相手全員休憩中）
    "voice_deathmatch": 2.6,   # 死闘（サポート5枚以上）
    "voice_pursuit": 2.4,      # 猛追（大差から追い上げ）
    "voice_solo": 2.4,         # 孤軍奮闘（少数側がバトル勝ち）
    "voice_tripledraw": 3.0,   # まさかの珍事（引き分け3回）
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

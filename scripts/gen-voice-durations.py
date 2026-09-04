#!/usr/bin/env python3
"""assets/audio/voice_*.wav の実長を測り src/data/voiceDurations.ts を生成する。

実況ボイスの1チャンネル制（重なり防止）は再生中ボイスの長さで次を待たせるが、
ネイティブ（expo-audio）は再生前に長さを取得できず一律2.2秒と見なしていた。
それより長いボイスで次の実況が重なるため、実長の表を焼き込んで参照する。
ボイス追加・再取り込みのたびに実行する（import-voice.py が自動で呼ぶ）。
"""
import contextlib
import glob
import os
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

entries = []
for f in sorted(glob.glob(os.path.join(ROOT, "assets/audio/voice_*.wav"))):
    name = os.path.basename(f)[:-4]
    with contextlib.closing(wave.open(f, "rb")) as w:
        dur = w.getnframes() / w.getframerate()
    entries.append((name, round(dur, 2)))

lines = [
    "// このファイルは scripts/gen-voice-durations.py が自動生成する。手で編集しない。",
    "// 実況ボイスの実際の長さ（秒）。ネイティブは再生前に長さを取得できないため、",
    "// 1チャンネル制（重なり防止）の待ち時間をこの表から引く。",
    "export const VOICE_DURATIONS: Record<string, number> = {",
]
for name, dur in entries:
    lines.append(f"  {name}: {dur},")
lines.append("};")
with open(os.path.join(ROOT, "src/data/voiceDurations.ts"), "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"{len(entries)}本のボイスの長さを書き出しました → src/data/voiceDurations.ts")

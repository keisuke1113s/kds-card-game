import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { ScreenEnter } from "@/components/ScreenEnter";
import { evaluateAchievements } from "@/store/achievementStore";
import { useKytStore } from "@/store/kytStore";
import { colors, radius, spacing } from "@/theme";

/**
 * 危険予測トレーニング（KYT）。
 * 教習所で行う「この場面のどこが危ない？」を、イラスト場面の中の
 * 危険ポイントをタップして当てるミニゲームにしたもの。
 */

interface KytSpot {
  /** 場面内の位置（%） */
  x: number;
  y: number;
  emoji: string;
  label: string;
}

interface KytScene {
  title: string;
  desc: string;
  /** 場面の装飾（背景に大きく敷く絵文字と説明） */
  deco: { x: number; y: number; emoji: string; size?: number }[];
  spots: KytSpot[];
  correctIndex: number;
  explain: string;
}

const SCENES: KytScene[] = [
  {
    title: "住宅街を走行中",
    desc: "時速30kmで住宅街を走っています。最も注意すべきなのはどれ？",
    deco: [{ x: 8, y: 12, emoji: "🏠" }, { x: 78, y: 10, emoji: "🏠" }, { x: 42, y: 8, emoji: "🏠" }],
    spots: [
      { x: 18, y: 55, emoji: "🚚", label: "路上駐車のトラック" },
      { x: 62, y: 68, emoji: "⚽", label: "転がってきたボール" },
      { x: 84, y: 40, emoji: "🚶", label: "歩道を歩く大人" },
    ],
    correctIndex: 1,
    explain: "ボールの後には、追いかける子どもが飛び出してくる可能性が高い！すぐ止まれる速度に落とそう。トラックの陰からの飛び出しにも注意。",
  },
  {
    title: "交差点で右折待ち",
    desc: "対向の車が道を譲ってくれました。右折するとき最も注意すべきなのはどれ？",
    deco: [{ x: 10, y: 8, emoji: "🚦" }, { x: 80, y: 6, emoji: "🏢" }],
    spots: [
      { x: 30, y: 45, emoji: "🚗", label: "譲ってくれた対向車" },
      { x: 44, y: 62, emoji: "🏍", label: "対向車の陰" },
      { x: 82, y: 30, emoji: "🚶", label: "右折先の横断歩道" },
    ],
    correctIndex: 1,
    explain: "対向車の陰からバイクがすり抜けてくる「サンキュー事故」の典型場面！右折先の歩行者も要確認ですが、まず死角のバイクが最重要。",
  },
  {
    title: "バス停のそば",
    desc: "前方のバス停にバスが停車中。追い越すとき最も注意すべきなのはどれ？",
    deco: [{ x: 6, y: 10, emoji: "🚏" }, { x: 75, y: 8, emoji: "🌳" }],
    spots: [
      { x: 20, y: 52, emoji: "🚌", label: "停車中のバス" },
      { x: 38, y: 70, emoji: "🚶", label: "バスの前方（死角）" },
      { x: 80, y: 45, emoji: "🚗", label: "後続車" },
    ],
    correctIndex: 1,
    explain: "バスを降りた人がバスの前を横切って渡ってくるのが最も危険。バスの陰は完全な死角なので、徐行して備えよう。",
  },
  {
    title: "夜の郊外の道",
    desc: "街灯の少ない夜道を走行中。最も注意すべきなのはどれ？",
    deco: [{ x: 10, y: 8, emoji: "🌙" }, { x: 78, y: 12, emoji: "⭐" }],
    spots: [
      { x: 25, y: 60, emoji: "🚲", label: "無灯火の自転車" },
      { x: 60, y: 40, emoji: "🚗", label: "対向車のライト" },
      { x: 84, y: 65, emoji: "🏠", label: "道ぞいの家" },
    ],
    correctIndex: 0,
    explain: "無灯火の自転車は直前まで見えない最大の危険。ハイビームを活用し、路肩側を特に警戒しよう。",
  },
  {
    title: "冬の橋にさしかかる",
    desc: "気温0度の朝、橋を渡ります。最も注意すべきなのはどれ？",
    deco: [{ x: 8, y: 10, emoji: "❄️" }, { x: 76, y: 8, emoji: "🌊" }],
    spots: [
      { x: 50, y: 55, emoji: "🌉", label: "橋の上の路面" },
      { x: 18, y: 42, emoji: "🚗", label: "前方の車" },
      { x: 82, y: 60, emoji: "🐦", label: "川の鳥" },
    ],
    correctIndex: 0,
    explain: "橋の上は地面より冷えて凍結しやすい場所の代表。見た目が黒く濡れているだけでも凍結（ブラックアイスバーン）を疑い、手前で減速を。",
  },
];

export default function KytScreen() {
  const router = useRouter();
  const kyt = useKytStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);

  const scene = SCENES[index];

  const start = () => {
    setIndex(0);
    setCorrectCount(0);
    setPicked(null);
    setPhase("play");
  };

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === scene.correctIndex;
    if (ok) {
      setCorrectCount((c) => c + 1);
      playSe("janken_win");
      haptic("success");
    } else {
      playSe("hit");
      haptic("warning");
    }
  };

  const next = () => {
    if (index + 1 >= SCENES.length) {
      const final = correctCount;
      kyt.addResult(final, SCENES.length);
      if (final >= SCENES.length) playSe("win");
      setPhase("result");
      setTimeout(evaluateAchievements, 400);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>⚠️ 危険予測トレーニング</Text>
            <Text style={styles.note}>
              教習所でおなじみのKYT（危険予測トレーニング）！{"\n"}
              場面の中で「いちばん危ないところ」をタップして当てよう。全{SCENES.length}問。
            </Text>
            {kyt.plays > 0 && (
              <Text style={styles.record}>
                これまで {kyt.plays}回挑戦 ／ 最高 {kyt.best}問正解
                {kyt.cleared ? " ／ 🏅全問クリア済み" : ""}
              </Text>
            )}
            <Pressable style={[styles.wideButton, { backgroundColor: "#e8590c" }]} onPress={start}>
              <Text style={styles.wideButtonText}>スタート！</Text>
            </Pressable>
          </View>
        )}

        {phase === "play" && (
          <View style={styles.card}>
            <Text style={styles.progress}>
              場面 {index + 1} / {SCENES.length}　（正解 {correctCount}）
            </Text>
            <Text style={styles.sceneTitle}>{scene.title}</Text>
            <Text style={styles.note}>{scene.desc}</Text>

            {/* 場面イラスト（道路の上に危険ポイントを配置） */}
            <View style={styles.scene}>
              <View style={styles.sky} />
              <View style={styles.roadside} />
              <View style={styles.road}>
                <View style={styles.centerLine} />
              </View>
              {scene.deco.map((d, i) => (
                <Text
                  key={`d${i}`}
                  style={[styles.deco, { left: `${d.x}%`, top: `${d.y}%`, fontSize: d.size ?? 26 }]}
                  allowFontScaling={false}
                >
                  {d.emoji}
                </Text>
              ))}
              {scene.spots.map((sp, i) => (
                <Pressable
                  key={`s${i}`}
                  style={[styles.spot, { left: `${sp.x}%`, top: `${sp.y}%` }]}
                  onPress={() => choose(i)}
                >
                  <Text style={styles.spotEmoji} allowFontScaling={false}>
                    {sp.emoji}
                  </Text>
                  {picked !== null && i === scene.correctIndex && (
                    <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.spotMark}>
                      ⚠️
                    </Animated.Text>
                  )}
                </Pressable>
              ))}
            </View>

            {picked === null ? (
              <View style={styles.labelList}>
                {scene.spots.map((sp, i) => (
                  <Pressable key={i} style={styles.labelButton} onPress={() => choose(i)}>
                    <Text style={styles.labelButtonText}>
                      {sp.emoji} {sp.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text
                  style={[
                    styles.judge,
                    { color: picked === scene.correctIndex ? colors.success : colors.danger },
                  ]}
                >
                  {picked === scene.correctIndex
                    ? "⭕ その通り！"
                    : `❌ 惜しい！正解は「${scene.spots[scene.correctIndex].label}」`}
                </Text>
                <Text style={styles.explain}>{scene.explain}</Text>
                <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={next}>
                  <Text style={styles.wideButtonText}>
                    {index + 1 >= SCENES.length ? "結果を見る" : "次の場面へ"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {phase === "result" && (
          <View style={styles.card}>
            <Text style={styles.title}>
              {correctCount >= SCENES.length
                ? "🏅 全問クリア！"
                : correctCount >= 3
                  ? "💮 いいセンス！"
                  : "📚 おつかれさま！"}
            </Text>
            <Text style={styles.resultScore}>
              {correctCount} <Text style={styles.resultTotal}>/ {SCENES.length} 問正解</Text>
            </Text>
            <Text style={styles.note}>
              {correctCount >= SCENES.length
                ? "危険を先読みできる目が育っています。実際の運転でも「かもしれない」を忘れずに！"
                : "危険は「見えないところ」に隠れています。もう一度挑戦してみよう！"}
            </Text>
            <Pressable style={[styles.wideButton, { backgroundColor: "#e8590c" }]} onPress={start}>
              <Text style={styles.wideButtonText}>もう一度挑戦する</Text>
            </Pressable>
            <Pressable
              style={[styles.wideButton, { backgroundColor: colors.textMuted }]}
              onPress={() => router.replace("/")}
            >
              <Text style={styles.wideButtonText}>ホームに戻る</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  sceneTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  progress: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  scene: {
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#cfe3f5",
  },
  sky: { position: "absolute", top: 0, left: 0, right: 0, height: "35%", backgroundColor: "#cfe3f5" },
  roadside: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    height: "15%",
    backgroundColor: "#9ec78a",
  },
  road: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#6b7280",
    justifyContent: "center",
  },
  centerLine: { height: 4, backgroundColor: "#fff", opacity: 0.8, marginHorizontal: 8, borderRadius: 2 },
  deco: { position: "absolute" },
  spot: { position: "absolute", alignItems: "center" },
  spotEmoji: { fontSize: 34 },
  spotMark: { position: "absolute", top: -18, fontSize: 22 },
  labelList: { gap: 8 },
  labelButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  labelButtonText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  judge: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  explain: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
  },
  resultScore: { fontSize: 40, fontWeight: "900", color: colors.primaryDark, textAlign: "center" },
  resultTotal: { fontSize: 18, color: colors.textMuted },
  wideButton: { paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  wideButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { ScreenEnter } from "@/components/ScreenEnter";
import { evaluateAchievements } from "@/store/achievementStore";
import { useKytStore } from "@/store/kytStore";
import { KYT_SCENES, KytBg, KytScene } from "@/data/kytScenes";
import { colors, radius, spacing } from "@/theme";

/**
 * 危険予測トレーニング（KYT）。
 * 教習所で行う「この場面のどこが危ない？」を、イラスト場面の中の
 * 危険ポイントをタップして当てるミニゲームにしたもの。
 */

const SET_SIZE = 5;

/** まだ正解していない場面を優先しつつ、毎回ランダムに5問選ぶ */
function pickScenes(masteredIds: string[]): KytScene[] {
  const mastered = new Set(masteredIds);
  const fresh = KYT_SCENES.filter((sc) => !mastered.has(sc.id));
  const done = KYT_SCENES.filter((sc) => mastered.has(sc.id));
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return [...shuffle(fresh), ...shuffle(done)].slice(0, SET_SIZE);
}

/** 背景バリエーションの配色 */
const BG_COLORS: Record<KytBg, { sky: string; side: string; road: string }> = {
  day: { sky: "#cfe3f5", side: "#9ec78a", road: "#6b7280" },
  crossing: { sky: "#cfe3f5", side: "#9ec78a", road: "#6b7280" },
  night: { sky: "#1c2440", side: "#2c3a2e", road: "#3a4049" },
  snow: { sky: "#dfe8f2", side: "#eef3f9", road: "#c6d2dd" },
  rain: { sky: "#9fb0c0", side: "#7f9f78", road: "#535e6b" },
  parking: { sky: "#d7dde5", side: "#d7dde5", road: "#8b95a1" },
};

export default function KytScreen() {
  const router = useRouter();
  const kyt = useKytStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [scenes, setScenes] = useState<KytScene[]>([]);
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [runMastered, setRunMastered] = useState<string[]>([]);

  const scene = scenes[index];

  const start = () => {
    setScenes(pickScenes(kyt.masteredIds));
    setIndex(0);
    setCorrectCount(0);
    setPicked(null);
    setRunMastered([]);
    setPhase("play");
  };

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === scene.correctIndex;
    if (ok) {
      setCorrectCount((c) => c + 1);
      setRunMastered((m) => [...m, scene.id]);
      playSe("janken_win");
      haptic("success");
    } else {
      playSe("hit");
      haptic("warning");
    }
  };

  const next = () => {
    if (index + 1 >= scenes.length) {
      const final = correctCount;
      kyt.addResult(final, scenes.length);
      kyt.markMastered(runMastered);
      if (final >= scenes.length) playSe("win");
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
              場面の中で「いちばん危ないところ」をタップして当てよう。{"\n"}
              全{KYT_SCENES.length}場面からランダムに{SET_SIZE}問出題。まだ正解していない場面が優先して出ます。
            </Text>
            <Text style={styles.record}>
              🦺 場面制覇 {kyt.masteredIds.length} / {KYT_SCENES.length}
              {kyt.masteredIds.length >= KYT_SCENES.length ? "　🏆 全場面制覇！" : ""}
            </Text>
            {kyt.plays > 0 && (
              <Text style={styles.record}>
                これまで {kyt.plays}回挑戦{kyt.cleared ? " ／ 🏅5問パーフェクト達成済み" : ""}
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
              場面 {index + 1} / {scenes.length}　（正解 {correctCount}）
            </Text>
            <Text style={styles.sceneTitle}>{scene.title}</Text>
            <Text style={styles.note}>{scene.desc}</Text>

            {/* 場面イラスト（道路の上に危険ポイントを配置） */}
            <View style={[styles.scene, { backgroundColor: BG_COLORS[scene.bg].sky }]}>
              <View style={[styles.sky, { backgroundColor: BG_COLORS[scene.bg].sky }]} />
              <View style={[styles.roadside, { backgroundColor: BG_COLORS[scene.bg].side }]} />
              <View style={[styles.road, { backgroundColor: BG_COLORS[scene.bg].road }]}>
                <View style={styles.centerLine} />
              </View>
              {/* 交差点: 縦の道を足す / 駐車場: 白枠線を敷く */}
              {scene.bg === "crossing" && (
                <View style={[styles.crossRoad, { backgroundColor: BG_COLORS[scene.bg].road }]} />
              )}
              {scene.bg === "parking" &&
                [15, 35, 55, 75].map((x) => (
                  <View key={x} style={[styles.parkLine, { left: `${x}%` }]} />
                ))}
              {scene.bg === "rain" && (
                <Text style={styles.rainMark} allowFontScaling={false}>💧　💧　💧</Text>
              )}
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
                    {index + 1 >= scenes.length ? "結果を見る" : "次の場面へ"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {phase === "result" && (
          <View style={styles.card}>
            <Text style={styles.title}>
              {correctCount >= scenes.length
                ? "🏅 全問クリア！"
                : correctCount >= 3
                  ? "💮 いいセンス！"
                  : "📚 おつかれさま！"}
            </Text>
            <Text style={styles.resultScore}>
              {correctCount} <Text style={styles.resultTotal}>/ {scenes.length} 問正解</Text>
            </Text>
            <Text style={styles.record}>
              🦺 場面制覇 {kyt.masteredIds.length} / {KYT_SCENES.length}
            </Text>
            <Text style={styles.note}>
              {kyt.masteredIds.length >= KYT_SCENES.length
                ? "全場面制覇おめでとう！危険を先読みできる目が育っています。"
                : correctCount >= scenes.length
                  ? "この調子で全場面制覇を目指そう！"
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
  title: { fontSize: 22, fontWeight: "900", color: "#c74e0a", textAlign: "center" },
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
  crossRoad: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "38%",
    width: "24%",
    opacity: 0.9,
  },
  parkLine: {
    position: "absolute",
    top: "55%",
    bottom: "8%",
    width: 4,
    backgroundColor: "#ffffffcc",
    borderRadius: 2,
  },
  rainMark: { position: "absolute", top: "20%", left: "18%", fontSize: 18, opacity: 0.7 },
  spot: { position: "absolute", alignItems: "center" },
  spotEmoji: { fontSize: 34 },
  spotMark: { position: "absolute", top: -18, fontSize: 22 },
  labelList: { gap: 8 },
  labelButton: {
    borderWidth: 1.5,
    borderColor: "#e8590c",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  labelButtonText: { fontSize: 14, fontWeight: "700", color: "#c74e0a" },
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

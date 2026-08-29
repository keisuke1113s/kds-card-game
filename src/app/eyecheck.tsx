import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { ScreenEnter } from "@/components/ScreenEnter";
import { evaluateAchievements } from "@/store/achievementStore";
import { useVisionStore } from "@/store/visionStore";
import { colors, radius, spacing } from "@/theme";

/**
 * 動体視力チェック。
 * 教習所の適性検査でおなじみのランドルト環（Cの輪）の切れ目の向きを
 * 制限時間30秒でどんどん当てていく反射神経ゲーム。
 */

type Dir = "up" | "down" | "left" | "right";
const DIRS: Dir[] = ["up", "down", "left", "right"];
const DIR_DEG: Record<Dir, string> = { right: "0deg", down: "90deg", left: "180deg", up: "270deg" };
const DIR_ARROW: Record<Dir, string> = { up: "⬆️", down: "⬇️", left: "⬅️", right: "➡️" };
const TIME_LIMIT = 30;

/** ランドルト環。切れ目の向きに回転させる */
function LandoltC({ dir, size }: { dir: Dir; size: number }) {
  const ring = size;
  const thick = size * 0.22;
  const gap = size * 0.24;
  return (
    <View style={{ width: ring, height: ring, transform: [{ rotate: DIR_DEG[dir] }] }}>
      <View
        style={{
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: thick,
          borderColor: "#1c2a3a",
        }}
      />
      {/* 切れ目（右向きが基準） */}
      <View
        style={{
          position: "absolute",
          right: -2,
          top: ring / 2 - gap / 2,
          width: thick + 4,
          height: gap,
          backgroundColor: colors.surface,
        }}
      />
    </View>
  );
}

export default function EyeCheckScreen() {
  const router = useRouter();
  const vision = useVisionStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [dir, setDir] = useState<Dir>("right");
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [flash, setFlash] = useState<"ok" | "ng" | null>(null);
  const doneRef = useRef(false);

  const nextRing = (prev: Dir) => {
    let d = prev;
    while (d === prev) d = DIRS[Math.floor(Math.random() * DIRS.length)];
    setDir(d);
  };

  const start = () => {
    doneRef.current = false;
    setScore(0);
    setMisses(0);
    setTimeLeft(TIME_LIMIT);
    nextRing(dir);
    setPhase("play");
  };

  useEffect(() => {
    if (phase !== "play") return;
    const h = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(h);
          if (!doneRef.current) {
            doneRef.current = true;
            setPhase("result");
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 結果の記録（result になった瞬間に1回だけ）
  useEffect(() => {
    if (phase !== "result") return;
    vision.addResult(score);
    if (score >= 15) playSe("win");
    setTimeout(evaluateAchievements, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const answer = (d: Dir) => {
    if (phase !== "play") return;
    if (d === dir) {
      setScore((s) => s + 1);
      setFlash("ok");
      playSe("tap", 1.3);
    } else {
      setMisses((m) => m + 1);
      setFlash("ng");
      playSe("hit");
      haptic("warning");
    }
    setTimeout(() => setFlash(null), 160);
    nextRing(d === dir ? dir : d);
  };

  // 正解数が増えるほど輪が小さくなる（動体視力っぽさ）
  const ringSize = Math.max(46, 110 - score * 4);

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>👁 動体視力チェック</Text>
            <Text style={styles.note}>
              適性検査でおなじみ「Cの輪（ランドルト環）」！{"\n"}
              切れ目の向きを{TIME_LIMIT}秒間でどんどん答えよう。正解するほど輪が小さくなるよ。
            </Text>
            {vision.plays > 0 && (
              <Text style={styles.record}>
                これまで {vision.plays}回挑戦 ／ 最高 {vision.best}問正解
              </Text>
            )}
            <AppButton label="スタート！" tone="primary" fullWidth onPress={start} />
            <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />
          </View>
        )}

        {phase === "play" && (
          <View style={styles.card}>
            <View style={styles.playHeader}>
              <Text style={styles.progress}>正解 {score}　ミス {misses}</Text>
              <Text style={[styles.timer, timeLeft <= 5 && { color: colors.danger }]}>
                ⏱ {timeLeft}秒
              </Text>
            </View>
            <View
              style={[
                styles.ringArea,
                flash === "ok" && { backgroundColor: "#e6f7ea" },
                flash === "ng" && { backgroundColor: "#fdeaea" },
              ]}
            >
              <LandoltC dir={dir} size={ringSize} />
            </View>
            <Text style={styles.hint}>切れ目はどっち向き？</Text>
            <View style={styles.arrowGrid}>
              <View style={styles.arrowRow}>
                <ArrowButton d="up" onPress={answer} />
              </View>
              <View style={styles.arrowRow}>
                <ArrowButton d="left" onPress={answer} />
                <ArrowButton d="down" onPress={answer} />
                <ArrowButton d="right" onPress={answer} />
              </View>
            </View>
          </View>
        )}

        {phase === "result" && (
          <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.card}>
            <Text style={styles.title}>
              {score >= 20 ? "🦅 ハヤブサの目！" : score >= 15 ? "👀 バツグンの動体視力！" : score >= 8 ? "💮 なかなかの反応！" : "📚 おつかれさま！"}
            </Text>
            <Text style={styles.resultScore}>
              {score} <Text style={styles.resultTotal}>問正解（ミス {misses}）</Text>
            </Text>
            <Text style={styles.note}>
              {score >= 15
                ? "実際の運転でも「早く気づく」は最大の安全装備。すばらしい！"
                : "動体視力は疲れや年齢でも変わります。目を休めてまた挑戦してね。"}
            </Text>
            <Text style={styles.record}>最高記録 {Math.max(vision.best, score)}問</Text>
            <AppButton label="もう一度挑戦" tone="primary" fullWidth onPress={start} />
            <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.replace("/")} />
          </Animated.View>
        )}
      </ScrollView>
    </ScreenEnter>
  );
}

function ArrowButton({ d, onPress }: { d: Dir; onPress: (d: Dir) => void }) {
  return (
    <Pressable style={styles.arrowButton} onPress={() => onPress(d)}>
      <Text style={styles.arrowText} allowFontScaling={false}>
        {DIR_ARROW[d]}
      </Text>
    </Pressable>
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
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  progress: { fontSize: 14, fontWeight: "800", color: colors.text },
  timer: { fontSize: 14, fontWeight: "900", color: colors.primaryDark },
  playHeader: { flexDirection: "row", justifyContent: "space-between" },
  ringArea: {
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
  hint: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  arrowGrid: { gap: 8 },
  arrowRow: { flexDirection: "row", justifyContent: "center", gap: 8 },
  arrowButton: {
    width: 84,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { fontSize: 26 },
  resultScore: { fontSize: 40, fontWeight: "900", color: colors.primaryDark, textAlign: "center" },
  resultTotal: { fontSize: 16, color: colors.textMuted },
});

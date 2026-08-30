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
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

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
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;

  const router = useRouter();
  const vision = useVisionStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  /** 追加種目（反応速度・周辺視野・選択反応）。null なら種目メニュー */
  const [mode, setMode] = useState<"reaction" | "periph" | "choice" | null>(null);
  const [dir, setDir] = useState<Dir>("right");
  const [ringKey, setRingKey] = useState(0);
  // 瞬間視: 輪は一瞬しか見えない（正解が増えるほど短くなる）
  const [ringVisible, setRingVisible] = useState(true);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [flash, setFlash] = useState<"ok" | "ng" | null>(null);
  const doneRef = useRef(false);

  const nextRing = (prev: Dir) => {
    let d = prev;
    while (d === prev) d = DIRS[Math.floor(Math.random() * DIRS.length)];
    setDir(d);
    setRingKey((k) => k + 1);
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

  // 瞬間視: 新しい輪が出たら、一定時間後に隠す（スコアで短縮 1300→350ms）
  useEffect(() => {
    if (phase !== "play") return;
    setRingVisible(true);
    const visibleMs = Math.max(350, 1300 - score * 60);
    const t = setTimeout(() => setRingVisible(false), visibleMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringKey, phase]);

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

  // 正解数が増えるほど輪が小さく・動きが速くなる（動体視力！）
  const ringSize = Math.max(30, 100 - score * 5);
  const driftMs = Math.max(850, 2200 - score * 90);

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && mode === null && (
          <View style={styles.card}>
            <Text style={styles.title}>👁 動体視力チェック</Text>
            <Text style={styles.note}>
              適性検査でおなじみ「Cの輪（ランドルト環）」！{"\n"}
              切れ目の向きを{TIME_LIMIT}秒間でどんどん答えよう。{"\n"}
              輪は動きながら一瞬で隠れる！正解するほど小さく・速くなるよ。
            </Text>
            {vision.plays > 0 && (
              <Text style={styles.record}>
                これまで {vision.plays}回挑戦 ／ 動体視力 最高 {vision.best}問
              </Text>
            )}
            <AppButton label="👁 動体視力をはじめる" tone="primary" fullWidth onPress={start} />

            {/* 追加種目（実際の適性検査に近い測定を4種そろえた） */}
            <View style={styles.menuBox}>
              <Text style={styles.menuTitle}>⚡ 反応速度テスト</Text>
              <Text style={styles.menuNote}>
                信号が青に変わったら素早くタップ×5回。フライングは無効！
                {vision.bestReaction !== null &&
                  `　自己ベスト: 平均${vision.bestReaction.toFixed(2)}秒`}
              </Text>
              <AppButton
                label="挑戦する"
                custom={{ bg: "#e8890c" }}
                fullWidth
                onPress={() => setMode("reaction")}
              />
            </View>
            <View style={styles.menuBox}>
              <Text style={styles.menuTitle}>🔭 周辺視野テスト</Text>
              <Text style={styles.menuNote}>
                中央の「＋」を見つめたまま、四隅に一瞬光る星の場所を当てる×8回。
                {vision.bestPeriph > 0 && `　自己ベスト: ${vision.bestPeriph}/8`}
              </Text>
              <AppButton
                label="挑戦する"
                custom={{ bg: "#3d8fd0" }}
                fullWidth
                onPress={() => setMode("periph")}
              />
            </View>
            <View style={styles.menuBox}>
              <Text style={styles.menuTitle}>🚦 選択反応テスト</Text>
              <Text style={styles.menuNote}>
                青は押す・赤は押さない！とっさの判断の正確さを測る×12回。
                {vision.bestChoice > 0 && `　自己ベスト: ${vision.bestChoice}/12`}
              </Text>
              <AppButton
                label="挑戦する"
                custom={{ bg: "#b0413e" }}
                fullWidth
                onPress={() => setMode("choice")}
              />
            </View>
            <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />
          </View>
        )}

        {phase === "start" && mode === "reaction" && (
          <ReactionTest onClose={() => setMode(null)} />
        )}
        {phase === "start" && mode === "periph" && <PeriphTest onClose={() => setMode(null)} />}
        {phase === "start" && mode === "choice" && <ChoiceTest onClose={() => setMode(null)} />}

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
              {/* 輪は左右に流れながら一瞬で隠れる。見えている間に向きを覚えよう */}
              <View
                {...({ dataSet: { kdsanim: "drift" } } as object)}
                style={{
                  animationDuration: `${driftMs}ms`,
                  animationTimingFunction: "ease-in-out",
                  animationIterationCount: "infinite",
                } as never}
              >
                {ringVisible ? (
                  <LandoltC dir={dir} size={ringSize} />
                ) : (
                  <Text style={styles.hiddenRing} allowFontScaling={false}>❔</Text>
                )}
              </View>
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
  menuBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  menuTitle: { fontSize: 15, fontWeight: "900", color: colors.text },
  menuNote: { fontSize: 12, lineHeight: 18, color: colors.textMuted },
  bigScore: { fontSize: 40, fontWeight: "900", color: colors.primary, textAlign: "center" },
  reactionArea: {
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: "#5c6a7a",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionText: { color: "#fff", fontSize: 22, fontWeight: "900", textAlign: "center" },
  periphArea: {
    height: 320,
    borderRadius: radius.lg,
    backgroundColor: "#14202e",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  periphCross: { color: "#fff", fontSize: 36, fontWeight: "900" },
  periphCorner: {
    position: "absolute",
    width: 110,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  periphCornerActive: { backgroundColor: "#ffffff10", borderRadius: 12 },
  periphStar: { fontSize: 34 },
  periphAsk: {
    position: "absolute",
    bottom: 8,
    color: "#ffd54d",
    fontSize: 13,
    fontWeight: "800",
  },
  choiceArea: {
    height: 280,
    borderRadius: radius.lg,
    backgroundColor: "#1c2a3a",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceDot: { width: 130, height: 130, borderRadius: 65 },
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
  title: { fontSize: 22, fontWeight: "900", color: "#1a5fb4", textAlign: "center" },
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
  hiddenRing: { fontSize: 40, opacity: 0.35 },
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

/** ⚡ 反応速度テスト: 信号が青になったらタップ×5回 */
function ReactionTest({ onClose }: { onClose: () => void }) {
  const addReaction = useVisionStore((s) => s.addReaction);
  const [stage, setStage] = useState<"idle" | "wait" | "go" | "false" | "done">("idle");
  const [times, setTimes] = useState<number[]>([]);
  const goAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const beginTrial = () => {
    setStage("wait");
    timerRef.current = setTimeout(() => {
      goAtRef.current = performance.now();
      setStage("go");
      playSe("chime");
    }, 1000 + Math.random() * 2000);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const tap = () => {
    if (stage === "idle") {
      setTimes([]);
      beginTrial();
      return;
    }
    if (stage === "wait") {
      // フライング: このトライアルはやり直し
      if (timerRef.current) clearTimeout(timerRef.current);
      haptic("warning");
      playSe("hit");
      setStage("false");
      return;
    }
    if (stage === "false") {
      beginTrial();
      return;
    }
    if (stage === "go") {
      const sec = (performance.now() - goAtRef.current) / 1000;
      const next = [...times, sec];
      setTimes(next);
      playSe("tap", 1.3);
      haptic("light");
      if (next.length >= 5) {
        const avg = next.reduce((a, b) => a + b, 0) / next.length;
        addReaction(Math.round(avg * 1000) / 1000);
        playSe("achievement");
        setStage("done");
        setTimeout(evaluateAchievements, 400);
      } else {
        beginTrial();
      }
    }
  };

  const avg = times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const fastest = times.length > 0 ? Math.min(...times) : 0;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>⚡ 反応速度テスト</Text>
      {stage === "done" ? (
        <>
          <Text style={styles.bigScore}>平均 {avg.toFixed(2)}秒</Text>
          <Text style={styles.record}>最速 {fastest.toFixed(2)}秒</Text>
          <Text style={styles.note}>
            {avg <= 0.35
              ? "🏆 素早い！プロ級の反応です"
              : avg <= 0.5
                ? "✅ 標準的な反応速度です"
                : "🐢 ゆっくりめ。繰り返すと速くなります"}
            {" "}※ 画面タッチの目安: 0.3〜0.5秒（疲れや睡眠不足で遅くなります）
          </Text>
          <AppButton label="もう一度" tone="primary" fullWidth onPress={() => { setTimes([]); setStage("idle"); }} />
          <AppButton label="種目メニューへ" tone="ghost" fullWidth onPress={onClose} />
        </>
      ) : (
        <>
          <Text style={styles.note}>
            赤の間は待って、青になった瞬間にタップ！（{times.length}/5回）
          </Text>
          <Pressable
            style={[
              styles.reactionArea,
              stage === "go" && { backgroundColor: "#2f9e44" },
              stage === "wait" && { backgroundColor: "#c62828" },
              stage === "false" && { backgroundColor: "#8a5bb8" },
            ]}
            onPress={tap}
          >
            <Text style={styles.reactionText}>
              {stage === "idle"
                ? "タップしてスタート"
                : stage === "wait"
                  ? "待て…"
                  : stage === "false"
                    ? "フライング！ タップしてやり直し"
                    : "今だ！タップ！！"}
            </Text>
          </Pressable>
          <AppButton label="やめる" tone="ghost" fullWidth onPress={onClose} />
        </>
      )}
    </View>
  );
}

/** 🔭 周辺視野テスト: 中央を見たまま、四隅に一瞬光る星の場所を当てる×8回 */
function PeriphTest({ onClose }: { onClose: () => void }) {
  const addPeriph = useVisionStore((s) => s.addPeriph);
  const [trial, setTrial] = useState(-1); // -1=説明
  const [starCorner, setStarCorner] = useState<number | null>(null); // 0..3
  const [answerCorner, setAnswerCorner] = useState<number | null>(null); // 出題済み・回答待ち
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const nextTrial = (t: number, sc: number) => {
    if (t >= 8) {
      addPeriph(sc);
      playSe("achievement");
      setDone(true);
      setTimeout(evaluateAchievements, 400);
      return;
    }
    setTrial(t);
    setStarCorner(null);
    setAnswerCorner(null);
    timerRef.current = setTimeout(() => {
      const c = Math.floor(Math.random() * 4);
      setStarCorner(c);
      timerRef.current = setTimeout(() => {
        setStarCorner(null);
        setAnswerCorner(c);
      }, 260);
    }, 900 + Math.random() * 1200);
  };

  const pick = (c: number) => {
    if (answerCorner === null) return;
    const ok = c === answerCorner;
    const sc = score + (ok ? 1 : 0);
    setScore(sc);
    playSe(ok ? "tap" : "hit", ok ? 1.3 : 1);
    haptic(ok ? "light" : "warning");
    nextTrial(trial + 1, sc);
  };

  if (done) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>🔭 周辺視野テスト</Text>
        <Text style={styles.bigScore}>{score} / 8</Text>
        <Text style={styles.note}>
          {score >= 7
            ? "🏆 視野が広い！歩行者や自転車にすぐ気づけるタイプ"
            : score >= 5
              ? "✅ 標準的な広さです"
              : "👀 中央に集中しすぎかも。視野は意識すると広がります"}
        </Text>
        <AppButton label="もう一度" tone="primary" fullWidth onPress={() => { setScore(0); setDone(false); nextTrial(0, 0); }} />
        <AppButton label="種目メニューへ" tone="ghost" fullWidth onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🔭 周辺視野テスト</Text>
      <Text style={styles.note}>
        中央の「＋」だけを見つめて！四隅のどこかに星が一瞬光ります。
        光った場所（角）をタップ（{Math.max(0, trial)}/8回）
      </Text>
      {trial < 0 ? (
        <AppButton label="スタート" tone="primary" fullWidth onPress={() => nextTrial(0, 0)} />
      ) : (
        <View style={styles.periphArea}>
          <Text style={styles.periphCross}>＋</Text>
          {[0, 1, 2, 3].map((c) => (
            <Pressable
              key={c}
              style={[
                styles.periphCorner,
                c === 0 && { top: 0, left: 0 },
                c === 1 && { top: 0, right: 0 },
                c === 2 && { bottom: 0, left: 0 },
                c === 3 && { bottom: 0, right: 0 },
                answerCorner !== null && styles.periphCornerActive,
              ]}
              onPress={() => pick(c)}
            >
              {starCorner === c && <Text style={styles.periphStar}>⭐</Text>}
            </Pressable>
          ))}
          {answerCorner !== null && (
            <Text style={styles.periphAsk}>どこに光った？角をタップ！</Text>
          )}
        </View>
      )}
      <AppButton label="やめる" tone="ghost" fullWidth onPress={onClose} />
    </View>
  );
}

/** 🚦 選択反応テスト: 青は押す・赤は押さない×12回 */
function ChoiceTest({ onClose }: { onClose: () => void }) {
  const addChoice = useVisionStore((s) => s.addChoice);
  const [idx, setIdx] = useState(-1);
  const [current, setCurrent] = useState<"blue" | "red" | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const tappedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreRef = useRef(0);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const step = (i: number) => {
    if (i >= 12) {
      addChoice(scoreRef.current);
      setScore(scoreRef.current);
      playSe("achievement");
      setDone(true);
      setTimeout(evaluateAchievements, 400);
      return;
    }
    setIdx(i);
    tappedRef.current = false;
    const color: "blue" | "red" = Math.random() < 0.55 ? "blue" : "red";
    setCurrent(color);
    timerRef.current = setTimeout(() => {
      // 表示終了時に採点（青=押した？ / 赤=押さなかった？）
      const ok = color === "blue" ? tappedRef.current : !tappedRef.current;
      if (ok) scoreRef.current += 1;
      else {
        playSe("hit");
        haptic("warning");
      }
      setCurrent(null);
      timerRef.current = setTimeout(() => step(i + 1), 350);
    }, 850);
  };

  const tap = () => {
    if (current === null || tappedRef.current) return;
    tappedRef.current = true;
    playSe("tap", current === "blue" ? 1.3 : 0.8);
  };

  if (done) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>🚦 選択反応テスト</Text>
        <Text style={styles.bigScore}>{score} / 12</Text>
        <Text style={styles.note}>
          {score >= 11
            ? "🏆 とっさの判断が正確！信号の変化にも冷静に対応できるタイプ"
            : score >= 8
              ? "✅ 標準的な判断力です"
              : "🧠 急ぐと押し間違えるタイプかも。ワンテンポ置く癖を"}
        </Text>
        <AppButton label="もう一度" tone="primary" fullWidth onPress={() => { scoreRef.current = 0; setScore(0); setDone(false); step(0); }} />
        <AppButton label="種目メニューへ" tone="ghost" fullWidth onPress={onClose} />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.title}>🚦 選択反応テスト</Text>
      <Text style={styles.note}>
        🔵青い丸が出たらすぐタップ、🔴赤い丸は押しちゃダメ！（{Math.max(0, idx)}/12）
      </Text>
      {idx < 0 ? (
        <AppButton label="スタート" tone="primary" fullWidth onPress={() => { scoreRef.current = 0; step(0); }} />
      ) : (
        <Pressable style={styles.choiceArea} onPress={tap}>
          {current && (
            <View
              style={[
                styles.choiceDot,
                { backgroundColor: current === "blue" ? "#1a5fb4" : "#c62828" },
              ]}
            />
          )}
        </Pressable>
      )}
      <AppButton label="やめる" tone="ghost" fullWidth onPress={onClose} />
    </View>
  );
}

/** LINE連携が必要な機能のロック画面 */
function LineGate() {
  const router = useRouter();
  return (
    <View style={lineGateStyles.root}>
      <View style={lineGateStyles.card}>
        <Text style={lineGateStyles.lockIcon}>🔒</Text>
        <Text style={lineGateStyles.title}>この機能はLINE連携で解放されます</Text>
        <Text style={lineGateStyles.note}>
          KDS釧路自動車学校の公式LINEと連携（無料）すると使えるようになります。
        </Text>
        <Pressable style={lineGateStyles.button} onPress={() => router.replace("/line")}>
          <Text style={lineGateStyles.buttonText}>💚 LINE連携する</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={lineGateStyles.back}>戻る</Text>
        </Pressable>
      </View>
    </View>
  );
}

const lineGateStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    maxWidth: 420,
    width: "100%",
  },
  lockIcon: { fontSize: 44 },
  title: { fontSize: 17, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: "#06C755",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  back: { fontSize: 13, color: colors.textMuted, padding: 4 },
});

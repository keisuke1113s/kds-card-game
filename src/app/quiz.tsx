import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { ScreenEnter } from "@/components/ScreenEnter";
import { QUIZ_CATEGORIES, QUIZ_QUESTIONS, QuizCategory, QuizQuestion } from "@/data/quizQuestions";
import { SignImage } from "@/components/SignImage";
import { evaluateAchievements } from "@/store/achievementStore";
import { useQuizStore } from "@/store/quizStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useMissionStore } from "@/store/missionStore";
import { colors, radius, spacing } from "@/theme";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

const SET_SIZE = 10;

/** 回答の瞬間に押される大きな○×スタンプ */
function JudgeStamp({ correct }: { correct: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withSequence(
      withTiming(1.3, { duration: 130, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 110 })
    );
  }, [t]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 2) * 0.85,
    transform: [{ scale: t.value }, { rotate: "-10deg" }],
  }));
  return (
    <Animated.Text
      style={[styles.judgeStamp, { color: correct ? "#2f9e44" : "#d83030" }, style]}
      allowFontScaling={false}
      pointerEvents="none"
    >
      {correct ? "⭕" : "❌"}
    </Animated.Text>
  );
}

/** 出題順をランダムに（同じ問題は1セットに1回だけ）。分野を選ぶとその分野から出る */
function pickQuestions(cat: QuizCategory | "all"): QuizQuestion[] {
  const pool = QUIZ_QUESTIONS.filter((q) => cat === "all" || q.cat === cat);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SET_SIZE);
}

const KENTEI_SIZE = 50;
const KENTEI_TIME = 300; // 秒（5分）
const KENTEI_PASS = 45; // 90点相当

function pickKenteiQuestions(): QuizQuestion[] {
  const pool = [...QUIZ_QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, KENTEI_SIZE);
}

/** 効果測定の合否判子（対戦の検定判子と同じ意匠） */
function QuizHanko({ pass }: { pass: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => {
    playSe("hit");
    haptic(pass ? "success" : "medium");
    t.value = withSequence(
      withTiming(1.06, { duration: 190, easing: Easing.in(Easing.cubic) }),
      withTiming(1, { duration: 120 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [{ rotate: "-10deg" }, { scale: t.value === 0 ? 2 : 2 - t.value }],
  }));
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={[styles.hanko, !pass && styles.hankoRetry, st]}>
        <Text style={[styles.hankoText, !pass && styles.hankoTextRetry]} allowFontScaling={false}>
          {pass ? "合格" : "再検定"}
        </Text>
        <Text style={styles.hankoSub} allowFontScaling={false}>KDS釧路自動車学校</Text>
      </Animated.View>
    </View>
  );
}

export default function QuizScreen() {
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;

  const router = useRouter();
  const quiz = useQuizStore();
  const largeText = useSettingsStore((s) => s.largeText);
  const biggerQ = largeText ? { fontSize: 20, lineHeight: 30 } : null;
  const biggerN = largeText ? { fontSize: 16, lineHeight: 25 } : null;
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // 直前に選んだ答え
  const [comboStreak, setComboStreak] = useState(0); // 連続正解数
  const [category, setCategory] = useState<QuizCategory | "all">("all");
  // 効果測定モード（50問・5分・90点合格）
  const [kentei, setKentei] = useState(false);
  const [timeLeft, setTimeLeft] = useState(KENTEI_TIME);
  // 効果測定の見直し用: 自分の解答の記録と、結果画面の絞り込み
  const [answers, setAnswers] = useState<(boolean | null)[]>([]);
  const [reviewFilter, setReviewFilter] = useState<"wrong" | "all">("wrong");

  const start = () => {
    setKentei(false);
    setQuestions(pickQuestions(category));
    setIndex(0);
    setScore(0);
    setPicked(null);
    setComboStreak(0);
    setPhase("play");
  };

  const startKentei = () => {
    setKentei(true);
    setAnswers([]);
    setReviewFilter("wrong");
    setQuestions(pickKenteiQuestions());
    setIndex(0);
    setScore(0);
    setPicked(null);
    setComboStreak(0);
    setTimeLeft(KENTEI_TIME);
    setPhase("play");
  };

  // 効果測定の残り時間。0になったらその場で採点
  useEffect(() => {
    if (!kentei || phase !== "play") return;
    const h = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(h);
          finishKentei();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kentei, phase]);

  const finishKentei = () => {
    setPhase("result");
    setTimeout(evaluateAchievements, 400);
  };

  const q = questions[index];
  const correct = picked !== null && q ? picked === q.answer : false;

  const choose = (ans: boolean) => {
    if (picked !== null || !q) return;
    const ok = ans === q.answer;
    if (kentei) {
      // 本試験形式: 正誤は明かさず、テンポよく次の問題へ。解説は最後にまとめて
      playSe("tap");
      haptic("light");
      setAnswers((a) => [...a, ans]);
      const newScore = score + (ok ? 1 : 0);
      if (ok) setScore(newScore);
      if (index + 1 >= questions.length) {
        quiz.addKentei(newScore, newScore >= KENTEI_PASS);
        if (newScore >= KENTEI_PASS) playSe("win");
        finishKentei();
        return;
      }
      setIndex((i) => i + 1);
      return;
    }
    setPicked(ans);
    if (ok) {
      setScore((s) => s + 1);
      setComboStreak((c) => c + 1);
      playSe("janken_win");
      haptic("success");
    } else {
      setComboStreak(0);
      playSe("hit");
      haptic("warning");
    }
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      const finalScore = score;
      quiz.addResult(finalScore, questions.length, category);
      useMissionStore.getState().report("quizScore", finalScore);
      if (finalScore >= questions.length) playSe("win");
      setPhase("result");
      // クイズ系の実績を判定
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
            <Text style={styles.title}>📝 学科クイズ</Text>
            <Text style={styles.note}>
              学科試験でよく問われる基本知識から、○×クイズを{SET_SIZE}問出題します。{"\n"}
              全問正解で称号がもらえます。運転の勉強にもなるよ！
            </Text>
            <Text style={styles.catLabel}>出題する分野</Text>
            <View style={styles.catRow}>
              {(["all", ...QUIZ_CATEGORIES] as const).map((c) => (
                <Pressable
                  key={c}
                  style={[styles.catChip, category === c && styles.catChipActive]}
                  onPress={() => setCategory(c)}
                >
                  <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>
                    {c === "all" ? "すべて" : c}
                  </Text>
                </Pressable>
              ))}
            </View>
            {quiz.bests[category] !== undefined && (
              <Text style={styles.record}>
                この分野の最高: {quiz.bests[category]}点
              </Text>
            )}
            {quiz.plays > 0 && (
              <Text style={styles.record}>
                これまで {quiz.plays}回挑戦 ／ 最高 {quiz.bestScore}点 ／ 全問正解{" "}
                {quiz.perfects}回
              </Text>
            )}
            <Pressable style={[styles.wideButton, { backgroundColor: "#78b424" }]} onPress={start}>
              <Text style={styles.wideButtonText}>スタート！</Text>
            </Pressable>
            {/* 教習所の効果測定と同じ本試験形式 */}
            <View style={styles.kenteiBox}>
              <Text style={styles.kenteiTitle}>🖊 効果測定（本試験形式）</Text>
              <Text style={styles.kenteiNote}>
                全分野から50問・制限時間5分・45問（90点）で合格。{"\n"}
                本試験と同じく解答中は正誤が分かりません。終了後に解説をゆっくり見直せます。
              </Text>
              {quiz.kenteiPlays > 0 && (
                <Text style={styles.record}>
                  挑戦 {quiz.kenteiPlays}回 ／ 合格 {quiz.kenteiPassed}回 ／ 最高 {quiz.kenteiBest}問
                </Text>
              )}
              <Pressable style={[styles.wideButton, { backgroundColor: "#b0413e" }]} onPress={startKentei}>
                <Text style={styles.wideButtonText}>効果測定を受ける</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === "play" && q && (
          <View style={styles.card}>
            <Text style={styles.progress}>
              第{index + 1}問 / {questions.length}
              {!kentei && `　（正解 ${score}）`}
              {kentei && (
                <Text style={[styles.timer, timeLeft <= 30 && { color: colors.danger }]}>
                  　⏱ {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                </Text>
              )}
            </Text>
            {!!q.sign && (
              <View style={styles.signWrap}>
                <SignImage id={q.sign} />
              </View>
            )}
            <Text style={[styles.question, biggerQ]}>{q.q}</Text>
            {/* 回答の瞬間、大きな○×がドンとスタンプされる */}
            {picked !== null && <JudgeStamp key={index} correct={correct} />}
            {picked !== null && comboStreak >= 3 && (
              <Text style={styles.comboFire} allowFontScaling={false}>
                🔥 {comboStreak}連続正解！
              </Text>
            )}
            {picked === null ? (
              <View style={styles.answerRow}>
                <Pressable style={[styles.answerButton, { backgroundColor: colors.success }]} onPress={() => choose(true)}>
                  <Text style={styles.answerMark}>○</Text>
                  <Text style={styles.answerLabel}>正しい</Text>
                </Pressable>
                <Pressable style={[styles.answerButton, { backgroundColor: colors.danger }]} onPress={() => choose(false)}>
                  <Text style={styles.answerMark}>×</Text>
                  <Text style={styles.answerLabel}>誤り</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text style={[styles.judge, { color: correct ? colors.success : colors.danger }]}>
                  {correct ? "⭕ 正解！" : `❌ 不正解…（答えは${q.answer ? "○" : "×"}）`}
                </Text>
                <Text style={[styles.explain, biggerN]}>{q.note}</Text>
                <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={next}>
                  <Text style={styles.wideButtonText}>
                    {index + 1 >= questions.length ? "結果を見る" : "次の問題へ"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {phase === "result" && kentei && (
          <View style={styles.card}>
            <Text style={styles.title}>効果測定 結果</Text>
            <QuizHanko pass={score >= KENTEI_PASS} />
            <Text style={styles.resultScore}>
              {score} <Text style={styles.resultTotal}>/ {KENTEI_SIZE} 問正解（{score * 2}点）</Text>
            </Text>
            <Text style={styles.note}>
              {score >= KENTEI_PASS
                ? "合格おめでとう！本試験でもこの調子！"
                : `合格まであと${KENTEI_PASS - score}問。解説を読み直してもう一度挑戦しよう！`}
            </Text>
            {/* 全問の見直し（間違えた問題を中心に、解説をゆっくり読める） */}
            <Text style={styles.reviewTitle}>📖 解答の見直し</Text>
            <View style={styles.catRow}>
              <Pressable
                style={[styles.catChip, reviewFilter === "wrong" && styles.catChipActive]}
                onPress={() => setReviewFilter("wrong")}
              >
                <Text style={[styles.catChipText, reviewFilter === "wrong" && styles.catChipTextActive]}>
                  間違えた問題（{questions.length - score}問）
                </Text>
              </Pressable>
              <Pressable
                style={[styles.catChip, reviewFilter === "all" && styles.catChipActive]}
                onPress={() => setReviewFilter("all")}
              >
                <Text style={[styles.catChipText, reviewFilter === "all" && styles.catChipTextActive]}>
                  すべて（{questions.length}問）
                </Text>
              </Pressable>
            </View>
            {questions.map((qq, i) => {
              const my = answers[i];
              const ok = my === qq.answer;
              if (reviewFilter === "wrong" && ok) return null;
              return (
                <View key={i} style={[styles.reviewItem, ok ? styles.reviewItemOk : styles.reviewItemNg]}>
                  <Text style={styles.reviewQ}>
                    {ok ? "⭕" : "❌"} 第{i + 1}問　{qq.q}
                  </Text>
                  {!!qq.sign && (
                    <View style={styles.signWrap}>
                      <SignImage id={qq.sign} />
                    </View>
                  )}
                  <Text style={styles.reviewA}>
                    あなたの答え: {my === null || my === undefined ? "未回答" : my ? "○" : "×"}　／　正解: {qq.answer ? "○" : "×"}
                  </Text>
                  <Text style={styles.reviewNote}>{qq.note}</Text>
                </View>
              );
            })}
            {reviewFilter === "wrong" && questions.length - score === 0 && (
              <Text style={styles.record}>全問正解！見直しは不要です 🎉</Text>
            )}
            <Pressable style={[styles.wideButton, { backgroundColor: "#b0413e" }]} onPress={startKentei}>
              <Text style={styles.wideButtonText}>もう一度受ける</Text>
            </Pressable>
            <Pressable style={[styles.wideButton, { backgroundColor: colors.textMuted }]} onPress={() => setPhase("start")}>
              <Text style={styles.wideButtonText}>クイズトップへ</Text>
            </Pressable>
          </View>
        )}

        {phase === "result" && !kentei && (
          <View style={styles.card}>
            <Text style={styles.title}>
              {score >= questions.length ? "🎉 全問正解！！" : score >= 7 ? "💮 なかなかの好成績！" : "📚 おつかれさま！"}
            </Text>
            <Text style={styles.resultScore}>
              {score} <Text style={styles.resultTotal}>/ {questions.length} 問正解</Text>
            </Text>
            <Text style={styles.note}>
              {score >= questions.length
                ? "学科マスターの称号にふさわしい知識です！"
                : "間違えた問題の解説を思い出して、次は全問正解を目指そう！"}
            </Text>
            <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={start}>
              <Text style={styles.wideButtonText}>もう一度挑戦する</Text>
            </Pressable>
            <Pressable style={[styles.wideButton, { backgroundColor: colors.textMuted }]} onPress={() => router.replace("/")}>
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
    gap: 14,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 22, fontWeight: "900", color: "#4e7d16", textAlign: "center" },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  catLabel: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#78b424",
  },
  catChipActive: { backgroundColor: "#78b424" },
  catChipText: { fontSize: 12, fontWeight: "800", color: "#4e7d16" },
  catChipTextActive: { color: "#fff" },
  progress: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  question: { fontSize: 17, lineHeight: 26, fontWeight: "700", color: colors.text },
  answerRow: { flexDirection: "row", gap: 12 },
  answerButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 18,
    borderRadius: radius.md,
    gap: 2,
  },
  answerMark: { fontSize: 34, fontWeight: "900", color: "#fff" },
  answerLabel: { fontSize: 13, fontWeight: "800", color: "#ffffffdd" },
  judge: { fontSize: 20, fontWeight: "900", textAlign: "center" },
  judgeStamp: {
    position: "absolute",
    top: 8,
    right: 14,
    fontSize: 74,
    zIndex: 5,
  },
  comboFire: {
    position: "absolute",
    top: 96,
    right: 10,
    fontSize: 14,
    fontWeight: "900",
    color: "#e8590c",
    zIndex: 5,
  },
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
  kenteiBox: {
    borderWidth: 1.5,
    borderColor: "#b0413e",
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
    backgroundColor: "#b0413e0d",
  },
  kenteiTitle: { fontSize: 15, fontWeight: "900", color: "#b0413e" },
  kenteiNote: { fontSize: 12, lineHeight: 19, color: colors.text },
  timer: { fontWeight: "900", color: colors.primaryDark },
  reviewTitle: { fontSize: 16, fontWeight: "900", color: colors.text, marginTop: 6 },
  reviewItem: {
    borderRadius: 10,
    borderLeftWidth: 4,
    padding: 10,
    gap: 6,
    backgroundColor: colors.background,
  },
  reviewItemOk: { borderLeftColor: "#2f9e44" },
  reviewItemNg: { borderLeftColor: "#d83030" },
  reviewQ: { fontSize: 13, lineHeight: 20, fontWeight: "700", color: colors.text },
  reviewA: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  reviewNote: { fontSize: 12, lineHeight: 19, color: colors.text },
  signWrap: { alignItems: "center", paddingVertical: 4 },
  hanko: {
    borderWidth: 3,
    borderColor: "#d02020",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  hankoRetry: { borderColor: "#b04030" },
  hankoText: { color: "#d02020", fontSize: 24, fontWeight: "900", letterSpacing: 5 },
  hankoTextRetry: { color: "#b04030", letterSpacing: 2 },
  hankoSub: { color: "#d02020aa", fontSize: 8, fontWeight: "700", marginTop: 1 },
  wideButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

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

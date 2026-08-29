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
import { QUIZ_QUESTIONS, QuizQuestion } from "@/data/quizQuestions";
import { evaluateAchievements } from "@/store/achievementStore";
import { useQuizStore } from "@/store/quizStore";
import { colors, radius, spacing } from "@/theme";

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

/** 出題順をランダムに（同じ問題は1セットに1回だけ） */
function pickQuestions(): QuizQuestion[] {
  const pool = [...QUIZ_QUESTIONS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SET_SIZE);
}

export default function QuizScreen() {
  const router = useRouter();
  const quiz = useQuizStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<boolean | null>(null); // 直前に選んだ答え
  const [comboStreak, setComboStreak] = useState(0); // 連続正解数

  const start = () => {
    setQuestions(pickQuestions());
    setIndex(0);
    setScore(0);
    setPicked(null);
    setComboStreak(0);
    setPhase("play");
  };

  const q = questions[index];
  const correct = picked !== null && q ? picked === q.answer : false;

  const choose = (ans: boolean) => {
    if (picked !== null || !q) return;
    setPicked(ans);
    const ok = ans === q.answer;
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
      quiz.addResult(finalScore, questions.length);
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
            {quiz.plays > 0 && (
              <Text style={styles.record}>
                これまで {quiz.plays}回挑戦 ／ 最高 {quiz.bestScore}点 ／ 全問正解{" "}
                {quiz.perfects}回
              </Text>
            )}
            <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={start}>
              <Text style={styles.wideButtonText}>スタート！</Text>
            </Pressable>
          </View>
        )}

        {phase === "play" && q && (
          <View style={styles.card}>
            <Text style={styles.progress}>
              第{index + 1}問 / {questions.length}　（正解 {score}）
            </Text>
            <Text style={styles.question}>{q.q}</Text>
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
                <Text style={styles.explain}>{q.note}</Text>
                <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={next}>
                  <Text style={styles.wideButtonText}>
                    {index + 1 >= questions.length ? "結果を見る" : "次の問題へ"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {phase === "result" && (
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
  title: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
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
  wideButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

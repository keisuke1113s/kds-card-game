import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { getCard } from "@/data/cards";
import { Axis, SHINDAN_QUESTIONS, computeShindanType, shindanTypeOf } from "@/data/shindan";
import { useRankStore } from "@/store/rankStore";
import { colors, radius, spacing } from "@/theme";

/** 運転適性診断（教習所の適性検査のパロディ） */
export default function ShindanScreen() {
  const router = useRouter();
  const savedKey = useRankStore((s) => s.shindanType);
  const setShindanType = useRankStore((s) => s.setShindanType);
  const saved = shindanTypeOf(savedKey);

  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [index, setIndex] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);

  const q = SHINDAN_QUESTIONS[index];
  // 結果画面に出すタイプ（診断直後 or 保存済みの前回結果）
  const [result, setResult] = useState<ReturnType<typeof computeShindanType> | null>(null);

  const start = () => {
    setIndex(0);
    setAxes([]);
    setPhase("play");
  };

  const choose = (axis: Axis) => {
    haptic("light");
    playSe("tap");
    const nextAxes = [...axes, axis];
    if (index + 1 >= SHINDAN_QUESTIONS.length) {
      setAxes(nextAxes);
      const t = computeShindanType(nextAxes);
      setShindanType(t.key);
      setResult(t);
      playSe("achievement");
      setPhase("result");
      return;
    }
    setAxes(nextAxes);
    setIndex((i) => i + 1);
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>🧠 運転適性診断</Text>
            <Text style={styles.note}>
              教習所の適性検査になぞらえた、あなたの「運転タイプ」診断！{"\n"}
              {SHINDAN_QUESTIONS.length}問の質問に直感で答えてね。結果は免許証にも記載されます。
            </Text>
            {saved && (
              <Text style={styles.record}>
                前回の診断: {saved.emoji} {saved.name}
              </Text>
            )}
            <AppButton label="診断をはじめる" custom={{ bg: "#e2604a" }} fullWidth onPress={start} />
            {saved && (
              <AppButton
                label={`${saved.emoji} 前回の結果をもう一度見る`}
                custom={{ bg: "#ffffff", fg: "#c4432e", border: "#e2604a" }}
                fullWidth
                onPress={() => {
                  setResult(saved);
                  setPhase("result");
                }}
              />
            )}
            <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />
          </View>
        )}

        {phase === "play" && q && (
          <Animated.View key={index} entering={FadeIn.duration(220)} style={styles.card}>
            <Text style={styles.progress}>
              Q{index + 1} / {SHINDAN_QUESTIONS.length}
            </Text>
            <Text style={styles.question}>{q.q}</Text>
            <Pressable style={styles.choice} onPress={() => choose(q.a.axis)}>
              <Text style={styles.choiceText}>A. {q.a.label}</Text>
            </Pressable>
            <Pressable style={styles.choice} onPress={() => choose(q.b.axis)}>
              <Text style={styles.choiceText}>B. {q.b.label}</Text>
            </Pressable>
          </Animated.View>
        )}

        {phase === "result" && result && (
          <Animated.View entering={ZoomIn.springify().damping(13)} style={styles.card}>
            <Text style={styles.resultLabel}>あなたの運転タイプは…</Text>
            <Text style={styles.resultEmoji}>{result.emoji}</Text>
            <Text style={styles.resultName}>{result.name}</Text>
            <Text style={styles.note}>{result.desc}</Text>
            <View style={styles.adviceBox}>
              <Text style={styles.adviceLabel}>🎮 おすすめの戦い方</Text>
              <Text style={styles.adviceText}>{result.advice}</Text>
              <Text style={styles.adviceLabel}>🃏 おすすめデッキ</Text>
              <Text style={styles.adviceText}>{result.deck}</Text>
            </View>
            <View style={styles.partnerRow}>
              <CardFace cardId={result.partner} size="md" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.adviceLabel}>🤝 相性の良いインストラクター</Text>
                <Text style={styles.partnerName}>
                  {getCard(result.partner).name}インストラクター
                </Text>
                <Text style={styles.adviceText}>
                  「インストラクターに挑戦」で対戦してみよう！
                </Text>
              </View>
            </View>
            <AppButton label="もう一度診断する" tone="ghost" fullWidth onPress={start} />
            <AppButton
              label="診断トップへ戻る"
              tone="ghost"
              fullWidth
              onPress={() => setPhase("start")}
            />
            <AppButton
              label="🪪 免許証で確認する"
              tone="primary"
              fullWidth
              onPress={() => router.replace("/license")}
            />
          </Animated.View>
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
  title: { fontSize: 22, fontWeight: "900", color: "#c4432e", textAlign: "center" },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  progress: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  question: { fontSize: 18, lineHeight: 27, fontWeight: "800", color: colors.text },
  choice: {
    borderWidth: 2,
    borderColor: "#e2604a",
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  choiceText: { fontSize: 15, fontWeight: "700", color: "#c4432e" },
  resultLabel: { fontSize: 14, fontWeight: "800", color: colors.textMuted, textAlign: "center" },
  resultEmoji: { fontSize: 56, textAlign: "center" },
  resultName: { fontSize: 24, fontWeight: "900", color: "#c4432e", textAlign: "center" },
  adviceBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    gap: 4,
  },
  adviceLabel: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  adviceText: { fontSize: 13, lineHeight: 20, color: colors.text },
  partnerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  partnerName: { fontSize: 16, fontWeight: "900", color: colors.text },
});

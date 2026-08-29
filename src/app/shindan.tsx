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
import {
  Axis,
  POLE_TRAITS,
  SHINDAN_QUESTIONS,
  axisBreakdown,
  computeShindanType,
  dominantPoles,
  partnerTypeOf,
  shindanTypeOf,
} from "@/data/shindan";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { useRankStore } from "@/store/rankStore";
import { colors, radius, spacing } from "@/theme";

/** 運転適性診断（教習所の適性検査のパロディ・16問16タイプ） */
export default function ShindanScreen() {
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;

  const router = useRouter();
  const savedKey = useRankStore((s) => s.shindanType);
  const savedAnswers = useRankStore((s) => s.shindanAnswers);
  const setShindanType = useRankStore((s) => s.setShindanType);
  const setShindanAnswers = useRankStore((s) => s.setShindanAnswers);
  const saved = shindanTypeOf(savedKey);

  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  const [index, setIndex] = useState(0);
  const [axes, setAxes] = useState<Axis[]>([]);
  const [result, setResult] = useState<ReturnType<typeof computeShindanType> | null>(null);
  const [resultAxes, setResultAxes] = useState<Axis[]>([]);

  const q = SHINDAN_QUESTIONS[index];

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
      setShindanAnswers(nextAxes.join(""));
      setResult(t);
      setResultAxes(nextAxes);
      playSe("achievement");
      setPhase("result");
      return;
    }
    setAxes(nextAxes);
    setIndex((i) => i + 1);
  };

  const showSaved = () => {
    if (!saved) return;
    setResult(saved);
    setResultAxes((savedAnswers ?? "").split("") as Axis[]);
    setPhase("result");
  };

  const buddy = result ? partnerTypeOf(result.key) : null;
  const hasMeters = resultAxes.length >= SHINDAN_QUESTIONS.length;
  const poles = hasMeters ? dominantPoles(resultAxes) : [];

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>🧠 運転適性診断</Text>
            <Text style={styles.note}>
              教習所の適性検査になぞらえた、あなたの「運転タイプ」診断！{"\n"}
              4つの軸で分析して、全16タイプから判定します。{"\n"}
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
                onPress={showSaved}
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
            <View style={styles.progressBar}>
              <View
                style={[styles.progressFill, { width: `${(index / SHINDAN_QUESTIONS.length) * 100}%` }]}
              />
            </View>
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
            <Text style={styles.resultCatch}>“{result.catch}”</Text>
            <Text style={styles.note}>{result.desc}</Text>

            {/* 4軸のメーター */}
            {hasMeters ? (
              <View style={styles.meterBox}>
                <Text style={styles.sectionLabel}>📊 あなたの傾向メーター</Text>
                {axisBreakdown(resultAxes).map((ax) => {
                  const total = ax.left.count + ax.right.count;
                  const leftPct = total > 0 ? (ax.left.count / total) * 100 : 50;
                  const leftWin = ax.left.count >= ax.right.count;
                  return (
                    <View key={ax.left.letter} style={styles.meterRow}>
                      <Text style={[styles.meterLabel, leftWin && styles.meterLabelWin]}>
                        {ax.left.label}
                      </Text>
                      <View style={styles.meterTrack}>
                        <View style={[styles.meterLeft, { width: `${leftPct}%` }]} />
                      </View>
                      <Text style={[styles.meterLabel, styles.meterLabelRight, !leftWin && styles.meterLabelWin]}>
                        {ax.right.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.record}>（メーター表示はもう一度診断すると出ます）</Text>
            )}

            {/* 強みと注意（傾きの強い2軸から） */}
            {poles.length > 0 && (
              <>
                <View style={[styles.adviceBox, { borderLeftColor: "#2f9e44" }]}>
                  <Text style={styles.sectionLabel}>💪 あなたの強み</Text>
                  {poles.slice(0, 2).map((p) => (
                    <Text key={`s${p}`} style={styles.adviceText}>
                      ・{POLE_TRAITS[p].strength}
                    </Text>
                  ))}
                </View>
                <View style={[styles.adviceBox, { borderLeftColor: "#d83030" }]}>
                  <Text style={styles.sectionLabel}>⚠️ 運転で気をつけたい場面</Text>
                  {poles.slice(0, 2).map((p) => (
                    <Text key={`c${p}`} style={styles.adviceText}>
                      ・{POLE_TRAITS[p].caution}
                    </Text>
                  ))}
                </View>
              </>
            )}

            {/* 運転傾向のアドバイス */}
            <View style={[styles.adviceBox, { borderLeftColor: "#1a5fb4" }]}>
              <Text style={styles.sectionLabel}>🚗 運転傾向とアドバイス</Text>
              <Text style={styles.adviceText}>{result.drive}</Text>
            </View>

            {/* ゲームのおすすめ */}
            <View style={[styles.adviceBox, { borderLeftColor: "#e8590c" }]}>
              <Text style={styles.sectionLabel}>🎮 おすすめの戦い方</Text>
              <Text style={styles.adviceText}>{result.advice}</Text>
              <Text style={styles.adviceText}>🃏 おすすめデッキ: {result.deck}</Text>
            </View>

            {/* 相性インストラクター */}
            <View style={styles.partnerRow}>
              <CardFace cardId={result.partner} size="md" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.sectionLabel}>🤝 相性の良いインストラクター</Text>
                <Text style={styles.partnerName}>
                  {getCard(result.partner).name}インストラクター
                </Text>
                <Text style={styles.adviceText}>「インストラクターに挑戦」で対戦してみよう！</Text>
              </View>
            </View>

            {/* 補い合える相棒タイプ */}
            {buddy && (
              <View style={[styles.adviceBox, { borderLeftColor: "#8a5bb8" }]}>
                <Text style={styles.sectionLabel}>🧩 補い合える相棒タイプ</Text>
                <Text style={styles.adviceText}>
                  {buddy.emoji} {buddy.name} — あなたと全部の軸が反対のタイプ。
                  一緒に走ると弱点を補い合えます。友だちと診断して探してみよう！
                </Text>
              </View>
            )}

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
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  progressFill: { height: 6, backgroundColor: "#e2604a", borderRadius: 3 },
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
  resultCatch: { fontSize: 13, fontWeight: "700", color: colors.textMuted, textAlign: "center" },
  sectionLabel: { fontSize: 13, fontWeight: "900", color: colors.text },
  meterBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    gap: 10,
  },
  meterRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  meterLabel: { width: 72, fontSize: 11, fontWeight: "700", color: colors.textMuted },
  meterLabelRight: { textAlign: "right" },
  meterLabelWin: { color: "#c4432e", fontWeight: "900" },
  meterTrack: {
    flex: 1,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#1a5fb433",
    overflow: "hidden",
  },
  meterLeft: { height: 12, backgroundColor: "#e2604a" },
  adviceBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    padding: 12,
    gap: 6,
  },
  adviceText: { fontSize: 13, lineHeight: 21, color: colors.text },
  partnerRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  partnerName: { fontSize: 16, fontWeight: "900", color: colors.text },
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

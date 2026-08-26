import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInRight } from "react-native-reanimated";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { getCard } from "@/data/cards";
import { lessons } from "@/tutorial/lessons";
import { colors } from "@/theme";

/** はじめての方向けのルール解説（スライド形式） */
export default function TutorialScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  // 連打で範囲外にならないよう必ず範囲内に収める
  const safeIndex = Math.min(Math.max(index, 0), lessons.length - 1);
  const lesson = lessons[safeIndex];
  const isLast = safeIndex === lessons.length - 1;

  const next = () => {
    if (isLast) router.replace("/prematch?tutorial=1");
    else setIndex((i) => Math.min(i + 1, lessons.length - 1));
  };

  return (
    <View style={styles.root}>
      {/* 進み具合 */}
      <View style={styles.progressRow}>
        {lessons.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              i === index && styles.progressDotActive,
              i < index && styles.progressDotDone,
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View key={safeIndex} entering={SlideInRight.duration(250)}>
          <Text style={styles.stepLabel}>
            {safeIndex + 1} / {lessons.length}
          </Text>
          <Text style={styles.title}>{lesson.title}</Text>

          {lesson.cardIds && (
            <View style={styles.cardRow}>
              {lesson.cardIds.map((id) => (
                <View key={id} style={styles.cardItem}>
                  <CardFace cardId={id} size="md" onPress={() => setDetailCardId(id)} />
                  <Text style={styles.cardName}>{getCard(id).name}</Text>
                </View>
              ))}
            </View>
          )}

          {lesson.body.map((p, i) => (
            <Text key={i} style={styles.body}>
              {p}
            </Text>
          ))}

          {!!lesson.tip && (
            <View style={styles.tipBox}>
              <Text style={styles.tipLabel}>ワンポイント</Text>
              <Text style={styles.tipText}>{lesson.tip}</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        {safeIndex > 0 ? (
          <Pressable style={styles.backButton} onPress={() => setIndex((i) => Math.max(i - 1, 0))}>
            <Text style={styles.backText}>戻る</Text>
          </Pressable>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <Pressable style={styles.nextButton} onPress={next}>
          <Text style={styles.nextText}>{isLast ? "練習対戦を始める ▶" : "次へ ▶"}</Text>
        </Pressable>
      </View>

      {detailCardId && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)} style={styles.overlayBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetailCardId(null)} />
          <View style={styles.overlayBox}>
            <Text style={styles.overlayTitle}>{getCard(detailCardId).name}</Text>
            <CardDetail cardId={detailCardId} />
            <Pressable style={styles.closeButton} onPress={() => setDetailCardId(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  progressRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 12,
    justifyContent: "center",
  },
  progressDot: {
    width: 22,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  progressDotActive: { backgroundColor: colors.primary },
  progressDotDone: { backgroundColor: colors.success },
  content: { padding: 20, paddingBottom: 24 },
  stepLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.text,
    marginTop: 4,
    marginBottom: 16,
  },
  cardRow: { flexDirection: "row", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  cardItem: { alignItems: "center", gap: 4 },
  cardName: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 27, color: colors.text, marginBottom: 12 },
  tipBox: {
    backgroundColor: "#fff8e1",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 14,
    marginTop: 8,
    gap: 4,
  },
  tipLabel: { fontSize: 12, fontWeight: "800", color: colors.accent },
  tipText: { fontSize: 14, lineHeight: 22, color: colors.text },
  footer: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  backButton: {
    borderRadius: 12,
    paddingVertical: 15,
    paddingHorizontal: 22,
    backgroundColor: colors.cancel,
  },
  backSpacer: { width: 0 },
  backText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  nextButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: colors.primary,
  },
  nextText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    gap: 12,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

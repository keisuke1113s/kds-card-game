import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

const speeds: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

/** 対戦開始前に条件を確認・変更してから始める画面 */
export default function PrematchScreen() {
  const router = useRouter();
  const { tutorial } = useLocalSearchParams<{ tutorial?: string }>();
  const isTutorial = tutorial === "1";
  const startGame = useGameStore((s) => s.startGame);
  const deckState = useDeckStore();
  const {
    difficulty,
    setDifficulty,
    aiSpeedMs,
    setAiSpeedMs,
    seEnabled,
    setSeEnabled,
    bgmEnabled,
    setBgmEnabled,
  } = useSettingsStore();

  const playerDeck = resolveActiveDeck(deckState);
  const opponentDeck = cpuDeckFor(playerDeck, deckState.builtinOverrides);

  const start = () => {
    startGame({
      playerDeck: playerDeck.list,
      cpuDeck: opponentDeck.list,
      // 練習対戦はいちばん弱いCPU・ゆっくりの手で固定する
      difficulty: isTutorial ? "easy" : difficulty,
      aiSpeedMs: isTutorial ? 1600 : aiSpeedMs,
      tutorial: isTutorial,
    });
    router.replace("/battle");
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.matchupBox}>
          <Text style={styles.matchupLabel}>あなた</Text>
          <Text style={styles.matchupDeck}>{playerDeck.name}</Text>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.matchupLabel}>CPU</Text>
          <Text style={styles.matchupDeck}>{opponentDeck.name}</Text>
        </View>
        <Pressable style={styles.deckLink} onPress={() => router.push("/deck")}>
          <Text style={styles.deckLinkText}>デッキを変える ▸</Text>
        </Pressable>

        {isTutorial && (
          <View style={styles.tutorialNote}>
            <Text style={styles.tutorialNoteTitle}>練習対戦</Text>
            <Text style={styles.tutorialNoteText}>
              画面に「次に何をすればいいか」のヒントが出ます。相手はいちばん弱いCPUなので、
              失敗しても大丈夫です。
            </Text>
          </View>
        )}

        {!isTutorial && <Text style={styles.sectionTitle}>CPUの強さ</Text>}
        {!isTutorial && (
          <View style={styles.row}>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <Choice
                key={d}
                label={DIFFICULTY_LABELS[d]}
                active={difficulty === d}
                onPress={() => setDifficulty(d)}
              />
            ))}
          </View>
        )}

        {!isTutorial && <Text style={styles.sectionTitle}>CPUの手の速さ</Text>}
        {!isTutorial && (
          <View style={styles.row}>
            {speeds.map((s) => (
              <Choice
                key={s.ms}
                label={s.label}
                active={aiSpeedMs === s.ms}
                onPress={() => setAiSpeedMs(s.ms)}
              />
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>サウンド</Text>
        <View style={styles.row}>
          <Choice
            label={`効果音 ${seEnabled ? "ON" : "OFF"}`}
            active={seEnabled}
            onPress={() => setSeEnabled(!seEnabled)}
          />
          <Choice
            label={`BGM ${bgmEnabled ? "ON" : "OFF"}`}
            active={bgmEnabled}
            onPress={() => setBgmEnabled(!bgmEnabled)}
          />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.startButton} onPress={start}>
          <Text style={styles.startText}>{isTutorial ? "練習対戦を始める" : "この設定で対戦する"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Choice({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.choice, active && { backgroundColor: colors.primary, borderColor: colors.primary }]}
    >
      <Text style={[styles.choiceText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  matchupBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: "center",
    gap: 2,
  },
  matchupLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  matchupDeck: { fontSize: 17, fontWeight: "800", color: colors.text },
  vs: { fontSize: 15, fontWeight: "900", color: colors.accent, marginVertical: 6 },
  deckLink: { alignSelf: "center", paddingVertical: 6 },
  deckLinkText: { color: colors.primary, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 10 },
  tutorialNote: {
    backgroundColor: "#fff8e1",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 14,
    gap: 4,
    marginTop: 4,
  },
  tutorialNoteTitle: { fontSize: 13, fontWeight: "800", color: colors.accent },
  tutorialNoteText: { fontSize: 14, lineHeight: 21, color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  choice: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceText: { fontWeight: "700", color: colors.text },
  footer: {
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { color: "#fff", fontWeight: "800", fontSize: 17 },
});

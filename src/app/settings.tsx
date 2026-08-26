import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

const speeds: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

export default function SettingsScreen() {
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

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>CPUの強さ</Text>
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

      <Text style={styles.sectionTitle}>CPUの手の速さ</Text>
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

      <Text style={styles.sectionTitle}>サウンド</Text>
      <View style={styles.row}>
        <Choice label={`効果音 ${seEnabled ? "ON" : "OFF"}`} active={seEnabled} onPress={() => setSeEnabled(!seEnabled)} />
        <Choice label={`BGM ${bgmEnabled ? "ON" : "OFF"}`} active={bgmEnabled} onPress={() => setBgmEnabled(!bgmEnabled)} />
      </View>

      <Text style={styles.note}>
        設定は次の対戦から反映されます（サウンドは即時）。
      </Text>
    </ScrollView>
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
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 8 },
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
  note: { color: colors.textMuted, marginTop: 16, fontSize: 12 },
});

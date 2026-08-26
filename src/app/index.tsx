import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { playBgm } from "@/audio/sound";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { cpuDeck } from "@/data/cards";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";

export default function HomeScreen() {
  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);
  const inProgress = useGameStore((s) => s.state !== null && s.state.phase.type !== "finished");
  const difficulty = useSettingsStore((s) => s.difficulty);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const deckState = useDeckStore();
  const bgmEnabled = useSettingsStore((s) => s.bgmEnabled);

  // ホームに戻ってきたらメインBGM（bgm_main が未提供なら何もしない）
  useFocusEffect(
    useCallback(() => {
      if (bgmEnabled) playBgm("bgm_main");
    }, [bgmEnabled])
  );

  const onStart = () => {
    const deck = resolveActiveDeck(deckState);
    startGame({
      playerDeck: deck.list,
      cpuDeck,
      difficulty,
      aiSpeedMs,
    });
    router.push("/battle");
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.titleBox}>
        <Text style={styles.kicker}>KDS</Text>
        <Text style={styles.title}>カードゲーム</Text>
        <Text style={styles.subtitle}>学科10時限・技能19時限をめざせ！</Text>
      </View>

      <View style={styles.menu}>
        {inProgress && (
          <MenuButton
            label="対戦にもどる"
            color={colors.accent}
            onPress={() => router.push("/battle")}
          />
        )}
        <MenuButton
          label={`たいせん（CPU: ${DIFFICULTY_LABELS[difficulty]}）`}
          color={colors.primary}
          onPress={onStart}
        />
        <MenuButton label="デッキこうちく" color={colors.success} onPress={() => router.push("/deck")} />
        <MenuButton label="カードずかん" color={colors.instructor} onPress={() => router.push("/library")} />
        <MenuButton label="ルール" color={colors.tantou} onPress={() => router.push("/rules")} />
        <MenuButton label="せってい" color={colors.textMuted} onPress={() => router.push("/settings")} />
      </View>
      <Text style={styles.footer}>KDSカードゲーム（非公式デジタル版・開発中）</Text>
    </SafeAreaView>
  );
}

function MenuButton({
  label,
  color,
  onPress,
}: {
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: color }, pressed && { opacity: 0.8 }]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: 24 },
  titleBox: { alignItems: "center", marginTop: 48, marginBottom: 32 },
  kicker: {
    fontSize: 40,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 8,
  },
  title: { fontSize: 32, fontWeight: "800", color: colors.text },
  subtitle: { marginTop: 8, color: colors.textMuted },
  menu: { gap: 12 },
  button: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  footer: {
    marginTop: "auto",
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 12,
  },
});

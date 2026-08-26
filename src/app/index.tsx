import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { stopBgm } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { colors, radius, shadow, spacing } from "@/theme";

export default function HomeScreen() {
  const router = useRouter();
  const inProgress = useGameStore((s) => s.state !== null && s.state.phase.type !== "finished");
  const deckState = useDeckStore();

  // BGMは対戦中のみ。ホームに戻ったら止める
  useFocusEffect(
    useCallback(() => {
      stopBgm();
    }, [])
  );

  const activeDeck = resolveActiveDeck(deckState);
  const opponentDeck = cpuDeckFor(activeDeck, deckState.builtinOverrides);

  return (
    <LinearGradient colors={[colors.background, colors.backgroundDeep]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.titleBox}>
          <View style={styles.logoRow}>
            <Text style={styles.logo}>KDS</Text>
            <View style={styles.logoBadge}>
              <Text style={styles.logoBadgeText}>a GO! GO!</Text>
            </View>
          </View>
          <Text style={styles.title}>カードゲーム</Text>
          <View style={styles.goalRow}>
            <GoalChip label="学科" value="10時限" color={colors.primary} />
            <GoalChip label="技能" value="19時限" color={colors.success} />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.menu}>
          {inProgress && (
            <AppButton
              label="対戦に戻る"
              icon="▶"
              tone="accent"
              size="lg"
              fullWidth
              onPress={() => router.push("/battle")}
            />
          )}

          <AppButton
            label="対戦"
            icon="⚔️"
            tone="primary"
            size="lg"
            feel="medium"
            fullWidth
            onPress={() => router.push("/prematch")}
          />
          <View style={styles.matchupCard}>
            <Text style={styles.matchupSide} numberOfLines={1}>
              {activeDeck.name}
            </Text>
            <Text style={styles.matchupVs}>VS</Text>
            <Text style={styles.matchupSide} numberOfLines={1}>
              {opponentDeck.name}
            </Text>
          </View>

          <AppButton
            label="はじめての方へ（遊び方）"
            icon="📖"
            tone="accent"
            fullWidth
            onPress={() => router.push("/tutorial")}
          />
          <View style={styles.row}>
            <AppButton
              label="デッキ構築"
              icon="🃏"
              tone="success"
              style={styles.flex}
              onPress={() => router.push("/deck")}
            />
            <AppButton
              label="カード図鑑"
              icon="🔍"
              tone="primary"
              style={styles.flex}
              onPress={() => router.push("/library")}
            />
          </View>
          <AppButton
            label="ルール"
            icon="📋"
            tone="ghost"
            fullWidth
            onPress={() => router.push("/rules")}
          />
        </Animated.View>

        <Text style={styles.footer}>KDSカードゲーム（非公式デジタル版）</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

function GoalChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.goalChip, { borderColor: color }]}>
      <Text style={[styles.goalLabel, { color }]}>{label}</Text>
      <Text style={styles.goalValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: spacing.xl },
  titleBox: { alignItems: "center", marginTop: spacing.xxl, marginBottom: spacing.xl },
  logoRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  logo: {
    fontSize: 46,
    fontWeight: "900",
    color: colors.primary,
    letterSpacing: 6,
    textShadowColor: "#ffffff",
    textShadowRadius: 6,
  },
  logoBadge: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
    transform: [{ rotate: "-6deg" }],
    ...shadow.card,
  },
  logoBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: colors.primaryDark,
    marginTop: spacing.xs,
    letterSpacing: 1,
  },
  goalRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  goalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    ...shadow.card,
  },
  goalLabel: { fontSize: 12, fontWeight: "800" },
  goalValue: { fontSize: 13, fontWeight: "800", color: colors.text },
  menu: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  matchupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: -spacing.xs,
  },
  matchupSide: { fontSize: 12, fontWeight: "600", color: colors.textMuted, flexShrink: 1 },
  matchupVs: { fontSize: 11, fontWeight: "900", color: colors.accent },
  footer: {
    marginTop: "auto",
    marginBottom: spacing.md,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
});

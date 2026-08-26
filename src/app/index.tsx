import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { stopBgm } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { colors, radius, shadow, spacing } from "@/theme";

/** カード実物のロゴで使われている色 */
const brand = {
  red: "#e5342c",
  yellow: "#efa724",
  green: "#63b737",
  orange: "#ee7a3a",
  skyblue: "#4fb6e0",
} as const;

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
        {/* タイトル：カード裏面を扇状に並べた上にロゴを置く */}
        <View style={styles.hero}>
          <View style={styles.fanRow}>
            <FannedCard angle={-14} offsetX={-58} offsetY={10} />
            <FannedCard angle={-6} offsetX={-28} offsetY={2} />
            <FannedCard angle={0} offsetX={0} offsetY={-2} float />
            <FannedCard angle={6} offsetX={28} offsetY={2} />
            <FannedCard angle={14} offsetX={58} offsetY={10} />
          </View>

          <View style={styles.titleBlock}>
            {/* カード実物のロゴと同じ配色にする */}
            <View style={styles.logoRow}>
              <Text style={[styles.logo, { color: brand.red }]}>K</Text>
              <Text style={[styles.logo, { color: brand.yellow }]}>D</Text>
              <Text style={[styles.logo, { color: brand.green }]}>S</Text>
              <View style={styles.goRow}>
                <Text style={[styles.go, { color: brand.orange }]}>a </Text>
                <Text style={[styles.go, { color: brand.yellow }]}>GO!</Text>
                <Text style={[styles.go, { color: brand.skyblue }]}> GO!</Text>
              </View>
            </View>
            <Text style={styles.catch}>運転が楽しくなる!!</Text>
            <Text style={styles.title}>トレーディングカードゲーム</Text>
            <View style={styles.goalRow}>
              <GoalChip label="学科" value="10時限" color={colors.primary} />
              <GoalChip label="技能" value="19時限" color={colors.success} />
            </View>
          </View>
        </View>

        {/* メニュー */}
        <Animated.View entering={FadeInDown.duration(350)} style={styles.menu}>
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

        <Text style={styles.footer}>KDSトレーディングカードゲーム（非公式デジタル版）</Text>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** 扇状に並べたカード裏面。中央の1枚だけゆっくり上下に揺れる */
function FannedCard({
  angle,
  offsetX,
  offsetY,
  float,
}: {
  angle: number;
  offsetX: number;
  offsetY: number;
  float?: boolean;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    y.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );
  }, [float, y]);

  // transform は1つにまとめる（別々に書くと後の指定で上書きされてしまう）
  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX },
      { translateY: offsetY + y.value },
      { rotate: `${angle}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.fanCard, anim]}>
      <CardFace cardId="cardback" size="sm" faceDown />
    </Animated.View>
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
  hero: { alignItems: "center", marginTop: spacing.lg, marginBottom: spacing.lg },
  fanRow: {
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fanCard: {
    position: "absolute",
    ...shadow.card,
  },
  titleBlock: { alignItems: "center", marginTop: spacing.sm },
  logoRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  logo: {
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#ffffff",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  goRow: { flexDirection: "row", alignItems: "baseline", marginLeft: 6, marginBottom: 6 },
  go: {
    fontSize: 20,
    fontWeight: "900",
    textShadowColor: "#ffffff",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  catch: {
    fontSize: 14,
    fontWeight: "900",
    color: brand.red,
    letterSpacing: 1,
    marginTop: 2,
    textShadowColor: "#ffffff",
    textShadowRadius: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.primaryDark,
    marginTop: 2,
    letterSpacing: 0.5,
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

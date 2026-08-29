import { Image } from "expo-image";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { JankenHand, useGameStore } from "@/store/gameStore";
import { colors, radius } from "@/theme";

/**
 * オンライン対戦の先攻を決めるじゃんけん（全画面）。
 * サーバーの jankenStart で表示され、勝敗が決まると自動で閉じる。
 * ランダムマッチ待機中のCPU対戦の上にもかぶせて表示される。
 */

const HAND_EMOJI: Record<JankenHand, string> = {
  rock: "✊",
  scissors: "✌️",
  paper: "✋",
};
const HAND_LABEL: Record<JankenHand, string> = {
  rock: "グー",
  scissors: "チョキ",
  paper: "パー",
};
const HANDS: JankenHand[] = ["rock", "scissors", "paper"];

export function OnlineJanken() {
  const jankenActive = useGameStore((s) => s.jankenActive);
  const jankenHand = useGameStore((s) => s.jankenHand);
  const jankenResult = useGameStore((s) => s.jankenResult);
  const sendJanken = useGameStore((s) => s.sendJanken);
  const opponentName = useGameStore((s) => s.opponentName);

  // あいこが続くほど盛り上がる（3連続で「熱すぎる！」、5連続で奇跡）
  const [tieStreak, setTieStreak] = React.useState(0);
  useEffect(() => {
    if (!jankenActive) {
      setTieStreak(0);
      return;
    }
    if (!jankenResult) return;
    if (jankenResult.result === "tie") setTieStreak((n) => n + 1);
    else setTieStreak(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jankenResult, jankenActive]);
  useEffect(() => {
    if (tieStreak === 3 || tieStreak === 5) {
      playSe("cheer");
      haptic("heavy");
    }
  }, [tieStreak]);

  if (!jankenActive) return null;

  const opp = opponentName ?? "相手";

  return (
    <View style={styles.layer}>
      {/* AI生成の対決ステージ背景（スポットライト） */}
      <Image
        source={require("../../assets/images/fx/fx_janken.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.75 }]}
        contentFit="cover"
      />
      <PopIn>
        <Text style={styles.foundText}>🌐 対戦相手が見つかりました！</Text>
        <Text style={styles.title}>{opp} さんとじゃんけん！</Text>
        <Text style={styles.sub}>勝ったほうが先攻です</Text>

        {jankenResult ? (
          <>
            <View style={styles.handsRow}>
              <View style={styles.handCol}>
                <Text style={styles.bigHand}>{HAND_EMOJI[jankenResult.myHand]}</Text>
                <Text style={styles.handWho}>あなた</Text>
              </View>
              <Text style={styles.vs}>VS</Text>
              <View style={styles.handCol}>
                <Text style={styles.bigHand}>{HAND_EMOJI[jankenResult.oppHand]}</Text>
                <Text style={styles.handWho}>{opp}</Text>
              </View>
            </View>
            <Text
              style={[
                styles.resultText,
                jankenResult.result === "win" && { color: "#ffd54d" },
                jankenResult.result === "lose" && { color: "#9fb4ff" },
              ]}
            >
              {jankenResult.result === "tie"
                ? "あいこ！ もう一度"
                : jankenResult.result === "win"
                  ? "勝ち！ あなたが先攻"
                  : `負け… ${opp} さんが先攻`}
            </Text>
            {jankenResult.result === "tie" && tieStreak >= 3 && (
              <Text style={styles.tieHype} allowFontScaling={false}>
                {tieStreak >= 5 ? "🌈 奇跡の" : "🔥 熱すぎる！！"}
                {tieStreak}連続あいこ！
              </Text>
            )}
          </>
        ) : jankenHand ? (
          <>
            <Text style={styles.bigHand}>{HAND_EMOJI[jankenHand]}</Text>
            <Text style={styles.waitText}>{opp} さんが手を選んでいます…</Text>
          </>
        ) : (
          <>
            <Text style={styles.chooseText}>手を選んでください</Text>
            <View style={styles.buttonRow}>
              {HANDS.map((h) => (
                <Pressable
                  key={h}
                  style={styles.handButton}
                  onPress={() => {
                    haptic("medium");
                    sendJanken(h);
                  }}
                >
                  <Text style={styles.handButtonEmoji}>{HAND_EMOJI[h]}</Text>
                  <Text style={styles.handButtonLabel}>{HAND_LABEL[h]}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </PopIn>
    </View>
  );
}

/** ポンと出る箱（Webでも崩れない共有値アニメーション） */
function PopIn({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(0.7);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.05, { duration: 180 }),
      withTiming(1, { duration: 110 })
    );
    opacity.value = withTiming(1, { duration: 160 });
  }, [scale, opacity]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return <Animated.View style={[styles.box, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(8, 12, 34, 0.86)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    zIndex: 90,
  },
  box: {
    alignSelf: "stretch",
    backgroundColor: "#1c2a5e",
    borderRadius: 22,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 8,
  },
  foundText: { color: "#8fd3ee", fontSize: 13, fontWeight: "800" },
  title: { color: "#fff", fontSize: 21, fontWeight: "900", textAlign: "center" },
  sub: { color: "#ffffffbb", fontSize: 13, fontWeight: "700" },
  chooseText: { color: "#fff", fontSize: 15, fontWeight: "800", marginTop: 10 },
  buttonRow: { flexDirection: "row", gap: 10, marginTop: 6, alignSelf: "stretch" },
  handButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 14,
    alignItems: "center",
    gap: 2,
  },
  handButtonEmoji: { fontSize: 34 },
  handButtonLabel: { color: "#fff", fontSize: 14, fontWeight: "900" },
  bigHand: { fontSize: 54, marginTop: 8 },
  waitText: { color: "#ffffffcc", fontSize: 14, fontWeight: "800" },
  handsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 8,
  },
  handCol: { alignItems: "center", gap: 2 },
  handWho: { color: "#ffffffcc", fontSize: 12, fontWeight: "800" },
  vs: { color: "#ffd54d", fontSize: 16, fontWeight: "900" },
  resultText: { color: "#fff", fontSize: 19, fontWeight: "900", marginTop: 4 },
  tieHype: { color: "#ffd54d", fontSize: 15, fontWeight: "900" },
});

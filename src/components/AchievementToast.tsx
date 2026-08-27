import { Image } from "expo-image";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { useAchievementStore } from "@/store/achievementStore";

/**
 * 実績達成の全画面お知らせ。キューに積まれた達成を1つずつ表示する。
 * タップか約2.8秒で次へ進む。アプリ全体（_layout）に1つだけ置く
 */
export function AchievementToast() {
  const toast = useAchievementStore((s) => s.toastQueue[0] ?? null);
  const shiftToast = useAchievementStore((s) => s.shiftToast);

  useEffect(() => {
    if (!toast) return;
    playSe("janken_win");
    haptic("success");
    const t = setTimeout(shiftToast, 2800);
    return () => clearTimeout(t);
  }, [toast, shiftToast]);

  if (!toast) return null;
  return (
    <Pressable style={styles.layer} onPress={shiftToast}>
      {/* AI生成の祝福背景 */}
      <Image
        source={require("../../assets/images/fx/fx_victory.webp")}
        style={[StyleSheet.absoluteFill, { opacity: 0.6 }]}
        contentFit="cover"
      />
      <PopBox key={toast.id}>
        <Text style={styles.kicker}>🏅 実績達成！</Text>
        <Text style={styles.emoji}>{toast.emoji}</Text>
        <Text style={styles.name}>{toast.name}</Text>
        <Text style={styles.desc}>{toast.desc}</Text>
        {toast.title && (
          <Text style={styles.title}>称号「{toast.title}」を手に入れた！</Text>
        )}
      </PopBox>
    </Pressable>
  );
}

function PopBox({ children }: { children: React.ReactNode }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.07, { duration: 200 }),
      withTiming(1, { duration: 130 })
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
    backgroundColor: "rgba(10, 12, 34, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    zIndex: 120,
  },
  box: {
    alignSelf: "stretch",
    backgroundColor: "#20305f",
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "#ffd54d",
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 6,
  },
  kicker: { color: "#ffd54d", fontSize: 14, fontWeight: "900" },
  emoji: { fontSize: 52 },
  name: { color: "#fff", fontSize: 22, fontWeight: "900" },
  desc: { color: "#ffffffbb", fontSize: 13, fontWeight: "700", textAlign: "center" },
  title: {
    marginTop: 4,
    color: "#ffd54d",
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center",
  },
});

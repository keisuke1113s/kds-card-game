import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { colors } from "@/theme";

interface Props {
  label: string;
  value: number;
  goal: number;
  color: string;
}

/**
 * 学科・技能の進捗バー。
 * 教習が進むと、増えたマスが順番に光りながら埋まり、
 * 数字がはずみ、「＋N」が浮かび上がる。
 */
export function TrackBar({ label, value, goal, color }: Props) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);
  const [from, setFrom] = useState(value);
  const countScale = useSharedValue(1);

  useEffect(() => {
    const diff = value - prev.current;
    const before = prev.current;
    prev.current = value;
    if (diff === 0) return;

    setFrom(before);
    setDelta({ amount: diff, key: Date.now() });
    countScale.value = withSequence(
      withTiming(diff > 0 ? 1.35 : 0.82, { duration: 130 }),
      withSpring(1, { damping: 9, stiffness: 260 })
    );
    const t = setTimeout(() => setDelta(null), 1300);
    return () => clearTimeout(t);
  }, [value, countScale]);

  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: countScale.value }] }));
  const gained = value > from;

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments}>
        {Array.from({ length: goal }, (_, i) => (
          <Segment
            key={i}
            filled={i < value}
            color={color}
            // 今回増えたマスだけ、左から順に光らせる
            highlight={gained && i >= from && i < value}
            order={i - from}
          />
        ))}
        {delta && (
          <Animated.Text
            key={delta.key}
            entering={ZoomIn.springify().damping(11)}
            exiting={FadeOutUp.duration(500)}
            style={[styles.delta, { color: delta.amount > 0 ? colors.success : colors.danger }]}
          >
            {delta.amount > 0 ? `＋${delta.amount}` : `−${-delta.amount}`}
            <Text style={styles.deltaUnit}>時限</Text>
          </Animated.Text>
        )}
      </View>
      <Animated.Text style={[styles.count, countStyle]}>
        {value}/{goal}
      </Animated.Text>
    </View>
  );
}

/** 1マス。今回埋まったマスは、順番に飛び出して光る */
function Segment({
  filled,
  color,
  highlight,
  order,
}: {
  filled: boolean;
  color: string;
  highlight: boolean;
  order: number;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  useEffect(() => {
    if (!highlight) return;
    const delay = Math.max(0, order) * 90;
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.5, { duration: 120 }),
        withSpring(1, { damping: 10, stiffness: 280 })
      )
    );
    glow.value = withDelay(
      delay,
      withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 520 }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, order]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
    shadowOpacity: glow.value * 0.9,
    shadowRadius: 6 * glow.value,
  }));

  return (
    <Animated.View
      style={[
        styles.segment,
        { backgroundColor: filled ? color : colors.border, shadowColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { width: 30, fontSize: 11, fontWeight: "700", color: colors.text },
  segments: { flex: 1, flexDirection: "row", gap: 2 },
  segment: { flex: 1, height: 10, borderRadius: 2 },
  // 中央の実況と重ならないよう、教習が進んだことはこのバーの上で伝えきる
  delta: {
    position: "absolute",
    right: 2,
    top: -20,
    fontSize: 24,
    fontWeight: "900",
    textShadowColor: "#fff",
    textShadowRadius: 8,
  },
  deltaUnit: { fontSize: 12, fontWeight: "800" },
  count: { width: 38, fontSize: 11, color: colors.textMuted, textAlign: "right" },
});

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeOutUp, ZoomIn } from "react-native-reanimated";
import { colors } from "@/theme";

interface Props {
  label: string;
  value: number;
  goal: number;
  color: string;
}

/** 学科・技能の進捗バー。増減時は「+N / −N」が浮かび上がる */
export function TrackBar({ label, value, goal, color }: Props) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);

  useEffect(() => {
    const diff = value - prev.current;
    prev.current = value;
    if (diff !== 0) {
      setDelta({ amount: diff, key: Date.now() });
      const t = setTimeout(() => setDelta(null), 1200);
      return () => clearTimeout(t);
    }
  }, [value]);

  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments}>
        {Array.from({ length: goal }, (_, i) => (
          <View
            key={`${i}-${i < value}`}
            style={[styles.segment, { backgroundColor: i < value ? color : colors.border }]}
          />
        ))}
        {delta && (
          <Animated.Text
            key={delta.key}
            entering={ZoomIn.duration(200)}
            exiting={FadeOutUp.duration(400)}
            style={[
              styles.delta,
              { color: delta.amount > 0 ? colors.success : colors.danger },
            ]}
          >
            {delta.amount > 0 ? `＋${delta.amount}` : `−${-delta.amount}`}
          </Animated.Text>
        )}
      </View>
      <Text style={styles.count}>
        {value}/{goal}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { width: 30, fontSize: 11, fontWeight: "700", color: colors.text },
  segments: { flex: 1, flexDirection: "row", gap: 2 },
  segment: { flex: 1, height: 10, borderRadius: 2 },
  delta: {
    position: "absolute",
    right: 4,
    top: -14,
    fontSize: 16,
    fontWeight: "900",
    textShadowColor: "#fff",
    textShadowRadius: 4,
  },
  count: { width: 38, fontSize: 11, color: colors.textMuted, textAlign: "right" },
});

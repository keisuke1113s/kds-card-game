import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

interface Props {
  label: string;
  value: number;
  goal: number;
  color: string;
}

/** 学科・技能の進捗バー（プレイマットの数字マスに相当） */
export function TrackBar({ label, value, goal, color }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.segments}>
        {Array.from({ length: goal }, (_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < value ? color : colors.border },
            ]}
          />
        ))}
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
  count: { width: 38, fontSize: 11, color: colors.textMuted, textAlign: "right" },
});

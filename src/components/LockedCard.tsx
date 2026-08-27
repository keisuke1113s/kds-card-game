import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { cardSize, CardSizeKey } from "@/theme";

/** まだ開放されていないカード（ブラックアウト表示） */
export function LockedCard({
  size = "md",
  onPress,
}: {
  size?: CardSizeKey;
  onPress?: () => void;
}) {
  const dim = cardSize[size];
  return (
    <Pressable
      style={[styles.card, { width: dim.width, height: dim.height }]}
      onPress={onPress}
    >
      <Text style={styles.question}>？</Text>
      <Text style={styles.hint}>未開放</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#20242e",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#3a4152",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  question: { color: "#5a6478", fontSize: 26, fontWeight: "900" },
  hint: { color: "#5a6478", fontSize: 9, fontWeight: "800" },
});

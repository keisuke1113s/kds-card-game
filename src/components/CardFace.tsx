import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { getCard } from "@/data/cards";
import { cardSize, CardSizeKey, colors } from "@/theme";

// カード画像が未提供のあいだはテキストフェイスで描画する。
// 画像が届いたら CardDef.image を見て expo-image に切り替える。

const typeColor: Record<string, string> = {
  instructor: colors.instructor,
  support: colors.support,
  tantou: colors.tantou,
};

const typeLabel: Record<string, string> = {
  instructor: "指導員",
  support: "サポート",
  tantou: "担当",
};

interface Props {
  cardId: string;
  size: CardSizeKey;
  faceDown?: boolean;
  dimmed?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
  disabled?: boolean;
}

export function CardFace({ cardId, size, faceDown, dimmed, style, onPress, disabled }: Props) {
  const dims = cardSize[size];
  if (faceDown) {
    return (
      <View style={[styles.card, styles.faceDown, dims, style]}>
        <Text style={styles.faceDownText}>KDS</Text>
      </View>
    );
  }

  const def = getCard(cardId);
  const color = typeColor[def.type];
  const showEffect = (size === "lg" || size === "xl") && !!def.effectText;
  const nameSize = size === "sm" ? 9 : size === "md" ? 11 : 16;
  const badgeSize = size === "sm" ? 8 : size === "md" ? 10 : 13;

  const body = (
    <View style={[styles.card, dims, { borderColor: color }, dimmed && styles.dimmed, style]}>
      <View style={[styles.header, { backgroundColor: color }]}>
        <Text style={[styles.name, { fontSize: nameSize }]} numberOfLines={1}>
          {def.name}
        </Text>
      </View>
      {def.type === "instructor" ? (
        <View style={styles.badges}>
          <View style={[styles.badge, { backgroundColor: colors.danger }]}>
            <Text style={[styles.badgeText, { fontSize: badgeSize }]}>戦{def.combat}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { fontSize: badgeSize }]}>教{def.lesson}</Text>
          </View>
        </View>
      ) : (
        <Text style={[styles.typeLabel, { color, fontSize: badgeSize }]}>
          {typeLabel[def.type]}
        </Text>
      )}
      {showEffect && (
        <Text style={styles.effect} numberOfLines={6}>
          {def.effectText}
        </Text>
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  faceDown: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
  },
  faceDownText: { color: "#ffffff88", fontWeight: "800", fontSize: 12 },
  dimmed: { opacity: 0.45 },
  header: { paddingHorizontal: 3, paddingVertical: 2 },
  name: { color: "#fff", fontWeight: "700" },
  badges: { flexDirection: "row", gap: 2, padding: 2 },
  badge: { borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  badgeText: { color: "#fff", fontWeight: "700" },
  typeLabel: { fontWeight: "700", padding: 3 },
  effect: { fontSize: 11, color: colors.text, paddingHorizontal: 6, paddingTop: 4, lineHeight: 16 },
});

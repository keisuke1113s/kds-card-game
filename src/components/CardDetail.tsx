import { Image } from "expo-image";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { getCard } from "@/data/cards";
import { cardThumbs } from "@/data/images";
import { CardFace } from "./CardFace";
import { cardSize, colors, shadow } from "@/theme";

const typeLabel: Record<string, string> = {
  instructor: "インストラクター",
  support: "サポート",
  tantou: "担当カード",
};

/**
 * カードの拡大表示＋読みやすいテキストでの詳細。
 * カード画像の効果文は小さく読みづらいため、転記済みテキストを大きく併記する。
 * scroll=false のときはスクロールなし（高さが確定しない場所で潰れるのを防ぐ）。
 */
export function CardDetail({ cardId, scroll = true }: { cardId: string; scroll?: boolean }) {
  const def = getCard(cardId);
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? { style: styles.scroll, contentContainerStyle: styles.container }
    : { style: [styles.container, styles.plain] };
  return (
    <Container {...containerProps}>
      {/* 手に持っているように、後ろから裏面が2枚のぞく。表のカードは真っ直ぐ */}
      <View style={styles.cardWrap}>
        <Image
          source={cardThumbs["cardback"]}
          style={[styles.backCard, styles.backLeft]}
          contentFit="cover"
        />
        <Image
          source={cardThumbs["cardback"]}
          style={[styles.backCard, styles.backRight]}
          contentFit="cover"
        />
        <View style={styles.frontCard}>
          <CardFace cardId={cardId} size="lg" />
        </View>
      </View>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{def.name}</Text>
        <Text style={styles.type}>{typeLabel[def.type]}</Text>
      </View>
      {def.type === "instructor" && (
        <View style={styles.statsRow}>
          <View style={[styles.statBadge, { backgroundColor: colors.danger }]}>
            <Text style={styles.statText}>戦闘力 {def.combat}</Text>
          </View>
          <View style={[styles.statBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.statText}>教習力 {def.lesson}</Text>
          </View>
        </View>
      )}
      {!!def.effectText && (
        <View style={styles.effectBox}>
          <Text style={styles.effectLabel}>効果</Text>
          <Text style={styles.effectText}>{def.effectText}</Text>
        </View>
      )}
      {!def.effectText && (
        <Text style={styles.noEffect}>効果なし</Text>
      )}
      {!!def.flavor && <Text style={styles.flavor}>{def.flavor}</Text>}
    </Container>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: "stretch", maxHeight: 480 },
  container: { alignItems: "center", gap: 10, paddingBottom: 4 },
  plain: { alignSelf: "stretch" },
  cardWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: cardSize.lg.width + 56,
    height: cardSize.lg.height + 16,
  },
  backCard: {
    position: "absolute",
    width: cardSize.lg.width,
    height: cardSize.lg.height,
    borderRadius: 6,
    ...shadow.card,
  },
  backLeft: { transform: [{ translateX: -22 }, { rotate: "-9deg" }] },
  backRight: { transform: [{ translateX: 22 }, { rotate: "9deg" }] },
  frontCard: { ...shadow.overlay },
  headerRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { fontSize: 20, fontWeight: "800", color: colors.text },
  type: { fontSize: 13, color: colors.textMuted, fontWeight: "700" },
  statsRow: { flexDirection: "row", gap: 8 },
  statBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  effectBox: {
    alignSelf: "stretch",
    backgroundColor: colors.background,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  effectLabel: { fontSize: 12, fontWeight: "800", color: colors.primaryDark },
  effectText: { fontSize: 16, lineHeight: 24, color: colors.text },
  noEffect: { fontSize: 14, color: colors.textMuted },
  flavor: { fontSize: 13, color: colors.textMuted, fontStyle: "italic" },
});

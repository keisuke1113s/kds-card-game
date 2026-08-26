import { Image } from "expo-image";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { getCard } from "@/data/cards";
import { cardImages } from "@/data/images";
import { cardSize, CardSizeKey, colors } from "@/theme";

// 実カード画像（868×1213）をそのまま描画する。
// 画像が無いカードはテキストフェイスでフォールバック。

const typeColor: Record<string, string> = {
  instructor: colors.instructor,
  support: colors.support,
  tantou: colors.tantou,
};

interface Props {
  cardId: string;
  size: CardSizeKey;
  faceDown?: boolean;
  dimmed?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}

export function CardFace({ cardId, size, faceDown, dimmed, onPress, disabled }: Props) {
  const dims = cardSize[size];

  let body: React.ReactNode;
  if (faceDown) {
    const back = cardImages["cardback"];
    body = back ? (
      <Image source={back} style={[styles.image, dims]} contentFit="cover" />
    ) : (
      <View style={[styles.card, styles.faceDownFallback, dims]}>
        <Text style={styles.faceDownText}>KDS</Text>
      </View>
    );
  } else {
    const def = getCard(cardId);
    const img = cardImages[def.image ?? def.id];
    if (img) {
      body = (
        <Image
          source={img}
          style={[styles.image, dims, dimmed && styles.dimmed]}
          contentFit="cover"
          transition={100}
        />
      );
    } else {
      const color = typeColor[def.type];
      body = (
        <View style={[styles.card, dims, { borderColor: color }, dimmed && styles.dimmed]}>
          <View style={[styles.header, { backgroundColor: color }]}>
            <Text style={styles.name} numberOfLines={1}>
              {def.name}
            </Text>
          </View>
          {def.type === "instructor" && (
            <Text style={styles.stats}>
              戦{def.combat} 教{def.lesson}
            </Text>
          )}
        </View>
      );
    }
  }

  if (!onPress) return <>{body}</>;
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={4}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: { borderRadius: 6, backgroundColor: colors.border },
  card: {
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  faceDownFallback: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  faceDownText: { color: "#ffffff88", fontWeight: "800", fontSize: 12 },
  dimmed: { opacity: 0.45 },
  header: { paddingHorizontal: 3, paddingVertical: 2 },
  name: { color: "#fff", fontWeight: "700", fontSize: 10 },
  stats: { fontSize: 10, fontWeight: "700", color: colors.text, padding: 3 },
});

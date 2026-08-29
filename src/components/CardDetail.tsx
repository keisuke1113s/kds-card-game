import { Image } from "expo-image";
import React, { useRef } from "react";
import { Dimensions, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { getCard } from "@/data/cards";
import { cardThumbs } from "@/data/images";
import { CardFace } from "./CardFace";
import { cardSize, colors, shadow } from "@/theme";

/**
 * 指でなぞるとカードが傾き、ホログラム風の光沢が流れる3Dチルト。
 * 触っていないときはゆっくり元の向きに戻る
 */
function TiltCard({ children }: { children: React.ReactNode }) {
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const gloss = useSharedValue(0);
  const size = useRef({ w: 1, h: 1 });
  const onTouch = (x: number, y: number) => {
    const nx = Math.min(1, Math.max(0, x / size.current.w)) - 0.5;
    const ny = Math.min(1, Math.max(0, y / size.current.h)) - 0.5;
    ry.value = nx * 22;
    rx.value = -ny * 16;
    gloss.value = nx + 0.5;
  };
  const release = () => {
    rx.value = withSpring(0, { damping: 12 });
    ry.value = withSpring(0, { damping: 12 });
    gloss.value = withSpring(0.5);
  };
  const style = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { rotateX: `${rx.value}deg` },
      { rotateY: `${ry.value}deg` },
    ],
  }));
  const glossStyle = useAnimatedStyle(() => ({
    opacity: Math.abs(ry.value) / 30 + 0.05,
    transform: [{ translateX: (gloss.value - 0.5) * 140 }, { rotate: "18deg" }],
  }));
  return (
    <Animated.View
      style={style}
      onLayout={(e) => {
        size.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
      }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderMove={(e) => onTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderGrant={(e) => onTouch(e.nativeEvent.locationX, e.nativeEvent.locationY)}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      {children}
      <Animated.View style={[styles.gloss, glossStyle]} pointerEvents="none" />
    </Animated.View>
  );
}

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
      {/* 手に持っているように、後ろから裏面が1枚のぞく。表のカードは真っ直ぐ */}
      <View style={styles.cardWrap}>
        <Image
          source={cardThumbs["cardback"]}
          style={[styles.backCard, styles.backRight]}
          contentFit="cover"
        />
        <View style={styles.frontCard}>
          <TiltCard>
            <CardFace cardId={cardId} size="lg" />
          </TiltCard>
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
  gloss: {
    position: "absolute",
    top: -30,
    bottom: -30,
    width: 70,
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: 35,
  },
  scroll: {
    alignSelf: "stretch",
    maxHeight: Math.min(560, Dimensions.get("window").height * 0.58),
  },
  container: { alignItems: "center", gap: 8, paddingBottom: 8 },
  plain: { alignSelf: "stretch" },
  cardWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: cardSize.lg.width + 78,
    height: cardSize.lg.height + 16,
  },
  backCard: {
    position: "absolute",
    width: cardSize.lg.width,
    height: cardSize.lg.height,
    borderRadius: 6,
    ...shadow.card,
  },
  backRight: { transform: [{ translateX: 40 }, { translateY: 6 }, { rotate: "14deg" }] },
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

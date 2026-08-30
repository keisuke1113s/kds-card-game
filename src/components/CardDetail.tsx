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
import { useSettingsStore } from "@/store/settingsStore";

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

/** 効果文に出てくる用語の解説（タップでポップ表示） */
const GLOSSARY: Record<string, string> = {
  "休憩": "カードを横向きにした状態。休憩中は行動できず、バトルの標的にされやすくなります。次の自分のターンの始めに元気に戻ります。",
  "元気": "カードが縦向きの状態。行動（学科・技能・バトルなど）を選べます。",
  "場外": "退場したカードの置き場。場外のカードは基本的に対戦中は戻ってきません（効果で戻ることがあります）。",
  "山札": "自分のデッキの束。ここからカードを引きます。山札が無くなると敗北です。",
  "手札": "手に持っているカード。インストラクターやサポートをここから出します。",
  "担当": "担当カードのこと。対戦中ずっと場にいて、常に効果を発揮します。",
  "サポート": "サポートカード。メインのターンやバトル中に使える助っ人カードです。",
  "教習力": "学科・技能を進めるときに進むマスの数です。",
  "戦闘力": "バトルの強さ。サポートなどで一時的に増えることがあります。",
  "リーチ": "卒業（学科10・技能19の達成）まで残りわずかの状態。",
};
const TERM_RE = new RegExp(`(${Object.keys(GLOSSARY).join("|")})`, "g");

/** 効果文を、用語だけタップできるテキストとして描画する */
function EffectTextWithGlossary({
  text,
  onTerm,
  style,
}: {
  text: string;
  onTerm: (term: string) => void;
  style?: object;
}) {
  const parts = text.split(TERM_RE);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        GLOSSARY[part] ? (
          <Text key={i} style={styles.termLink} onPress={() => onTerm(part)}>
            {part}
          </Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
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
  // 設定「大きめ文字」で効果文をひとまわり大きく
  const largeText = useSettingsStore((s) => s.largeText);
  const bigger = largeText ? { fontSize: 16, lineHeight: 24 } : null;
  const [term, setTerm] = React.useState<string | null>(null);
  const Container = scroll ? ScrollView : View;
  const containerProps = scroll
    ? { style: styles.scroll, contentContainerStyle: styles.container }
    : { style: [styles.container, styles.plain] };
  return (
    <Container {...containerProps}>
      {/* 手に持っているように、後ろから裏面が1枚のぞく。表のカードは真っ直ぐ。
          背の低い画面では効果文まで見えるようにカードを縮小する */}
      <View
        style={[
          styles.cardWrap,
          COMPACT && {
            width: (cardSize.lg.width + 78) * COMPACT_SCALE,
            height: (cardSize.lg.height + 16) * COMPACT_SCALE,
          },
        ]}
      >
        <View style={COMPACT ? { transform: [{ scale: COMPACT_SCALE }] } : null}>
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
          <Text style={styles.effectLabel}>効果（下線の言葉はタップで説明）</Text>
          <EffectTextWithGlossary
            text={def.effectText}
            style={[styles.effectText, bigger]}
            onTerm={setTerm}
          />
        </View>
      )}
      {term && (
        <View style={styles.termBox}>
          <Text style={styles.termTitle}>「{term}」とは</Text>
          <Text style={styles.termBody}>{GLOSSARY[term]}</Text>
          <Text style={styles.termClose} onPress={() => setTerm(null)}>
            閉じる
          </Text>
        </View>
      )}
      {!def.effectText && (
        <Text style={styles.noEffect}>効果なし</Text>
      )}
      {!!def.flavor && <Text style={styles.flavor}>{def.flavor}</Text>}
    </Container>
  );
}

// 画面が低い端末（iPhone縦持ちなど）ではカードを縮めて効果文が隠れないようにする
// 縦1000px未満（iPhone Pro Max含むスマホ全般）はカードを縮小して、
// 効果の説明とボタンまでスクロールなしで収まるようにする
const COMPACT = Dimensions.get("window").height < 1000;
const COMPACT_SCALE = 0.74;

const styles = StyleSheet.create({
  termLink: {
    textDecorationLine: "underline",
    color: colors.primary,
    fontWeight: "800",
  },
  termBox: {
    backgroundColor: "#eef4ff",
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    padding: 12,
    gap: 6,
    alignSelf: "stretch",
  },
  termTitle: { fontSize: 14, fontWeight: "900", color: colors.primaryDark },
  termBody: { fontSize: 13, lineHeight: 20, color: colors.text },
  termClose: { fontSize: 12, fontWeight: "800", color: colors.primary, textAlign: "right" },
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

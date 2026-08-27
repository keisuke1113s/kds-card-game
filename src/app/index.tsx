import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useEffect } from "react";
import { stopBgm } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { Image } from "expo-image";
import { cardSmalls } from "@/data/images";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { colors, radius, shadow, spacing } from "@/theme";
import { InstallPrompt } from "@/components/InstallPrompt";
import { ScreenEnter } from "@/components/ScreenEnter";

/** 開発版デモ（GitHub Pages の /dev/ 配下）で開いているか */
const IS_DEV_DEMO =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location.pathname.includes("/dev/");

/** カード実物のロゴから採色した色 */
const brand = {
  red: "#d83030", // K・「!」・キャッチコピー
  yellow: "#e49c18", // D・G
  green: "#78b424", // S
  coral: "#e2604a", // a
  blue: "#3d8fd0", // 1つ目の O
  lime: "#c9d63a", // 2つ目の G
  skyblue: "#8fd3ee", // 2つ目の O
  amber: "#eeb121", // 最後の「!」
} as const;

export default function HomeScreen() {
  const router = useRouter();
  const inProgress = useGameStore((s) => s.state !== null && s.state.phase.type !== "finished");
  const queueCancelledNotice = useGameStore((s) => s.queueCancelledNotice);
  const clearQueueCancelledNotice = useGameStore((s) => s.clearQueueCancelledNotice);
  const deckState = useDeckStore();

  // BGMは対戦中のみ。ホームに戻ったら止める
  useFocusEffect(
    useCallback(() => {
      stopBgm();
    }, [])
  );

  // ランダムマッチの相手待ちを解除して戻ってきたときのお知らせ。数秒で自動的に消す
  useEffect(() => {
    if (!queueCancelledNotice) return;
    const timer = setTimeout(clearQueueCancelledNotice, 3200);
    return () => clearTimeout(timer);
  }, [queueCancelledNotice, clearQueueCancelledNotice]);

  const activeDeck = resolveActiveDeck(deckState);
  const record = useRecordStore();
  const opponentDeck = cpuDeckFor(activeDeck, deckState.builtinOverrides);

  return (
    <LinearGradient colors={[colors.background, colors.backgroundDeep]} style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {/* 社外に出さないための注意書き（最上部に固定で目立たせる） */}
        <View style={styles.warning}>
          <Text style={styles.warningText}>開発中のため社外厳禁！！</Text>
        </View>


        {/* 開発版デモ（/dev/）のときだけ目印を出す。本番デモとネイティブでは出さない */}
        {IS_DEV_DEMO && (
          <View style={styles.devBadge}>
            <Text style={styles.devBadgeText}>🔧 開発版（動作確認用）</Text>
          </View>
        )}

        {/* タイトル：カード裏面を扇状に並べた上にロゴを置く */}
        <View style={styles.hero}>
          <View style={styles.fanRow}>
            <FannedCard angle={-14} offsetX={-58} offsetY={10} />
            <FannedCard angle={-6} offsetX={-28} offsetY={2} />
            <FannedCard angle={0} offsetX={0} offsetY={-2} float />
            <FannedCard angle={6} offsetX={28} offsetY={2} />
            <FannedCard angle={14} offsetX={58} offsetY={10} />
          </View>

          <View style={styles.titleBlock}>
            {/* カード実物のロゴと同じ配色にする */}
            <View style={styles.logoRow}>
              <Text style={[styles.logo, { color: brand.red }]}>K</Text>
              <Text style={[styles.logo, { color: brand.yellow }]}>D</Text>
              <Text style={[styles.logo, { color: brand.green }]}>S</Text>
              <View style={styles.goRow}>
                <Text style={[styles.go, { color: brand.coral }]}>a</Text>
                <Text style={[styles.go, { color: brand.yellow }]}> G</Text>
                <Text style={[styles.go, { color: brand.blue }]}>O</Text>
                <Text style={[styles.go, { color: brand.red }]}>!</Text>
                <Text style={[styles.go, { color: brand.lime }]}> G</Text>
                <Text style={[styles.go, { color: brand.skyblue }]}>O</Text>
                <Text style={[styles.go, { color: brand.amber }]}>!</Text>
              </View>
            </View>
            {/* 「運転」「楽しく」だけ赤、つなぎの言葉は黒 */}
            <Text style={styles.catch}>
              <Text style={styles.catchRed}>運転</Text>
              <Text style={styles.catchDark}>が</Text>
              <Text style={styles.catchRed}>楽しく</Text>
              <Text style={styles.catchDark}>なる!!</Text>
            </Text>
            <Text style={styles.title}>トレーディングカードゲーム</Text>
            {/* 実カード配布の案内 */}
            <View style={styles.realCardNote}>
              <Text style={styles.realCardNoteText}>
                KDSに入校したら、本物のカードをもらえるよ♪
              </Text>
            </View>
            <View style={styles.goalRow}>
              <GoalChip label="学科" value="10時限" color={colors.primary} />
              <GoalChip label="技能" value="19時限" color={colors.success} />
            </View>
          </View>
        </View>

        {/* メニュー */}
        <ScreenEnter style={styles.menu} delay={80} keepVisible>
          {inProgress && (
            <AppButton
              label="対戦に戻る"
              icon="▶"
              tone="accent"
              size="lg"
              fullWidth
              onPress={() => router.push("/battle")}
            />
          )}

          <AppButton
            label="はじめての方へ（遊び方）"
            icon="📖"
            tone="accent"
            fullWidth
            onPress={() => router.push("/tutorial")}
          />
          <AppButton
            label="CPU対戦"
            iconNode={<CrossedCards />}
            tone="primary"
            size="lg"
            feel="medium"
            fullWidth
            onPress={() => router.push("/prematch")}
          />
          <AppButton
            label="オンライン対戦"
            icon="🌐"
            tone="primary"
            size="lg"
            feel="medium"
            fullWidth
            onPress={() => router.push("/online")}
          />
          <View style={styles.matchupCard}>
            <Text style={styles.matchupSide} numberOfLines={1}>
              {activeDeck.name}
            </Text>
            <Text style={styles.matchupVs}>VS</Text>
            <Text style={styles.matchupSide} numberOfLines={1}>
              {opponentDeck.name}
            </Text>
          </View>
          {/* 通算成績（1戦でもしたら出す） */}
          {record.wins + record.losses > 0 && (
            <Text style={styles.recordLine}>
              通算 <Text style={styles.recordWin}>{record.wins}勝</Text>{" "}
              <Text style={styles.recordLose}>{record.losses}敗</Text>
              {record.streak >= 2 ? `　🔥${record.streak}連勝中` : ""}
            </Text>
          )}

          <View style={styles.row}>
            <AppButton
              label="デッキ構築"
              iconNode={
                <Image
                  source={cardSmalls["cardback"]}
                  style={styles.buttonCardIcon}
                  contentFit="cover"
                />
              }
              tone="success"
              style={styles.flex}
              onPress={() => router.push("/deck")}
            />
            <AppButton
              label="カード図鑑"
              iconNode={
                <Image
                  source={cardSmalls["i_shibuya_hana"]}
                  style={styles.buttonCardIcon}
                  contentFit="cover"
                />
              }
              tone="primary"
              style={styles.flex}
              onPress={() => router.push("/library")}
            />
          </View>
          <AppButton
            label="ルール"
            icon="📋"
            tone="ghost"
            fullWidth
            onPress={() => router.push("/rules")}
          />

          {/* ホーム画面に追加できる環境でだけ出る案内 */}
          <InstallPrompt />
        </ScreenEnter>

        <Text style={styles.footer}>KDSトレーディングカードゲーム（非公式デジタル版）</Text>
        </ScrollView>

        {/* ランダムマッチの相手待ちをやめて戻ってきたときの全画面のお知らせ */}
        {queueCancelledNotice && (
          <QueueCancelledOverlay onClose={clearQueueCancelledNotice} />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

/** 対戦ボタン用：自分のカードと相手のカードを交差させたアイコン */
function CrossedCards() {
  return (
    <View style={styles.crossWrap}>
      <Image
        source={cardSmalls["i_konno"]}
        style={[styles.crossCard, styles.crossLeft]}
        contentFit="cover"
      />
      <Image
        source={cardSmalls["cardback"]}
        style={[styles.crossCard, styles.crossRight]}
        contentFit="cover"
      />
    </View>
  );
}

/** 扇状に並べたカード裏面。中央の1枚だけゆっくり上下に揺れる */
function FannedCard({
  angle,
  offsetX,
  offsetY,
  float,
}: {
  angle: number;
  offsetX: number;
  offsetY: number;
  float?: boolean;
}) {
  const y = useSharedValue(0);
  useEffect(() => {
    if (!float) return;
    y.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );
  }, [float, y]);

  // transform は1つにまとめる（別々に書くと後の指定で上書きされてしまう）
  const anim = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX },
      { translateY: offsetY + y.value },
      { rotate: `${angle}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.fanCard, anim]}>
      <CardFace cardId="cardback" size="sm" faceDown />
    </Animated.View>
  );
}

function GoalChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.goalChip, { borderColor: color }]}>
      <Text style={[styles.goalLabel, { color }]}>{label}</Text>
      <Text style={styles.goalValue}>{value}</Text>
    </View>
  );
}

/** 相手待ち解除の全画面お知らせ。ポンと出て、タップか数秒で消える */
function QueueCancelledOverlay({ onClose }: { onClose: () => void }) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSequence(
      withTiming(1.06, { duration: 200 }),
      withTiming(1, { duration: 120 })
    );
    opacity.value = withTiming(1, { duration: 180 });
  }, [scale, opacity]);
  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
  return (
    <Pressable style={styles.queueOverlayBg} onPress={onClose}>
      <Animated.View style={[styles.queueOverlayBox, boxStyle]}>
        <Text style={styles.queueOverlayEmoji}>🌐</Text>
        <Text style={styles.queueOverlayTitle}>相手待ちを解除しました</Text>
        <Text style={styles.queueOverlaySub}>
          オンライン対戦のランダムマッチ待機を終了しました。{"\n"}
          また遊ぶときは「オンライン対戦」からどうぞ。
        </Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  // 中身をひとかたまりにして、画面の上下中央にそろえる
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  hero: { alignItems: "center", marginBottom: spacing.lg },
  fanRow: {
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  fanCard: {
    position: "absolute",
    ...shadow.card,
  },
  titleBlock: { alignItems: "center", marginTop: spacing.sm },
  logoRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  logo: {
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: 1,
    textShadowColor: "#ffffff",
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  goRow: { flexDirection: "row", alignItems: "baseline", marginLeft: 6, marginBottom: 6 },
  go: {
    fontSize: 20,
    fontWeight: "900",
    textShadowColor: "#ffffff",
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  catchRed: { color: brand.red },
  catchDark: { color: colors.text },
  catch: {
    fontSize: 14,
    fontWeight: "900",
    color: brand.red,
    letterSpacing: 1,
    marginTop: 2,
    textShadowColor: "#ffffff",
    textShadowRadius: 4,
  },
  title: {
    fontSize: 19,
    fontWeight: "900",
    color: colors.primaryDark,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  goalRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  goalChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    ...shadow.card,
  },
  goalLabel: { fontSize: 12, fontWeight: "800" },
  goalValue: { fontSize: 13, fontWeight: "800", color: colors.text },
  recordLine: {
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    marginTop: -6,
  },
  recordWin: { color: colors.success, fontWeight: "900" },
  recordLose: { color: colors.danger, fontWeight: "900" },
  realCardNote: {
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingHorizontal: 16,
    marginTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  realCardNoteText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  devBadge: {
    alignSelf: "center",
    backgroundColor: "#4a148c",
    borderRadius: radius.md,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
  },
  devBadgeText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  queueOverlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(12, 18, 46, 0.78)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    zIndex: 50,
  },
  queueOverlayBox: {
    alignSelf: "stretch",
    backgroundColor: "#4a3f9f",
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8,
  },
  queueOverlayEmoji: { fontSize: 44 },
  queueOverlayTitle: { color: "#fff", fontSize: 21, fontWeight: "900" },
  queueOverlaySub: {
    color: "#ffffffcc",
    fontSize: 13,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 20,
  },
  warning: {
    alignSelf: "center",
    backgroundColor: "#ffe5e5",
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
  },
  warningText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  menu: { gap: spacing.md },
  row: { flexDirection: "row", gap: spacing.md },
  flex: { flex: 1 },
  buttonCardIcon: {
    width: 20,
    height: 28,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ffffff88",
  },
  crossWrap: { width: 40, height: 30, alignItems: "center", justifyContent: "center" },
  crossCard: {
    position: "absolute",
    width: 21,
    height: 29,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "#ffffffaa",
  },
  crossLeft: { transform: [{ translateX: -8 }, { rotate: "-18deg" }] },
  crossRight: { transform: [{ translateX: 8 }, { rotate: "18deg" }] },
  matchupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: -spacing.xs,
  },
  matchupSide: { fontSize: 12, fontWeight: "600", color: colors.textMuted, flexShrink: 1 },
  matchupVs: { fontSize: 11, fontWeight: "900", color: colors.accent },
  footer: {
    marginTop: spacing.lg,
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
});

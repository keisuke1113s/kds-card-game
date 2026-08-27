import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { CardFace } from "@/components/CardFace";
import { preloadForMatch } from "@/data/preload";
import { colors, radius, spacing } from "@/theme";

/**
 * 対戦前の準備。説明書の手順どおりに進める。
 *
 *   ① お互いにデッキをよくシャッフルします
 *   ② じゃんけんで先攻・後攻を決めます   ← 実際に手を選ぶ
 *
 * ③（山札から5枚引く）は対戦画面で配る演出として続く。
 */

export type Hand = "rock" | "scissors" | "paper";

const HAND_LABEL: Record<Hand, { emoji: string; name: string }> = {
  rock: { emoji: "✊", name: "グー" },
  scissors: { emoji: "✌️", name: "チョキ" },
  paper: { emoji: "🖐", name: "パー" },
};

const HANDS: Hand[] = ["rock", "scissors", "paper"];

/** CPUの手を決める（描画中には呼ばれない。手を選んだときだけ） */
function randomHand(): Hand {
  return HANDS[Math.floor(Math.random() * HANDS.length)];
}

/** 1 = 自分の勝ち、-1 = 相手の勝ち、0 = あいこ */
function judge(mine: Hand, theirs: Hand): 1 | 0 | -1 {
  if (mine === theirs) return 0;
  const beats: Record<Hand, Hand> = { rock: "scissors", scissors: "paper", paper: "rock" };
  return beats[mine] === theirs ? 1 : -1;
}

const SHUFFLE_MS = 1600;

type Phase = "shuffle" | "choose" | "reveal";

export function MatchPrep({
  cardIds,
  onDecided,
  onCancel,
}: {
  /** この対戦で使うカード。準備の裏で絵を読み込んでおく */
  cardIds: string[];
  /** じゃんけんの決着。true なら自分が先攻 */
  onDecided: (firstPlayerIsMe: boolean) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("shuffle");
  const [round, setRound] = useState(1);
  const [mine, setMine] = useState<Hand | null>(null);
  const [theirs, setTheirs] = useState<Hand | null>(null);
  const [draw, setDraw] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setPhase("choose"), SHUFFLE_MS);
    // 準備をしている間に、対戦で使うカードの絵をそろえておく
    void preloadForMatch(cardIds);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (hand: Hand) => {
    haptic("medium");
    playSe("janken");
    const cpu = randomHand();
    setMine(hand);
    setTheirs(cpu);
    setDraw(false);
    setPhase("reveal");

    const result = judge(hand, cpu);
    if (result === 0) {
      // あいこ。もう一度選び直す
      setTimeout(() => {
        setDraw(true);
        haptic("warning");
      }, 700);
      setTimeout(() => {
        setMine(null);
        setTheirs(null);
        setDraw(false);
        setRound((r) => r + 1);
        setPhase("choose");
      }, 1600);
      return;
    }

    setTimeout(() => {
      haptic(result === 1 ? "success" : "warning");
      playSe(result === 1 ? "janken_win" : "janken_lose");
    }, 650);
    setTimeout(() => onDecided(result === 1), 2100);
  };

  const stepNumber = phase === "shuffle" ? 1 : 2;
  const stepText =
    phase === "shuffle"
      ? "お互いにデッキをよくシャッフルします"
      : "じゃんけんで先攻・後攻を決めます";

  const result = mine && theirs ? judge(mine, theirs) : null;

  return (
    <View style={styles.layer}>
      <Animated.View key={stepNumber} entering={FadeIn.duration(260)} style={styles.caption}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{stepNumber}</Text>
        </View>
        <Text style={styles.captionText}>{stepText}</Text>
      </Animated.View>

      <View style={styles.stage}>
        {phase === "shuffle" ? (
          <Shuffle />
        ) : (
          <View style={styles.jankenRow}>
            <HandSide
              label="あなた"
              hand={mine}
              waiting={phase === "choose"}
              winner={result === 1}
            />
            <Text style={styles.vs}>VS</Text>
            <HandSide
              label="CPU"
              hand={theirs}
              waiting={phase === "choose"}
              winner={result === -1}
              mirrored
            />
          </View>
        )}
      </View>

      {phase === "choose" && (
        <Animated.View entering={FadeIn.duration(240)} style={styles.chooseWrap}>
          <Text style={styles.chooseTitle}>
            {round === 1 ? "手を選んでください" : `あいこ！ もう一度（${round}回目）`}
          </Text>
          <View style={styles.handButtons}>
            {HANDS.map((h) => (
              <Pressable key={h} style={styles.handButton} onPress={() => choose(h)}>
                <Text style={styles.handButtonEmoji} allowFontScaling={false}>
                  {HAND_LABEL[h].emoji}
                </Text>
                <Text style={styles.handButtonLabel}>{HAND_LABEL[h].name}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onCancel} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelText}>やめる</Text>
          </Pressable>
        </Animated.View>
      )}

      {draw && (
        <Animated.View
          entering={ZoomIn.springify().damping(12)}
          exiting={FadeOut.duration(200)}
          style={[styles.resultPill, { backgroundColor: colors.textMuted }]}
        >
          <Text style={styles.resultText}>あいこ！</Text>
        </Animated.View>
      )}

      {phase === "reveal" && result !== null && result !== 0 && (
        <Animated.View
          entering={ZoomIn.springify().damping(11).delay(650)}
          style={[
            styles.resultPill,
            { backgroundColor: result === 1 ? colors.success : colors.danger },
          ]}
        >
          <Text style={styles.resultText}>先攻は{result === 1 ? "あなた" : "CPU"}</Text>
        </Animated.View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- ①シャッフル

/** 山札から数枚が抜き出されては戻る、リフルシャッフルの動き */
function Shuffle() {
  useEffect(() => {
    const timers = [0, 320, 640, 960].map((d) =>
      setTimeout(() => {
        playSe("draw");
        haptic("light");
      }, d)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <View style={styles.deckStage}>
      {/* 動かない土台の山 */}
      <View style={styles.deckBase}>
        <CardFace cardId="cardback" size="sm" faceDown />
      </View>
      {[0, 1, 2, 3].map((i) => (
        <ShuffleCard key={i} index={i} />
      ))}
    </View>
  );
}

function ShuffleCard({ index }: { index: number }) {
  const p = useSharedValue(0);
  // 左右交互に抜き出す
  const dir = index % 2 === 0 ? 1 : -1;

  useEffect(() => {
    p.value = withDelay(
      index * 110,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })
        ),
        3,
        false
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: p.value * 62 * dir },
      { translateY: p.value * -10 - index * 2 },
      { rotate: `${p.value * 13 * dir}deg` },
    ],
  }));

  return (
    <Animated.View style={[styles.deckBase, style]}>
      <CardFace cardId="cardback" size="sm" faceDown />
    </Animated.View>
  );
}

// ---------------------------------------------------------------- ②じゃんけん

/** 手を出す側。選ぶ前は「最初はグー」のように上下に振り続ける */
function HandSide({
  label,
  hand,
  waiting,
  winner,
  mirrored,
}: {
  label: string;
  hand: Hand | null;
  waiting: boolean;
  winner: boolean;
  mirrored?: boolean;
}) {
  const swing = useSharedValue(0);
  const pop = useSharedValue(1);

  useEffect(() => {
    if (waiting) {
      swing.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 260, easing: Easing.in(Easing.quad) })
        ),
        -1,
        false
      );
    } else {
      swing.value = withTiming(0, { duration: 120 });
      pop.value = withSequence(
        withTiming(1.35, { duration: 150 }),
        withTiming(1, { duration: 220 })
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waiting]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: -swing.value * 16 },
      { scale: pop.value },
      { scaleX: mirrored ? -1 : 1 },
    ],
  }));

  return (
    <View style={styles.handSide}>
      <Animated.Text style={[styles.handEmoji, style]} allowFontScaling={false}>
        {hand ? HAND_LABEL[hand].emoji : "✊"}
      </Animated.Text>
      <Text style={[styles.handLabel, winner && styles.handLabelWin]}>
        {label}
        {winner ? " 勝ち" : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0b1f4aee",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.lg,
  },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#ffffff26",
    borderWidth: 1.5,
    borderColor: "#ffffffaa",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontWeight: "900", fontSize: 13 },
  captionText: { color: "#fff", fontSize: 15, fontWeight: "800", flexShrink: 1 },

  stage: { height: 170, alignItems: "center", justifyContent: "center" },
  deckStage: { width: 200, height: 150, alignItems: "center", justifyContent: "center" },
  deckBase: { position: "absolute" },

  jankenRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  handSide: { alignItems: "center", gap: 4, width: 100 },
  handEmoji: { fontSize: 58, lineHeight: 70 },
  handLabel: { color: "#ffffffcc", fontWeight: "800", fontSize: 13 },
  handLabelWin: { color: colors.accent },
  vs: { color: "#ffffff88", fontWeight: "900", fontSize: 16 },

  chooseWrap: { alignItems: "center", gap: spacing.md },
  chooseTitle: { color: "#fff", fontSize: 15, fontWeight: "800" },
  handButtons: { flexDirection: "row", gap: spacing.sm },
  handButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 2,
    minWidth: 84,
  },
  handButtonEmoji: { fontSize: 30, lineHeight: 36 },
  handButtonLabel: { color: "#fff", fontWeight: "800", fontSize: 13 },
  cancel: { paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: "#ffffff99", fontWeight: "700", fontSize: 13 },

  resultPill: { paddingVertical: 8, paddingHorizontal: 22, borderRadius: radius.pill },
  resultText: { color: "#fff", fontWeight: "900", fontSize: 18 },
});

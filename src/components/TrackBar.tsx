import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { colors } from "@/theme";

interface Props {
  label: string;
  value: number;
  goal: number;
  color: string;
  /** 学科なら勉強、技能なら教習車の演出を出す */
  kind: "academic" | "skill";
}

/**
 * 学科・技能の進捗バー。
 * 教習が進むと、増えたマスが順番に光りながら埋まり、
 * 数字がはずみ、「＋N」が浮かび上がる。
 */
export function TrackBar({ label, value, goal, color, kind }: Props) {
  const prev = useRef(value);
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null);
  const [from, setFrom] = useState(value);
  const countScale = useSharedValue(1);

  useEffect(() => {
    const diff = value - prev.current;
    const before = prev.current;
    prev.current = value;
    if (diff === 0) return;

    setFrom(before);
    setDelta({ amount: diff, key: Date.now() });
    countScale.value = withSequence(
      withTiming(diff > 0 ? 1.35 : 0.82, { duration: 130 }),
      withSpring(1, { damping: 9, stiffness: 260 })
    );
    const t = setTimeout(() => setDelta(null), 1300);
    return () => clearTimeout(t);
  }, [value, countScale]);

  const countStyle = useAnimatedStyle(() => ({ transform: [{ scale: countScale.value }] }));
  const gained = value > from;
  const lost = value < from;

  // 戻されたときは、バーごと横に震わせる
  const shake = useSharedValue(0);
  useEffect(() => {
    if (!delta || delta.amount >= 0) return;
    shake.value = withSequence(
      withTiming(-5, { duration: 45 }),
      withTiming(5, { duration: 45 }),
      withTiming(-4, { duration: 45 }),
      withTiming(3, { duration: 45 }),
      withTiming(0, { duration: 40 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delta]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Animated.View style={[styles.row, shakeStyle]}>
      <Text style={[styles.label, lost && styles.labelLost]}>{label}</Text>
      <View style={styles.segments}>
        {Array.from({ length: goal }, (_, i) => (
          <Segment
            key={i}
            filled={i < value}
            color={color}
            // 今回増えたマスだけ、左から順に光らせる
            highlight={gained && i >= from && i < value}
            order={i - from}
            // 今回失ったマスは、赤くはじけてから消える
            lost={lost && i >= value && i < from}
            lostOrder={from - 1 - i}
          />
        ))}
        {delta && (
          <TrackEffect
            key={`fx${delta.key}`}
            kind={kind}
            from={from}
            to={value}
            goal={goal}
          />
        )}
        {delta && (
          <Animated.Text
            key={delta.key}
            entering={ZoomIn.springify().damping(11)}
            exiting={FadeOutUp.duration(500)}
            style={[
              styles.delta,
              { color: delta.amount > 0 ? colors.success : colors.danger },
              delta.amount < 0 && styles.deltaLost,
            ]}
          >
            {delta.amount > 0 ? `＋${delta.amount}` : `−${-delta.amount}`}
            <Text style={styles.deltaUnit}>時限</Text>
          </Animated.Text>
        )}
      </View>
      <Animated.Text style={[styles.count, countStyle, lost && styles.countLost]}>
        {value}/{goal}
      </Animated.Text>
    </Animated.View>
  );
}

/**
 * 教習の増減を、種類ごとの絵で伝える。
 *
 *   技能を進める … 教習車が煙をあげて走り抜け、通った跡がきらめく
 *   学科を進める … 教科書が飛び出し、鉛筆とひらめきが舞う
 *   戻される     … 車は逆走してエンストし、教科書は伏せて落ちる
 *
 * どれも進捗バーの上だけで完結させる。中央に出すと、
 * ターン帯や実況と重なって読めなくなるため。
 */
function TrackEffect({
  kind,
  from,
  to,
  goal,
}: {
  kind: "academic" | "skill";
  from: number;
  to: number;
  goal: number;
}) {
  const back = to < from;

  // 動く区間の左端と右端（バー全体に対する割合）
  const startPct = (from / goal) * 100;
  const endPct = (to / goal) * 100;

  return (
    <>
      {/* 進むときだけ、バーの上を光が走り抜ける */}
      {!back && <Sweep startPct={startPct} endPct={endPct} />}
      <Vehicle kind={kind} back={back} startPct={startPct} endPct={endPct} />
      {!back &&
        [0, 1, 2].map((i) => (
          <Sparkle
            key={i}
            index={i}
            kind={kind}
            startPct={startPct}
            endPct={endPct}
          />
        ))}
    </>
  );
}

/** バーの上を左から右へ走り抜ける光の帯 */
function Sweep({ startPct, endPct }: { startPct: number; endPct: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 560, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    left: `${startPct + (endPct - startPct) * p.value}%`,
    opacity: (1 - p.value) * 0.85,
    transform: [{ scaleY: 1 + (1 - p.value) * 1.4 }],
  }));
  return <Animated.View style={[styles.sweep, style]} pointerEvents="none" />;
}

/** 教習車／教科書の本体 */
function Vehicle({
  kind,
  back,
  startPct,
  endPct,
}: {
  kind: "academic" | "skill";
  back: boolean;
  startPct: number;
  endPct: number;
}) {
  const progress = useSharedValue(0);
  const bob = useSharedValue(0);
  const fall = useSharedValue(0);
  const pop = useSharedValue(0);

  useEffect(() => {
    // 飛び出してから走り出す
    pop.value = withSequence(
      withTiming(1.5, { duration: 130 }),
      withSpring(1, { damping: 8, stiffness: 240 })
    );
    progress.value = withTiming(1, {
      // 戻されるときは、ずるずると引きずられるように遅くする
      duration: back ? 900 : 640,
      easing: back ? Easing.inOut(Easing.cubic) : Easing.out(Easing.cubic),
    });
    bob.value = withRepeat(
      withSequence(
        withTiming(1, { duration: back ? 90 : 110 }),
        withTiming(0, { duration: back ? 90 : 110 })
      ),
      back ? 9 : 6,
      false
    );
    // 戻されたあとは、力なく落ちていく
    if (back) fall.value = withDelay(620, withTiming(1, { duration: 420 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const style = useAnimatedStyle(() => {
    const pct = startPct + (endPct - startPct) * progress.value;
    // 走り終わり・読み終わりでふっと消す
    const fade = back
      ? 1 - fall.value
      : progress.value > 0.78
        ? (1 - progress.value) * 4.5
        : 1;
    return {
      left: `${pct}%`,
      opacity: fade,
      transform:
        kind === "skill"
          ? [
              { translateX: -11 },
              // 路面のがたつき（戻されるときは激しく揺れる）
              { translateY: -bob.value * (back ? 4 : 2.5) + fall.value * 16 },
              // 逆走しているように向きを変え、最後は傾いて止まる
              { scaleX: back ? -1 : 1 },
              { scale: pop.value },
              { rotate: back ? `${fall.value * 25}deg` : `${-bob.value * 5}deg` },
            ]
          : [
              { translateX: -9 },
              { translateY: -bob.value * (back ? 5 : 5) + fall.value * 20 },
              { scale: pop.value },
              {
                rotate: back
                  ? `${(bob.value - 0.5) * 30 + fall.value * 40}deg`
                  : `${(bob.value - 0.5) * 24}deg`,
              },
            ],
    };
  });

  const emoji = back
    ? kind === "skill"
      ? "\u{1F6A7}" // 工事中：教習が差し戻された
      : "\u{1F4D5}" // 伏せた赤い本：やり直し
    : kind === "skill"
      ? "\u{1F697}"
      : "\u{1F4D6}";

  return (
    <Animated.Text
      style={[styles.effect, back && styles.effectBack, style]}
      allowFontScaling={false}
    >
      {emoji}
    </Animated.Text>
  );
}

/** 通った跡に散る、きらめき・煙・鉛筆 */
const SKILL_BITS = ["\u{1F4A8}", "\u{2728}", "\u{1F4A5}"];
const ACADEMIC_BITS = ["\u{270F}\u{FE0F}", "\u{2728}", "\u{1F4A1}"];

function Sparkle({
  index,
  kind,
  startPct,
  endPct,
}: {
  index: number;
  kind: "academic" | "skill";
  startPct: number;
  endPct: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      120 + index * 130,
      withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 進んだ区間を3等分した位置に散らす
  const at = startPct + ((endPct - startPct) * (index + 1)) / 4;
  const drift = (index - 1) * 7;

  const style = useAnimatedStyle(() => ({
    left: `${at}%`,
    opacity: p.value < 0.25 ? p.value * 4 : (1 - p.value) * 1.4,
    transform: [
      { translateX: -6 + drift * p.value },
      { translateY: -p.value * 18 },
      { scale: 0.6 + p.value * 0.7 },
      { rotate: `${p.value * (index % 2 === 0 ? 40 : -40)}deg` },
    ],
  }));

  const bits = kind === "skill" ? SKILL_BITS : ACADEMIC_BITS;

  return (
    <Animated.Text style={[styles.bit, style]} allowFontScaling={false}>
      {bits[index % bits.length]}
    </Animated.Text>
  );
}

/** 1マス。今回埋まったマスは、順番に飛び出して光る */
function Segment({
  filled,
  color,
  highlight,
  order,
  lost,
  lostOrder,
}: {
  filled: boolean;
  color: string;
  highlight: boolean;
  order: number;
  /** 今回失われたマス */
  lost?: boolean;
  /** 右端から数えた順番（右から順に崩れていく） */
  lostOrder?: number;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  // 失ったマスは、いったん赤く点いてから消える
  const red = useSharedValue(0);

  // 増えたときと減ったときで同じ scale を動かすので、ひとつにまとめる
  useEffect(() => {
    if (highlight) {
      const delay = Math.max(0, order) * 90;
      scale.value = withDelay(
        delay,
        withSequence(
          withTiming(1.5, { duration: 120 }),
          withSpring(1, { damping: 10, stiffness: 280 })
        )
      );
      glow.value = withDelay(
        delay,
        withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 520 }))
      );
      return;
    }
    if (lost) {
      const delay = Math.max(0, lostOrder ?? 0) * 110;
      // 赤く点滅 → 力尽きて潰れる
      red.value = withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(0.4, { duration: 90 }),
          withTiming(1, { duration: 90 }),
          withTiming(0, { duration: 420 })
        )
      );
      scale.value = withDelay(
        delay,
        withSequence(
          withTiming(1.8, { duration: 110 }),
          withTiming(0.25, { duration: 260 }),
          withSpring(1, { damping: 12, stiffness: 200 })
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, order, lost, lostOrder]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: scale.value }],
    shadowOpacity: Math.max(glow.value * 0.9, red.value),
    shadowRadius: Math.max(6 * glow.value, 8 * red.value),
    shadowColor: red.value > 0 ? colors.danger : color,
    backgroundColor:
      red.value > 0.5 ? colors.danger : filled ? color : colors.border,
  }));

  return (
    <Animated.View
      style={[
        styles.segment,
        { backgroundColor: filled ? color : colors.border, shadowColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { width: 30, fontSize: 11, fontWeight: "700", color: colors.text },
  labelLost: { color: colors.danger },
  segments: { flex: 1, flexDirection: "row", gap: 2 },
  segment: { flex: 1, height: 10, borderRadius: 2 },
  // 中央の実況と重ならないよう、教習が進んだことはこのバーの上で伝えきる
  delta: {
    position: "absolute",
    right: 2,
    top: -20,
    fontSize: 24,
    fontWeight: "900",
    textShadowColor: "#fff",
    textShadowRadius: 8,
  },
  deltaUnit: { fontSize: 12, fontWeight: "800" },
  // 戻されたときは、より大きく赤い影をつけて重く見せる
  deltaLost: { fontSize: 28, textShadowColor: "#ffd6d6", textShadowRadius: 10 },
  // 進捗バーの真上を走らせる
  effect: { position: "absolute", top: -14, fontSize: 17 },
  effectBack: { fontSize: 20 },
  bit: { position: "absolute", top: -16, fontSize: 12 },
  sweep: {
    position: "absolute",
    top: 0,
    width: 26,
    height: 10,
    marginLeft: -13,
    borderRadius: 5,
    backgroundColor: "#ffffff",
  },
  count: { width: 38, fontSize: 11, color: colors.textMuted, textAlign: "right" },
  countLost: { color: colors.danger, fontWeight: "900" },
});

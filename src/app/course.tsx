import { useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { ScreenEnter } from "@/components/ScreenEnter";
import { evaluateAchievements } from "@/store/achievementStore";
import { useCourseStore } from "@/store/courseStore";
import { colors, radius, spacing } from "@/theme";

/**
 * S字・クランク チャレンジ。
 * 技能教習の代名詞、S字とクランクを「指でなぞって」脱輪せずに通り抜ける。
 * 道からはみ出したら脱輪でやり直し。ゴールまでのタイムを競う。
 */

const W = 320;
const H = 380;
const ROAD_HALF = 34; // S字の道幅の半分

type CourseKind = "s" | "crank";

/** S字: サンプル点の連なりで道を作る（円の帯がつながってS字になる） */
const S_POINTS: { x: number; y: number }[] = Array.from({ length: 41 }, (_, i) => {
  const t = i / 40;
  return { x: 160 + 88 * Math.sin(2 * Math.PI * t), y: 350 - 320 * t };
});

/** クランク: 長方形の組み合わせ */
const CRANK_RECTS: { x: number; y: number; w: number; h: number }[] = [
  { x: 25, y: 240, w: 74, h: 140 }, // 縦（入口）
  { x: 25, y: 170, w: 200, h: 74 }, // 横
  { x: 151, y: 0, w: 74, h: 240 }, // 縦（出口）
];

function insideS(x: number, y: number): boolean {
  return S_POINTS.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 <= ROAD_HALF ** 2);
}

function insideCrank(x: number, y: number): boolean {
  return CRANK_RECTS.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

function inStart(kind: CourseKind, x: number, y: number): boolean {
  return kind === "s" ? y > 320 && insideS(x, y) : y > 330 && insideCrank(x, y);
}

function inGoal(kind: CourseKind, x: number, y: number): boolean {
  return kind === "s" ? y < 55 && insideS(x, y) : y < 50 && insideCrank(x, y);
}

export default function CourseScreen() {
  const router = useRouter();
  const store = useCourseStore();
  const [kind, setKind] = useState<CourseKind>("s");
  const [status, setStatus] = useState<"idle" | "run" | "fail" | "clear">("idle");
  const [car, setCar] = useState<{ x: number; y: number } | null>(null);
  const [time, setTime] = useState(0);
  const startAt = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const kindRef = useRef(kind);
  kindRef.current = kind;

  const inside = (x: number, y: number) => (kindRef.current === "s" ? insideS(x, y) : insideCrank(x, y));

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          if (inStart(kindRef.current, x, y)) {
            startAt.current = performance.now();
            setStatus("run");
            setCar({ x, y });
            haptic("light");
            playSe("engine_start");
          }
        },
        onPanResponderMove: (e) => {
          if (statusRef.current !== "run") return;
          const { locationX: x, locationY: y } = e.nativeEvent;
          setCar({ x, y });
          if (!inside(x, y)) {
            setStatus("fail");
            playSe("hit");
            haptic("warning");
            return;
          }
          if (inGoal(kindRef.current, x, y)) {
            const sec = Math.round((performance.now() - startAt.current) / 100) / 10;
            setTime(sec);
            setStatus("clear");
            playSe("win");
            haptic("success");
            useCourseStore.getState().addResult(kindRef.current, sec);
            setTimeout(evaluateAchievements, 400);
          }
        },
        onPanResponderRelease: () => {
          if (statusRef.current === "run") {
            // 途中で指を離したらやり直し
            setStatus("fail");
            playSe("hit");
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const reset = () => {
    setStatus("idle");
    setCar(null);
  };

  const best = kind === "s" ? store.bestS : store.bestCrank;

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>🚗 S字・クランク チャレンジ</Text>
          <Text style={styles.note}>
            スタート（緑）に指を置いて、道から出ないようにゴール（🏁）までなぞろう！
            はみ出したら脱輪でやり直し。
          </Text>
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, kind === "s" && styles.tabActive]}
              onPress={() => {
                setKind("s");
                reset();
              }}
            >
              <Text style={[styles.tabText, kind === "s" && styles.tabTextActive]}>🌀 S字</Text>
            </Pressable>
            <Pressable
              style={[styles.tab, kind === "crank" && styles.tabActive]}
              onPress={() => {
                setKind("crank");
                reset();
              }}
            >
              <Text style={[styles.tabText, kind === "crank" && styles.tabTextActive]}>⚡ クランク</Text>
            </Pressable>
          </View>

          {/* コース面 */}
          <View style={styles.courseWrap}>
            <View style={styles.course} {...pan.panHandlers}>
              {/* 道路 */}
              {kind === "s"
                ? S_POINTS.map((p, i) => (
                    <View
                      key={i}
                      style={[
                        styles.sDot,
                        { left: p.x - ROAD_HALF, top: p.y - ROAD_HALF },
                      ]}
                    />
                  ))
                : CRANK_RECTS.map((r, i) => (
                    <View
                      key={i}
                      style={[styles.crankRect, { left: r.x, top: r.y, width: r.w, height: r.h }]}
                    />
                  ))}
              {/* スタート・ゴール */}
              <View
                style={[
                  styles.zone,
                  styles.startZone,
                  kind === "s" ? { left: 126, top: 320, width: 68 } : { left: 25, top: 330, width: 74 },
                ]}
              >
                <Text style={styles.zoneText}>START</Text>
              </View>
              <View
                style={[
                  styles.zone,
                  styles.goalZone,
                  kind === "s" ? { left: 126, top: 8, width: 68 } : { left: 151, top: 4, width: 74 },
                ]}
              >
                <Text style={styles.zoneText}>🏁 GOAL</Text>
              </View>
              {/* 車 */}
              {car && status !== "idle" && (
                <View
                  style={[
                    styles.carDot,
                    { left: car.x - 14, top: car.y - 14 },
                    status === "fail" && { backgroundColor: colors.danger },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.carEmoji} allowFontScaling={false}>🚗</Text>
                </View>
              )}
              {/* 状態表示 */}
              {status === "fail" && (
                <Animated.View entering={ZoomIn.duration(200)} style={styles.overlayMsg} pointerEvents="none">
                  <Text style={styles.overlayMsgText}>💥 脱輪！</Text>
                  <Text style={styles.overlayMsgSub}>スタートからやり直し</Text>
                </Animated.View>
              )}
              {status === "clear" && (
                <Animated.View entering={ZoomIn.springify().damping(11)} style={styles.overlayMsg} pointerEvents="none">
                  <Text style={styles.overlayMsgText}>🎉 通過！ {time}秒</Text>
                  <Text style={styles.overlayMsgSub}>おみごと！</Text>
                </Animated.View>
              )}
            </View>
          </View>

          <Text style={styles.record}>
            {best !== null ? `🏅 ベストタイム ${best}秒` : "まだクリアなし"}
            {store.bestS !== null && store.bestCrank !== null ? "　🎖 両コース制覇！" : ""}
          </Text>
          {(status === "fail" || status === "clear") && (
            <AppButton label="もう一度走る" tone="primary" fullWidth onPress={reset} />
          )}
          <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />
        </View>
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 12,
    maxWidth: 520,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 20, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center", fontWeight: "700" },
  tabRow: { flexDirection: "row", gap: 8 },
  tab: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  tabTextActive: { color: "#fff" },
  courseWrap: { alignItems: "center" },
  course: {
    width: W,
    height: H,
    backgroundColor: "#9ec78a",
    borderRadius: 12,
    overflow: "hidden",
  },
  sDot: {
    position: "absolute",
    width: ROAD_HALF * 2,
    height: ROAD_HALF * 2,
    borderRadius: ROAD_HALF,
    backgroundColor: "#6b7280",
  },
  crankRect: { position: "absolute", backgroundColor: "#6b7280" },
  zone: {
    position: "absolute",
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  startZone: { backgroundColor: "#2f9e44cc" },
  goalZone: { backgroundColor: "#e8590ccc" },
  zoneText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  carDot: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#ffffffd8",
    alignItems: "center",
    justifyContent: "center",
  },
  carEmoji: { fontSize: 16 },
  overlayMsg: {
    position: "absolute",
    top: "42%",
    alignSelf: "center",
    backgroundColor: "#000000b8",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 18,
    alignItems: "center",
    gap: 2,
  },
  overlayMsgText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  overlayMsgSub: { color: "#ffffffcc", fontSize: 12, fontWeight: "700" },
});

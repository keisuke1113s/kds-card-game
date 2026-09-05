import { useRouter } from "expo-router";
import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { ScreenEnter } from "@/components/ScreenEnter";
import { evaluateAchievements } from "@/store/achievementStore";
import { useKytStore } from "@/store/kytStore";
import { KYT_SCENES, KytBg, KytScene } from "@/data/kytScenes";
import { colors, radius, spacing } from "@/theme";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

/**
 * 危険予測トレーニング（KYT）。
 * 教習所で行う「この場面のどこが危ない？」を、イラスト場面の中の
 * 危険ポイントをタップして当てるミニゲームにしたもの。
 */

const SET_SIZE = 5;

/** まだ正解していない場面を優先しつつ、毎回ランダムに5問選ぶ */
function pickScenes(masteredIds: string[]): KytScene[] {
  const mastered = new Set(masteredIds);
  const fresh = KYT_SCENES.filter((sc) => !mastered.has(sc.id));
  const done = KYT_SCENES.filter((sc) => mastered.has(sc.id));
  const shuffle = <T,>(arr: T[]): T[] => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  return [...shuffle(fresh), ...shuffle(done)].slice(0, SET_SIZE);
}

/** 背景バリエーションの配色 */
const BG_COLORS: Record<KytBg, { sky: string; side: string; road: string }> = {
  day: { sky: "#cfe3f5", side: "#9ec78a", road: "#6b7280" },
  crossing: { sky: "#cfe3f5", side: "#9ec78a", road: "#6b7280" },
  night: { sky: "#1c2440", side: "#2c3a2e", road: "#3a4049" },
  snow: { sky: "#dfe8f2", side: "#eef3f9", road: "#c6d2dd" },
  rain: { sky: "#9fb0c0", side: "#7f9f78", road: "#535e6b" },
  parking: { sky: "#d7dde5", side: "#d7dde5", road: "#8b95a1" },
};

/** 運転席視点のリアル背景（fal.ai生成・アプリに焼き込み） */
const BG_IMAGES: Record<KytBg, number> = {
  day: require("../../assets/images/kyt/kyt_day.webp"),
  crossing: require("../../assets/images/kyt/kyt_crossing.webp"),
  night: require("../../assets/images/kyt/kyt_night.webp"),
  snow: require("../../assets/images/kyt/kyt_snow.webp"),
  rain: require("../../assets/images/kyt/kyt_rain.webp"),
  parking: require("../../assets/images/kyt/kyt_parking.webp"),
};

/** 場面ごとの専用イラスト（fal.ai生成・80場面すべて）。無い場面は汎用背景へフォールバック */
const SCENE_IMAGES: Record<string, number> = {
  ambulance: require("../../assets/images/kyt/scenes/ambulance.webp"),
  animal_road: require("../../assets/images/kyt/scenes/animal_road.webp"),
  ball: require("../../assets/images/kyt/scenes/ball.webp"),
  bike_earphone: require("../../assets/images/kyt/scenes/bike_earphone.webp"),
  bike_kids: require("../../assets/images/kyt/scenes/bike_kids.webp"),
  bike_reverse: require("../../assets/images/kyt/scenes/bike_reverse.webp"),
  bike_wobble: require("../../assets/images/kyt/scenes/bike_wobble.webp"),
  bridge_wind: require("../../assets/images/kyt/scenes/bridge_wind.webp"),
  bus_front: require("../../assets/images/kyt/scenes/bus_front.webp"),
  bus_start: require("../../assets/images/kyt/scenes/bus_start.webp"),
  deaigashira: require("../../assets/images/kyt/scenes/deaigashira.webp"),
  door_zone: require("../../assets/images/kyt/scenes/door_zone.webp"),
  dusk: require("../../assets/images/kyt/scenes/dusk.webp"),
  fog_road: require("../../assets/images/kyt/scenes/fog_road.webp"),
  fumikiri: require("../../assets/images/kyt/scenes/fumikiri.webp"),
  gakudou: require("../../assets/images/kyt/scenes/gakudou.webp"),
  garbage_truck: require("../../assets/images/kyt/scenes/garbage_truck.webp"),
  genkan: require("../../assets/images/kyt/scenes/genkan.webp"),
  gomi: require("../../assets/images/kyt/scenes/gomi.webp"),
  green_arrow: require("../../assets/images/kyt/scenes/green_arrow.webp"),
  gs_exit: require("../../assets/images/kyt/scenes/gs_exit.webp"),
  hodou_jitensha: require("../../assets/images/kyt/scenes/hodou_jitensha.webp"),
  jihanki: require("../../assets/images/kyt/scenes/jihanki.webp"),
  kansei: require("../../assets/images/kyt/scenes/kansei.webp"),
  kei_truck: require("../../assets/images/kyt/scenes/kei_truck.webp"),
  kyushajo: require("../../assets/images/kyt/scenes/kyushajo.webp"),
  left_bike: require("../../assets/images/kyt/scenes/left_bike.webp"),
  long_drive: require("../../assets/images/kyt/scenes/long_drive.webp"),
  migi_chokushin: require("../../assets/images/kyt/scenes/migi_chokushin.webp"),
  narrow_pass: require("../../assets/images/kyt/scenes/narrow_pass.webp"),
  night_black: require("../../assets/images/kyt/scenes/night_black.webp"),
  night_crosswalk: require("../../assets/images/kyt/scenes/night_crosswalk.webp"),
  night_cyclist: require("../../assets/images/kyt/scenes/night_cyclist.webp"),
  night_deer: require("../../assets/images/kyt/scenes/night_deer.webp"),
  night_glare: require("../../assets/images/kyt/scenes/night_glare.webp"),
  night_station: require("../../assets/images/kyt/scenes/night_station.webp"),
  night_truck_park: require("../../assets/images/kyt/scenes/night_truck_park.webp"),
  open_door_taxi: require("../../assets/images/kyt/scenes/open_door_taxi.webp"),
  park_back: require("../../assets/images/kyt/scenes/park_back.webp"),
  park_cart: require("../../assets/images/kyt/scenes/park_cart.webp"),
  park_conv: require("../../assets/images/kyt/scenes/park_conv.webp"),
  park_door: require("../../assets/images/kyt/scenes/park_door.webp"),
  parked_shadow: require("../../assets/images/kyt/scenes/parked_shadow.webp"),
  phone_walk: require("../../assets/images/kyt/scenes/phone_walk.webp"),
  rain_brake: require("../../assets/images/kyt/scenes/rain_brake.webp"),
  rain_hydro: require("../../assets/images/kyt/scenes/rain_hydro.webp"),
  rain_night: require("../../assets/images/kyt/scenes/rain_night.webp"),
  rain_start: require("../../assets/images/kyt/scenes/rain_start.webp"),
  rain_umbrella: require("../../assets/images/kyt/scenes/rain_umbrella.webp"),
  rain_visor: require("../../assets/images/kyt/scenes/rain_visor.webp"),
  reverse_out: require("../../assets/images/kyt/scenes/reverse_out.webp"),
  sag: require("../../assets/images/kyt/scenes/sag.webp"),
  school_gate: require("../../assets/images/kyt/scenes/school_gate.webp"),
  scooter_slip: require("../../assets/images/kyt/scenes/scooter_slip.webp"),
  senior_driver: require("../../assets/images/kyt/scenes/senior_driver.webp"),
  shopping_street: require("../../assets/images/kyt/scenes/shopping_street.webp"),
  silver_car: require("../../assets/images/kyt/scenes/silver_car.webp"),
  snow_bridge: require("../../assets/images/kyt/scenes/snow_bridge.webp"),
  snow_bus: require("../../assets/images/kyt/scenes/snow_bus.webp"),
  snow_corner_kid: require("../../assets/images/kyt/scenes/snow_corner_kid.webp"),
  snow_cross_walker: require("../../assets/images/kyt/scenes/snow_cross_walker.webp"),
  snow_melt: require("../../assets/images/kyt/scenes/snow_melt.webp"),
  snow_parking_lot: require("../../assets/images/kyt/scenes/snow_parking_lot.webp"),
  snow_rut: require("../../assets/images/kyt/scenes/snow_rut.webp"),
  snow_shadow: require("../../assets/images/kyt/scenes/snow_shadow.webp"),
  snow_spin_hill: require("../../assets/images/kyt/scenes/snow_spin_hill.webp"),
  snow_stop: require("../../assets/images/kyt/scenes/snow_stop.webp"),
  snow_tunnel_exit: require("../../assets/images/kyt/scenes/snow_tunnel_exit.webp"),
  snow_wall: require("../../assets/images/kyt/scenes/snow_wall.webp"),
  snow_whiteout: require("../../assets/images/kyt/scenes/snow_whiteout.webp"),
  snow_wild: require("../../assets/images/kyt/scenes/snow_wild.webp"),
  snow_windshield: require("../../assets/images/kyt/scenes/snow_windshield.webp"),
  snow_wiper: require("../../assets/images/kyt/scenes/snow_wiper.webp"),
  sunset_glare: require("../../assets/images/kyt/scenes/sunset_glare.webp"),
  takuhai: require("../../assets/images/kyt/scenes/takuhai.webp"),
  thank_you: require("../../assets/images/kyt/scenes/thank_you.webp"),
  truck_left: require("../../assets/images/kyt/scenes/truck_left.webp"),
  truck_mirror: require("../../assets/images/kyt/scenes/truck_mirror.webp"),
  u_turn_car: require("../../assets/images/kyt/scenes/u_turn_car.webp"),
  yellow: require("../../assets/images/kyt/scenes/yellow.webp"),
};

export default function KytScreen() {
  // LINEゲートの殻。連携状態でフックの数が変わって落ちないよう（React #310）、
  // 本体は別コンポーネントに分けて連携済みのときだけマウントする
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;
  return <KytScreenBody />;
}

function KytScreenBody() {

  const router = useRouter();
  const kyt = useKytStore();
  const [phase, setPhase] = useState<"start" | "play" | "result">("start");
  /** タイムアタック（60秒で何場面正解できるか） */
  const [rush, setRush] = useState(false);
  const [rushTime, setRushTime] = useState(60);
  const [scenes, setScenes] = useState<KytScene[]>([]);
  const [index, setIndex] = useState(0);
  /** マーカーを一時的に隠してイラスト全体を確認する */
  const [hideSpots, setHideSpots] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [runMastered, setRunMastered] = useState<string[]>([]);

  const scene = scenes[index];

  const start = () => {
    setRush(false);
    setScenes(pickScenes(kyt.masteredIds));
    setIndex(0);
    setCorrectCount(0);
    setPicked(null);
    setRunMastered([]);
    setPhase("play");
  };

  /** タイムアタック開始（全場面シャッフルで60秒間解き続ける） */
  const startRush = () => {
    const all = [...KYT_SCENES];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    setRush(true);
    setRushTime(60);
    setScenes(all);
    setIndex(0);
    setCorrectCount(0);
    setPicked(null);
    setRunMastered([]);
    setPhase("play");
  };

  // タイムアタックの残り時間
  useEffect(() => {
    if (!rush || phase !== "play") return;
    const h = setInterval(() => {
      setRushTime((t) => {
        if (t <= 1) {
          clearInterval(h);
          setPhase("result");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rush, phase]);

  // タイムアタック終了時の記録
  useEffect(() => {
    if (phase !== "result" || !rush) return;
    kyt.addRush(correctCount);
    kyt.markMastered(runMastered);
    playSe("achievement");
    setTimeout(evaluateAchievements, 400);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    const ok = i === scene.correctIndex;
    if (ok) {
      setCorrectCount((c) => c + 1);
      setRunMastered((m) => [...m, scene.id]);
      playSe("janken_win");
      haptic("success");
    } else {
      playSe("hit");
      haptic("warning");
    }
    // タイムアタックは解説を出さずテンポよく次へ
    if (rush) {
      setTimeout(() => {
        setIndex((x) => (x + 1) % scenes.length);
        setPicked(null);
      }, 550);
    }
  };

  const next = () => {
    if (index + 1 >= scenes.length) {
      const final = correctCount;
      kyt.addResult(final, scenes.length);
      kyt.markMastered(runMastered);
      if (final >= scenes.length) playSe("win");
      setPhase("result");
      setTimeout(evaluateAchievements, 400);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {phase === "start" && (
          <View style={styles.card}>
            <Text style={styles.title}>⚠️ 危険予測トレーニング</Text>
            <Text style={styles.note}>
              教習所でおなじみのKYT（危険予測トレーニング）！{"\n"}
              場面の中で「いちばん危ないところ」をタップして当てよう。{"\n"}
              全{KYT_SCENES.length}場面からランダムに{SET_SIZE}問出題。まだ正解していない場面が優先して出ます。
            </Text>
            <Text style={styles.record}>
              🦺 場面制覇 {kyt.masteredIds.length} / {KYT_SCENES.length}
              {kyt.masteredIds.length >= KYT_SCENES.length ? "　🏆 全場面制覇！" : ""}
            </Text>
            {kyt.plays > 0 && (
              <Text style={styles.record}>
                これまで {kyt.plays}回挑戦{kyt.cleared ? " ／ 🏅5問パーフェクト達成済み" : ""}
              </Text>
            )}
            <Pressable style={[styles.wideButton, { backgroundColor: "#e8590c" }]} onPress={start}>
              <Text style={styles.wideButtonText}>スタート！</Text>
            </Pressable>
            <View style={styles.rushBox}>
              <Text style={styles.rushTitle}>⏱ タイムアタック</Text>
              <Text style={styles.rushNote}>
                60秒で何場面見抜けるか！解説なしのテンポ勝負。
                {kyt.bestRush > 0 && `　自己ベスト: ${kyt.bestRush}問`}
              </Text>
              <Pressable
                style={[styles.wideButton, { backgroundColor: "#b0413e" }]}
                onPress={startRush}
              >
                <Text style={styles.wideButtonText}>タイムアタックに挑戦</Text>
              </Pressable>
            </View>
          </View>
        )}

        {phase === "play" && (
          <View style={styles.card}>
            <Text style={styles.progress}>
              {rush
                ? `⏱ 残り${rushTime}秒　正解 ${correctCount}`
                : `場面 ${index + 1} / ${scenes.length}　（正解 ${correctCount}）`}
            </Text>
            <Text style={styles.sceneTitle}>{scene.title}</Text>
            <Text style={styles.note}>{scene.desc}</Text>

            {/* 場面イラスト（運転席視点のリアル背景の上に危険ポイントを配置） */}
            <View style={[styles.scene, { backgroundColor: BG_COLORS[scene.bg].sky }]}>
              <Image
                source={SCENE_IMAGES[scene.id] ?? BG_IMAGES[scene.bg]}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
              />
              {!hideSpots && scene.spots.map((sp, i) => (
                <Pressable
                  key={`s${i}`}
                  style={[styles.spot, { left: `${sp.x}%`, top: `${sp.y}%` }]}
                  onPress={() => choose(i)}
                >
                  <View style={styles.spotBadge}>
                    <Text style={styles.spotEmoji} allowFontScaling={false}>
                      {sp.emoji}
                    </Text>
                  </View>
                  {picked !== null && i === scene.correctIndex && (
                    <Animated.Text entering={ZoomIn.springify().damping(10)} style={styles.spotMark}>
                      ⚠️
                    </Animated.Text>
                  )}
                </Pressable>
              ))}
              <Pressable
                style={styles.eyeChip}
                onPress={() => {
                  haptic("light");
                  setHideSpots((v) => !v);
                }}
              >
                <Text style={styles.eyeChipText} allowFontScaling={false}>
                  {hideSpots ? "📍 マーカーを表示" : "👁 イラストを見る"}
                </Text>
              </Pressable>
            </View>

            {picked === null ? (
              <View style={styles.labelList}>
                {scene.spots.map((sp, i) => (
                  <Pressable key={i} style={styles.labelButton} onPress={() => choose(i)}>
                    <Text style={styles.labelButtonText}>
                      {sp.emoji} {sp.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                <Text
                  style={[
                    styles.judge,
                    { color: picked === scene.correctIndex ? colors.success : colors.danger },
                  ]}
                >
                  {picked === scene.correctIndex
                    ? "⭕ その通り！"
                    : `❌ 惜しい！正解は「${scene.spots[scene.correctIndex].label}」`}
                </Text>
                {/* 本物のKYT手法にならった3段階（何が→どうなる→どうする） */}
                <View style={styles.kytSteps}>
                  <Text style={styles.kytStep}>
                    ⚠️ <Text style={styles.kytStepHead}>何が:</Text>{" "}
                    {scene.spots[scene.correctIndex].label}
                  </Text>
                  <Text style={styles.kytStep}>
                    💥 <Text style={styles.kytStepHead}>どうなる:</Text> {scene.explain}
                  </Text>
                  {!!scene.action && (
                    <Text style={styles.kytStep}>
                      ✅ <Text style={styles.kytStepHead}>どうする:</Text> {scene.action}
                    </Text>
                  )}
                </View>
                <Pressable style={[styles.wideButton, { backgroundColor: colors.primary }]} onPress={next}>
                  <Text style={styles.wideButtonText}>
                    {index + 1 >= scenes.length ? "結果を見る" : "次の場面へ"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {phase === "result" && (
          <View style={styles.card}>
            <Text style={styles.title}>
              {rush
                ? correctCount >= 10
                  ? "🏆 神業の危険察知！"
                  : correctCount >= 6
                    ? "🔥 ナイスペース！"
                    : "⏱ タイムアップ！"
                : correctCount >= scenes.length
                  ? "🏅 全問クリア！"
                  : correctCount >= 3
                    ? "💮 いいセンス！"
                    : "📚 おつかれさま！"}
            </Text>
            {/* 全問正解は指差し確認で「ヨシ！」 */}
            {!rush && correctCount >= scenes.length && <YoshiStamp />}
            <Text style={styles.resultScore}>
              {rush ? (
                <>
                  {correctCount} <Text style={styles.resultTotal}>問正解（60秒）</Text>
                </>
              ) : (
                <>
                  {correctCount} <Text style={styles.resultTotal}>/ {scenes.length} 問正解</Text>
                </>
              )}
            </Text>
            {rush && kyt.bestRush > 0 && (
              <Text style={styles.record}>⏱ 自己ベスト: {kyt.bestRush}問</Text>
            )}
            <Text style={styles.record}>
              🦺 場面制覇 {kyt.masteredIds.length} / {KYT_SCENES.length}
            </Text>
            <Text style={styles.note}>
              {kyt.masteredIds.length >= KYT_SCENES.length
                ? "全場面制覇おめでとう！危険を先読みできる目が育っています。"
                : correctCount >= scenes.length
                  ? "この調子で全場面制覇を目指そう！"
                  : "危険は「見えないところ」に隠れています。もう一度挑戦してみよう！"}
            </Text>
            <Pressable style={[styles.wideButton, { backgroundColor: "#e8590c" }]} onPress={start}>
              <Text style={styles.wideButtonText}>もう一度挑戦する</Text>
            </Pressable>
            <Pressable
              style={[styles.wideButton, { backgroundColor: colors.textMuted }]}
              onPress={() => router.replace("/")}
            >
              <Text style={styles.wideButtonText}>ホームに戻る</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  kytSteps: {
    backgroundColor: "#00000008",
    borderRadius: 10,
    padding: 10,
    gap: 6,
    alignSelf: "stretch",
  },
  kytStep: { fontSize: 13, lineHeight: 20, color: "#333" },
  kytStepHead: { fontWeight: "900" },
  rushBox: {
    backgroundColor: "#00000008",
    borderRadius: 12,
    padding: 12,
    gap: 8,
    alignSelf: "stretch",
  },
  rushTitle: { fontSize: 15, fontWeight: "900", color: "#7a2020" },
  rushNote: { fontSize: 12, lineHeight: 18, color: "#666" },
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
  title: { fontSize: 22, fontWeight: "900", color: "#c74e0a", textAlign: "center" },
  sceneTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  record: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  progress: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  scene: {
    height: 220,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#cfe3f5",
  },
  sky: { position: "absolute", top: 0, left: 0, right: 0, height: "35%", backgroundColor: "#cfe3f5" },
  roadside: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    height: "15%",
    backgroundColor: "#9ec78a",
  },
  road: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#6b7280",
    justifyContent: "center",
  },
  centerLine: { height: 4, backgroundColor: "#fff", opacity: 0.8, marginHorizontal: 8, borderRadius: 2 },
  deco: { position: "absolute" },
  crossRoad: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "38%",
    width: "24%",
    opacity: 0.9,
  },
  parkLine: {
    position: "absolute",
    top: "55%",
    bottom: "8%",
    width: 4,
    backgroundColor: "#ffffffcc",
    borderRadius: 2,
  },
  rainMark: { position: "absolute", top: "20%", left: "18%", fontSize: 18, opacity: 0.7 },
  spot: { position: "absolute", alignItems: "center" },
  spotBadge: {
    backgroundColor: "#ffffff99",
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#e8590cdd",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  spotEmoji: { fontSize: 24 },
  spotMark: { position: "absolute", top: -18, fontSize: 22 },
  eyeChip: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "#000000a0",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  eyeChipText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  labelList: { gap: 8 },
  labelButton: {
    borderWidth: 1.5,
    borderColor: "#e8590c",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  labelButtonText: { fontSize: 14, fontWeight: "700", color: "#c74e0a" },
  judge: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  explain: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text,
    backgroundColor: colors.background,
    borderRadius: 10,
    padding: 12,
  },
  resultScore: { fontSize: 40, fontWeight: "900", color: colors.primaryDark, textAlign: "center" },
  resultTotal: { fontSize: 18, color: colors.textMuted },
  wideButton: { paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  wideButtonText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

/** LINE連携が必要な機能のロック画面 */
function LineGate() {
  const router = useRouter();
  return (
    <View style={lineGateStyles.root}>
      <View style={lineGateStyles.card}>
        <Text style={lineGateStyles.lockIcon}>🔒</Text>
        <Text style={lineGateStyles.title}>この機能はLINE連携で解放されます</Text>
        <Text style={lineGateStyles.note}>
          KDS釧路自動車学校の公式LINEと連携（無料）すると使えるようになります。
        </Text>
        <Pressable style={lineGateStyles.button} onPress={() => router.replace("/line")}>
          <Text style={lineGateStyles.buttonText}>💚 LINE連携する</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={lineGateStyles.back}>戻る</Text>
        </Pressable>
      </View>
    </View>
  );
}

const lineGateStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    maxWidth: 420,
    width: "100%",
  },
  lockIcon: { fontSize: 44 },
  title: { fontSize: 17, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: "#06C755",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  back: { fontSize: 13, color: colors.textMuted, padding: 4 },
});

/** 全問正解のごほうび: 指差し確認の「ヨシ！」スタンプがバンッと押される */
function YoshiStamp() {
  const t = useSharedValue(0);
  useEffect(() => {
    playSe("cheer");
    haptic("success");
    t.value = withSequence(
      withTiming(1.12, { duration: 210, easing: Easing.in(Easing.cubic) }),
      withTiming(1, { duration: 130 })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const st = useAnimatedStyle(() => ({
    opacity: Math.min(1, t.value * 3),
    transform: [{ rotate: "-8deg" }, { scale: t.value === 0 ? 2.2 : 2.2 - t.value * 1.2 }],
  }));
  return (
    <View style={{ alignItems: "center" }}>
      <Animated.View style={[yoshiStyles.box, st]}>
        <Text style={yoshiStyles.text} allowFontScaling={false}>
          👉 ヨシ！
        </Text>
      </Animated.View>
    </View>
  );
}

const yoshiStyles = StyleSheet.create({
  box: {
    borderWidth: 4,
    borderColor: "#e8590c",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 18,
    backgroundColor: "#fff7f0",
  },
  text: { color: "#e8590c", fontSize: 26, fontWeight: "900", letterSpacing: 2 },
});

import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { getCard } from "@/data/cards";
import { checkQrPayload, specialCodeOf } from "@/data/unlock";
import { trackEvent } from "@/data/telemetry";
import { evaluateAchievements } from "@/store/achievementStore";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { colors, radius, spacing } from "@/theme";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

/**
 * 実物カードのQRコードを読み込んで、カードを開放する画面。
 * Webはブラウザのカメラ＋jsQR、アプリ版は expo-camera で読み取る。
 */

type ScanOutcome =
  | { kind: "unlocked"; cardId: string }
  | { kind: "already"; cardId: string }
  | { kind: "needsUpdate" }
  | { kind: "invalid" }
  | { kind: "special" }
  | { kind: "offline" };

export default function ScanScreen() {
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;

  const router = useRouter();
  const unlockState = useUnlockStore();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [manual, setManual] = useState("");
  // 結果表示中は読み取りを止める（同じQRを連続で拾わないように）
  const pausedRef = useRef(false);
  pausedRef.current = outcome !== null;
  // スペシャルコードのサーバー照合中も読み取りを止める
  const busyRef = useRef(false);

  const redeemSpecial = async (codeValue: string) => {
    busyRef.current = true;
    try {
      const res = await fetch("https://tcg.kds946.com/unlock-all", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: codeValue }),
      });
      const out = (await res.json()) as { ok?: boolean };
      if (out.ok) {
        useUnlockStore.getState().setAllOpenMode(true);
        haptic("success");
        playSe("janken_win");
        evaluateAchievements();
        setOutcome({ kind: "special" });
      } else {
        // コード違いは通常の無効QRと同じ見た目にする（仕組みの存在を明かさない）
        haptic("light");
        setOutcome({ kind: "invalid" });
      }
    } catch {
      haptic("light");
      setOutcome({ kind: "offline" });
    } finally {
      busyRef.current = false;
    }
  };

  const handlePayload = (raw: string) => {
    if (pausedRef.current || busyRef.current) return;
    const check = checkQrPayload(raw);
    if (check.status === "invalid") {
      const special = specialCodeOf(raw);
      if (special) {
        void redeemSpecial(special);
        return;
      }
      haptic("light");
      setOutcome({ kind: "invalid" });
      return;
    }
    if (check.status === "unknownCard") {
      // 本物のQRだが、このバージョンのアプリにまだ入っていない新カード
      haptic("light");
      setOutcome({ kind: "needsUpdate" });
      return;
    }
    const cardId = check.cardId;
    const already = unlockedSet(useUnlockStore.getState()).has(cardId);
    if (already) {
      haptic("light");
      setOutcome({ kind: "already", cardId });
      return;
    }
    useUnlockStore.getState().unlock(cardId);
    haptic("heavy");
    setOutcome({ kind: "unlocked", cardId });
    // コレクション系の実績を判定する
    evaluateAchievements();
    trackEvent("scan", { cardId });
  };

  return (
    <ScreenEnter style={styles.root}>
      <View style={styles.cameraBox}>
        {Platform.OS === "web" ? (
          <WebCamera onPayload={handlePayload} />
        ) : (
          <NativeCamera onPayload={handlePayload} />
        )}
        <View style={styles.frame} pointerEvents="none" />
      </View>
      <Text style={styles.guide}>
        カードのQRコードを枠の中に映してください
      </Text>

      <View style={styles.manualRow}>
        <TextInput
          style={styles.manualInput}
          value={manual}
          onChangeText={setManual}
          placeholder="コードを直接入力（読み取れないとき）"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.manualButton, manual.trim().length === 0 && { opacity: 0.4 }]}
          onPress={() => {
            if (!manual.trim()) return;
            handlePayload(manual);
            setManual("");
          }}
        >
          <Text style={styles.manualButtonText}>登録</Text>
        </Pressable>
      </View>

      {/* カード開放は全画面のパック開封演出で祝う */}
      {outcome?.kind === "unlocked" && (
        <PackOpeningFX
          cardId={outcome.cardId}
          onContinue={() => setOutcome(null)}
          onClose={() => router.back()}
        />
      )}
      {outcome && outcome.kind !== "unlocked" && (
        <View style={styles.resultLayer}>
          <View style={styles.resultBox}>
            {outcome.kind === "invalid" ? (
              <>
                <Text style={styles.resultEmoji}>🚫</Text>
                <Text style={styles.resultTitle}>このQRコードは使えません</Text>
                <Text style={styles.resultSub}>
                  KDSカードゲームの正しいQRコードか確認してください
                </Text>
              </>
            ) : outcome.kind === "needsUpdate" ? (
              <>
                <Text style={styles.resultEmoji}>🆕</Text>
                <Text style={styles.resultTitle}>新しいカードのQRコードです</Text>
                <Text style={styles.resultSub}>
                  アプリを最新版に更新すると、このカードを登録できるようになります
                </Text>
              </>
            ) : outcome.kind === "special" ? (
              <>
                <Text style={styles.resultEmoji}>🎉</Text>
                <Text style={styles.resultTitle}>スペシャル特典が開放されました！</Text>
                <Text style={styles.resultSub}>
                  すべてのカードが図鑑とデッキで使えるようになりました
                </Text>
              </>
            ) : outcome.kind === "offline" ? (
              <>
                <Text style={styles.resultEmoji}>📶</Text>
                <Text style={styles.resultTitle}>通信できませんでした</Text>
                <Text style={styles.resultSub}>
                  電波の良い場所で、もう一度お試しください
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.resultEmoji}>✅</Text>
                <Text style={styles.resultTitle}>
                  「{getCard(outcome.cardId).name}」は登録済みです
                </Text>
                <CardFace cardId={outcome.cardId} size="lg" />
              </>
            )}
            <View style={styles.resultButtons}>
              <Pressable
                style={[styles.resultButton, { backgroundColor: colors.primary }]}
                onPress={() => setOutcome(null)}
              >
                <Text style={styles.resultButtonText}>続けて読み込む</Text>
              </Pressable>
              <Pressable
                style={[styles.resultButton, { backgroundColor: colors.textMuted }]}
                onPress={() => router.back()}
              >
                <Text style={styles.resultButtonText}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}
      {/* 開放状態の変化を購読して再描画する（unlockState は表示には未使用でも必要） */}
      <View style={{ display: "none" }}>{unlockState.scannedIds.length}</View>
    </ScreenEnter>
  );
}

/**
 * QRカード開放の全画面パック開封演出（約3.6秒）。
 * 暗転 → 光が集まる → 白フラッシュ → カードがめくれて登場 →
 * 金色バースト＋紙吹雪 → 「NEW! ◯◯をゲット！」→ ボタン表示。
 * 図鑑の開発用テスト開放からも使う
 */
export function PackOpeningFX({
  cardId,
  onContinue,
  onClose,
}: {
  cardId: string;
  onContinue?: () => void;
  onClose: () => void;
}) {
  const isTantou = cardId.startsWith("t_");
  const bg = useSharedValue(0); // fx_pack 背景の入り
  const bgScale = useSharedValue(1.25);
  const intro = useSharedValue(0); // 裏面カードの登場（下からふわっと）
  const wobble = useSharedValue(0);
  const pulse = useSharedValue(0.4); // 期待感の明滅
  const flash = useSharedValue(0); // 白フラッシュ
  const flip = useSharedValue(0); // 0=裏 1=表
  const burst = useSharedValue(0); // fx_victory の祝福背景
  const pop = useSharedValue(0); // 表カードの最終バウンス
  const nameIn = useSharedValue(0); // カード名の出現
  const buttonsIn = useSharedValue(0);

  useEffect(() => {
    playSe("draw");
    // 開封の高揚感ジングル（きらめき→ファンファーレ）を演出全体に重ねる
    playSe("pack_open");
    // 0.0s: 暗転して宝箱の光がゆっくり寄ってくる
    bg.value = withTiming(1, { duration: 400 });
    bgScale.value = withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) });
    // 0.3s: 裏面カードが下からふわっと現れ、小刻みに震え始める
    intro.value = withDelay(300, withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) }));
    wobble.value = withDelay(
      900,
      withRepeat(withSequence(withTiming(3.2, { duration: 90 }), withTiming(-3.2, { duration: 90 })), 6)
    );
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 420 }), withTiming(0.45, { duration: 420 })),
      -1
    );
    const seTimers = [
      setTimeout(() => playSe("support"), 1000),
      setTimeout(() => {
        playSe("hit");
        haptic("heavy");
      }, 2050),
      setTimeout(() => {
        playSe("janken_win");
        haptic("success");
      }, 2450),
    ];
    // 2.05s: 白フラッシュ → めくれる
    flash.value = withDelay(
      2050,
      withSequence(withTiming(0.95, { duration: 110 }), withTiming(0, { duration: 420 }))
    );
    flip.value = withDelay(2150, withTiming(1, { duration: 480, easing: Easing.inOut(Easing.cubic) }));
    // 2.3s: 祝福の金色バーストに切り替え
    burst.value = withDelay(2300, withTiming(1, { duration: 500 }));
    // 2.6s: 表カードがドンとバウンス
    pop.value = withDelay(2600, withSequence(withTiming(1.18, { duration: 180 }), withTiming(1, { duration: 220 })));
    // 2.8s: カード名 → 3.4s: ボタン
    nameIn.value = withDelay(2800, withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }));
    buttonsIn.value = withDelay(3400, withTiming(1, { duration: 300 }));
    return () => seTimers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bgStyle = useAnimatedStyle(() => ({
    opacity: bg.value,
    transform: [{ scale: bgScale.value }],
  }));
  const pulseStyle = useAnimatedStyle(() => ({ opacity: bg.value * pulse.value }));
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: intro.value * (flip.value < 0.5 ? 1 : 0),
    transform: [
      { translateY: (1 - intro.value) * 90 },
      { perspective: 900 },
      { rotate: `${wobble.value}deg` },
      { rotateY: `${flip.value * 180}deg` },
      { scale: 0.9 + intro.value * 0.1 },
    ],
  }));
  const frontStyle = useAnimatedStyle(() => ({
    opacity: flip.value >= 0.5 ? 1 : 0,
    transform: [
      { perspective: 900 },
      { rotateY: `${flip.value * 180 - 180}deg` },
      { scale: pop.value > 0 ? pop.value : 1 },
    ],
  }));
  const nameStyle = useAnimatedStyle(() => ({
    opacity: nameIn.value,
    transform: [{ translateY: (1 - nameIn.value) * 26 }],
  }));
  const buttonsStyle = useAnimatedStyle(() => ({ opacity: buttonsIn.value }));

  return (
    <View style={styles.fxLayer}>
      {/* 宝箱の光（前半） */}
      <Animated.View style={[StyleSheet.absoluteFill, bgStyle]}>
        <Image
          source={require("../../assets/images/fx/fx_pack.webp")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>
      {/* 期待感の明滅（金色の集中線をうっすら重ねる） */}
      <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]}>
        <Image
          source={require("../../assets/images/fx/fx_reach_gold.webp")}
          style={[StyleSheet.absoluteFill, { opacity: 0.5 }]}
          contentFit="cover"
        />
      </Animated.View>
      {/* 祝福バースト（後半） */}
      <Animated.View style={[StyleSheet.absoluteFill, burstStyle]}>
        <Image
          source={require("../../assets/images/fx/fx_victory.webp")}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      </Animated.View>

      {/* 光の粒が中央に集まる（前半） */}
      {Array.from({ length: 14 }, (_, i) => (
        <ConvergeSpark key={`s${i}`} index={i} />
      ))}
      {/* 紙吹雪が弾ける（後半）。担当カードは特別に多めに */}
      {Array.from({ length: isTantou ? 48 : 30 }, (_, i) => (
        <ConfettiPiece
          key={`c${i}`}
          index={i}
          count={isTantou ? 48 : 30}
          delayMs={2300}
          dist={isTantou ? 240 : 200}
        />
      ))}

      {/* 担当カードは虹色の光の輪がカードの周りを回る */}
      {isTantou && <RainbowHalo />}

      {/* カード本体 */}
      <View style={styles.fxCardWrap} pointerEvents="none">
        <Animated.View style={[styles.packFace, backStyle]}>
          <CardFace cardId={cardId} size="lg" faceDown />
        </Animated.View>
        <Animated.View style={[styles.packFace, frontStyle]}>
          <CardFace cardId={cardId} size="lg" />
        </Animated.View>
      </View>

      {/* 白フラッシュ */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: "#fff" }, flashStyle]}
      />

      {/* NEW! カード名 */}
      <Animated.View style={[styles.fxNameWrap, nameStyle]} pointerEvents="none">
        {isTantou && <Text style={styles.fxTantouBadge}>🌈 担当カード！！ 🌈</Text>}
        <Text style={styles.fxNewBadge}>✨ NEW! ✨</Text>
        <Text style={styles.fxName} allowFontScaling={false}>
          「{getCard(cardId).name}」をゲット！
        </Text>
        <Text style={styles.fxNameSub}>図鑑に追加され、デッキでも使えるようになりました</Text>
      </Animated.View>

      {/* ボタン（演出が終わってからフェードイン） */}
      <Animated.View style={[styles.fxButtons, buttonsStyle]}>
        {onContinue && (
          <Pressable
            style={[styles.resultButton, { backgroundColor: colors.primary }]}
            onPress={onContinue}
          >
            <Text style={styles.resultButtonText}>続けて読み込む</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.resultButton, { backgroundColor: colors.textMuted }]}
          onPress={onClose}
        >
          <Text style={styles.resultButtonText}>閉じる</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const CONFETTI_COLORS = ["#e2604a", "#e49c18", "#78b424", "#3d8fd0", "#c9d63a", "#8fd3ee"];

/** 中央へ吸い込まれていく光の粒（開封前のため込め） */
/** 担当カード専用: 12色の光の粒がカードの周りをゆっくり回る虹の輪 */
const RAINBOW_COLORS = [
  "#ff5252", "#ff9800", "#ffd600", "#8bc34a", "#00e5a0", "#00bcd4",
  "#40c4ff", "#3f51b5", "#9c27b0", "#e91e63", "#ffab40", "#b388ff",
];
function RainbowHalo() {
  const rot = useSharedValue(0);
  const on = useSharedValue(0);
  useEffect(() => {
    // カードがめくれる（2.3秒）のと同時に現れて回り続ける
    on.value = withDelay(2300, withTiming(1, { duration: 420 }));
    rot.value = withRepeat(withTiming(360, { duration: 5200, easing: Easing.linear }), -1);
  }, [on, rot]);
  const st = useAnimatedStyle(() => ({
    opacity: on.value,
    transform: [{ rotate: `${rot.value}deg` }],
  }));
  return (
    <Animated.View style={[styles.rainbowHalo, st]} pointerEvents="none">
      {RAINBOW_COLORS.map((c, i) => {
        const a = (i / RAINBOW_COLORS.length) * Math.PI * 2;
        return (
          <View
            key={c}
            style={[
              styles.rainbowDot,
              {
                backgroundColor: c,
                transform: [
                  { translateX: Math.cos(a) * 135 },
                  { translateY: Math.sin(a) * 135 },
                ],
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

function ConvergeSpark({ index }: { index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      500 + (index % 7) * 140,
      withTiming(1, { duration: 900 + (index % 4) * 160, easing: Easing.in(Easing.quad) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const angle = (index / 14) * Math.PI * 2 + 0.4;
  const dist = 190 + (index % 5) * 40;
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : (1 - p.value) * 0.4 + 0.6,
    transform: [
      { translateX: Math.cos(angle) * dist * (1 - p.value) },
      { translateY: Math.sin(angle) * dist * (1 - p.value) },
      { scale: 1.1 - p.value * 0.7 },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[styles.spark, style]} />;
}

function ConfettiPiece({
  index,
  count,
  delayMs,
  dist: baseDist,
}: {
  index: number;
  count: number;
  delayMs: number;
  dist: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      delayMs + (index % 7) * 90,
      withTiming(1, { duration: 1300 + (index % 5) * 220, easing: Easing.out(Easing.quad) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const angle = (index / count) * Math.PI * 2;
  const dist = baseDist + (index % 4) * 40;
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, (p.value - 0.6) / 0.4),
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value + 80 * p.value * p.value },
      { rotate: `${p.value * (index % 2 === 0 ? 540 : -540)}deg` },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        { backgroundColor: CONFETTI_COLORS[index % CONFETTI_COLORS.length] },
        style,
      ]}
    />
  );
}

/** Web: ブラウザのカメラ映像を jsQR で読み取る */
function WebCamera({ onPayload }: { onPayload: (raw: string) => void }) {
  const hostRef = useRef<View>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let video: HTMLVideoElement | null = null;
    let raf = 0;

    const start = async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (stopped) return;
        const host = hostRef.current as unknown as HTMLElement | null;
        if (!host) return;
        video = document.createElement("video");
        video.setAttribute("playsinline", "true");
        video.muted = true;
        video.srcObject = stream;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "cover";
        host.appendChild(video);
        await video.play();

        const canvas = document.createElement("canvas");
        const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (stopped || !video || !ctx2d) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            // 画面中央の枠のあたりだけを読み取る。
            // 映像全体を読むと、QRが並んだ印刷物などで狙った隣のコードを
            // 拾ってしまうため（名前と違うカードが登録される誤読の原因）
            const side = Math.floor(Math.min(video.videoWidth, video.videoHeight) * 0.6);
            const sx = Math.floor((video.videoWidth - side) / 2);
            const sy = Math.floor((video.videoHeight - side) / 2);
            canvas.width = side;
            canvas.height = side;
            ctx2d.drawImage(video, sx, sy, side, side, 0, 0, side, side);
            const img = ctx2d.getImageData(0, 0, side, side);
            const found = jsQR(img.data, img.width, img.height);
            if (found?.data) onPayload(found.data);
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (!stopped) {
          setError("カメラを使えませんでした。ブラウザのカメラ許可を確認してください。");
        }
      }
    };
    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      if (video) video.remove();
      stream?.getTracks().forEach((t) => t.stop());
    };
    // onPayload は ref 経由で最新が呼ばれるため依存に入れない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <View style={styles.cameraError}>
        <Text style={styles.cameraErrorText}>{error}</Text>
        <Text style={styles.cameraErrorText}>下の欄からコードを直接入力もできます。</Text>
      </View>
    );
  }
  return <View ref={hostRef} style={{ flex: 1 }} />;
}

/** アプリ版: expo-camera のバーコード読み取り */
function NativeCamera({ onPayload }: { onPayload: (raw: string) => void }) {
  // Webバンドルに expo-camera を含めないため、ここで動的に読み込む
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { CameraView, useCameraPermissions } = require("expo-camera");
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted) void requestPermission();
  }, [permission, requestPermission]);

  if (!permission?.granted) {
    return (
      <View style={styles.cameraError}>
        <Text style={styles.cameraErrorText}>カメラの使用を許可してください</Text>
      </View>
    );
  }
  return (
    <CameraView
      style={{ flex: 1 }}
      barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
      onBarcodeScanned={(e: { data?: string }) => {
        if (e.data) onPayload(e.data);
      }}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  cameraBox: {
    margin: spacing.lg,
    borderRadius: radius.lg,
    overflow: "hidden",
    aspectRatio: 1,
    backgroundColor: "#111",
  },
  frame: {
    position: "absolute",
    left: "15%",
    right: "15%",
    top: "15%",
    bottom: "15%",
    borderWidth: 3,
    borderColor: "#ffffffaa",
    borderRadius: 14,
  },
  guide: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
  },
  manualRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.lg,
    alignItems: "center",
  },
  manualInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text,
  },
  manualButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  manualButtonText: { color: "#fff", fontWeight: "800" },
  cameraError: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 8,
  },
  cameraErrorText: { color: "#fff", fontSize: 13, textAlign: "center", lineHeight: 20 },
  resultLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(10, 14, 34, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  resultBox: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  resultEmoji: { fontSize: 40 },
  fxLayer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0a0c22",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  fxCardWrap: {
    width: 150,
    height: 210,
    marginTop: -60,
  },
  packFace: { ...StyleSheet.absoluteFill },
  fxNameWrap: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 150,
    alignItems: "center",
    gap: 4,
  },
  rainbowHalo: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  rainbowDot: {
    position: "absolute",
    width: 15,
    height: 15,
    borderRadius: 8,
  },
  fxTantouBadge: {
    fontSize: 20,
    fontWeight: "900",
    color: "#ffd54d",
    textAlign: "center",
  },
  fxNewBadge: {
    color: "#ffd54d",
    fontSize: 16,
    fontWeight: "900",
    textShadowColor: "#000",
    textShadowRadius: 8,
  },
  fxName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    textAlign: "center",
    textShadowColor: "#000",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  fxNameSub: {
    color: "#ffffffcc",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  fxButtons: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 60,
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  spark: {
    position: "absolute",
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ffd54d",
    shadowColor: "#ffd54d",
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  confetti: {
    position: "absolute",
    width: 10,
    height: 14,
    borderRadius: 2,
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
  },
  resultSub: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  resultButtons: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  resultButton: {
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  resultButtonText: { color: "#fff", fontWeight: "800" },
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

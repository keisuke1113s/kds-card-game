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
import { checkQrPayload } from "@/data/unlock";
import { evaluateAchievements } from "@/store/achievementStore";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { haptic } from "@/audio/haptics";
import { colors, radius, spacing } from "@/theme";

/**
 * 実物カードのQRコードを読み込んで、カードを開放する画面。
 * Webはブラウザのカメラ＋jsQR、アプリ版は expo-camera で読み取る。
 */

type ScanOutcome =
  | { kind: "unlocked"; cardId: string }
  | { kind: "already"; cardId: string }
  | { kind: "needsUpdate" }
  | { kind: "invalid" };

export default function ScanScreen() {
  const router = useRouter();
  const unlockState = useUnlockStore();
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [manual, setManual] = useState("");
  // 結果表示中は読み取りを止める（同じQRを連続で拾わないように）
  const pausedRef = useRef(false);
  pausedRef.current = outcome !== null;

  const handlePayload = (raw: string) => {
    if (pausedRef.current) return;
    const check = checkQrPayload(raw);
    if (check.status === "invalid") {
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

      {outcome && (
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
            ) : (
              <>
                <Text style={styles.resultEmoji}>
                  {outcome.kind === "unlocked" ? "🎉" : "✅"}
                </Text>
                <Text style={styles.resultTitle}>
                  {outcome.kind === "unlocked"
                    ? `「${getCard(outcome.cardId).name}」を登録しました！`
                    : `「${getCard(outcome.cardId).name}」は登録済みです`}
                </Text>
                {outcome.kind === "unlocked" ? (
                  <PackReveal cardId={outcome.cardId} />
                ) : (
                  <CardFace cardId={outcome.cardId} size="lg" />
                )}
                {outcome.kind === "unlocked" && (
                  <Text style={styles.resultSub}>
                    図鑑に追加され、デッキでも使えるようになりました
                  </Text>
                )}
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
 * パック開封風の演出。
 * カード裏面が光りながら揺れ、めくれて表が現れる。まわりに紙吹雪が舞う
 * （図鑑の開発用テスト開放からも使う）
 */
export function PackReveal({ cardId }: { cardId: string }) {
  const flip = useSharedValue(0); // 0=裏 1=表
  const glow = useSharedValue(0);
  const wobble = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(
      withSequence(withTiming(1, { duration: 260 }), withTiming(0.3, { duration: 260 })),
      3
    );
    wobble.value = withSequence(
      withTiming(-4, { duration: 130 }),
      withRepeat(withSequence(withTiming(4, { duration: 110 }), withTiming(-4, { duration: 110 })), 5),
      withTiming(0, { duration: 90 })
    );
    flip.value = withDelay(
      1400,
      withTiming(1, { duration: 550, easing: Easing.inOut(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotate: `${wobble.value}deg` },
      { rotateY: `${flip.value * 180}deg` },
    ],
    opacity: flip.value < 0.5 ? 1 : 0,
  }));
  const frontStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 800 },
      { rotateY: `${flip.value * 180 - 180}deg` },
      { scale: 1 + (flip.value > 0.5 ? (1 - flip.value) * 0.3 : 0) },
    ],
    opacity: flip.value >= 0.5 ? 1 : 0,
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value * 0.9 }));

  return (
    <View style={styles.packWrap}>
      <Animated.View style={[styles.packGlow, glowStyle]} />
      <Animated.View style={[styles.packFace, backStyle]}>
        <CardFace cardId={cardId} size="lg" faceDown />
      </Animated.View>
      <Animated.View style={[styles.packFace, frontStyle]}>
        <CardFace cardId={cardId} size="lg" />
      </Animated.View>
      {/* 紙吹雪 */}
      {Array.from({ length: 14 }, (_, i) => (
        <ConfettiPiece key={i} index={i} />
      ))}
    </View>
  );
}

const CONFETTI_COLORS = ["#e2604a", "#e49c18", "#78b424", "#3d8fd0", "#c9d63a", "#8fd3ee"];

function ConfettiPiece({ index }: { index: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      1500 + (index % 7) * 90,
      withTiming(1, { duration: 1300 + (index % 5) * 220, easing: Easing.out(Easing.quad) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const angle = (index / 14) * Math.PI * 2;
  const dist = 90 + (index % 4) * 30;
  const style = useAnimatedStyle(() => ({
    opacity: p.value === 0 ? 0 : 1 - Math.max(0, (p.value - 0.6) / 0.4),
    transform: [
      { translateX: Math.cos(angle) * dist * p.value },
      { translateY: Math.sin(angle) * dist * p.value + 60 * p.value * p.value },
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
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx2d.drawImage(video, 0, 0);
            const img = ctx2d.getImageData(0, 0, canvas.width, canvas.height);
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
  packWrap: {
    width: 150,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  packFace: { ...StyleSheet.absoluteFill },
  packGlow: {
    position: "absolute",
    left: -18,
    right: -18,
    top: -18,
    bottom: -18,
    borderRadius: 20,
    backgroundColor: "#ffd54d",
  },
  confetti: {
    position: "absolute",
    left: "50%",
    top: "40%",
    width: 9,
    height: 13,
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

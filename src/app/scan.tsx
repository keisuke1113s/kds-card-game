import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { getCard } from "@/data/cards";
import { verifyQrPayload } from "@/data/unlock";
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
    const cardId = verifyQrPayload(raw);
    if (!cardId) {
      haptic("light");
      setOutcome({ kind: "invalid" });
      return;
    }
    const already = unlockedSet(useUnlockStore.getState()).has(cardId);
    if (already) {
      haptic("light");
      setOutcome({ kind: "already", cardId });
      return;
    }
    useUnlockStore.getState().unlock(cardId);
    haptic("heavy");
    setOutcome({ kind: "unlocked", cardId });
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
                <CardFace cardId={outcome.cardId} size="lg" />
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

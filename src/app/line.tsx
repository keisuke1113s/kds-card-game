import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { ScreenEnter } from "@/components/ScreenEnter";
import { LINE_FRIEND_URL, LINE_LINK_CODES, isValidLinkCode } from "@/data/lineConfig";
import { ALL_CARDS_OPEN_FOR_TESTING, specialCodeOf } from "@/data/unlock";
import { evaluateAchievements } from "@/store/achievementStore";
import { getDeviceId, trackEvent } from "@/data/telemetry";
import { useLineStore } from "@/store/lineStore";
import { colors, radius, spacing } from "@/theme";

const LINE_GREEN = "#06C755";

/**
 * LINE連携（任意）。
 * 公式アカウントを友だち追加 → Lステップが配る連携コードを入力すると
 * オンライン対戦・QRカード登録・インストラクターに挑戦が解放される。
 */
export default function LineScreen() {
  const router = useRouter();
  const line = useLineStore();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justLinked, setJustLinked] = useState(false);

  const [busy, setBusy] = useState(false);
  // LINEログイン連携（方式B）。サーバーにチャネル設定があるときだけボタンを出す
  const [loginAvailable, setLoginAvailable] = useState(false);
  const [loginWaiting, setLoginWaiting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("https://tcg.kds946.com/line/available");
        const out = (await res.json()) as { available?: boolean };
        if (alive) setLoginAvailable(Boolean(out.available));
      } catch {
        // サーバーに届かないときはコード連携だけを出す
      }
    })();
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startLineLogin = async () => {
    haptic("light");
    const id = await getDeviceId();
    const url = `https://tcg.kds946.com/line/login?device=${id}`;
    if (Platform.OS === "web") {
      window.open(url, "_blank", "noopener");
    } else {
      void Linking.openURL(url);
    }
    // LINE側での操作が終わるのを数秒おきに確認する（3分で打ち切り）
    setLoginWaiting(true);
    if (pollRef.current) clearInterval(pollRef.current);
    let tries = 0;
    pollRef.current = setInterval(() => {
      tries++;
      if (tries > 60) {
        if (pollRef.current) clearInterval(pollRef.current);
        setLoginWaiting(false);
        return;
      }
      void (async () => {
        try {
          const res = await fetch(`https://tcg.kds946.com/line/check?device=${id}`);
          const out = (await res.json()) as { linked?: boolean };
          if (out.linked) {
            if (pollRef.current) clearInterval(pollRef.current);
            setLoginWaiting(false);
            completeLink();
          }
        } catch {
          // 次の周期でもう一度確認する
        }
      })();
    }, 3000);
  };

  const completeLink = () => {
    line.setLinked();
    trackEvent("lineLink");
    setJustLinked(true);
    setError(null);
    playSe("achievement");
    haptic("success");
    setTimeout(evaluateAchievements, 400);
  };

  const failLink = (message: string) => {
    setError(message);
    playSe("hit");
    haptic("warning");
  };

  const tryLink = async () => {
    if (!code.trim() || busy) return;
    if (isValidLinkCode(code)) {
      completeLink();
      return;
    }
    // KCX: 形式のスペシャルコードはサーバーで照合する（QR登録画面が
    // 連携ゲートの内側にあるため、解除後の復帰ルートはこの画面になる）
    const special = specialCodeOf(code);
    if (special) {
      setBusy(true);
      try {
        const res = await fetch("https://tcg.kds946.com/unlock-all", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: special }),
        });
        const out = (await res.json()) as { ok?: boolean; action?: string };
        if (out.ok && out.action === "lineLink") {
          completeLink();
          return;
        }
      } catch {
        failLink("通信できませんでした。電波の良い場所でもう一度お試しください。");
        return;
      } finally {
        setBusy(false);
      }
    }
    failLink("コードが違うようです。LINEに届いたコードをそのまま入力してください。");
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        {line.linked ? (
          <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.card}>
            {justLinked && (
              <>
                {Array.from({ length: 12 }, (_, i) => (
                  <View
                    key={i}
                    {...({ dataSet: { kdsanim: "fall" } } as object)}
                    style={[
                      { position: "absolute", left: `${(i * 83) % 100}%`, top: 0, opacity: 0, zIndex: 5 },
                      {
                        animationDuration: `${2400 + ((i * 977) % 2000)}ms`,
                        animationTimingFunction: "linear",
                        animationIterationCount: "infinite",
                        animationDelay: `${(i * 431) % 1500}ms`,
                      } as never,
                    ]}
                    pointerEvents="none"
                  >
                    <Text style={{ fontSize: 18 }}>{["🎉", "💚", "✨"][i % 3]}</Text>
                  </View>
                ))}
              </>
            )}
            <Text style={styles.title}>💚 連携済み</Text>
            <Text style={styles.bigCheck}>✅</Text>
            <Text style={styles.note}>
              {justLinked
                ? "KDSファミリーへようこそ！すべての機能が解放されました！"
                : "LINE連携済みです。すべての機能が使えます。"}
            </Text>
            <View style={styles.unlockList}>
              <Text style={styles.unlockItem}>🌐 オンライン対戦</Text>
              <Text style={styles.unlockItem}>📷 QRカード登録</Text>
              <Text style={styles.unlockItem}>👨‍🏫 インストラクターに挑戦</Text>
              <Text style={styles.unlockItem}>🏆 トーナメント</Text>
              <Text style={styles.unlockItem}>🏫 自動車学校メニュー（クイズ・危険予測・診断・視力）</Text>
              <Text style={styles.unlockItem}>📔 教習手帳・💡 豆知識・🪪 教習生免許証</Text>
              <Text style={styles.unlockItem}>🎖 称号「KDSファミリー」</Text>
            </View>
            <AppButton label="ホームへ戻る" tone="primary" fullWidth onPress={() => router.replace("/")} />
          </Animated.View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>💚 LINE連携（無料）</Text>
            <Text style={styles.note}>
              KDS釧路自動車学校の公式LINEと連携すると、次の機能が解放されます。
            </Text>
            <View style={styles.unlockList}>
              <Text style={styles.unlockItem}>🔒 🌐 オンライン対戦</Text>
              <Text style={styles.unlockItem}>🔒 📷 QRカード登録</Text>
              <Text style={styles.unlockItem}>🔒 👨‍🏫 インストラクターに挑戦</Text>
              <Text style={styles.unlockItem}>🔒 🏆 トーナメント</Text>
              <Text style={styles.unlockItem}>🔒 🏫 自動車学校メニュー（クイズ・危険予測・診断・視力）</Text>
              <Text style={styles.unlockItem}>🔒 📔 教習手帳・💡 豆知識・🪪 教習生免許証</Text>
              <Text style={styles.unlockItem}>🎁 称号「KDSファミリー」</Text>
            </View>

            <View style={styles.stepBox}>
              <Text style={styles.stepTitle}>STEP 1　公式LINEを友だち追加</Text>
              <Text style={styles.stepNote}>
                下のボタンからKDS釧路自動車学校の公式アカウントを追加してね。
              </Text>
              <Pressable
                style={styles.lineButton}
                onPress={() => {
                  haptic("light");
                  Linking.openURL(LINE_FRIEND_URL);
                }}
              >
                <Text style={styles.lineButtonText}>💬 友だち追加する</Text>
              </Pressable>
            </View>

            {loginAvailable && (
              <View style={styles.stepBox}>
                <Text style={styles.stepTitle}>STEP 2　LINEでログインして連携</Text>
                <Text style={styles.stepNote}>
                  LINEのログイン画面が開きます。許可すると自動で連携されます。
                </Text>
                <Pressable style={styles.lineButton} onPress={startLineLogin}>
                  <Text style={styles.lineButtonText}>💚 LINEでログインして連携</Text>
                </Pressable>
                {loginWaiting && (
                  <Text style={styles.stepNote}>
                    ⏳ LINEでの操作が終わるのを待っています…（終わると自動で画面が切り替わります）
                  </Text>
                )}
              </View>
            )}

            <View style={styles.stepBox}>
              <Text style={styles.stepTitle}>
                {loginAvailable ? "うまくいかないとき　連携コードで連携" : "STEP 2　連携コードを入力"}
              </Text>
              <Text style={styles.stepNote}>
                友だち追加すると、LINEに「連携コード」が届きます。
                届かないときはトークで「トレカ連携」と送ってみてね。
              </Text>
              {/* テスト期間中だけ、動作チェック用にコードをそのまま見せる */}
              {ALL_CARDS_OPEN_FOR_TESTING && (
                <Text style={styles.testCode} selectable>
                  🔧 動作チェック用コード: <Text style={{ fontWeight: "900" }}>{LINE_LINK_CODES[0]}</Text>
                </Text>
              )}
              <TextInput
                style={styles.codeInput}
                value={code}
                onChangeText={(v) => {
                  setCode(v);
                  setError(null);
                }}
                placeholder="連携コードを入力"
                autoCapitalize="characters"
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <Pressable style={[styles.lineButton, { backgroundColor: colors.primary }]} onPress={tryLink}>
                <Text style={styles.lineButtonText}>連携する</Text>
              </Pressable>
            </View>

            <Text style={styles.small}>
              連携は無料で、アプリが取得する個人情報はありません。
              連携しなくてもCPU対戦はこれまで通り遊べます。
            </Text>
            <AppButton label="あとで（ホームへ戻る）" tone="ghost" fullWidth onPress={() => router.back()} />
          </View>
        )}
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
    overflow: "hidden",
  },
  title: { fontSize: 22, fontWeight: "900", color: LINE_GREEN, textAlign: "center" },
  bigCheck: { fontSize: 56, textAlign: "center" },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  small: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
  unlockList: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  unlockItem: { fontSize: 14, fontWeight: "700", color: colors.text },
  stepBox: {
    borderWidth: 1.5,
    borderColor: LINE_GREEN,
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  stepTitle: { fontSize: 14, fontWeight: "900", color: "#04833a" },
  stepNote: { fontSize: 12, lineHeight: 19, color: colors.text },
  lineButton: {
    backgroundColor: LINE_GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  lineButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  codeInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 12, color: colors.danger, fontWeight: "700" },
  testCode: {
    fontSize: 12,
    color: "#8a6d00",
    backgroundColor: "#fff7e0",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    overflow: "hidden",
  },
});

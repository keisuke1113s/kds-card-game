import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { ZoomIn } from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { ScreenEnter } from "@/components/ScreenEnter";
import { LINE_FRIEND_URL, isValidLinkCode } from "@/data/lineConfig";
import { evaluateAchievements } from "@/store/achievementStore";
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

  const tryLink = () => {
    if (!code.trim()) return;
    if (isValidLinkCode(code)) {
      line.setLinked();
      setJustLinked(true);
      setError(null);
      playSe("achievement");
      haptic("success");
      setTimeout(evaluateAchievements, 400);
    } else {
      setError("コードが違うようです。LINEに届いたコードをそのまま入力してください。");
      playSe("hit");
      haptic("warning");
    }
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
            <Text style={styles.title}>💚 連携ずみ</Text>
            <Text style={styles.bigCheck}>✅</Text>
            <Text style={styles.note}>
              {justLinked
                ? "KDSファミリーへようこそ！すべての機能が解放されました！"
                : "LINE連携ずみです。すべての機能が使えます。"}
            </Text>
            <View style={styles.unlockList}>
              <Text style={styles.unlockItem}>🌐 オンライン対戦</Text>
              <Text style={styles.unlockItem}>📷 QRカード登録</Text>
              <Text style={styles.unlockItem}>👨‍🏫 インストラクターに挑戦</Text>
              <Text style={styles.unlockItem}>🏆 トーナメント</Text>
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

            <View style={styles.stepBox}>
              <Text style={styles.stepTitle}>STEP 2　連携コードを入力</Text>
              <Text style={styles.stepNote}>
                友だち追加すると、LINEに「連携コード」が届きます。
                届かないときはトークで「連携」と送ってみてね。
              </Text>
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
              連携しなくてもCPU対戦・学科クイズなどはこれまで通り遊べます。
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
});

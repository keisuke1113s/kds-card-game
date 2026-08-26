import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { haptic } from "@/audio/haptics";
import { colors, radius } from "@/theme";

/**
 * ヘッダー左のホームボタン。
 * ブラウザの戻る操作や履歴に依存せず、どの画面からでもホームに戻れるようにする
 * （ホーム画面に追加したときはブラウザの戻るボタンが無いため）。
 */
function HomeButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        haptic("light");
        router.replace("/");
      }}
      hitSlop={10}
      style={({ pressed }) => [styles.homeButton, pressed && styles.homeButtonPressed]}
    >
      <Text style={styles.homeButtonIcon}>🏠</Text>
      <Text style={styles.homeButtonText}>ホーム</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
          headerLeft: () => <HomeButton />,
          headerBackVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="battle" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="tutorial" options={{ title: "遊び方" }} />
        <Stack.Screen name="prematch" options={{ title: "対戦の準備" }} />
        <Stack.Screen name="deck/index" options={{ title: "デッキ" }} />
        <Stack.Screen name="deck/[deckId]" options={{ title: "デッキ構築" }} />
        <Stack.Screen name="library/index" options={{ title: "カード図鑑" }} />
        <Stack.Screen name="rules" options={{ title: "ルール" }} />
        <Stack.Screen name="settings" options={{ title: "設定", headerLeft: () => null }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  // ヘッダーと同じ青に埋もれないよう、白フチのボタンとして見せる
  homeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 12,
    borderRadius: radius.pill,
    backgroundColor: "#ffffff26",
    borderWidth: 1.5,
    borderColor: "#ffffffaa",
  },
  homeButtonPressed: { backgroundColor: "#ffffff44", borderColor: "#ffffff" },
  homeButtonIcon: { fontSize: 13 },
  homeButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
});

import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors } from "@/theme";

/**
 * ヘッダー左のホームボタン。
 * ブラウザの戻る操作や履歴に依存せず、どの画面からでもホームに戻れるようにする
 * （ホーム画面に追加したときはブラウザの戻るボタンが無いため）。
 */
function HomeButton() {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.replace("/")} hitSlop={10} style={styles.homeButton}>
      <Text style={styles.homeButtonText}>‹ ホーム</Text>
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
  homeButton: { paddingVertical: 4, paddingRight: 16 },
  homeButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});

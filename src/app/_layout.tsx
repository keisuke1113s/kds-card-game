import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { colors } from "@/theme";

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
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="battle" options={{ headerShown: false, gestureEnabled: false }} />
        <Stack.Screen name="deck/index" options={{ title: "デッキ" }} />
        <Stack.Screen name="deck/[deckId]" options={{ title: "デッキ構築" }} />
        <Stack.Screen name="library/index" options={{ title: "カード図鑑" }} />
        <Stack.Screen name="rules" options={{ title: "ルール" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
      </Stack>
    </>
  );
}

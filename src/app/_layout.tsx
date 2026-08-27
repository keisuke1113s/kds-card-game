import { Stack, useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { haptic } from "@/audio/haptics";
import { preloadAllSmall, preloadAllThumbs } from "@/data/preload";
import { ensureInitialSet } from "@/store/unlockStore";
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
  // カードの絵を先に読み込み、そろってから起動画面を消す。
  // 絵が後から出てくる（一瞬文字だけになる）のを防ぐため。
  // 一覧用（150px）と拡大用（300px）の全カードぶんをここで読み込む。
  // 初回起動なら、ランダムな22枚（デッキ1つ分）をこの端末の初期セットとして配る
  useEffect(() => {
    ensureInitialSet();
  }, []);

  useEffect(() => {
    let alive = true;
    const hideBoot = () => {
      const el = globalThis.document?.getElementById("kds-boot");
      if (!el) return;
      el.classList.add("kds-hide");
      setTimeout(() => el.remove(), 400);
    };
    // 読み込みが長引いても、いつまでも待たせない
    const failsafe = setTimeout(hideBoot, 8000);
    Promise.all([preloadAllSmall(), preloadAllThumbs()]).finally(() => {
      if (!alive) return;
      clearTimeout(failsafe);
      hideBoot();
    });
    return () => {
      alive = false;
      clearTimeout(failsafe);
    };
  }, []);

  return (
    <>
      {/*
       * ブラウザのタブ名 ＝ ホーム画面に追加したときの既定名。
       * expo-router が空の <title> を先に出力してしまうため、ここで必ず名前を入れる。
       */}
      <Head>
        <title>KDSトレーディングカードゲーム</title>
      </Head>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.primary },
          headerTintColor: "#fff",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: colors.background },
          headerLeft: () => <HomeButton />,
          headerBackVisible: false,
          // 画面の移動は右から流れ込む形で見せる
          animation: "slide_from_right",
          animationDuration: 280,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, animation: "fade" }} />
        {/* 対戦は「別世界に入る」感じにしたいのでフェードで切り替える */}
        <Stack.Screen
          name="battle"
          options={{ headerShown: false, gestureEnabled: false, animation: "fade" }}
        />
        <Stack.Screen name="online" options={{ title: "オンライン対戦" }} />
        <Stack.Screen name="tutorial" options={{ title: "遊び方" }} />
        <Stack.Screen name="prematch" options={{ title: "対戦の準備" }} />
        <Stack.Screen name="deck/index" options={{ title: "デッキ" }} />
        <Stack.Screen name="deck/[deckId]" options={{ title: "デッキ構築" }} />
        <Stack.Screen name="library/index" options={{ title: "カード図鑑" }} />
        <Stack.Screen name="scan" options={{ title: "カードのQR登録" }} />
        <Stack.Screen name="admin" options={{ title: "カード管理" }} />
        <Stack.Screen name="rules" options={{ title: "ルール" }} />
        {/* 設定は下から迫り上がる（ダイアログのような扱い） */}
        <Stack.Screen
          name="settings"
          options={{ title: "設定", headerLeft: () => null, animation: "slide_from_bottom" }}
        />
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

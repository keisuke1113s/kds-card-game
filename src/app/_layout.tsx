import { Stack, usePathname, useRouter } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";
import { haptic } from "@/audio/haptics";
import { AchievementToast } from "@/components/AchievementToast";
import { ImageWarmLayer } from "@/components/ImageWarmLayer";
import { setupErrorReporting } from "@/data/errlog";
import { trackEvent } from "@/data/telemetry";
import { useLineStore } from "@/store/lineStore";
import { preloadAllSmall, preloadAllThumbs } from "@/data/preload";
import { evaluateAchievements } from "@/store/achievementStore";
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

/**
 * 新しいバージョンの検知（Webのみ）。
 * いま動いているJSバンドル名と、サーバー上の最新ページが参照するバンドル名を
 * 比べて、違っていたら更新バナーを出す。iPhoneのホーム画面アプリ（PWA）は
 * 開き直しても再読み込みされないことがあり、古い版が出続ける対策
 */
function useUpdateAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const doc = globalThis.document;
    if (!doc) return;
    const script = doc.querySelector('script[src*="entry-"]') as { src?: string } | null;
    const src = script?.src ?? "";
    const cur = /entry-([a-f0-9]+)\.js/.exec(src)?.[1];
    if (!cur) return; // 開発サーバーでは何もしない
    const root = src.split("_expo")[0];
    let lastCheck = 0;
    const check = async () => {
      if (Date.now() - lastCheck < 3 * 60 * 1000) return; // 3分に1回まで
      lastCheck = Date.now();
      try {
        const html = await fetch(root, { cache: "no-store" }).then((r) => r.text());
        const latest = /entry-([a-f0-9]+)\.js/.exec(html)?.[1];
        if (latest && latest !== cur) setAvailable(true);
      } catch {
        // 圏外などで確認できないときは何もしない
      }
    };
    void check();
    const onVisible = () => {
      if (doc.visibilityState === "visible") void check();
    };
    doc.addEventListener("visibilitychange", onVisible);
    return () => doc.removeEventListener("visibilitychange", onVisible);
  }, []);
  return available;
}

export default function RootLayout() {
  const updateAvailable = useUpdateAvailable();
  // 管理画面（/admin）は管理者用の別世界なので、実績の判定・お知らせや
  // 利用分析の「起動」カウントを動かさない
  const pathname = usePathname();
  const isAdmin = pathname.startsWith("/admin");

  // カードの絵を先に読み込み、そろってから起動画面を消す。
  // 絵が後から出てくる（一瞬文字だけになる）のを防ぐため。
  // 一覧用（150px）と拡大用（300px）の全カードぶんをここで読み込む。
  // 初回起動なら、ランダムな22枚（デッキ1つ分）をこの端末の初期セットとして配る
  useEffect(() => {
    ensureInitialSet();
    setupErrorReporting();
    if (isAdmin) return;
    trackEvent("appOpen", { line: useLineStore.getState().linked });
    // 取りこぼした実績があれば起動時に拾う（お知らせは次の達成時のみ）
    const t = setTimeout(evaluateAchievements, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // アプリに戻ってきたとき、カードの絵を温め直す。
  // iPhoneのSafariはメモリ節約のため展開済みの絵を捨てることがあり、
  // 戻った直後にカードが一瞬白く見える原因になるため
  useEffect(() => {
    const doc = globalThis.document;
    if (!doc?.addEventListener) return;
    let lastWarm = Date.now();
    const onVisible = () => {
      if (doc.visibilityState !== "visible") return;
      // 頻繁に切り替えても連発しないよう、1分以上あいたときだけ温め直す
      if (Date.now() - lastWarm < 60 * 1000) return;
      lastWarm = Date.now();
      void preloadAllSmall();
      void preloadAllThumbs();
    };
    doc.addEventListener("visibilitychange", onVisible);
    return () => doc.removeEventListener("visibilitychange", onVisible);
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
        {/* 各画面のヘッダー色はホームのボタンの色と揃える（どこにいるか一目で分かる） */}
        <Stack.Screen name="index" options={{ headerShown: false, animation: "fade" }} />
        {/* 対戦は「別世界に入る」感じにしたいのでフェードで切り替える */}
        <Stack.Screen
          name="battle"
          options={{ headerShown: false, gestureEnabled: false, animation: "fade" }}
        />
        <Stack.Screen name="online" options={{ title: "オンライン対戦", headerStyle: { backgroundColor: "#d83030" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="tutorial" options={{ title: "遊び方", headerStyle: { backgroundColor: "#eeb121" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="prematch" options={{ title: "対戦の準備", headerStyle: { backgroundColor: "#3d8fd0" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="deck/index" options={{ title: "デッキ", headerStyle: { backgroundColor: "#78b424" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="deck/[deckId]" options={{ title: "デッキ構築", headerStyle: { backgroundColor: "#78b424" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="library/index" options={{ title: "カード図鑑", headerStyle: { backgroundColor: "#3d8fd0" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="scan" options={{ title: "カードのQR登録" }} />
        <Stack.Screen name="records" options={{ title: "対戦記録", headerStyle: { backgroundColor: "#8fd3ee" }, headerTintColor: "#16283c", }} />
        <Stack.Screen name="achievements" options={{ title: "実績と称号", headerStyle: { backgroundColor: "#d83030" }, headerTintColor: "#fff", }} />
        {/* 管理画面はゲームと切り離す（ヘッダーのホームボタンも出さない） */}
        <Stack.Screen name="admin" options={{ title: "管理画面", headerLeft: () => null }} />
        <Stack.Screen name="rules" options={{ title: "ルール", headerStyle: { backgroundColor: "#eeb121" }, headerTintColor: "#16283c", }} />
        <Stack.Screen name="quiz" options={{ title: "学科クイズ", headerStyle: { backgroundColor: "#78b424" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="kyokan" options={{ title: "インストラクターに挑戦", headerStyle: { backgroundColor: "#3d8fd0" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="tournament" options={{ title: "トーナメント", headerStyle: { backgroundColor: "#3d8fd0" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="kyt" options={{ title: "危険予測トレーニング", headerStyle: { backgroundColor: "#e8590c" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="license" options={{ title: "教習生免許証", headerStyle: { backgroundColor: "#e2604a" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="shindan" options={{ title: "運転適性診断", headerStyle: { backgroundColor: "#e2604a" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="eyecheck" options={{ title: "動体視力チェック", headerStyle: { backgroundColor: "#3d8fd0" }, headerTintColor: "#fff", }} />
        <Stack.Screen name="course" options={{ title: "S字・クランク" }} />
        <Stack.Screen name="line" options={{ title: "LINE連携", headerStyle: { backgroundColor: "#06C755" }, headerTintColor: "#fff" }} />
        {/* 設定は下から迫り上がる（ダイアログのような扱い） */}
        <Stack.Screen
          name="settings"
          options={{ title: "設定", headerLeft: () => null, animation: "slide_from_bottom", headerStyle: { backgroundColor: "#c9d63a" }, headerTintColor: "#16283c", }}
        />
      </Stack>
      {/* 実績達成の全画面お知らせ（アプリ全体で1つ。管理画面では出さない） */}
      {!isAdmin && <AchievementToast />}
      {/* カード画像を捨てられにくくする常駐ウォームレイヤー（Webのみ） */}
      <ImageWarmLayer />
      {/* 新しいバージョンのお知らせ（タップで読み込み直す） */}
      {updateAvailable && (
        <Pressable
          style={styles.updateBanner}
          onPress={() => {
            const loc = (globalThis as { location?: { reload: () => void } }).location;
            loc?.reload();
          }}
        >
          <Text style={styles.updateBannerText}>
            🆕 新しいバージョンがあります — タップで更新
          </Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  updateBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: "#1d7a34",
    paddingVertical: 10,
    alignItems: "center",
  },
  updateBannerText: { color: "#fff", fontWeight: "800", fontSize: 14 },
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

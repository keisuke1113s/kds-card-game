import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { colors, radius, shadow, spacing } from "@/theme";

/**
 * 「ホーム画面に追加」の案内。
 *
 * ブラウザの決まりで、ページを開いただけで勝手に追加することはできない。
 * できるのは次の2つまで:
 *   - Android の Chrome … OS標準のインストールダイアログをこちらから出す（1タップで完了）
 *   - iPhone の Safari  … 追加のしかたを案内する（Appleは自動化の仕組みを用意していない）
 */

const DISMISS_KEY = "kds-install-dismissed";

type Mode = "none" | "android" | "ios";

/** すでにホーム画面から起動しているか */
function isStandalone(): boolean {
  if (Platform.OS !== "web") return true;
  try {
    const nav = globalThis.navigator as Navigator & { standalone?: boolean };
    if (nav?.standalone) return true; // iOS Safari
    return globalThis.matchMedia?.("(display-mode: standalone)").matches ?? false;
  } catch {
    return false;
  }
}

/** iPhone / iPad の Safari か（Chrome for iOS などは「ホーム画面に追加」を持たない） */
function isIosSafari(): boolean {
  if (Platform.OS !== "web") return false;
  try {
    const nav = globalThis.navigator as Navigator & { maxTouchPoints?: number };
    const ua = nav?.userAgent ?? "";
    const isApple =
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes("Macintosh") && (nav?.maxTouchPoints ?? 0) > 1);
    if (!isApple) return false;
    // Safari 以外（CriOS = Chrome、FxiOS = Firefox）は共有メニューに項目が無い
    return !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  } catch {
    return false;
  }
}

function wasDismissed(): boolean {
  if (Platform.OS !== "web") return true;
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY, "1");
  } catch {
    // プライベートブラウズなどで保存できなくても支障はない
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>("none");

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (isStandalone() || wasDismissed()) return;

    const win = globalThis as typeof globalThis & { __installPrompt?: unknown };

    // パソコンでも同じイベントは来るが、案内したいのはスマホ・タブレットだけ
    const isTouchDevice = (globalThis.navigator?.maxTouchPoints ?? 0) > 0;
    const showAndroid = () => {
      if (isTouchDevice) setMode("android");
    };
    // +html.tsx が先に拾っている場合があるので、両方を見る
    if (win.__installPrompt) showAndroid();
    globalThis.addEventListener?.("kds-installable", showAndroid);

    const onInstalled = () => setMode("none");
    globalThis.addEventListener?.("kds-installed", onInstalled);

    // iPhone はダイアログを出せないので、少し待ってから案内を出す
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (isIosSafari()) {
      timer = setTimeout(() => {
        setMode((m) => (m === "none" ? "ios" : m));
      }, 1200);
    }

    return () => {
      globalThis.removeEventListener?.("kds-installable", showAndroid);
      globalThis.removeEventListener?.("kds-installed", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const close = () => {
    haptic("light");
    rememberDismissed();
    setMode("none");
  };

  const install = async () => {
    haptic("medium");
    const win = globalThis as typeof globalThis & {
      __installPrompt?: { prompt: () => void; userChoice: Promise<{ outcome: string }> };
    };
    const prompt = win.__installPrompt;
    if (!prompt) return;
    try {
      prompt.prompt();
      const choice = await prompt.userChoice;
      win.__installPrompt = undefined;
      if (choice.outcome === "accepted") setMode("none");
      else close();
    } catch {
      setMode("none");
    }
  };

  if (mode === "none") return null;

  return (
    <ScreenEnter style={styles.card}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>ホーム画面に追加できます</Text>
        {mode === "android" ? (
          <Text style={styles.body}>
            追加すると、アプリのアイコンから一発で開けます。通信の待ち時間も短くなります。
          </Text>
        ) : (
          <Text style={styles.body}>
            画面下の共有ボタン{" "}
            <Text style={styles.icon}>⬆︎</Text>
            {" "}を押して、メニューの中から「ホーム画面に追加」を選んでください。
          </Text>
        )}
      </View>

      <View style={styles.buttons}>
        {mode === "android" && (
          <Pressable style={styles.primaryButton} onPress={install}>
            <Text style={styles.primaryText}>ホーム画面に追加</Text>
          </Pressable>
        )}
        <Pressable style={styles.closeButton} onPress={close} hitSlop={8}>
          <Text style={styles.closeText}>{mode === "android" ? "あとで" : "わかりました"}</Text>
        </Pressable>
      </View>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  textWrap: { gap: 3 },
  title: { fontSize: 15, fontWeight: "900", color: colors.primaryDark },
  body: { fontSize: 13, lineHeight: 20, color: colors.text },
  icon: { fontWeight: "900", color: colors.primary },
  buttons: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  primaryButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  closeButton: { paddingVertical: 10, paddingHorizontal: 12 },
  closeText: { color: colors.textMuted, fontWeight: "700", fontSize: 13 },
});

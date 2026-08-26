import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSettingsStore } from "@/store/settingsStore";

// 触覚フィードバック（振動）。
//
// 対応状況:
//   - iOS / Android のアプリ版 … expo-haptics で細かい強弱を出せる（本命）
//   - Android のブラウザ       … navigator.vibrate で簡易的に振動する
//   - iOS の Safari            … 振動の仕組みがブラウザに無いため動かない
//                                （ホーム画面に追加しても同じ。アプリ版が必要）

export type Tap =
  | "light" // ボタン・カード選択
  | "medium" // カードを場に出す・能力発動
  | "heavy" // バトル宣言
  | "success" // じゃんけん勝ち・勝利
  | "warning" // 教習時限を戻された
  | "error"; // 敗北・退場

/** ブラウザ用の振動パターン（ミリ秒。配列は振動と休止の交互） */
const webPattern: Record<Tap, number | number[]> = {
  light: 12,
  medium: 22,
  heavy: 38,
  success: [18, 60, 18],
  warning: [26, 70, 26],
  error: [45, 70, 45],
};

export function haptic(kind: Tap): void {
  if (!useSettingsStore.getState().hapticsEnabled) return;

  if (Platform.OS === "web") {
    try {
      const nav = globalThis.navigator as Navigator & {
        vibrate?: (p: number | number[]) => boolean;
      };
      nav?.vibrate?.(webPattern[kind]);
    } catch {
      // 非対応のブラウザ（iOS Safari など）では何も起きない
    }
    return;
  }

  try {
    switch (kind) {
      case "light":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case "medium":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case "heavy":
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case "success":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case "warning":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case "error":
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // 対応していない端末では無視する
  }
}

/** この端末で振動が使えるか（設定画面の案内に使う） */
export function hapticsAvailable(): boolean {
  if (Platform.OS !== "web") return true;
  try {
    const nav = globalThis.navigator as Navigator & { vibrate?: unknown };
    return typeof nav?.vibrate === "function";
  } catch {
    return false;
  }
}

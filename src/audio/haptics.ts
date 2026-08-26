import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { useSettingsStore } from "@/store/settingsStore";

// 触覚フィードバック（iPhoneの振動）。
// 体感品質に効くので、操作の重みに応じて強さを使い分ける。
// Web では何も起きない（例外も出さない）。

export type Tap =
  | "light" // ボタン・カード選択
  | "medium" // カードを場に出す・能力発動
  | "heavy" // バトル宣言
  | "success" // じゃんけん勝ち・勝利
  | "warning" // 教習時限を戻された
  | "error"; // 敗北・退場

export function haptic(kind: Tap): void {
  if (Platform.OS === "web") return;
  if (!useSettingsStore.getState().hapticsEnabled) return;
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

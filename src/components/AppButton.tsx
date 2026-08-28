import React from "react";
import { Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "@/audio/haptics";
import { colors, radius, shadow, spacing } from "@/theme";

// アプリ共通のボタン。
// 押すと沈み込み、影が浅くなり、触覚フィードバックが返る。
// この「手応え」の有無が、無料アプリと有料アプリの体感差になる。

export type ButtonTone =
  | "primary"
  | "accent"
  | "success"
  | "danger"
  | "neutral"
  | "ghost";

const toneColor: Record<ButtonTone, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.primary, fg: "#ffffff" },
  accent: { bg: colors.accent, fg: "#ffffff" },
  success: { bg: colors.success, fg: "#ffffff" },
  danger: { bg: colors.danger, fg: "#ffffff" },
  neutral: { bg: colors.cancel, fg: "#ffffff" },
  ghost: { bg: "transparent", fg: colors.primary, border: colors.primary },
};

interface Props {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** 押したときの触覚の強さ */
  feel?: "light" | "medium" | "heavy";
  style?: ViewStyle;
  /** ラベルの左に置く絵文字 */
  icon?: string;
  /** 絵文字の代わりに画像などを置きたいとき */
  iconNode?: React.ReactNode;
  fullWidth?: boolean;
}

export function AppButton({
  label,
  onPress,
  tone = "primary",
  size = "md",
  disabled,
  feel = "light",
  style,
  icon,
  iconNode,
  fullWidth,
}: Props) {
  const press = useSharedValue(0);
  const c = toneColor[tone];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - press.value * 0.035 }, { translateY: press.value * 2 }],
    shadowOpacity: (shadow.button.shadowOpacity ?? 0.18) * (1 - press.value * 0.7),
    shadowRadius: shadow.button.shadowRadius * (1 - press.value * 0.5),
  }));

  // style で高さが固定されているときは、見た目の枠（内側）も
  // その高さいっぱいに広げる（外側だけ大きくなって枠の高さが揃わない事故を防ぐ）
  const fixedHeight = !!style && style.height !== undefined;

  const pad =
    size === "lg"
      ? { paddingVertical: 16, paddingHorizontal: spacing.xl }
      : size === "sm"
        ? { paddingVertical: 8, paddingHorizontal: spacing.md }
        : { paddingVertical: 13, paddingHorizontal: spacing.lg };

  const fontSize = size === "lg" ? 17 : size === "sm" ? 12 : 15;

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        shadow.button,
        animatedStyle,
        fullWidth && styles.fullWidth,
        disabled && styles.disabledShadow,
        style,
      ]}
    >
      <Pressable
        onPressIn={() => {
          if (disabled) return;
          press.value = withTiming(1, { duration: 70 });
        }}
        onPressOut={() => {
          press.value = withSpring(0, { damping: 15, stiffness: 320 });
        }}
        onPress={() => {
          if (disabled) return;
          haptic(feel);
          onPress();
        }}
        disabled={disabled}
        style={[
          styles.base,
          pad,
          fixedHeight && styles.fillHeight,
          {
            backgroundColor: disabled ? colors.border : c.bg,
            borderColor: c.border ?? "transparent",
            borderWidth: c.border ? 2 : 0,
          },
        ]}
      >
        <View style={styles.inner}>
          {iconNode ?? (!!icon && <Text style={[styles.icon, { fontSize: fontSize + 2 }]}>{icon}</Text>)}
          <Text
            style={[
              styles.label,
              { color: disabled ? colors.textMuted : c.fg, fontSize },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // 影は角丸に沿わせる（四角い影が角に残らないように）
  shadowWrap: { borderRadius: radius.md, backgroundColor: "transparent" },
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { color: "#fff" },
  label: { fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
  fullWidth: { alignSelf: "stretch" },
  fillHeight: { height: "100%", paddingVertical: 0 },
  disabledShadow: { shadowOpacity: 0, elevation: 0 },
});

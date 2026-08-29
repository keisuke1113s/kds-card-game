import React, { useEffect, useState } from "react";
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
  // 押した位置から波紋が広がる
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

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
        onPressIn={(ev) => {
          if (disabled) return;
          press.value = withTiming(1, { duration: 70 });
          const ne = ev.nativeEvent as { locationX?: number; locationY?: number };
          setRipple({ x: ne.locationX ?? 40, y: ne.locationY ?? 20, key: Date.now() });
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
        {ripple && (
          <Ripple
            key={ripple.key}
            x={ripple.x}
            y={ripple.y}
            color={tone === "ghost" ? colors.primary + "26" : "#ffffff4d"}
            onDone={() => setRipple(null)}
          />
        )}
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

/** 押した位置から広がる波紋 */
function Ripple({
  x,
  y,
  color,
  onDone,
}: {
  x: number;
  y: number;
  color: string;
  onDone: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withTiming(1, { duration: 480 });
    const timer = setTimeout(onDone, 520);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: 0.9 - t.value * 0.9,
    transform: [{ scale: 0.15 + t.value * 1.1 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ripple,
        { left: x - 90, top: y - 90, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  // 影は角丸に沿わせる（四角い影が角に残らないように）
  shadowWrap: { borderRadius: radius.md, backgroundColor: "transparent" },
  base: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  inner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  icon: { color: "#fff" },
  label: { fontWeight: "800", textAlign: "center", letterSpacing: 0.3 },
  fullWidth: { alignSelf: "stretch" },
  ripple: { position: "absolute", width: 180, height: 180, borderRadius: 90 },
  fillHeight: { height: "100%", paddingVertical: 0 },
  disabledShadow: { shadowOpacity: 0, elevation: 0 },
});

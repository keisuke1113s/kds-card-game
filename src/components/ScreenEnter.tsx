import React, { useEffect } from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

/**
 * 画面が表示されたときに、ふわりと浮き上がって現れるラッパー。
 *
 * `entering` プロップではなく共有値で動かしているのは、
 * 中の子要素が `entering` を持っていても打ち消し合わないようにするため
 * （入れ子の entering は画面が真っ白になる原因になる）。
 */
export function ScreenEnter({
  children,
  style,
  delay = 0,
  distance = 16,
  duration = 320,
  keepVisible = false,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 表示を遅らせる（ミリ秒）。段違いに出したいときに使う */
  delay?: number;
  /** 下から持ち上げる距離 */
  distance?: number;
  duration?: number;
  /**
   * 透明にせず、動きだけで見せる。
   * 端末によってアニメーションが始まらないことがあり、
   * 消えては困るもの（ホームのメニューなど）はこちらを使う。
   */
  keepVisible?: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration, easing: Easing.out(Easing.cubic) })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: keepVisible ? 1 : progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

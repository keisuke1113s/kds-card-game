import React from "react";
import { StyleSheet, Text, View } from "react-native";

/**
 * 学科クイズ用の道路標識（コード描画）。
 * 画像生成だと形が不正確になりがちなので、単純な図形の組み合わせで
 * 教習で扱う代表的な標識を正確に描く。
 */

export type SignId =
  | "tomare" // 止まれ（一時停止）
  | "jokou" // 徐行
  | "shinnyu_kinshi" // 車両進入禁止
  | "chusha_kinshi" // 駐車禁止
  | "chuteisha_kinshi" // 駐停車禁止
  | "saikou_50" // 最高速度50
  | "ippou_tsukou" // 一方通行
  | "sharyou_tsukoudome" // 車両通行止め
  | "hokousha_senyou" // 歩行者専用
  | "jitensha_hokousha"; // 自転車及び歩行者専用

const RED = "#c81e2b";
const BLUE = "#1a5fb4";

/** 逆三角形（止まれ・徐行） */
function TriangleSign({ label }: { label: string }) {
  return (
    <View style={s.triWrap}>
      <View style={s.triangle} />
      <Text style={s.triText} allowFontScaling={false}>
        {label}
      </Text>
    </View>
  );
}

/** 赤い縁の円形標識 */
function CircleSign({
  bg,
  border,
  slash,
  cross,
  children,
}: {
  bg: string;
  border: string;
  slash?: boolean;
  cross?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <View style={[s.circle, { backgroundColor: bg, borderColor: border }]}>
      {children}
      {slash && <View style={s.slash} />}
      {cross && (
        <>
          <View style={s.slash} />
          <View style={[s.slash, { transform: [{ rotate: "45deg" }] }]} />
        </>
      )}
    </View>
  );
}

export function SignImage({ id }: { id: SignId | string }) {
  switch (id) {
    case "tomare":
      return <TriangleSign label="止まれ" />;
    case "jokou":
      return <TriangleSign label="徐行" />;
    case "shinnyu_kinshi":
      return (
        <CircleSign bg={RED} border={RED}>
          <View style={s.whiteBar} />
        </CircleSign>
      );
    case "chusha_kinshi":
      return <CircleSign bg={BLUE} border={RED} slash />;
    case "chuteisha_kinshi":
      return <CircleSign bg={BLUE} border={RED} cross />;
    case "saikou_50":
      return (
        <CircleSign bg="#fff" border={RED}>
          <Text style={s.speedText} allowFontScaling={false}>
            50
          </Text>
        </CircleSign>
      );
    case "ippou_tsukou":
      return (
        <View style={s.rect}>
          <Text style={s.arrowText} allowFontScaling={false}>
            ➜
          </Text>
          <Text style={s.rectLabel} allowFontScaling={false}>
            一方通行
          </Text>
        </View>
      );
    case "sharyou_tsukoudome":
      return (
        <CircleSign bg="#fff" border={RED}>
          <Text style={s.carIcon} allowFontScaling={false}>
            🚗
          </Text>
          <View style={s.slash} />
        </CircleSign>
      );
    case "hokousha_senyou":
      return (
        <CircleSign bg={BLUE} border={BLUE}>
          <Text style={s.personIcon} allowFontScaling={false}>
            🚶
          </Text>
        </CircleSign>
      );
    case "jitensha_hokousha":
      return (
        <CircleSign bg={BLUE} border={BLUE}>
          <Text style={s.personIconSmall} allowFontScaling={false}>
            🚲🚶
          </Text>
        </CircleSign>
      );
    default:
      return null;
  }
}

const SIZE = 84;

const s = StyleSheet.create({
  triWrap: { width: SIZE, height: SIZE, alignItems: "center", justifyContent: "flex-start" },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: SIZE / 2,
    borderRightWidth: SIZE / 2,
    borderTopWidth: SIZE - 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: RED,
  },
  triText: {
    position: "absolute",
    top: 14,
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: 1,
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 8,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  whiteBar: { width: SIZE * 0.62, height: 13, backgroundColor: "#fff", borderRadius: 2 },
  slash: {
    position: "absolute",
    width: SIZE * 0.95,
    height: 8,
    backgroundColor: RED,
    transform: [{ rotate: "-45deg" }],
  },
  speedText: { color: RED, fontSize: 30, fontWeight: "900" },
  carIcon: { fontSize: 30 },
  personIcon: { fontSize: 32 },
  personIconSmall: { fontSize: 20 },
  rect: {
    width: SIZE + 20,
    height: SIZE * 0.56,
    backgroundColor: BLUE,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowText: { color: "#fff", fontSize: 26, fontWeight: "900", lineHeight: 28 },
  rectLabel: { color: "#fff", fontSize: 9, fontWeight: "700" },
});

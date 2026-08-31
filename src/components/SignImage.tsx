import React from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

/**
 * 学科クイズ用の道路標識。
 * 標識のデザインは法令（道路標識、区画線及び道路標示に関する命令）で
 * 定められた公的なもので著作権の対象にならないため、正式デザインの画像
 * （Wikimedia Commons のパブリックドメイン素材）をそのまま表示する。
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
  | "jitensha_hokousha" // 自転車及び歩行者専用
  | "tsukoudome" // 通行止め（歩行者も車も）
  | "keiteki" // 警笛鳴らせ
  | "wakaba" // 初心運転者標識（初心者マーク）
  | "yusen" // 優先道路
  | "tenkai_kinshi" // 転回禁止
  | "oikoshi_kinshi" // 追越しのための右側部分はみ出し通行禁止
  | "saitei_50" // 最低速度50
  | "oudan_kinshi" // 歩行者横断禁止
  | "oudan_hodou" // 横断歩道
  | "fumikiri_ari" // 踏切あり
  | "gakkou_ari" // 学校、幼稚園、保育所等あり
  | "shingou_ari" // 信号機あり
  | "suberiyasui" // すべりやすい
  | "rakuseki" // 落石のおそれあり
  | "shasen_genshou" // 車線数減少
  | "doubutsu" // 動物が飛び出すおそれあり
  | "kouji"; // 道路工事中

const SIGN_IMAGES: Record<SignId, number> = {
  tomare: require("../../assets/images/signs/tomare.webp"),
  jokou: require("../../assets/images/signs/jokou.webp"),
  shinnyu_kinshi: require("../../assets/images/signs/shinnyu_kinshi.webp"),
  chusha_kinshi: require("../../assets/images/signs/chusha_kinshi.webp"),
  chuteisha_kinshi: require("../../assets/images/signs/chuteisha_kinshi.webp"),
  saikou_50: require("../../assets/images/signs/saikou_50.webp"),
  ippou_tsukou: require("../../assets/images/signs/ippou_tsukou.webp"),
  sharyou_tsukoudome: require("../../assets/images/signs/sharyou_tsukoudome.webp"),
  hokousha_senyou: require("../../assets/images/signs/hokousha_senyou.webp"),
  jitensha_hokousha: require("../../assets/images/signs/jitensha_hokousha.webp"),
  tsukoudome: require("../../assets/images/signs/tsukoudome.webp"),
  keiteki: require("../../assets/images/signs/keiteki.webp"),
  wakaba: require("../../assets/images/signs/wakaba.webp"),
  yusen: require("../../assets/images/signs/yusen.webp"),
  tenkai_kinshi: require("../../assets/images/signs/tenkai_kinshi.webp"),
  oikoshi_kinshi: require("../../assets/images/signs/oikoshi_kinshi.webp"),
  saitei_50: require("../../assets/images/signs/saitei_50.webp"),
  oudan_kinshi: require("../../assets/images/signs/oudan_kinshi.webp"),
  oudan_hodou: require("../../assets/images/signs/oudan_hodou.webp"),
  fumikiri_ari: require("../../assets/images/signs/fumikiri_ari.webp"),
  gakkou_ari: require("../../assets/images/signs/gakkou_ari.webp"),
  shingou_ari: require("../../assets/images/signs/shingou_ari.webp"),
  suberiyasui: require("../../assets/images/signs/suberiyasui.webp"),
  rakuseki: require("../../assets/images/signs/rakuseki.webp"),
  shasen_genshou: require("../../assets/images/signs/shasen_genshou.webp"),
  doubutsu: require("../../assets/images/signs/doubutsu.webp"),
  kouji: require("../../assets/images/signs/kouji.webp"),
};

const SIZE = 96;

export function SignImage({ id }: { id: SignId | string }) {
  const src = SIGN_IMAGES[id as SignId];
  if (!src) return null;
  return (
    <View style={s.wrap}>
      <Image source={src} style={s.image} contentFit="contain" />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  image: { width: SIZE, height: SIZE },
});

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
  | "kouji" // 道路工事中
  | "keikai_cross"
  | "keikai_rotary"
  | "keikai_tjunction"
  | "keikai_yjunction"
  | "keikai_curve_r"
  | "keikai_kussetsu_r"
  | "keikai_haikou_kyoku"
  | "keikai_tsuzura"
  | "keikai_rotsu_outotsu"
  | "keikai_gouryuu"
  | "keikai_fukuin"
  | "keikai_nihoukou"
  | "keikai_nobori_koubai"
  | "keikai_kudari_koubai"
  | "keikai_yokokaze"
  | "keikai_sonota"
  | "kisei_nirin_igai"
  | "kisei_oogata_kamotsu"
  | "kisei_oogata_jouyou"
  | "kisei_nirin_gentsuki"
  | "kisei_keisharyou"
  | "kisei_jitensha_tome"
  | "kisei_futari_nori"
  | "kisei_shitei_hoko"
  | "kisei_oudan_kinshi_sharyou"
  | "kisei_jikan_seigen"
  | "kisei_kikenbutsu"
  | "kisei_juuryou"
  | "kisei_takasa"
  | "kisei_saidai_haba"
  | "kisei_jidousha_senyou"
  | "kisei_jitensha_senyou"
  | "kisei_hokousha_tome"
  | "shiji_heishin"
  | "shiji_kidou"
  | "shiji_teisha_ka"
  | "shiji_chuousen"
  | "shiji_jitensha_oudan"
  | "shiji_anzen_chitai";

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
  keikai_cross: require("../../assets/images/signs/keikai_cross.webp"),
  keikai_rotary: require("../../assets/images/signs/keikai_rotary.webp"),
  keikai_tjunction: require("../../assets/images/signs/keikai_tjunction.webp"),
  keikai_yjunction: require("../../assets/images/signs/keikai_yjunction.webp"),
  keikai_curve_r: require("../../assets/images/signs/keikai_curve_r.webp"),
  keikai_kussetsu_r: require("../../assets/images/signs/keikai_kussetsu_r.webp"),
  keikai_haikou_kyoku: require("../../assets/images/signs/keikai_haikou_kyoku.webp"),
  keikai_tsuzura: require("../../assets/images/signs/keikai_tsuzura.webp"),
  keikai_rotsu_outotsu: require("../../assets/images/signs/keikai_rotsu_outotsu.webp"),
  keikai_gouryuu: require("../../assets/images/signs/keikai_gouryuu.webp"),
  keikai_fukuin: require("../../assets/images/signs/keikai_fukuin.webp"),
  keikai_nihoukou: require("../../assets/images/signs/keikai_nihoukou.webp"),
  keikai_nobori_koubai: require("../../assets/images/signs/keikai_nobori_koubai.webp"),
  keikai_kudari_koubai: require("../../assets/images/signs/keikai_kudari_koubai.webp"),
  keikai_yokokaze: require("../../assets/images/signs/keikai_yokokaze.webp"),
  keikai_sonota: require("../../assets/images/signs/keikai_sonota.webp"),
  kisei_nirin_igai: require("../../assets/images/signs/kisei_nirin_igai.webp"),
  kisei_oogata_kamotsu: require("../../assets/images/signs/kisei_oogata_kamotsu.webp"),
  kisei_oogata_jouyou: require("../../assets/images/signs/kisei_oogata_jouyou.webp"),
  kisei_nirin_gentsuki: require("../../assets/images/signs/kisei_nirin_gentsuki.webp"),
  kisei_keisharyou: require("../../assets/images/signs/kisei_keisharyou.webp"),
  kisei_jitensha_tome: require("../../assets/images/signs/kisei_jitensha_tome.webp"),
  kisei_futari_nori: require("../../assets/images/signs/kisei_futari_nori.webp"),
  kisei_shitei_hoko: require("../../assets/images/signs/kisei_shitei_hoko.webp"),
  kisei_oudan_kinshi_sharyou: require("../../assets/images/signs/kisei_oudan_kinshi_sharyou.webp"),
  kisei_jikan_seigen: require("../../assets/images/signs/kisei_jikan_seigen.webp"),
  kisei_kikenbutsu: require("../../assets/images/signs/kisei_kikenbutsu.webp"),
  kisei_juuryou: require("../../assets/images/signs/kisei_juuryou.webp"),
  kisei_takasa: require("../../assets/images/signs/kisei_takasa.webp"),
  kisei_saidai_haba: require("../../assets/images/signs/kisei_saidai_haba.webp"),
  kisei_jidousha_senyou: require("../../assets/images/signs/kisei_jidousha_senyou.webp"),
  kisei_jitensha_senyou: require("../../assets/images/signs/kisei_jitensha_senyou.webp"),
  kisei_hokousha_tome: require("../../assets/images/signs/kisei_hokousha_tome.webp"),
  shiji_heishin: require("../../assets/images/signs/shiji_heishin.webp"),
  shiji_kidou: require("../../assets/images/signs/shiji_kidou.webp"),
  shiji_teisha_ka: require("../../assets/images/signs/shiji_teisha_ka.webp"),
  shiji_chuousen: require("../../assets/images/signs/shiji_chuousen.webp"),
  shiji_jitensha_oudan: require("../../assets/images/signs/shiji_jitensha_oudan.webp"),
  shiji_anzen_chitai: require("../../assets/images/signs/shiji_anzen_chitai.webp"),
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

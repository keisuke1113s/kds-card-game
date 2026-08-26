import * as WebBrowser from "expo-web-browser";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/theme";

const sections: { title: string; body: string }[] = [
  {
    title: "勝利条件",
    body: "学科教習10時限と技能教習19時限の両方を先に達成したプレイヤーの勝ちです。",
  },
  {
    title: "デッキ構築",
    body: "デッキは20枚以上。同名カードは入れられません。サポートカードは5枚以下。担当カードは1枚のみで、デッキ枚数には含まれません。",
  },
  {
    title: "対戦準備",
    body: "デッキをシャッフルし、先攻・後攻を決めて、山札から5枚引きます。1回だけ手札をすべて引き直せます。",
  },
  {
    title: "ターンの流れ",
    body: "スタートフェイズ: 休憩中のインストラクターを元気にし、山札から1枚引きます（引けなければ敗北）。\n\nメインフェイズ: 最初にだけ手札からインストラクターを1枚出せます。その後、場のインストラクターはそれぞれ「技能を進める」「学科を進める」「バトルをする」「なにもしない」のどれか1つを行います。技能・学科・バトルをしたインストラクターは休憩状態になります。\n\nターン終了を宣言したら相手のターンです。",
  },
  {
    title: "バトル",
    body: "元気状態のインストラクターで、相手の休憩状態のインストラクターにバトルを仕掛けます。仕掛けた側は休憩状態になります。防御側から交互にサポートカードを何枚でも使えます。両者が使い終わったら戦闘力を比べ、低い方が場外へ。同じなら両方場外です。",
  },
  {
    title: "こまかいルール",
    body: "・場に出したターンからすぐ行動できます\n・教習力は技能か学科のどちらか一方にだけ使えます（振り分け不可）\n・残りの教習時限を超えた分は切り捨てです\n・達成済みの教習時限も、相手のカード効果で戻されることがあります",
  },
];

export default function RulesScreen() {
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {sections.map((s) => (
        <View key={s.title} style={styles.card}>
          <Text style={styles.title}>{s.title}</Text>
          <Text style={styles.body}>{s.body}</Text>
        </View>
      ))}
      <Pressable
        style={styles.link}
        onPress={() => WebBrowser.openBrowserAsync("https://card.kds946.com")}
      >
        <Text style={styles.linkText}>公式説明書サイトを開く（card.kds946.com）</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 6 },
  body: { color: colors.text, lineHeight: 22 },
  link: { padding: 14, alignItems: "center" },
  linkText: { color: colors.primary, fontWeight: "700" },
});

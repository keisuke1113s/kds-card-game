import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { AppButton } from "@/components/AppButton";
import { CardFace } from "@/components/CardFace";
import { ScreenEnter } from "@/components/ScreenEnter";
import { RANKS, rankIndexFor, totalDistanceKm, winsToNextRank } from "@/data/rank";
import { shareLicenseImage } from "@/data/shareImage";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useRankStore } from "@/store/rankStore";
import { shindanTypeOf } from "@/data/shindan";
import { useRecordStore } from "@/store/recordStore";
import { colors, radius, spacing } from "@/theme";

/**
 * 教習生免許証（プロフィール）。
 * 運転免許証風のカードに、名前・段階・戦績・走行距離を表示する。
 */
export default function LicenseScreen() {
  const router = useRouter();
  const record = useRecordStore();
  const rankStore = useRankStore();
  const deckState = useDeckStore();
  const activeDeck = resolveActiveDeck(deckState);

  const rankIdx = rankIndexFor(record.wins);
  const rank = RANKS[rankIdx];
  const nextRank = winsToNextRank(record.wins);
  const km = totalDistanceKm(record.wins + record.losses);
  const gold = rankIdx >= RANKS.length - 1;

  const shindan = shindanTypeOf(rankStore.shindanType);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rankStore.playerName);

  const name = rankStore.playerName || "教習生";

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>🪪 教習生免許証</Text>

        {/* 免許証カード */}
        <View style={styles.license}>
          <View style={[styles.licenseBand, gold && styles.licenseBandGold]}>
            <Text style={styles.licenseBandText}>KDSカードゲーム 教習生免許証</Text>
          </View>
          <View style={styles.licenseBody}>
            <View style={styles.licenseLeft}>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>氏名</Text>
                {editing ? (
                  <TextInput
                    style={styles.nameInput}
                    value={draft}
                    onChangeText={setDraft}
                    maxLength={10}
                    autoFocus
                    placeholder="なまえ（10文字まで）"
                    onSubmitEditing={() => {
                      rankStore.setPlayerName(draft.trim());
                      setEditing(false);
                    }}
                  />
                ) : (
                  <Pressable
                    onPress={() => {
                      haptic("light");
                      setDraft(rankStore.playerName);
                      setEditing(true);
                    }}
                  >
                    <Text style={styles.fieldName}>
                      {name} <Text style={styles.editHint}>✏️</Text>
                    </Text>
                  </Pressable>
                )}
              </View>
              {editing && (
                <Pressable
                  style={styles.saveButton}
                  onPress={() => {
                    rankStore.setPlayerName(draft.trim());
                    setEditing(false);
                  }}
                >
                  <Text style={styles.saveButtonText}>保存</Text>
                </Pressable>
              )}
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>段階</Text>
                <Text style={styles.fieldValue}>
                  {rank.emoji} {rank.name}
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>交付日</Text>
                <Text style={styles.fieldValue}>{rankStore.since}</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>成績</Text>
                <Text style={styles.fieldValue}>
                  {record.wins}勝 {record.losses}敗
                </Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>走行距離</Text>
                <Text style={styles.fieldValue}>{km.toLocaleString()}km</Text>
              </View>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>適性</Text>
                {shindan ? (
                  <Text style={styles.fieldValue}>
                    {shindan.emoji} {shindan.name}
                  </Text>
                ) : (
                  <Pressable onPress={() => router.push("/shindan")}>
                    <Text style={[styles.fieldValue, { color: "#1a5fb4" }]}>未診断（タップで診断）▸</Text>
                  </Pressable>
                )}
              </View>
            </View>
            {/* 顔写真の枠には使用デッキの担当カード */}
            <View style={styles.photoBox}>
              <CardFace cardId={activeDeck.list.tantou} size="md" />
              <Text style={styles.photoLabel}>担当</Text>
            </View>
          </View>
          <View style={styles.licenseFooter}>
            <Text style={styles.footerNote}>
              {nextRank
                ? `あと${nextRank.remain}勝で「${nextRank.next.name}」に進級`
                : "全課程修了！おめでとうございます！"}
            </Text>
            <View style={styles.hankoBox}>
              <Text style={styles.hankoBoxText}>KDS</Text>
            </View>
          </View>
        </View>

        <AppButton
          label="📤 免許証を画像で共有"
          tone="primary"
          fullWidth
          onPress={() =>
            shareLicenseImage({
              name,
              typeName: shindan ? `${shindan.emoji} ${shindan.name}` : "",
              rankName: rank.name,
              rankEmoji: rank.emoji,
              since: rankStore.since,
              wins: record.wins,
              losses: record.losses,
              km,
              gold,
            })
          }
        />
        <AppButton label="ホームへ戻る" tone="ghost" fullWidth onPress={() => router.back()} />

        <Text style={styles.note}>
          名前をタップすると変更できます。段階は通算勝利数で上がっていきます
          （{RANKS.map((r) => r.name).join(" → ")}）。
        </Text>
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, maxWidth: 520, width: "100%", alignSelf: "center" },
  title: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  license: {
    backgroundColor: "#f2f7ec",
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: "#9db48a",
    overflow: "hidden",
  },
  licenseBand: { backgroundColor: "#3f7d3a", paddingVertical: 8, alignItems: "center" },
  licenseBandGold: { backgroundColor: "#c9a227" },
  licenseBandText: { color: "#fff", fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  licenseBody: { flexDirection: "row", padding: 14, gap: 12 },
  licenseLeft: { flex: 1, gap: 8 },
  fieldRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  fieldLabel: { width: 62, fontSize: 11, fontWeight: "800", color: "#5a6b50" },
  fieldName: { fontSize: 20, fontWeight: "900", color: "#1c2a1a" },
  editHint: { fontSize: 13 },
  fieldValue: { fontSize: 14, fontWeight: "700", color: "#1c2a1a" },
  nameInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#9db48a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    fontSize: 16,
    fontWeight: "800",
    color: "#1c2a1a",
    backgroundColor: "#fff",
  },
  saveButton: {
    alignSelf: "flex-end",
    backgroundColor: "#3f7d3a",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  saveButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  photoBox: { alignItems: "center", gap: 4 },
  photoLabel: { fontSize: 10, fontWeight: "700", color: "#5a6b50" },
  licenseFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  footerNote: { fontSize: 11, fontWeight: "700", color: "#5a6b50", flex: 1 },
  hankoBox: {
    borderWidth: 2,
    borderColor: "#d02020",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
    transform: [{ rotate: "-6deg" }],
  },
  hankoBoxText: { color: "#d02020", fontSize: 13, fontWeight: "900" },
  note: { fontSize: 12, lineHeight: 19, color: colors.textMuted },
});

import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { ACHIEVEMENTS } from "@/data/achievements";
import { ScreenEnter } from "@/components/ScreenEnter";
import { useAchievementStore } from "@/store/achievementStore";
import { haptic } from "@/audio/haptics";
import { colors, radius, spacing } from "@/theme";

/** 実績（バッジ棚）と称号の設定 */
export default function AchievementsScreen() {
  const earned = useAchievementStore((s) => s.earned);
  const selectedTitle = useAchievementStore((s) => s.selectedTitle);
  const setSelectedTitle = useAchievementStore((s) => s.setSelectedTitle);

  const earnedCount = ACHIEVEMENTS.filter((a) => earned[a.id]).length;
  const titles = ACHIEVEMENTS.filter((a) => a.title && earned[a.id]).map((a) => a.title!);

  return (
    <ScreenEnter style={styles.root}>
      <FlatList
        data={ACHIEVEMENTS}
        keyExtractor={(a) => a.id}
        numColumns={2}
        columnWrapperStyle={{ gap: spacing.sm }}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.progress}>
              🏅 達成 {earnedCount} / {ACHIEVEMENTS.length}
            </Text>
            <Text style={styles.sectionTitle}>称号（オンライン対戦で名乗る）</Text>
            <View style={styles.titleWrap}>
              <Pressable
                style={[styles.titleChip, selectedTitle === null && styles.titleChipActive]}
                onPress={() => {
                  haptic("light");
                  setSelectedTitle(null);
                }}
              >
                <Text
                  style={[styles.titleText, selectedTitle === null && styles.titleTextActive]}
                >
                  なし
                </Text>
              </Pressable>
              {titles.map((t) => (
                <Pressable
                  key={t}
                  style={[styles.titleChip, selectedTitle === t && styles.titleChipActive]}
                  onPress={() => {
                    haptic("light");
                    setSelectedTitle(t);
                  }}
                >
                  <Text style={[styles.titleText, selectedTitle === t && styles.titleTextActive]}>
                    {t}
                  </Text>
                </Pressable>
              ))}
              {titles.length === 0 && (
                <Text style={styles.noTitle}>称号つきの実績を達成すると選べるようになります</Text>
              )}
            </View>
            <Text style={styles.sectionTitle}>実績</Text>
          </View>
        }
        renderItem={({ item }) => {
          const got = !!earned[item.id];
          const hidden = !!item.secret && !got;
          return (
            <View style={[styles.badge, !got && styles.badgeLocked, got && styles.badgeGot]}>
              {got && (
                <Text style={styles.badgeSparkle} pointerEvents="none">
                  ✨
                </Text>
              )}
              <Text style={[styles.badgeEmoji, !got && { opacity: 0.35 }]}>
                {got ? item.emoji : hidden ? "❓" : "🔒"}
              </Text>
              <Text style={[styles.badgeName, !got && { color: colors.textMuted }]}>
                {hidden ? "？？？" : item.name}
              </Text>
              <Text style={styles.badgeDesc}>
                {hidden ? "シークレット実績（達成すると内容が分かります）" : item.desc}
              </Text>
              {item.title && !hidden && (
                <Text style={[styles.badgeTitle, !got && { color: colors.textMuted }]}>
                  称号「{item.title}」
                </Text>
              )}
              {got && <Text style={styles.badgeDate}>{earned[item.id].slice(0, 10)} 達成</Text>}
            </View>
          );
        }}
      />
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  badgeGot: { borderWidth: 2, borderColor: "#e4a018" },
  badgeSparkle: { position: "absolute", top: 4, right: 6, fontSize: 14 },
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  progress: { fontSize: 17, fontWeight: "900", color: colors.text, textAlign: "center" },
  sectionTitle: { fontSize: 14, fontWeight: "900", color: colors.text, marginTop: 6 },
  titleWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  titleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  titleChipActive: { backgroundColor: "#c9971b", borderColor: "#c9971b" },
  titleText: { fontSize: 13, fontWeight: "800", color: colors.text },
  titleTextActive: { color: "#fff" },
  noTitle: { fontSize: 12, color: colors.textMuted },
  badge: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: "center",
    gap: 3,
  },
  badgeLocked: { opacity: 0.75, backgroundColor: colors.background },
  badgeEmoji: { fontSize: 30 },
  badgeName: { fontSize: 14, fontWeight: "900", color: colors.text },
  badgeDesc: { fontSize: 11, color: colors.textMuted, textAlign: "center", lineHeight: 16 },
  badgeTitle: { fontSize: 11, fontWeight: "800", color: "#c9971b" },
  badgeDate: { fontSize: 10, color: colors.textMuted },
});

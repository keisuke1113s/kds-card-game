import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { stopBgm } from "@/audio/sound";
import { CardFace } from "@/components/CardFace";
import { MatchPrep } from "@/components/MatchPrep";
import { ScreenEnter } from "@/components/ScreenEnter";
import { buildKyokanDeck, KYOKAN_LIST, KyokanDef } from "@/data/kyokan";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, radius, spacing } from "@/theme";

const HUMAN = 0 as const;
const CPU = 1 as const;

/**
 * インストラクターに挑戦 — 撃破マップ。
 * 32人の顔がグリッドに並び、未撃破は暗く、撃破するとカラー＋✅になる。
 * タップで下の詳細パネルに出て、そこから挑戦する
 */
export default function KyokanScreen() {
  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const history = useRecordStore((s) => s.history);
  const [selected, setSelected] = useState<KyokanDef | null>(null);
  const [target, setTarget] = useState<KyokanDef | null>(null);

  const playerDeck = resolveActiveDeck(useDeckStore());

  // 撃破済みのインストラクター（勝利記録から）
  const beaten = useMemo(
    () =>
      new Set(
        history
          .filter((r) => r.result === "win" && r.kyokan)
          .map((r) => r.kyokan as string)
      ),
    [history]
  );
  const allBeaten = beaten.size >= KYOKAN_LIST.length;

  const begin = (firstPlayerIsMe: boolean) => {
    if (!target) return;
    startGame({
      playerDeck: playerDeck.list,
      cpuDeck: buildKyokanDeck(target),
      difficulty: "hard",
      aiSpeedMs,
      firstPlayer: firstPlayerIsMe ? HUMAN : CPU,
      kyokan: target.cardId,
    });
    router.replace("/battle");
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.note}>
          全インストラクターが、本人のカード入りキャラデッキで立ちはだかる特別対戦です。
          強さは「つよい」固定。倒した相手はカラーになっていきます！
        </Text>
        {allBeaten ? (
          <View style={styles.completeBanner}>
            <Text style={styles.completeBannerText}>
              🏆 全インストラクター制覇！！ あなたは頂点の教習生です！
            </Text>
          </View>
        ) : (
          <Text style={styles.progress}>
            🏆 撃破 {beaten.size} / {KYOKAN_LIST.length} 人
          </Text>
        )}

        {/* 撃破マップ（顔グリッド） */}
        <View style={styles.grid}>
          {KYOKAN_LIST.map((k) => {
            const won = beaten.has(k.cardId);
            const isSel = selected?.cardId === k.cardId;
            return (
              <Pressable
                key={k.cardId}
                style={[styles.gridItem, isSel && styles.gridItemSelected]}
                onPress={() => {
                  haptic("light");
                  setSelected(k);
                }}
              >
                <CardFace cardId={k.cardId} size="sm" dimmed={!won} />
                {/* 未撃破は暗い覆いをかけてモノクロ風に */}
                {!won && <View style={styles.unbeatenShade} pointerEvents="none" />}
                {won && (
                  <Text style={styles.beatenMark} pointerEvents="none">
                    ✅
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* 選択したインストラクターの詳細と挑戦ボタン */}
        {selected ? (
          <View style={styles.detailCard}>
            <CardFace cardId={selected.cardId} size="md" />
            <View style={styles.detailInfo}>
              <Text style={styles.detailName}>
                {selected.name}インストラクター{" "}
                {beaten.has(selected.cardId) ? "✅ 撃破済み" : ""}
              </Text>
              <Text style={styles.detailDesc}>{selected.desc}</Text>
              <Pressable
                style={styles.challengeButton}
                onPress={() => {
                  haptic("medium");
                  setTarget(selected);
                }}
              >
                <Text style={styles.challengeButtonText}>⚔️ 挑戦する</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Text style={styles.hint}>顔をタップすると詳細が出ます</Text>
        )}
        <Text style={styles.hint}>
          ※ 自分のデッキは、いま選択中のデッキ（{playerDeck.name}）を使います
        </Text>
      </ScrollView>

      {target && (
        <MatchPrep
          cardIds={[...playerDeck.list.main, playerDeck.list.tantou]}
          ticket={{ course: "インストラクター戦", opponent: `${selected?.name ?? ""}インストラクター` }}
          onDecided={begin}
          onCancel={() => {
            stopBgm();
            setTarget(null);
          }}
        />
      )}
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  note: { fontSize: 14, lineHeight: 22, color: colors.text },
  progress: { fontSize: 15, fontWeight: "900", color: colors.primaryDark },
  completeBanner: {
    backgroundColor: "#fff7e0",
    borderWidth: 2,
    borderColor: "#e4a018",
    borderRadius: radius.md,
    padding: 12,
  },
  completeBannerText: { fontSize: 14, fontWeight: "900", color: "#8a5a00", textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  gridItem: { position: "relative", borderRadius: 8 },
  gridItemSelected: {
    borderWidth: 2.5,
    borderColor: colors.accent,
    borderRadius: 8,
    margin: -2.5,
  },
  unbeatenShade: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#31415488",
    borderRadius: 6,
  },
  beatenMark: { position: "absolute", top: -4, right: -4, fontSize: 14 },
  detailCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  detailInfo: { flex: 1, gap: 8 },
  detailName: { fontSize: 17, fontWeight: "900", color: colors.text },
  detailDesc: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  challengeButton: {
    backgroundColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  challengeButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  hint: { fontSize: 12, color: colors.textMuted },
});

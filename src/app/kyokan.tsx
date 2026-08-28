import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { stopBgm } from "@/audio/sound";
import { CardFace } from "@/components/CardFace";
import { MatchPrep } from "@/components/MatchPrep";
import { ScreenEnter } from "@/components/ScreenEnter";
import { buildKyokanDeck, KYOKAN_LIST, KyokanDef } from "@/data/kyokan";
import { useAchievementStore } from "@/store/achievementStore";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, radius, spacing } from "@/theme";

const HUMAN = 0 as const;
const CPU = 1 as const;

/** 教官ごとの実績ID（達成済みバッジの表示用） */
const KYOKAN_ACH: Record<string, string> = {
  i_okumura: "kyokanOkumura",
  i_shigaya: "kyokanShigaya",
  i_iida: "kyokanIida",
};

export default function KyokanScreen() {
  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const earned = useAchievementStore((s) => s.earned);
  const [target, setTarget] = useState<KyokanDef | null>(null);

  const playerDeck = resolveActiveDeck(useDeckStore());

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
          実在のインストラクターがキャラデッキで立ちはだかる特別対戦です。
          強さは「つよい」固定。勝てば教官ごとの称号がもらえます！
        </Text>
        {KYOKAN_LIST.map((k) => {
          const beaten = !!earned[KYOKAN_ACH[k.cardId]];
          return (
            <Pressable
              key={k.cardId}
              style={styles.kyokanCard}
              onPress={() => {
                haptic("medium");
                setTarget(k);
              }}
            >
              <CardFace cardId={k.cardId} size="md" />
              <View style={styles.kyokanInfo}>
                <Text style={styles.kyokanName}>
                  {k.name}教官 {beaten ? "✅ 撃破済み" : ""}
                </Text>
                <Text style={styles.kyokanDesc}>{k.desc}</Text>
                <Text style={styles.kyokanChallenge}>タップして挑戦 ▸</Text>
              </View>
            </Pressable>
          );
        })}
        <Text style={styles.hint}>
          ※ 自分のデッキは、いま選択中のデッキ（{playerDeck.name}）を使います
        </Text>
      </ScrollView>

      {target && (
        <MatchPrep
          cardIds={[...playerDeck.list.main, playerDeck.list.tantou]}
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
  kyokanCard: {
    flexDirection: "row",
    gap: 14,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: "center",
  },
  kyokanInfo: { flex: 1, gap: 4 },
  kyokanName: { fontSize: 18, fontWeight: "900", color: colors.text },
  kyokanDesc: { fontSize: 13, lineHeight: 20, color: colors.textMuted },
  kyokanChallenge: { fontSize: 13, fontWeight: "800", color: colors.primary },
  hint: { fontSize: 12, color: colors.textMuted },
});

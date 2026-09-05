import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { playSe, stopBgm } from "@/audio/sound";
import { CardFace } from "@/components/CardFace";
import { MatchPrep } from "@/components/MatchPrep";
import { ScreenEnter } from "@/components/ScreenEnter";
import { buildKyokanDeck, KYOKAN_LIST } from "@/data/kyokan";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTournamentStore } from "@/store/tournamentStore";
import { colors, radius, spacing } from "@/theme";
import { useLineStore } from "@/store/lineStore";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { Difficulty } from "@/ai/types";

const HUMAN = 0 as const;
const CPU = 1 as const;

const STAGES: { label: string; desc: string; difficulty: Difficulty }[] = [
  { label: "1回戦", desc: "CPU（よわい）", difficulty: "easy" },
  { label: "2回戦", desc: "CPU（ふつう）", difficulty: "normal" },
  { label: "準決勝", desc: "CPU（つよい）", difficulty: "hard" },
  { label: "決勝", desc: "インストラクター", difficulty: "hard" },
];

/** 4連戦を勝ち抜くトーナメント。負けたら最初から */
export default function TournamentScreen() {
  // LINEゲートの殻。連携状態でフックの数が変わって落ちないよう（React #310）、
  // 本体は別コンポーネントに分けて連携済みのときだけマウントする
  const lineLinked = useLineStore((s) => s.linked);
  if (LINE_GATE_ENABLED && !lineLinked) return <LineGate />;
  return <TournamentScreenBody />;
}

function TournamentScreenBody() {

  const router = useRouter();
  const startGame = useGameStore((s) => s.startGame);
  const aiSpeedMs = useSettingsStore((s) => s.aiSpeedMs);
  const t = useTournamentStore();
  const [preparing, setPreparing] = useState(false);

  const deckState = useDeckStore();
  const playerDeck = resolveActiveDeck(deckState);
  const finalKyokan = KYOKAN_LIST.find((k) => k.cardId === t.kyokanId) ?? null;

  const begin = (firstPlayerIsMe: boolean) => {
    const stage = STAGES[t.stage];
    if (!stage) return;
    const isFinal = t.stage === 3 && finalKyokan;
    startGame({
      playerDeck: playerDeck.list,
      cpuDeck: isFinal
        ? buildKyokanDeck(finalKyokan)
        : cpuDeckFor(playerDeck, deckState.builtinOverrides).list,
      difficulty: stage.difficulty,
      aiSpeedMs,
      firstPlayer: firstPlayerIsMe ? HUMAN : CPU,
      kyokan: isFinal ? finalKyokan.cardId : undefined,
      tournament: true,
    });
    router.replace("/battle");
  };

  // 優勝直後の画面
  if (!t.active && t.stage === 4) {
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.championTitle}>優勝おめでとう！！</Text>
          <Text style={styles.note}>
            4連戦を勝ち抜きました！ 称号「グランドチャンピオン」を獲得！{"\n"}
            （優勝回数: {t.champions}回）
          </Text>
          <Pressable
            style={styles.startButton}
            onPress={() => {
              haptic("medium");
              playSe("battle");
              t.start();
            }}
          >
            <Text style={styles.startButtonText}>もう一度優勝を目指す</Text>
          </Pressable>
        </View>
      </ScreenEnter>
    );
  }

  // 未開始（または敗退後）
  if (!t.active) {
    return (
      <ScreenEnter style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.trophy}>🏆</Text>
          <Text style={styles.introTitle}>トーナメント</Text>
          {t.lastResult === "lose" && (
            <Text style={styles.loseText}>😢 前回は敗退… もう一度最初から挑戦しよう！</Text>
          )}
          <Text style={styles.note}>
            よわい → ふつう → つよい → インストラクター（ランダム）の4連戦。{"\n"}
            1敗もせずに勝ち抜くと優勝！ 途中で負けたら最初からです。{"\n"}
            デッキは、いま選択中の「{playerDeck.name}」を使います。
          </Text>
          <Pressable
            style={styles.startButton}
            onPress={() => {
              haptic("medium");
              playSe("battle");
              t.start();
            }}
          >
            <Text style={styles.startButtonText}>トーナメント開始！</Text>
          </Pressable>
        </View>
      </ScreenEnter>
    );
  }

  // 進行中
  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.progress}>
          🏆 {STAGES[t.stage]?.label ?? ""} 進出中（あと{4 - t.stage}勝で優勝！）
        </Text>
        {/* 教習所のコース図風: 道でつながったチェックポイントを車が進んでいく */}
        {STAGES.map((s, i) => {
          const status = i < t.stage ? "done" : i === t.stage ? "now" : "locked";
          const icons = ["🌀", "⚡", "⛰", "🏁"];
          return (
            <View key={s.label}>
              {i > 0 && (
                <View style={styles.courseRoadWrap}>
                  <View style={[styles.courseRoad, i <= t.stage && styles.courseRoadDone]}>
                    <View style={styles.courseRoadLine} />
                  </View>
                </View>
              )}
              <View
                style={[
                  styles.stageRow,
                  status === "now" && styles.stageRowNow,
                  status === "done" && styles.stageRowDone,
                ]}
              >
                <View style={[styles.courseNode, status === "done" && styles.courseNodeDone]}>
                  <Text style={styles.courseNodeIcon}>
                    {status === "now" ? "🚗" : status === "done" ? "✅" : icons[i]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.stageLabel}>
                    {icons[i]} {s.label}
                  </Text>
                  <Text style={styles.stageDesc}>
                    {i === 3 && finalKyokan ? `${finalKyokan.name}インストラクター` : s.desc}
                  </Text>
                </View>
                {i === 3 && finalKyokan && <CardFace cardId={finalKyokan.cardId} size="sm" />}
              </View>
            </View>
          );
        })}
        <Pressable
          style={styles.startButton}
          onPress={() => {
            haptic("medium");
            setPreparing(true);
          }}
        >
          <Text style={styles.startButtonText}>
            ⚔️ {STAGES[t.stage]?.label}を戦う
          </Text>
        </Pressable>
        <Pressable style={styles.abandon} onPress={() => t.abandon()}>
          <Text style={styles.abandonText}>🛑 トーナメントをやめる（最初からになります）</Text>
        </Pressable>
      </ScrollView>

      {preparing && (
        <MatchPrep
          cardIds={[...playerDeck.list.main, playerDeck.list.tantou]}
          ticket={{ course: "トーナメント", opponent: STAGES[t.stage]?.label ?? "" }}
          onDecided={begin}
          onCancel={() => {
            stopBgm();
            setPreparing(false);
          }}
        />
      )}
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: spacing.lg },
  trophy: { fontSize: 64 },
  introTitle: { fontSize: 26, fontWeight: "900", color: colors.text },
  championTitle: { fontSize: 26, fontWeight: "900", color: "#c9971b" },
  loseText: { fontSize: 14, fontWeight: "800", color: colors.danger },
  note: { fontSize: 14, lineHeight: 22, color: colors.text, textAlign: "center" },
  progress: { fontSize: 16, fontWeight: "900", color: colors.primaryDark },
  courseRoadWrap: { alignItems: "flex-start", paddingLeft: 34 },
  courseRoad: {
    width: 16,
    height: 22,
    backgroundColor: "#9aa5b1",
    justifyContent: "center",
    alignItems: "center",
  },
  courseRoadDone: { backgroundColor: "#57b060" },
  courseRoadLine: { width: 2, height: 12, backgroundColor: "#ffffffaa", borderRadius: 1 },
  courseNode: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#6b7280",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#ffffff",
  },
  courseNodeDone: { backgroundColor: "#57b060" },
  courseNodeIcon: { fontSize: 18 },
  stageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  stageRowNow: { borderWidth: 2, borderColor: colors.accent },
  stageRowDone: { opacity: 0.75 },
  stageMark: { fontSize: 22 },
  stageLabel: { fontSize: 16, fontWeight: "900", color: colors.text },
  stageDesc: { fontSize: 13, color: colors.textMuted },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  startButtonText: { color: "#fff", fontWeight: "900", fontSize: 16 },
  abandon: { alignItems: "center", paddingVertical: 6 },
  abandonText: { fontSize: 12, color: colors.textMuted, textDecorationLine: "underline" },
});

/** LINE連携が必要な機能のロック画面 */
function LineGate() {
  const router = useRouter();
  return (
    <View style={lineGateStyles.root}>
      <View style={lineGateStyles.card}>
        <Text style={lineGateStyles.lockIcon}>🔒</Text>
        <Text style={lineGateStyles.title}>この機能はLINE連携で解放されます</Text>
        <Text style={lineGateStyles.note}>
          KDS釧路自動車学校の公式LINEと連携（無料）すると使えるようになります。
        </Text>
        <Pressable style={lineGateStyles.button} onPress={() => router.replace("/line")}>
          <Text style={lineGateStyles.buttonText}>💚 LINE連携する</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={lineGateStyles.back}>戻る</Text>
        </Pressable>
      </View>
    </View>
  );
}

const lineGateStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.background },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    gap: 12,
    maxWidth: 420,
    width: "100%",
  },
  lockIcon: { fontSize: 44 },
  title: { fontSize: 17, fontWeight: "900", color: colors.text, textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: "center" },
  button: {
    backgroundColor: "#06C755",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  back: { fontSize: 13, color: colors.textMuted, padding: 4 },
});

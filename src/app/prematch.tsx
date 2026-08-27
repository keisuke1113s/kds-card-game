import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CpuPersona, DIFFICULTY_LABELS, PERSONA_EMOJI, PERSONA_LABELS } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";
import { HAPTICS_AVAILABLE } from "@/audio/haptics";
import {
  cpuDeckFor,
  randomizeDecksForMatch,
  resolveActiveDeck,
  useDeckStore,
} from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";
import { MatchPrep } from "@/components/MatchPrep";

const speeds: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

/** 対戦開始前に条件を確認・変更してから始める画面 */
export default function PrematchScreen() {
  const router = useRouter();
  const { tutorial } = useLocalSearchParams<{ tutorial?: string }>();
  const isTutorial = tutorial === "1";
  const startGame = useGameStore((s) => s.startGame);
  const deckState = useDeckStore();
  const {
    difficulty,
    setDifficulty,
    cpuPersona,
    setCpuPersona,
    aiSpeedMs,
    setAiSpeedMs,
    seEnabled,
    setSeEnabled,
    bgmEnabled,
    setBgmEnabled,
    hapticsEnabled,
    setHapticsEnabled,
    randomizeStandard,
    setRandomizeStandard,
    randomizeChallenger,
    setRandomizeChallenger,
  } = useSettingsStore();

  const playerDeck = resolveActiveDeck(deckState);
  const opponentDeck = cpuDeckFor(playerDeck, deckState.builtinOverrides);

  // 説明書どおり、シャッフル → じゃんけん の順に準備してから始める
  const [preparing, setPreparing] = useState(false);

  const begin = (firstPlayerIsMe: boolean) => {
    // ここからが新しい連戦。前回の連戦スコアはリセットする
    useRecordStore.getState().resetSession();
    // 設定に応じて、この対戦に登場するデッキだけをランダムに組み直す
    randomizeDecksForMatch(randomizeStandard, randomizeChallenger);
    // 組み直した内容で解決し直す
    const latest = useDeckStore.getState();
    const player = resolveActiveDeck(latest);
    const opponent = cpuDeckFor(player, latest.builtinOverrides);
    startGame({
      playerDeck: player.list,
      cpuDeck: opponent.list,
      // 練習対戦はいちばん弱いCPU・ゆっくりの手で固定する
      difficulty: isTutorial ? "easy" : difficulty,
      aiSpeedMs: isTutorial ? 1600 : aiSpeedMs,
      tutorial: isTutorial,
      firstPlayer: firstPlayerIsMe ? HUMAN : CPU,
    });
    router.replace("/battle");
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.matchupBox}>
          <Text style={styles.matchupLabel}>あなた</Text>
          <Text style={styles.matchupDeck}>{playerDeck.name}</Text>
          <Text style={styles.vs}>VS</Text>
          <Text style={styles.matchupLabel}>CPU</Text>
          <Text style={styles.matchupDeck}>{opponentDeck.name}</Text>
        </View>
        <Pressable style={styles.deckLink} onPress={() => router.push("/deck")}>
          <Text style={styles.deckLinkText}>デッキを変える ▸</Text>
        </Pressable>

        {isTutorial && (
          <View style={styles.tutorialNote}>
            <Text style={styles.tutorialNoteTitle}>練習対戦</Text>
            <Text style={styles.tutorialNoteText}>
              画面に「次に何をすればいいか」のヒントが出ます。相手はいちばん弱いCPUなので、
              失敗しても大丈夫です。
            </Text>
          </View>
        )}

        {!isTutorial && <Text style={styles.sectionTitle}>CPUの強さ</Text>}
        {!isTutorial && (
          <View style={styles.row}>
            {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
              <Choice
                key={d}
                label={DIFFICULTY_LABELS[d]}
                active={difficulty === d}
                onPress={() => setDifficulty(d)}
              />
            ))}
          </View>
        )}

        {!isTutorial && <Text style={styles.sectionTitle}>CPUの個性</Text>}
        {!isTutorial && (
          <View style={styles.row}>
            {(Object.keys(PERSONA_LABELS) as CpuPersona[]).map((p) => (
              <Choice
                key={p}
                label={`${PERSONA_EMOJI[p]} ${PERSONA_LABELS[p]}`}
                active={cpuPersona === p}
                onPress={() => setCpuPersona(p)}
              />
            ))}
          </View>
        )}

        {!isTutorial && <Text style={styles.sectionTitle}>CPUの手の速さ</Text>}
        {!isTutorial && (
          <View style={styles.row}>
            {speeds.map((s) => (
              <Choice
                key={s.ms}
                label={s.label}
                active={aiSpeedMs === s.ms}
                onPress={() => setAiSpeedMs(s.ms)}
              />
            ))}
          </View>
        )}

        <Text style={styles.sectionTitle}>デッキの入れ替え（対戦するごと）</Text>
      <View style={styles.rowWrap}>
        <Text style={styles.deckRandomLabel}>スタンダードデッキ</Text>
        <View style={styles.row}>
          <Choice
            label="入れ替える"
            active={randomizeStandard}
            onPress={() => setRandomizeStandard(true)}
          />
          <Choice
            label="入れ替えない"
            active={!randomizeStandard}
            onPress={() => setRandomizeStandard(false)}
          />
        </View>
      </View>
      <View style={styles.rowWrap}>
        <Text style={styles.deckRandomLabel}>チャレンジャーデッキ</Text>
        <View style={styles.row}>
          <Choice
            label="入れ替える"
            active={randomizeChallenger}
            onPress={() => setRandomizeChallenger(true)}
          />
          <Choice
            label="入れ替えない"
            active={!randomizeChallenger}
            onPress={() => setRandomizeChallenger(false)}
          />
        </View>
      </View>

      <Text style={styles.sectionTitle}>サウンド</Text>
        <View style={styles.row}>
          <Choice
            label={`効果音 ${seEnabled ? "ON" : "OFF"}`}
            active={seEnabled}
            onPress={() => setSeEnabled(!seEnabled)}
          />
          <Choice
            label={`BGM ${bgmEnabled ? "ON" : "OFF"}`}
            active={bgmEnabled}
            onPress={() => setBgmEnabled(!bgmEnabled)}
          />
          <Choice
            label={HAPTICS_AVAILABLE ? `振動 ${hapticsEnabled ? "ON" : "OFF"}` : "振動 なし"}
            active={HAPTICS_AVAILABLE && hapticsEnabled}
            disabled={!HAPTICS_AVAILABLE}
            onPress={() => HAPTICS_AVAILABLE && setHapticsEnabled(!hapticsEnabled)}
          />
        </View>
        {!HAPTICS_AVAILABLE && (
          <Text style={styles.hapticNote}>
            ※ iPhoneのブラウザには振動の仕組みが無いため、この端末では振動しません
            （ホーム画面に追加した場合も同じです）。App Store・TestFlight で配布する
            アプリ版では振動します。
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.startButton} onPress={() => setPreparing(true)}>
          <Text style={styles.startText}>{isTutorial ? "練習対戦を始める" : "この設定で対戦する"}</Text>
        </Pressable>
      </View>

      {preparing && (
        <MatchPrep
          cardIds={[
            ...playerDeck.list.main,
            playerDeck.list.tantou,
            ...opponentDeck.list.main,
            opponentDeck.list.tantou,
          ]}
          onDecided={begin}
          onCancel={() => setPreparing(false)}
        />
      )}
    </ScreenEnter>
  );
}

function Choice({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.choice,
        active && { backgroundColor: colors.primary, borderColor: colors.primary },
        disabled && styles.choiceDisabled,
      ]}
    >
      <Text
        style={[
          styles.choiceText,
          active && { color: "#fff" },
          disabled && { color: colors.textMuted },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowWrap: { gap: 6, marginBottom: 4 },
  deckRandomLabel: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  matchupBox: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    alignItems: "center",
    gap: 2,
  },
  matchupLabel: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  matchupDeck: { fontSize: 17, fontWeight: "800", color: colors.text },
  vs: { fontSize: 15, fontWeight: "900", color: colors.accent, marginVertical: 6 },
  deckLink: { alignSelf: "center", paddingVertical: 6 },
  deckLinkText: { color: colors.primary, fontWeight: "700" },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 10 },
  tutorialNote: {
    backgroundColor: "#fff8e1",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: 14,
    gap: 4,
    marginTop: 4,
  },
  tutorialNoteTitle: { fontSize: 13, fontWeight: "800", color: colors.accent },
  tutorialNoteText: { fontSize: 14, lineHeight: 21, color: colors.text },
  row: { flexDirection: "row", gap: 10 },
  choice: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 12,
    alignItems: "center",
  },
  choiceText: { fontWeight: "700", color: colors.text },
  choiceDisabled: { backgroundColor: colors.background, borderStyle: "dashed" },
  hapticNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    marginTop: 4,
  },
  footer: {
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startText: { color: "#fff", fontWeight: "800", fontSize: 17 },
});

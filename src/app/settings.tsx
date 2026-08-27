import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HAPTICS_AVAILABLE } from "@/audio/haptics";
import { useGameStore } from "@/store/gameStore";
import { useRecordStore } from "@/store/recordStore";
import { useSettingsStore } from "@/store/settingsStore";
import { ensureInitialSet, unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { DARK_MODE, setDarkModePreference } from "@/theme";

/** ダークモードを切り替えて反映する（色は起動時に固定のため読み込み直す） */
function switchDarkMode(dark: boolean): void {
  if (dark === DARK_MODE) return;
  setDarkModePreference(dark);
  const loc = (globalThis as { location?: { reload: () => void } }).location;
  loc?.reload();
}
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";

const speeds: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

/** 開発版デモ（/dev/）か、開発中の起動か（テスト用機能を出す条件） */
const IS_DEV_BUILD =
  (typeof __DEV__ !== "undefined" && __DEV__) ||
  (Platform.OS === "web" &&
    typeof window !== "undefined" &&
    window.location.pathname.includes("/dev/"));

export default function SettingsScreen() {
  const router = useRouter();
  const quitGame = useGameStore((s) => s.quitGame);
  const queueActive = useGameStore((s) => s.queueActive);
  const inBattle = useGameStore((s) => s.state !== null && s.state.phase.type !== "finished");
  const [confirmQuit, setConfirmQuit] = useState(false);
  const {
    aiSpeedMs,
    setAiSpeedMs,
    seEnabled,
    setSeEnabled,
    bgmEnabled,
    setBgmEnabled,
    hapticsEnabled,
    setHapticsEnabled,
  } = useSettingsStore();

  const record = useRecordStore();

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>対戦成績</Text>
      <View style={styles.recordBox}>
        <Text style={styles.recordText}>
          通算 {record.wins}勝 {record.losses}敗
          {record.streak >= 2 ? `（${record.streak}連勝中）` : ""}
        </Text>
        {/* 成績のリセットは正式版には無い機能。開発中の動作確認用にだけ出す */}
        {IS_DEV_BUILD && (
          <Pressable style={styles.recordReset} onPress={() => record.reset()} hitSlop={6}>
            <Text style={styles.recordResetText}>成績をリセット（テスト用）</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>CPUの手の速さ</Text>
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

      <Text style={styles.sectionTitle}>サウンド</Text>
      <View style={styles.row}>
        <Choice label={`効果音 ${seEnabled ? "ON" : "OFF"}`} active={seEnabled} onPress={() => setSeEnabled(!seEnabled)} />
        <Choice label={`BGM ${bgmEnabled ? "ON" : "OFF"}`} active={bgmEnabled} onPress={() => setBgmEnabled(!bgmEnabled)} />
        <Choice
          label={HAPTICS_AVAILABLE ? `振動 ${hapticsEnabled ? "ON" : "OFF"}` : "振動 なし"}
          active={HAPTICS_AVAILABLE && hapticsEnabled}
          disabled={!HAPTICS_AVAILABLE}
          onPress={() => HAPTICS_AVAILABLE && setHapticsEnabled(!hapticsEnabled)}
        />
      </View>

      <Text style={styles.sectionTitle}>画面の見た目</Text>
      <View style={styles.row}>
        <Choice
          label="☀️ ライト"
          active={!DARK_MODE}
          onPress={() => switchDarkMode(false)}
        />
        <Choice label="🌙 ダーク" active={DARK_MODE} onPress={() => switchDarkMode(true)} />
      </View>

      <Text style={styles.note}>
        CPUの強さは対戦開始時にだけ選べます。サウンドの変更はすぐに反映されます。
        画面の見た目の切り替えは、画面を読み込み直して反映します。
      </Text>
      {!HAPTICS_AVAILABLE && (
        <Text style={styles.note}>
          ※ iPhoneのブラウザには振動の仕組みが無いため、この端末では振動しません
          （ホーム画面に追加した場合も同じです）。App Store・TestFlight で配布する
          アプリ版では振動します。
        </Text>
      )}

      {!inBattle && IS_DEV_BUILD && <DevCardReset />}

      {!inBattle && (
        <Pressable
          style={[styles.wideButton, { backgroundColor: colors.primary }]}
          onPress={() => router.replace("/")}
        >
          <Text style={styles.wideButtonText}>ホームに戻る</Text>
        </Pressable>
      )}

      {inBattle && (
        <>
          <Text style={styles.sectionTitle}>対戦中</Text>
          <Pressable
            style={[styles.wideButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.wideButtonText}>対戦に戻る</Text>
          </Pressable>
          <Pressable
            style={[styles.wideButton, { backgroundColor: colors.danger }]}
            onPress={() => setConfirmQuit(true)}
          >
            <Text style={styles.wideButtonText}>対戦をやめる</Text>
          </Pressable>
        </>
      )}
      {confirmQuit && (
        <Pressable style={styles.overlayBg} onPress={() => setConfirmQuit(false)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>対戦をやめますか？</Text>
            <Text style={styles.note}>
              {queueActive
                ? "この対局は失われます。ランダムマッチの相手待ちも解除されます。"
                : "この対局は失われます。"}
            </Text>
            <Pressable
              style={[styles.wideButton, { backgroundColor: colors.danger }]}
              onPress={() => {
                setConfirmQuit(false);
                quitGame();
                router.replace("/");
              }}
            >
              <Text style={styles.wideButtonText}>対戦をやめてホームに戻る</Text>
            </Pressable>
            <Pressable
              style={[styles.wideButton, { backgroundColor: colors.cancel }]}
              onPress={() => setConfirmQuit(false)}
            >
              <Text style={styles.wideButtonText}>対戦を続ける</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
      </ScrollView>
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
        disabled && { backgroundColor: colors.background, borderStyle: "dashed" },
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

/**
 * 開発版だけに出す、カード配布のやり直しボタン（動作確認用）。
 * iPhoneでサイトデータを消さなくても、初回のランダム配布を再体験できる
 */
function DevCardReset() {
  const unlockState = useUnlockStore();
  const count = unlockedSet(unlockState).size;
  const [done, setDone] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.sectionTitle}>開発版のテスト用</Text>
      <Text style={styles.note}>
        いまの開放カードは {count} 枚です。リセットすると、QRで開放した分も消えて、
        新しいランダム22枚が配り直されます。
      </Text>
      <Pressable
        style={[styles.wideButton, { backgroundColor: colors.danger }]}
        onPress={() => {
          unlockState.resetAll();
          ensureInitialSet();
          setDone(true);
          setTimeout(() => setDone(false), 3000);
        }}
      >
        <Text style={styles.wideButtonText}>
          {done ? "✅ 配り直しました！図鑑で確認できます" : "🔄 カード配布をリセット（テスト用）"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  recordBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  recordText: { fontSize: 15, fontWeight: "800", color: colors.text },
  recordReset: {
    backgroundColor: colors.cancel,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  recordResetText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 8 },
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
  note: { color: colors.textMuted, marginTop: 16, fontSize: 12 },
  wideButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    alignSelf: "stretch",
  },
  wideButtonText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 400,
    gap: 10,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 17, fontWeight: "800", color: colors.text },
});

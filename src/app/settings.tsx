import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { HAPTICS_AVAILABLE } from "@/audio/haptics";
import { useGameStore } from "@/store/gameStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";

const speeds: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

export default function SettingsScreen() {
  const router = useRouter();
  const quitGame = useGameStore((s) => s.quitGame);
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

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
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

      <Text style={styles.note}>
        CPUの強さは対戦開始時にだけ選べます。サウンドの変更はすぐに反映されます。
      </Text>
      {!HAPTICS_AVAILABLE && (
        <Text style={styles.note}>
          ※ iPhoneのブラウザには振動の仕組みが無いため、この端末では振動しません
          （ホーム画面に追加した場合も同じです）。App Store・TestFlight で配布する
          アプリ版では振動します。
        </Text>
      )}

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
            <Text style={styles.note}>この対局は失われます。</Text>
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

const styles = StyleSheet.create({
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useGameStore } from "@/store/gameStore";
import { colors, radius, shadow, spacing } from "@/theme";

/**
 * オンライン対戦（開発版）。
 * 合言葉（部屋コード）を作る／入力して入る／ランダムマッチの3通り。
 * サーバーアドレスは開発中は手入力（本番では固定にする予定）。
 */

interface OnlinePrefs {
  name: string;
  serverUrl: string;
  setName: (v: string) => void;
  setServerUrl: (v: string) => void;
}

const useOnlinePrefs = create<OnlinePrefs>()(
  persist(
    (set) => ({
      name: "",
      serverUrl: "ws://192.168.50.57:8790",
      setName: (name) => set({ name }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
    }),
    { name: "kds-online-prefs", storage: createJSONStorage(() => AsyncStorage) }
  )
);

export default function OnlineScreen() {
  const router = useRouter();
  const prefs = useOnlinePrefs();
  const deckState = useDeckStore();
  const connectOnline = useGameStore((s) => s.connectOnline);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const onlineError = useGameStore((s) => s.onlineError);
  const roomCode = useGameStore((s) => s.roomCode);
  const opponentName = useGameStore((s) => s.opponentName);
  const quitGame = useGameStore((s) => s.quitGame);
  const [joinCode, setJoinCode] = React.useState("");

  const deck = resolveActiveDeck(deckState);
  const name = prefs.name || "教習生";

  // 対局が始まったら対戦画面へ
  useEffect(() => {
    if (onlineStatus === "playing") router.replace("/battle");
  }, [onlineStatus, router]);

  const start = (mode: "create" | "join" | "queue") => {
    haptic("medium");
    connectOnline({
      serverUrl: prefs.serverUrl.trim(),
      mode,
      code: joinCode.trim().toUpperCase(),
      name,
      deck: deck.list,
    });
  };

  const waiting = onlineStatus === "connecting" || onlineStatus === "waitingOpponent";

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>あなたの名前</Text>
        <TextInput
          style={styles.input}
          value={prefs.name}
          onChangeText={prefs.setName}
          placeholder="教習生"
          maxLength={12}
        />

        <Text style={styles.sectionTitle}>使うデッキ</Text>
        <Pressable style={styles.deckRow} onPress={() => router.push("/deck")}>
          <Text style={styles.deckName}>{deck.name}</Text>
          <Text style={styles.deckChange}>変える ▸</Text>
        </Pressable>

        {waiting ? (
          <View style={styles.waitBox}>
            {roomCode ? (
              <>
                <Text style={styles.waitTitle}>合言葉を相手に伝えてください</Text>
                <Text style={styles.codeText}>{roomCode}</Text>
                <Text style={styles.waitNote}>
                  相手が「合言葉で入る」にこのコードを入力すると対戦が始まります
                </Text>
              </>
            ) : (
              <Text style={styles.waitTitle}>
                {onlineStatus === "connecting" ? "サーバーに接続しています…" : "相手を待っています…"}
              </Text>
            )}
            {opponentName && (
              <Text style={styles.waitNote}>{opponentName} さんが入室しました</Text>
            )}
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                haptic("light");
                quitGame();
              }}
            >
              <Text style={styles.cancelText}>やめる</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>対戦のしかた</Text>
            <Pressable style={[styles.bigButton, { backgroundColor: colors.primary }]} onPress={() => start("create")}>
              <Text style={styles.bigButtonText}>🔑 合言葉を作って待つ</Text>
              <Text style={styles.bigButtonSub}>6文字のコードを相手に伝えます</Text>
            </Pressable>

            <View style={styles.joinRow}>
              <TextInput
                style={[styles.input, styles.joinInput]}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder="合言葉（6文字）"
                autoCapitalize="characters"
                maxLength={6}
              />
              <Pressable
                style={[styles.joinButton, joinCode.trim().length < 6 && styles.buttonDisabled]}
                onPress={() => joinCode.trim().length >= 6 && start("join")}
              >
                <Text style={styles.bigButtonText}>入る</Text>
              </Pressable>
            </View>

            <Pressable style={[styles.bigButton, { backgroundColor: colors.success }]} onPress={() => start("queue")}>
              <Text style={styles.bigButtonText}>🎲 ランダムマッチ</Text>
              <Text style={styles.bigButtonSub}>待っている誰かとすぐ対戦</Text>
            </Pressable>
          </>
        )}

        {(onlineError || onlineStatus === "error" || onlineStatus === "opponentLeft") && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {onlineStatus === "opponentLeft"
                ? "相手が退室しました"
                : (onlineError ?? "エラーが発生しました")}
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>サーバーアドレス（開発用）</Text>
        <TextInput
          style={styles.input}
          value={prefs.serverUrl}
          onChangeText={prefs.setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>
          同じWi-Fiの中で遊ぶときは、サーバーを起動しているMacのアドレスを入れてください。
        </Text>
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
  },
  deckRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  deckName: { fontSize: 16, fontWeight: "800", color: colors.text },
  deckChange: { color: colors.primary, fontWeight: "700" },
  bigButton: {
    borderRadius: radius.lg,
    paddingVertical: 16,
    alignItems: "center",
    gap: 2,
    ...shadow.button,
  },
  bigButtonText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  bigButtonSub: { color: "#ffffffcc", fontSize: 12, fontWeight: "700" },
  joinRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  joinInput: { flex: 1, letterSpacing: 4, fontWeight: "800" },
  joinButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  buttonDisabled: { opacity: 0.4 },
  waitBox: {
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginTop: spacing.md,
    ...shadow.card,
  },
  waitTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  codeText: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: 8,
    color: colors.primary,
  },
  waitNote: { fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 19 },
  cancelButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.cancel,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  cancelText: { color: "#fff", fontWeight: "800" },
  errorBox: {
    backgroundColor: "#ffe5e5",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: spacing.md,
  },
  errorText: { color: colors.danger, fontWeight: "800" },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
});

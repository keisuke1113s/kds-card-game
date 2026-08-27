import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useGameStore } from "@/store/gameStore";
import { colors, radius, shadow, spacing } from "@/theme";

/**
 * オンライン対戦。
 * 合言葉（部屋コード）を作る／入力して入る／ランダムマッチの3通り。
 * サーバーアドレスは開発中は手入力（本番では固定にする予定）。
 */

interface OnlinePrefs {
  name: string;
  serverUrl: string;
  setName: (v: string) => void;
  setServerUrl: (v: string) => void;
}

/** 本番サーバー（Fly.io 東京）。GitHub Pages からは wss が必須 */
export const DEFAULT_SERVER_URL = "wss://kds-taisen.fly.dev";

/** サーバーアドレス欄は開発ビルドのときだけ見せる（公開版では常に本番へ接続） */
const SHOW_SERVER_FIELD = typeof __DEV__ !== "undefined" && __DEV__;

const useOnlinePrefs = create<OnlinePrefs>()(
  persist(
    (set) => ({
      name: "",
      serverUrl: DEFAULT_SERVER_URL,
      setName: (name) => set({ name }),
      setServerUrl: (serverUrl) => set({ serverUrl }),
    }),
    {
      name: "kds-online-prefs",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // 旧バージョンで保存された開発用アドレスを本番サーバーに置き換える
      migrate: (state) => ({ ...(state as OnlinePrefs), serverUrl: DEFAULT_SERVER_URL }),
    }
  )
);

export default function OnlineScreen() {
  const router = useRouter();
  const prefs = useOnlinePrefs();
  const [lobbyWaiting, setLobbyWaiting] = React.useState<number | null>(null);
  const deckState = useDeckStore();
  const connectOnline = useGameStore((s) => s.connectOnline);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const onlineError = useGameStore((s) => s.onlineError);
  const roomCode = useGameStore((s) => s.roomCode);
  const opponentName = useGameStore((s) => s.opponentName);
  const quitGame = useGameStore((s) => s.quitGame);
  const queueActive = useGameStore((s) => s.queueActive);
  const startGame = useGameStore((s) => s.startGame);
  const [joinCode, setJoinCode] = React.useState("");

  const deck = resolveActiveDeck(deckState);
  const name = prefs.name || "教習生";
  // アドレス欄を出さない公開版では、保存値がどうであれ必ず本番サーバーへつなぐ
  const serverUrl = SHOW_SERVER_FIELD ? prefs.serverUrl.trim() : DEFAULT_SERVER_URL;

  // 対局が始まったら対戦画面へ
  useEffect(() => {
    if (onlineStatus === "playing") router.replace("/battle");
  }, [onlineStatus, router]);

  // ランダムマッチで待っている人がいるか、10秒ごとに確認する
  useEffect(() => {
    let alive = true;
    const httpUrl = serverUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const check = async () => {
      try {
        const res = await fetch(`${httpUrl}/lobby`);
        const data = (await res.json()) as { waiting: number };
        if (alive) setLobbyWaiting(data.waiting);
      } catch {
        if (alive) setLobbyWaiting(null);
      }
    };
    void check();
    const timer = setInterval(check, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [serverUrl]);

  const start = (mode: "create" | "join" | "queue") => {
    haptic("medium");
    connectOnline({
      serverUrl,
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
            {queueActive && (
              <Pressable
                style={styles.cpuWhileWaitButton}
                onPress={() => {
                  haptic("medium");
                  // 待機を維持したままCPU対戦を開始する。
                  // 相手が見つかったらCPU対戦は打ち切られ、オンライン対戦に切り替わる
                  const latest = useDeckStore.getState();
                  const player = resolveActiveDeck(latest);
                  const st = useSettingsStore.getState();
                  startGame({
                    playerDeck: player.list,
                    cpuDeck: cpuDeckFor(player, latest.builtinOverrides).list,
                    difficulty: st.difficulty,
                    aiSpeedMs: st.aiSpeedMs,
                  });
                  router.replace("/battle");
                }}
              >
                <Text style={styles.bigButtonText}>🤖 待っている間にCPU対戦</Text>
                <Text style={styles.bigButtonSub}>相手が見つかったら自動で切り替わります</Text>
              </Pressable>
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
            <Text style={styles.sectionTitle}>対戦のしかた（2つの方法があります）</Text>

            {/* 方法1: 合言葉で決まった相手と対戦する */}
            <View style={styles.methodCard}>
              <View style={styles.methodHeader}>
                <View style={[styles.methodNumber, { backgroundColor: colors.primary }]}>
                  <Text style={styles.methodNumberText}>方法1</Text>
                </View>
                <Text style={styles.methodTitle}>🔑 合言葉で対戦</Text>
              </View>
              <Text style={styles.methodDesc}>
                友だちや決まった相手と対戦する方法です。どちらかが合言葉を作り、もう1人がその合言葉を入力すると対戦が始まります。
              </Text>
              <Pressable style={[styles.bigButton, { backgroundColor: colors.primary }]} onPress={() => start("create")}>
                <Text style={styles.bigButtonText}>合言葉を作って待つ</Text>
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
              <Text style={styles.methodNote}>相手から合言葉を聞いたら、ここに入力してください</Text>
            </View>

            {/* 区切り */}
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orText}>または</Text>
              <View style={styles.orLine} />
            </View>

            {/* 方法2: ランダムマッチ */}
            <View style={styles.methodCard}>
              <View style={styles.methodHeader}>
                <View style={[styles.methodNumber, { backgroundColor: colors.success }]}>
                  <Text style={styles.methodNumberText}>方法2</Text>
                </View>
                <Text style={styles.methodTitle}>🎲 ランダムマッチ</Text>
              </View>
              <Text style={styles.methodDesc}>
                相手を決めずに、いま待っている誰かとすぐ対戦する方法です。合言葉はいりません。
              </Text>
              <Pressable style={[styles.bigButton, { backgroundColor: colors.success }]} onPress={() => start("queue")}>
                <Text style={styles.bigButtonText}>相手を探して対戦</Text>
                <Text style={styles.bigButtonSub}>
                  {lobbyWaiting === null
                    ? "待っている誰かとすぐ対戦"
                    : lobbyWaiting > 0
                      ? "✅ いま待っている人がいます！すぐ対戦できます"
                      : "いま待っている人はいません（あなたが最初になれます）"}
                </Text>
              </Pressable>
            </View>
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

        {SHOW_SERVER_FIELD && (
          <>
            <Text style={styles.sectionTitle}>サーバーアドレス（開発時のみ表示）</Text>
            <TextInput
              style={styles.input}
              value={prefs.serverUrl}
              onChangeText={prefs.setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {prefs.serverUrl.trim() !== DEFAULT_SERVER_URL && (
              <Pressable onPress={() => prefs.setServerUrl(DEFAULT_SERVER_URL)}>
                <Text style={styles.resetLink}>▸ 標準のサーバーに戻す</Text>
              </Pressable>
            )}
          </>
        )}
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
  methodCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.card,
  },
  methodHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  methodNumber: {
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  methodNumberText: { color: "#fff", fontSize: 12, fontWeight: "900" },
  methodTitle: { fontSize: 17, fontWeight: "900", color: colors.text },
  methodDesc: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  methodNote: { fontSize: 12, color: colors.textMuted, textAlign: "center" },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginVertical: 2,
  },
  orLine: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 13, fontWeight: "800", color: colors.textMuted },
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
  cpuWhileWaitButton: {
    alignSelf: "stretch",
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: "center",
    gap: 2,
  },
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
  resetLink: { fontSize: 13, color: colors.primary, fontWeight: "700", paddingVertical: 4 },
});

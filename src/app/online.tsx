import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { stopBgm } from "@/audio/sound";
import { Difficulty } from "@/ai/types";
import { HAPTICS_AVAILABLE, haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { allDecks, cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { useSettingsStore } from "@/store/settingsStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { DeckList } from "@/engine/deckRules";
import { MatchPrep } from "@/components/MatchPrep";
import { OnlineJanken } from "@/components/OnlineJanken";
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

/** CPUの手の速さの選択肢（対戦準備画面と同じ） */
const SPEEDS: { label: string; ms: number }[] = [
  { label: "はやい", ms: 700 },
  { label: "ふつう", ms: 1000 },
  { label: "ゆっくり", ms: 1600 },
];

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
  // 名前が未入力のまま参加ボタンを押したときに出す入力ダイアログ。
  // どの参加方法を押したかを覚えておき、入力後にその方法で続行する
  const [namePrompt, setNamePrompt] = React.useState<"create" | "join" | "queue" | "edit" | null>(
    null
  );
  const [nameDraft, setNameDraft] = React.useState("");
  // 待機中CPU対戦の設定パネル。cpuDeckId は null で「おまかせ」
  const [cpuOptionsOpen, setCpuOptionsOpen] = React.useState(false);
  const [cpuDeckId, setCpuDeckId] = React.useState<string | null>(null);
  const settings = useSettingsStore();

  const deck = resolveActiveDeck(deckState);
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
    const name = prefs.name.trim();
    // 名前は必須。未入力なら入力ダイアログを出し、入力後に続行する
    if (!name) {
      setNameDraft("");
      setNamePrompt(mode);
      return;
    }
    connectOnline({
      serverUrl,
      mode,
      code: joinCode.trim().toUpperCase(),
      name,
      deck: deck.list,
    });
  };

  /** 名前ダイアログで「決定」を押したとき: 名前を保存してから参加を続行する */
  const confirmName = () => {
    const name = nameDraft.trim();
    if (!name || !namePrompt) return;
    prefs.setName(name);
    const mode = namePrompt;
    setNamePrompt(null);
    // 名前の変更だけのときは参加しない
    if (mode === "edit") return;
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

  /** 合言葉をコピーする。押した直後だけ「コピーしました」に変わる */
  const [codeCopied, setCodeCopied] = React.useState(false);
  const copyCode = async () => {
    if (!roomCode) return;
    haptic("light");
    try {
      await Clipboard.setStringAsync(roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2500);
    } catch {
      // コピーできない環境では何もしない（コードは画面に見えている）
    }
  };

  /** 合言葉をLINEで送る（LINEの共有画面が開く） */
  const shareCodeToLine = () => {
    if (!roomCode) return;
    haptic("light");
    const message = `KDSカードゲームで対戦しよう！\n合言葉: ${roomCode}\nhttps://keisuke1113s.github.io/kds-card-game/`;
    void Linking.openURL(`https://line.me/R/share?text=${encodeURIComponent(message)}`);
  };

  /** 待機を維持したままCPU対戦を始める前の準備（シャッフル→じゃんけん）。
      通常のCPU対戦と同じ流れで先攻後攻を決める */
  const [cpuPrep, setCpuPrep] = React.useState<{
    playerList: DeckList;
    cpuList: DeckList;
  } | null>(null);

  const startCpuWhileWaiting = () => {
    haptic("medium");
    const latest = useDeckStore.getState();
    const player = resolveActiveDeck(latest);
    const chosen =
      cpuDeckId === null
        ? cpuDeckFor(player, latest.builtinOverrides)
        : (allDecks(latest.customDecks, latest.builtinOverrides).find((d) => d.id === cpuDeckId) ??
          cpuDeckFor(player, latest.builtinOverrides));
    setCpuPrep({ playerList: player.list, cpuList: chosen.list });
  };

  /** じゃんけんで先攻が決まったらCPU対戦を開始する。
      相手が見つかったらCPU対戦は打ち切られ、オンライン対戦に切り替わる */
  const beginCpuMatch = (firstPlayerIsMe: boolean) => {
    if (!cpuPrep) return;
    const st = useSettingsStore.getState();
    startGame({
      playerDeck: cpuPrep.playerList,
      cpuDeck: cpuPrep.cpuList,
      difficulty: st.difficulty,
      aiSpeedMs: st.aiSpeedMs,
      firstPlayer: firstPlayerIsMe ? HUMAN : CPU,
    });
    setCpuPrep(null);
    router.replace("/battle");
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>使うデッキ</Text>
        <Pressable style={styles.deckRow} onPress={() => router.push("/deck")}>
          <Text style={styles.deckName}>{deck.name}</Text>
          <Text style={styles.deckChange}>変える ▸</Text>
        </Pressable>

        {/* 名前は参加ボタンを押したときのダイアログで入力する。
            登録済みの名前はここで確認・変更できる */}
        {prefs.name.trim() !== "" && (
          <Pressable
            style={styles.deckRow}
            onPress={() => {
              haptic("light");
              setNameDraft(prefs.name);
              setNamePrompt("edit");
            }}
          >
            <Text style={styles.nameRowText}>
              名前: <Text style={styles.deckName}>{prefs.name}</Text>
            </Text>
            <Text style={styles.deckChange}>変える ▸</Text>
          </Pressable>
        )}

        {waiting ? (
          <View style={styles.waitBox}>
            {roomCode ? (
              <>
                <Text style={styles.waitTitle}>合言葉を相手に伝えてください</Text>
                <Text style={styles.codeText}>{roomCode}</Text>
                <View style={styles.shareRow}>
                  <Pressable style={styles.shareButton} onPress={copyCode}>
                    <Text style={styles.shareButtonText}>
                      {codeCopied ? "✅ コピーしました" : "📋 コピー"}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.shareButton, styles.lineButton]}
                    onPress={shareCodeToLine}
                  >
                    <Text style={[styles.shareButtonText, { color: "#fff" }]}>
                      💬 LINEで送る
                    </Text>
                  </Pressable>
                </View>
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
                  setCpuOptionsOpen((v) => !v);
                }}
              >
                <Text style={styles.bigButtonText}>🤖 待っている間にCPU対戦</Text>
                <Text style={styles.bigButtonSub}>
                  {cpuOptionsOpen ? "▼ 下の設定を選んで開始してください" : "相手が見つかったら自動で切り替わります"}
                </Text>
              </Pressable>
            )}

            {queueActive && cpuOptionsOpen && (
              <View style={styles.cpuOptions}>
                <Text style={styles.cpuOptionTitle}>CPUの強さ</Text>
                <View style={styles.choiceRow}>
                  {(Object.keys(DIFFICULTY_LABELS) as Difficulty[]).map((d) => (
                    <Choice
                      key={d}
                      label={DIFFICULTY_LABELS[d]}
                      active={settings.difficulty === d}
                      onPress={() => settings.setDifficulty(d)}
                    />
                  ))}
                </View>

                <Text style={styles.cpuOptionTitle}>CPUの手の速さ</Text>
                <View style={styles.choiceRow}>
                  {SPEEDS.map((s) => (
                    <Choice
                      key={s.ms}
                      label={s.label}
                      active={settings.aiSpeedMs === s.ms}
                      onPress={() => settings.setAiSpeedMs(s.ms)}
                    />
                  ))}
                </View>

                <Text style={styles.cpuOptionTitle}>サウンド</Text>
                <View style={styles.choiceRow}>
                  <Choice
                    label={`効果音 ${settings.seEnabled ? "ON" : "OFF"}`}
                    active={settings.seEnabled}
                    onPress={() => settings.setSeEnabled(!settings.seEnabled)}
                  />
                  <Choice
                    label={`BGM ${settings.bgmEnabled ? "ON" : "OFF"}`}
                    active={settings.bgmEnabled}
                    onPress={() => settings.setBgmEnabled(!settings.bgmEnabled)}
                  />
                  <Choice
                    label={HAPTICS_AVAILABLE ? `振動 ${settings.hapticsEnabled ? "ON" : "OFF"}` : "振動 なし"}
                    active={HAPTICS_AVAILABLE && settings.hapticsEnabled}
                    disabled={!HAPTICS_AVAILABLE}
                    onPress={() =>
                      HAPTICS_AVAILABLE && settings.setHapticsEnabled(!settings.hapticsEnabled)
                    }
                  />
                </View>

                <Text style={styles.cpuOptionTitle}>CPUのデッキ</Text>
                <View style={styles.choiceWrap}>
                  <Choice
                    label="おまかせ"
                    active={cpuDeckId === null}
                    onPress={() => setCpuDeckId(null)}
                  />
                  {allDecks(deckState.customDecks, deckState.builtinOverrides).map((d) => (
                    <Choice
                      key={d.id}
                      label={d.name}
                      active={cpuDeckId === d.id}
                      onPress={() => setCpuDeckId(d.id)}
                    />
                  ))}
                </View>

                <Pressable style={styles.cpuStartButton} onPress={startCpuWhileWaiting}>
                  <Text style={styles.bigButtonText}>この設定でCPU対戦を始める</Text>
                </Pressable>
              </View>
            )}
            <Pressable
              style={styles.cancelButton}
              onPress={() => {
                haptic("light");
                quitGame();
              }}
            >
              <Text style={styles.cancelText}>🛑 やめる</Text>
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

      {/* 対戦相手が見つかったときの、先攻を決めるじゃんけん */}
      <OnlineJanken />

      {/* 待機中CPU対戦の準備（シャッフル→じゃんけんで先攻を決める） */}
      {cpuPrep && (
        <MatchPrep
          cardIds={[
            ...cpuPrep.playerList.main,
            cpuPrep.playerList.tantou,
            ...cpuPrep.cpuList.main,
            cpuPrep.cpuList.tantou,
          ]}
          onDecided={beginCpuMatch}
          onCancel={() => {
            stopBgm();
            setCpuPrep(null);
          }}
        />
      )}

      {/* 名前が未入力のまま参加しようとしたときの必須入力ダイアログ */}
      <Modal visible={namePrompt !== null} transparent animationType="fade">
        <View style={styles.nameModalLayer}>
          <View style={styles.nameModalBox}>
            <Text style={styles.nameModalTitle}>名前を入力してください</Text>
            <Text style={styles.nameModalSub}>対戦相手にこの名前が表示されます</Text>
            <TextInput
              style={styles.input}
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="例: たろう"
              maxLength={12}
              autoFocus
              onSubmitEditing={confirmName}
            />
            <Pressable
              style={[styles.nameModalOk, nameDraft.trim().length === 0 && styles.buttonDisabled]}
              onPress={confirmName}
            >
              <Text style={styles.bigButtonText}>
                {namePrompt === "edit" ? "この名前にする" : "この名前で参加する"}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.cancelButton, { alignSelf: "center" }]}
              onPress={() => {
                haptic("light");
                setNamePrompt(null);
              }}
            >
              <Text style={styles.cancelText}>🛑 やめる</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenEnter>
  );
}

/** 対戦準備画面と同じ見た目の選択ボタン */
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
  nameRowText: { fontSize: 14, fontWeight: "700", color: colors.textMuted },
  shareRow: { flexDirection: "row", gap: 10 },
  shareButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  shareButtonText: { fontWeight: "800", color: colors.text, fontSize: 13 },
  lineButton: { backgroundColor: "#06c755", borderColor: "#06c755" },
  cpuOptions: { alignSelf: "stretch", gap: 6 },
  cpuOptionTitle: { fontSize: 13, fontWeight: "800", color: colors.textMuted, marginTop: 4 },
  choiceRow: { flexDirection: "row", gap: 8 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    flexGrow: 1,
    flexBasis: "28%",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
  },
  choiceText: { fontWeight: "700", color: colors.text, fontSize: 13 },
  choiceDisabled: { borderStyle: "dashed" },
  cpuStartButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 6,
  },
  nameModalLayer: {
    flex: 1,
    backgroundColor: "rgba(10, 20, 40, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  nameModalBox: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: "stretch",
    ...shadow.card,
  },
  nameModalTitle: { fontSize: 18, fontWeight: "900", color: colors.text, textAlign: "center" },
  nameModalSub: { fontSize: 13, color: colors.textMuted, textAlign: "center" },
  nameModalOk: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: "center",
  },
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

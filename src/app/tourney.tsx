import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useFocusEffect, useRouter } from "expo-router";
import { haptic } from "@/audio/haptics";
import { playSe } from "@/audio/sound";
import { AppButton } from "@/components/AppButton";
import { ScreenEnter } from "@/components/ScreenEnter";
import { DEFAULT_SERVER_URL, useOnlinePrefs } from "@/app/online";
import { getDeviceId } from "@/data/telemetry";
import { cpuDeckFor, resolveActiveDeck, useDeckStore } from "@/store/deckStore";
import { CPU, HUMAN, useGameStore } from "@/store/gameStore";
import { useRankStore } from "@/store/rankStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useTourneyStore } from "@/store/tourneyStore";
import { colors, radius, spacing } from "@/theme";

/**
 * オンライントーナメント（常設ロビー・4人制）。
 * エントリーして4人そろうと自動で準決勝2試合 → 決勝が始まる。
 * 進行はサーバー（/tourney）へのポーリングで追いかける。
 */

const HTTP_URL = DEFAULT_SERVER_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

interface BracketMatch {
  a: string;
  b: string;
  winner: string | null;
  voided?: boolean;
}

interface TourneyStatus {
  phase: "waiting" | "semi" | "final" | "done";
  lobbyCount: number;
  lobbyNames: string[];
  inLobby: boolean;
  inTournament: boolean;
  bracket: {
    semis: BracketMatch[];
    final: BracketMatch | null;
    champion: string | null;
    championIsYou: boolean;
  } | null;
  yourMatchCode: string | null;
  watchCode: string | null;
}

export default function TourneyScreen() {
  const router = useRouter();
  const prefs = useOnlinePrefs();
  const deckState = useDeckStore();
  const connectOnline = useGameStore((s) => s.connectOnline);
  const onlineStatus = useGameStore((s) => s.onlineStatus);
  const startGame = useGameStore((s) => s.startGame);
  const setTourneyActive = useTourneyStore((s) => s.setActive);
  const addTourneyWin = useTourneyStore((s) => s.addWin);
  const startLobbyWatch = useTourneyStore((s) => s.startLobbyWatch);
  const stopLobbyWatch = useTourneyStore((s) => s.stopLobbyWatch);

  const [status, setStatus] = useState<TourneyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<string | null>(null);
  const joiningRef = useRef(false);
  const celebratedRef = useRef(false);

  // 表示名: 免許証の名前 → オンライン設定の名前 → 自動の仮名（教習生+端末4桁）
  const nameFor = useCallback(
    (dev: string) => {
      const lic = useRankStore.getState().playerName.trim();
      return lic || prefs.name.trim() || `教習生${dev.replace(/\D/g, "").slice(-4) || "0000"}`;
    },
    [prefs.name]
  );

  useEffect(() => {
    void getDeviceId().then(setDevice);
  }, []);

  // 対局が始まったら対戦画面へ
  useEffect(() => {
    if (onlineStatus === "playing") router.replace("/battle");
  }, [onlineStatus, router]);

  // 画面を見ている間: エントリー（ハートビート）＋3秒ごとの状況確認。
  // 待機中CPU対戦の見張りはこの画面が引き継ぐので止める
  useFocusEffect(
    useCallback(() => {
      if (!device) return;
      stopLobbyWatch();
      let alive = true;
      const poll = async () => {
        try {
          const res = await fetch(`${HTTP_URL}/tourney?device=${encodeURIComponent(device)}`);
          const d = (await res.json()) as TourneyStatus;
          if (!alive) return;
          setStatus(d);
          setError(null);
          // ロビー（次回開催待ち）にいるべきなのに外れていたらエントリーし直す
          if (!d.inLobby && !d.inTournament) {
            await fetch(`${HTTP_URL}/tourney/join`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ device, name: nameFor(device) }),
            });
          }
        } catch {
          if (alive) setError("サーバーに接続できません。通信環境を確認してください。");
        }
      };
      void poll();
      const timer = setInterval(() => void poll(), 3000);
      return () => {
        alive = false;
        clearInterval(timer);
        // 画面を離れたらロビーから外れる（対戦へ進んだ場合はロビーに居ないので無害）
        void fetch(`${HTTP_URL}/tourney/leave`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ device }),
        }).catch(() => {});
      };
    }, [device, nameFor, stopLobbyWatch])
  );

  /** ロビーで待ちながらCPU対戦を始める（裏でロビーの見張りを続ける） */
  const startCpuWhileWaiting = () => {
    if (!device) return;
    haptic("medium");
    startLobbyWatch(device, nameFor(device));
    const latest = useDeckStore.getState();
    const player = resolveActiveDeck(latest);
    const cpu = cpuDeckFor(player, latest.builtinOverrides);
    const st = useSettingsStore.getState();
    startGame({
      playerDeck: player.list,
      cpuDeck: cpu.list,
      difficulty: st.difficulty,
      aiSpeedMs: st.aiSpeedMs,
      firstPlayer: Math.random() < 0.5 ? HUMAN : CPU,
    });
    router.replace("/battle");
  };

  // 優勝したら一度だけお祝い＋記録（実績「オンライン王者」用）
  useEffect(() => {
    if (status?.phase === "done" && status.bracket?.championIsYou && !celebratedRef.current) {
      celebratedRef.current = true;
      addTourneyWin();
      setTourneyActive(false);
      playSe("achievement");
      haptic("success");
    }
    if (status?.phase !== "done") celebratedRef.current = false;
  }, [status, addTourneyWin, setTourneyActive]);

  /** 自分の試合の部屋へ入る */
  const enterMatch = () => {
    if (!status?.yourMatchCode || joiningRef.current) return;
    joiningRef.current = true;
    haptic("medium");
    setTourneyActive(true);
    connectOnline({
      serverUrl: DEFAULT_SERVER_URL,
      mode: "join",
      code: status.yourMatchCode,
      name: device ? nameFor(device) : "教習生",
      deck: resolveActiveDeck(deckState).list,
    });
    setTimeout(() => (joiningRef.current = false), 4000);
  };

  const b = status?.bracket;
  const matchRow = (m: BracketMatch, label: string) => (
    <View style={styles.matchRow} key={label}>
      <Text style={styles.matchLabel}>{label}</Text>
      <Text style={[styles.matchName, m.winner === m.a && styles.matchWinner]} numberOfLines={1}>
        {m.winner === m.a ? "✓ " : ""}
        {m.a}
      </Text>
      <Text style={styles.matchVs}>VS</Text>
      <Text style={[styles.matchName, m.winner === m.b && styles.matchWinner]} numberOfLines={1}>
        {m.winner === m.b ? "✓ " : ""}
        {m.b}
      </Text>
      <Text style={styles.matchState}>
        {m.voided ? "不成立" : m.winner ? "終了" : "進行中"}
      </Text>
    </View>
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <ScreenEnter>
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>🏆 オンライントーナメント</Text>
          <Text style={styles.introText}>
            エントリーした人が4人そろうと、自動で組み合わせ抽選！{"\n"}
            準決勝2試合 → 決勝で王者を決めます。
          </Text>
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {!status && !error && <Text style={styles.waitText}>サーバーに接続しています…</Text>}

        {/* ロビー（エントリー待ち） */}
        {status && !status.inTournament && (
          <View style={styles.box}>
            <Text style={styles.boxTitle}>
              エントリー中 {status.lobbyCount}/4人
            </Text>
            <Text style={styles.lobbyNames}>
              {status.lobbyNames.length > 0 ? status.lobbyNames.join("・") : "…"}
            </Text>
            <Text style={styles.waitText}>
              {status.phase === "waiting"
                ? "4人そろい次第、自動で始まります。この画面のままお待ちください"
                : "いま別のトーナメントが進行中です。次の回に自動でエントリーされています"}
            </Text>
            <View style={styles.dots}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={[styles.dot, i < status.lobbyCount && styles.dotOn]}
                />
              ))}
            </View>
            <AppButton
              label="🤖 CPUと対戦しながら待つ"
              custom={{ bg: colors.primary }}
              fullWidth
              onPress={startCpuWhileWaiting}
            />
            <Text style={styles.waitText}>
              エントリーしたままCPU対戦で腕ならし。4人そろうと対戦画面にお知らせが出ます
              （90秒以内にトーナメントへ移動しないと不戦敗になるので注意！）
            </Text>
          </View>
        )}

        {/* トーナメント表 */}
        {b && status?.inTournament && (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.box}>
            <Text style={styles.boxTitle}>
              {status.phase === "done"
                ? "🏁 結果"
                : status.phase === "final"
                  ? "🔥 決勝戦"
                  : "⚔️ 準決勝"}
            </Text>
            {b.semis.map((m, i) => matchRow(m, `準決勝${i + 1}`))}
            {b.final && matchRow(b.final, "決勝")}

            {status.yourMatchCode && (
              <AppButton
                label={status.phase === "final" ? "🔥 決勝へ進む！" : "▶ 自分の試合へ進む"}
                custom={{ bg: "#c62828" }}
                size="lg"
                feel="medium"
                fullWidth
                onPress={enterMatch}
              />
            )}
            {!status.yourMatchCode && status.watchCode && (
              <AppButton
                label="👀 進行中の試合を観戦する"
                custom={{ bg: "#16283c" }}
                fullWidth
                onPress={() => {
                  haptic("light");
                  router.push({ pathname: "/spectate", params: { code: status.watchCode! } });
                }}
              />
            )}
            {!status.yourMatchCode && !status.watchCode && status.phase !== "done" && (
              <Text style={styles.waitText}>他の試合の結果を待っています…</Text>
            )}
          </Animated.View>
        )}

        {/* 優勝発表 */}
        {status?.phase === "done" && b?.champion && (
          <Animated.View entering={ZoomIn.springify().damping(10)} style={styles.championBox}>
            <Text style={styles.championCrown}>👑</Text>
            <Text style={styles.championName}>{b.champion}</Text>
            <Text style={styles.championLabel}>
              {b.championIsYou ? "優勝おめでとうございます！！" : "優勝！"}
            </Text>
            {b.championIsYou && (
              <Text style={styles.championNote}>実績「オンライン王者」を獲得！</Text>
            )}
          </Animated.View>
        )}

        <Text style={styles.note}>
          ※ 対戦が終わったら結果画面の「🏆 トーナメントへ戻る」でこの画面に戻ってください。{"\n"}
          ※ 90秒以内に試合へ進まないと不戦敗になります。
        </Text>
      </ScreenEnter>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  introBox: {
    backgroundColor: "#7a5a00",
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 6,
    marginBottom: spacing.md,
  },
  introTitle: { color: "#ffd54d", fontSize: 18, fontWeight: "900" },
  introText: { color: "#fff", fontSize: 13, fontWeight: "600", lineHeight: 20 },
  box: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 10,
    marginBottom: spacing.md,
  },
  boxTitle: { fontSize: 16, fontWeight: "900", color: colors.text },
  lobbyNames: { fontSize: 14, fontWeight: "700", color: colors.text },
  waitText: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  error: { fontSize: 13, color: colors.danger, fontWeight: "700", marginBottom: spacing.sm },
  dots: { flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 4 },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.border,
  },
  dotOn: { backgroundColor: "#2e9e5b" },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  matchLabel: { fontSize: 11, fontWeight: "800", color: colors.textMuted, width: 52 },
  matchName: { flex: 1, fontSize: 13, fontWeight: "700", color: colors.text, textAlign: "center" },
  matchWinner: { color: "#b8860b", fontWeight: "900" },
  matchVs: { fontSize: 11, fontWeight: "900", color: colors.danger },
  matchState: { fontSize: 11, fontWeight: "700", color: colors.textMuted, width: 44, textAlign: "right" },
  championBox: {
    backgroundColor: "#fff8e1",
    borderWidth: 2,
    borderColor: "#ffd54d",
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
    marginBottom: spacing.md,
  },
  championCrown: { fontSize: 44 },
  championName: { fontSize: 22, fontWeight: "900", color: "#7a5a00" },
  championLabel: { fontSize: 14, fontWeight: "800", color: "#a06a00" },
  championNote: { fontSize: 12, fontWeight: "700", color: "#2e9e5b", marginTop: 4 },
  note: { fontSize: 11, color: colors.textMuted, lineHeight: 17 },
});

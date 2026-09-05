import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { CardFace } from "@/components/CardFace";
import { eventText } from "@/components/eventText";
import { ScreenEnter } from "@/components/ScreenEnter";
import { ACADEMIC_GOAL, GameEvent, SKILL_GOAL } from "@/engine/types";
import { DEFAULT_SERVER_URL } from "@/app/online";
import { useGameStore } from "@/store/gameStore";
import { colors, radius, spacing } from "@/theme";

/**
 * オンライン対戦のライブ観戦。
 * 手札の中身は届かない（枚数だけ）。応援スタンプを送ると
 * 対戦しているふたりの画面に絵文字が流れる。
 */

interface Board {
  names: [string, string];
  titles: [string | undefined, string | undefined];
  tracks: [{ academic: number; skill: number }, { academic: number; skill: number }];
  fields: [{ cardId: string; rested: boolean }[], { cardId: string; rested: boolean }[]];
  tantou: [string, string];
  handCounts: [number, number];
  deckCounts: [number, number];
  outs: [string[], string[]];
  turnPlayer: 0 | 1;
  turnNumber: number;
  phaseType: string;
  winner: 0 | 1 | null;
}

const CHEERS = ["👏", "🔥", "😆", "😱", "💪"];

export default function SpectateScreen() {
  const router = useRouter();
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [board, setBoard] = useState<Board | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [myCheer, setMyCheer] = useState<{ key: number; emoji: string } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!code) {
      setError("観戦する対戦が指定されていません");
      return;
    }
    let alive = true;
    const ws = new WebSocket(DEFAULT_SERVER_URL);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "spectate", code: String(code) }));
    ws.onmessage = (ev) => {
      if (!alive) return;
      try {
        const msg = JSON.parse(String(ev.data)) as {
          type: string;
          board?: Board;
          events?: GameEvent[];
          emoji?: string;
          message?: string;
        };
        if (msg.type === "spectateState" && msg.board) {
          const b = msg.board;
          setBoard(b);
          const lines = (msg.events ?? [])
            .map((e) => eventText(e, 0, b.names[1])?.replaceAll("あなた", b.names[0]))
            .filter((t): t is string => !!t);
          if (lines.length > 0) setLog((cur) => [...lines.reverse(), ...cur].slice(0, 30));
        } else if (msg.type === "cheer" && msg.emoji) {
          setMyCheer({ key: Date.now(), emoji: msg.emoji });
        } else if (msg.type === "error") {
          setError(msg.message ?? "観戦できませんでした");
        }
      } catch {
        // 壊れたメッセージは無視
      }
    };
    ws.onerror = () => {
      if (alive) setError("サーバーに接続できませんでした");
    };
    return () => {
      alive = false;
      try {
        ws.close();
      } catch {
        // 閉じ損ねても実害なし
      }
      wsRef.current = null;
    };
  }, [code]);

  const connectSpectate = useGameStore((s) => s.connectSpectate);
  // 対戦者と同じ画面での観戦に切り替える（この画面のソケットは離脱時に閉じる）
  const openFullView = () => {
    if (!board || !code) return;
    haptic("medium");
    connectSpectate({
      serverUrl: DEFAULT_SERVER_URL,
      code: String(code),
      names: board.names,
    });
    router.replace("/battle");
  };

  const sendCheer = (emoji: string) => {
    haptic("light");
    setMyCheer({ key: Date.now(), emoji });
    try {
      wsRef.current?.send(JSON.stringify({ type: "cheer", emoji }));
    } catch {
      // 送れなくても観戦は続けられる
    }
  };

  const side = (i: 0 | 1) => {
    if (!board) return null;
    const t = board.tracks[i];
    return (
      <View style={[styles.side, board.turnPlayer === i && board.phaseType !== "finished" && styles.sideActive]}>
        <View style={styles.sideHead}>
          <Text style={styles.sideName} numberOfLines={1}>
            {board.turnPlayer === i && board.phaseType !== "finished" ? "▶ " : ""}
            {board.names[i]}
            {board.winner === i ? " 🏆" : ""}
          </Text>
          <Text style={styles.sideCounts}>
            手札{board.handCounts[i]}・山札{board.deckCounts[i]}・場外{board.outs[i].length}
          </Text>
        </View>
        <View style={styles.trackRow}>
          <Text style={styles.trackLabel}>📖 学科</Text>
          <View style={styles.trackBg}>
            <View style={[styles.trackFill, { width: `${(t.academic / ACADEMIC_GOAL) * 100}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={styles.trackNum}>{t.academic}/{ACADEMIC_GOAL}</Text>
        </View>
        <View style={styles.trackRow}>
          <Text style={styles.trackLabel}>🚗 技能</Text>
          <View style={styles.trackBg}>
            <View style={[styles.trackFill, { width: `${(t.skill / SKILL_GOAL) * 100}%`, backgroundColor: colors.success }]} />
          </View>
          <Text style={styles.trackNum}>{t.skill}/{SKILL_GOAL}</Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fieldRow}>
          <View style={styles.tantouWrap}>
            <CardFace cardId={board.tantou[i]} size="sm" />
            <Text style={styles.cardTag}>担当</Text>
          </View>
          {board.fields[i].map((f, j) => (
            <View key={`${f.cardId}-${j}`} style={f.rested ? styles.restedCard : undefined}>
              <CardFace cardId={f.cardId} size="sm" />
              {f.rested && <Text style={styles.cardTag}>休憩</Text>}
            </View>
          ))}
          {board.fields[i].length === 0 && (
            <Text style={styles.noField}>インストラクターなし</Text>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <ScreenEnter style={styles.root}>
      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backText}>戻る</Text>
          </Pressable>
        </View>
      ) : !board ? (
        <View style={styles.center}>
          <Text style={styles.loading}>観戦席へ移動しています…</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.turnText} allowFontScaling={false}>
            {board.phaseType === "finished"
              ? `🏁 対戦終了！ ${board.winner !== null ? `${board.names[board.winner]}の勝ち！` : ""}`
              : `👀 ライブ観戦中｜ターン${board.turnNumber}`}
          </Text>
          {side(1)}
          {side(0)}
          <View style={styles.logBox}>
            {log.slice(0, 6).map((l, i) => (
              <Text key={i} style={[styles.logLine, i === 0 && styles.logLatest]} numberOfLines={1}>
                {l}
              </Text>
            ))}
            {log.length === 0 && <Text style={styles.logLine}>実況を待っています…</Text>}
          </View>
          <Pressable style={styles.fullViewButton} onPress={openFullView}>
            <Text style={styles.fullViewText}>🎬 対戦画面で観戦する（切り替え）</Text>
          </Pressable>
          <View style={styles.cheerRow}>
            <Text style={styles.cheerLabel}>応援を送る:</Text>
            {CHEERS.map((c) => (
              <Pressable key={c} style={styles.cheerButton} onPress={() => sendCheer(c)}>
                <Text style={{ fontSize: 22 }}>{c}</Text>
              </Pressable>
            ))}
          </View>
          {myCheer && (
            <View key={myCheer.key} style={styles.myCheer} pointerEvents="none">
              <Text style={{ fontSize: 40 }}>{myCheer.emoji}</Text>
            </View>
          )}
        </View>
      )}
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  fullViewButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  fullViewText: { color: "#fff", fontWeight: "900", fontSize: 14 },
  root: { flex: 1, backgroundColor: "#0e1b33" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  loading: { color: "#cfe4ff", fontSize: 15, fontWeight: "700" },
  errorText: { color: "#ff9e9e", fontSize: 14, fontWeight: "700", textAlign: "center" },
  backButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 28,
  },
  backText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  body: { flex: 1, padding: spacing.sm, gap: 8 },
  turnText: { color: "#ffd54d", fontSize: 15, fontWeight: "900", textAlign: "center" },
  side: {
    backgroundColor: "#16283c",
    borderRadius: 12,
    padding: 8,
    gap: 6,
    borderWidth: 2,
    borderColor: "transparent",
  },
  sideActive: { borderColor: "#ffd54d" },
  sideHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sideName: { color: "#fff", fontSize: 15, fontWeight: "900", flex: 1 },
  sideCounts: { color: "#8fa8c8", fontSize: 11, fontWeight: "700" },
  trackRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  trackLabel: { color: "#cfe4ff", fontSize: 11, fontWeight: "800", width: 52 },
  trackBg: { flex: 1, height: 8, borderRadius: 999, backgroundColor: "#0e1b33", overflow: "hidden" },
  trackFill: { height: 8, borderRadius: 999 },
  trackNum: { color: "#cfe4ff", fontSize: 11, fontWeight: "800", width: 40, textAlign: "right" },
  fieldRow: { gap: 6, alignItems: "center", minHeight: 66, paddingVertical: 2 },
  tantouWrap: { alignItems: "center", opacity: 0.9 },
  restedCard: { opacity: 0.55 },
  cardTag: { color: "#8fa8c8", fontSize: 9, fontWeight: "800", textAlign: "center" },
  noField: { color: "#5a748c", fontSize: 12 },
  logBox: {
    flex: 1,
    backgroundColor: "#16283c",
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  logLine: { color: "#8fa8c8", fontSize: 12 },
  logLatest: { color: "#fff", fontWeight: "800" },
  cheerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cheerLabel: { color: "#cfe4ff", fontSize: 12, fontWeight: "800" },
  cheerButton: {
    backgroundColor: "#1c2a5e",
    borderRadius: 999,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  myCheer: { position: "absolute", bottom: 90, right: 30 },
});

import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { danNameOf } from "@/store/danStore";
import { useRankStore } from "@/store/rankStore";
import { DEFAULT_SERVER_URL } from "@/app/online";
import { colors, radius, spacing } from "@/theme";

/**
 * 週間ランキング（サーバー集計）。
 * 月曜日はじまりの1週間で、勝利数→最高連勝の順に並ぶ。
 * 免許証に名前を付けている人だけが掲示される。
 */

interface RankRow {
  name: string;
  wins: number;
  losses: number;
  bestStreak: number;
  dan: number;
}

interface RankingData {
  week: string;
  top: RankRow[];
  prevWeek: string;
  prevTop: RankRow[];
}

const HTTP_URL = DEFAULT_SERVER_URL.replace(/^wss:/, "https:").replace(/^ws:/, "http:");

const MEDALS = ["🥇", "🥈", "🥉"];

export default function RankingScreen() {
  const [data, setData] = useState<RankingData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const myName = useRankStore((s) => s.playerName.trim());

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${HTTP_URL}/ranking?t=${Date.now()}`, { cache: "no-store" });
      setData((await res.json()) as RankingData);
    } catch {
      setError("ランキングを取得できませんでした。通信環境を確認してください。");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.caption}>
          月曜日から日曜日までの勝利数ランキングです。{"\n"}
          🪪 教習生免許証に名前を付けると掲示されます。
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}
        {!data && !error && <Text style={styles.loading}>読み込んでいます…</Text>}

        {data && (
          <>
            <View style={styles.board}>
              <Text style={styles.boardTitle} allowFontScaling={false}>
                🏆 今週のランキング（{data.week.slice(5).replace("-", "/")}〜）
              </Text>
              {data.top.length === 0 && (
                <Text style={styles.empty}>
                  今週はまだ記録がありません。{"\n"}最初の勝者になろう！
                </Text>
              )}
              {data.top.map((r, i) => {
                const mine = myName !== "" && r.name === myName;
                return (
                  <View key={`${r.name}-${i}`} style={[styles.row, mine && styles.rowMine]}>
                    <Text style={styles.rankNum} allowFontScaling={false}>
                      {MEDALS[i] ?? `${i + 1}位`}
                    </Text>
                    <View style={styles.nameCol}>
                      <Text style={[styles.name, mine && styles.nameMine]} numberOfLines={1}>
                        {r.name}
                        {mine ? "（あなた）" : ""}
                      </Text>
                      <Text style={styles.sub}>
                        🥋 {danNameOf(r.dan)}
                        {r.bestStreak >= 2 ? `　🔥 最高${r.bestStreak}連勝` : ""}
                      </Text>
                    </View>
                    <Text style={styles.wins} allowFontScaling={false}>
                      {r.wins}勝
                      <Text style={styles.losses}> {r.losses}敗</Text>
                    </Text>
                  </View>
                );
              })}
            </View>

            {data.prevTop.length > 0 && (
              <View style={styles.prevBoard}>
                <Text style={styles.prevTitle}>👑 先週の栄光</Text>
                {data.prevTop.map((r, i) => (
                  <Text key={`p-${i}`} style={styles.prevRow}>
                    {MEDALS[i] ?? `${i + 1}位`} {r.name}（{r.wins}勝）
                  </Text>
                ))}
              </View>
            )}
          </>
        )}

        <Pressable
          style={styles.reloadButton}
          onPress={() => {
            haptic("light");
            void load();
          }}
        >
          <Text style={styles.reloadText}>🔄 最新に更新</Text>
        </Pressable>
      </ScrollView>
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.md, gap: 12, paddingBottom: 40 },
  caption: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 13, fontWeight: "700" },
  loading: { color: colors.textMuted, fontSize: 14, textAlign: "center", marginTop: 20 },
  board: {
    backgroundColor: "#1c3a2a",
    borderWidth: 3,
    borderColor: "#6b4a2a",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  boardTitle: { color: "#ffe9b0", fontSize: 16, fontWeight: "900", textAlign: "center" },
  empty: { color: "#cfe8d8", fontSize: 13, textAlign: "center", lineHeight: 20, paddingVertical: 12 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#12281c",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  rowMine: { backgroundColor: "#3a5a2a", borderWidth: 2, borderColor: "#ffd54d" },
  rankNum: { color: "#ffe9b0", fontSize: 15, fontWeight: "900", width: 44 },
  nameCol: { flex: 1, gap: 1 },
  name: { color: "#fff", fontSize: 15, fontWeight: "800" },
  nameMine: { color: "#ffd54d" },
  sub: { color: "#9fc3a8", fontSize: 11, fontWeight: "700" },
  wins: { color: "#ffd54d", fontSize: 16, fontWeight: "900" },
  losses: { color: "#9fc3a8", fontSize: 11, fontWeight: "700" },
  prevBoard: {
    backgroundColor: "#f8f4e8",
    borderRadius: 12,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: "#e4d8b8",
  },
  prevTitle: { fontSize: 14, fontWeight: "900", color: "#8a5a00" },
  prevRow: { fontSize: 13, fontWeight: "700", color: "#6c5a2e" },
  reloadButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingVertical: 12,
    alignItems: "center",
  },
  reloadText: { color: "#fff", fontSize: 15, fontWeight: "800" },
});

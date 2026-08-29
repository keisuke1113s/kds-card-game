import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View, TextInput } from "react-native";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";
import { ScreenEnter } from "@/components/ScreenEnter";
import { useGameStore } from "@/store/gameStore";
import { decodeReplay, encodeReplay } from "@/data/replayCode";
import { MatchRecord, useRecordStore } from "@/store/recordStore";
import { colors, radius, spacing } from "@/theme";

/** 対戦記録の一覧（新しい順）。練習対戦は記録されない */
export default function RecordsScreen() {
  const [replayCode, setReplayCode] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const startReplayTop = useGameStore((st) => st.startReplay);
  const router = useRouter();
  const history = useRecordStore((s) => s.history);
  const [tab, setTab] = React.useState<"list" | "stats">("list");

  const cpu = history.filter((h) => h.mode === "cpu");
  const online = history.filter((h) => h.mode === "online");
  const winsOf = (list: MatchRecord[]) => list.filter((h) => h.result === "win").length;

  return (
    <ScreenEnter style={styles.root}>
      <View style={styles.tabRow}>
        {(
          [
            { key: "list", label: "📜 記録" },
            { key: "stats", label: "📊 分析" },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            style={[styles.tabButton, tab === t.key && styles.tabButtonActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {tab === "stats" ? (
        <StatsView history={history} />
      ) : (
      <FlatList
        data={history}
        keyExtractor={(h) => h.at}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={styles.summaryBox}>
              <SummaryItem label="ぜんぶ" wins={winsOf(history)} total={history.length} />
              <SummaryItem label="CPU対戦" wins={winsOf(cpu)} total={cpu.length} />
              <SummaryItem label="オンライン" wins={winsOf(online)} total={online.length} />
            </View>
            {/* 友達からもらったリプレイコードの再生 */}
            <View style={styles.importRow}>
              <TextInput
                style={styles.importInput}
                value={replayCode}
                onChangeText={setReplayCode}
                placeholder="🔗 リプレイコード（KR1.〜）を貼り付けて再生"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.importButton, !replayCode.trim() && { opacity: 0.4 }]}
                onPress={() => {
                  const replay = decodeReplay(replayCode);
                  if (!replay) {
                    setImportError("コードを読み取れませんでした");
                    setTimeout(() => setImportError(null), 3000);
                    return;
                  }
                  setReplayCode("");
                  startReplayTop(replay);
                  router.push("/battle");
                }}
              >
                <Text style={styles.importButtonText}>再生</Text>
              </Pressable>
            </View>
            {importError && <Text style={styles.importError}>{importError}</Text>}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              まだ対戦の記録がありません。{"\n"}CPU対戦やオンライン対戦で遊ぶと、ここに記録されていきます。
            </Text>
          </View>
        }
        renderItem={({ item }) => <RecordRow record={item} />}
      />
      )}
    </ScreenEnter>
  );
}

/** 自己ベスト（最少ターン勝利・最速勝利） */
function PersonalBests({ history }: { history: MatchRecord[] }) {
  const wins = history.filter((r) => r.result === "win");
  const turnsWins = wins.filter((r) => r.turns > 0);
  const durWins = wins.filter((r) => r.durationSec > 0);
  if (wins.length === 0) {
    return <Text style={styles.bestLine}>勝利するとここに自己ベストが表示されます</Text>;
  }
  const minTurns = turnsWins.length > 0 ? Math.min(...turnsWins.map((r) => r.turns)) : null;
  const minDur = durWins.length > 0 ? Math.min(...durWins.map((r) => r.durationSec)) : null;
  return (
    <View style={{ gap: 2 }}>
      {minTurns !== null && (
        <Text style={styles.bestLine}>🏎️ 最少ターン勝利: {minTurns}ターン</Text>
      )}
      {minDur !== null && (
        <Text style={styles.bestLine}>
          ⏱️ 最速勝利: {Math.floor(minDur / 60)}分{minDur % 60}秒
        </Text>
      )}
    </View>
  );
}

/** 集計1行（名前・勝敗・勝率バー） */
function StatRow({ label, list }: { label: string; list: MatchRecord[] }) {
  const wins = list.filter((h) => h.result === "win").length;
  const total = list.length;
  const rate = total > 0 ? wins / total : 0;
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.statTrack}>
        <View style={[styles.statFill, { width: `${rate * 100}%` }]} />
      </View>
      <Text style={styles.statValue}>
        {wins}勝{total - wins}敗（{Math.round(rate * 100)}%）
      </Text>
    </View>
  );
}

/** 分析タブ: デッキ別・相手別・先攻後攻別・CPUの強さ別の勝率 */
function StatsView({ history }: { history: MatchRecord[] }) {
  const groupBy = (keyOf: (r: MatchRecord) => string | null) => {
    const map = new Map<string, MatchRecord[]>();
    for (const r of history) {
      const k = keyOf(r);
      if (k === null) continue;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    // 対戦数の多い順
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  const byDeck = groupBy((r) => r.myDeckName);
  const byOpponent = groupBy((r) => (r.mode === "online" ? (r.opponentName ?? "相手") : null));
  const byDifficulty = groupBy((r) =>
    r.mode === "cpu" ? (DIFFICULTY_LABELS[r.difficulty as Difficulty] ?? "ふつう") : null
  );

  if (history.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.emptyText}>まだ記録がありません。対戦すると分析が表示されます。</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={[0]}
      keyExtractor={() => "stats"}
      contentContainerStyle={styles.list}
      renderItem={() => (
        <View style={{ gap: 6 }}>
          <Text style={styles.statsSection}>自己ベスト</Text>
          <PersonalBests history={history} />

          <Text style={styles.statsSection}>先攻・後攻</Text>
          <StatRow label="先攻のとき" list={history.filter((r) => r.first)} />
          <StatRow label="後攻のとき" list={history.filter((r) => !r.first)} />

          <Text style={styles.statsSection}>デッキ別</Text>
          {byDeck.map(([name, list]) => (
            <StatRow key={name} label={name} list={list} />
          ))}

          {byDifficulty.length > 0 && (
            <>
              <Text style={styles.statsSection}>CPUの強さ別</Text>
              {byDifficulty.map(([name, list]) => (
                <StatRow key={name} label={`CPU（${name}）`} list={list} />
              ))}
            </>
          )}

          {byOpponent.length > 0 && (
            <>
              <Text style={styles.statsSection}>オンラインの相手別</Text>
              {byOpponent.map(([name, list]) => (
                <StatRow key={name} label={name} list={list} />
              ))}
            </>
          )}
        </View>
      )}
    />
  );
}

function SummaryItem({ label, wins, total }: { label: string; wins: number; total: number }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>
        {total > 0 ? `${wins}勝 ${total - wins}敗` : "—"}
      </Text>
    </View>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

function RecordRow({ record }: { record: MatchRecord }) {
  const router = useRouter();
  const startReplay = useGameStore((s) => s.startReplay);
  const [copied, setCopied] = useState(false);
  const win = record.result === "win";
  const opponent =
    record.mode === "online"
      ? `🌐 ${record.opponentName ?? "相手"}`
      : `🤖 CPU（${DIFFICULTY_LABELS[record.difficulty as Difficulty] ?? "ふつう"}）`;
  return (
    <View style={[styles.row, win ? styles.rowWin : styles.rowLose]}>
      <View style={styles.rowHead}>
        <Text style={[styles.result, { color: win ? colors.success : colors.danger }]}>
          {win ? "勝ち" : "負け"}
        </Text>
        <Text style={styles.opponent} numberOfLines={1}>
          {opponent}
        </Text>
        <Text style={styles.date}>{formatDate(record.at)}</Text>
      </View>
      <Text style={styles.detail}>
        {record.myDeckName}／{record.first ? "先攻" : "後攻"}／{record.turns}ターン／
        {formatDuration(record.durationSec)}
        {record.reason === "deckOut" ? "／山札切れ" : ""}
      </Text>
      <Text style={styles.tracks}>
        あなた 学科{record.myAcademic} 技能{record.mySkill} ─ あいて 学科{record.oppAcademic} 技能
        {record.oppSkill}
      </Text>
      {record.replay && (
        <View style={styles.replayRow}>
          <Pressable
            style={styles.replayButton}
            onPress={() => {
              startReplay(record.replay!);
              router.push("/battle");
            }}
          >
            <Text style={styles.replayButtonText}>▶ この対戦をリプレイで見る</Text>
          </Pressable>
          <Pressable
            style={[styles.replayButton, { backgroundColor: colors.support }]}
            onPress={async () => {
              const code = encodeReplay(record.replay!);
              try {
                await navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                // コピーできない環境は諦める
              }
            }}
          >
            <Text style={styles.replayButtonText}>{copied ? "✅ コピーしました" : "🔗 共有"}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  replayRow: { flexDirection: "row", gap: 8 },
  importRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  importInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  importButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  importButtonText: { color: "#fff", fontWeight: "800", fontSize: 13 },
  importError: { fontSize: 12, color: colors.danger, fontWeight: "700" },
  bestLine: { fontSize: 14, fontWeight: "800", color: colors.text, paddingVertical: 2 },
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  tabRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, paddingBottom: 0 },
  tabButton: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 9,
    alignItems: "center",
  },
  tabButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontWeight: "800", color: colors.text, fontSize: 13 },
  tabTextActive: { color: "#fff" },
  statsSection: { fontSize: 14, fontWeight: "900", color: colors.text, marginTop: 10 },
  statRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statLabel: { width: 110, fontSize: 12, fontWeight: "800", color: colors.textMuted },
  statTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
    overflow: "hidden",
  },
  statFill: { height: "100%", borderRadius: 5, backgroundColor: colors.success },
  statValue: { width: 118, fontSize: 11, fontWeight: "800", color: colors.text, textAlign: "right" },
  summaryBox: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: 4,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryLabel: { fontSize: 12, fontWeight: "800", color: colors.textMuted },
  summaryValue: { fontSize: 15, fontWeight: "900", color: colors.text },
  emptyBox: { padding: spacing.xl, alignItems: "center" },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 5,
    padding: spacing.md,
    gap: 3,
  },
  rowWin: { borderLeftColor: colors.success },
  rowLose: { borderLeftColor: colors.danger },
  rowHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  result: { fontSize: 15, fontWeight: "900" },
  opponent: { flex: 1, fontSize: 14, fontWeight: "800", color: colors.text },
  date: { fontSize: 11, color: colors.textMuted, fontWeight: "700" },
  detail: { fontSize: 12, color: colors.textMuted, fontWeight: "700" },
  tracks: { fontSize: 11, color: colors.textMuted },
  replayButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  replayButtonText: { color: "#fff", fontSize: 12, fontWeight: "900" },
});

import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { DIFFICULTY_LABELS } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";
import { ScreenEnter } from "@/components/ScreenEnter";
import { MatchRecord, useRecordStore } from "@/store/recordStore";
import { colors, radius, spacing } from "@/theme";

/** 対戦記録の一覧（新しい順）。練習対戦は記録されない */
export default function RecordsScreen() {
  const history = useRecordStore((s) => s.history);

  const cpu = history.filter((h) => h.mode === "cpu");
  const online = history.filter((h) => h.mode === "online");
  const winsOf = (list: MatchRecord[]) => list.filter((h) => h.result === "win").length;

  return (
    <ScreenEnter style={styles.root}>
      <FlatList
        data={history}
        keyExtractor={(h) => h.at}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.summaryBox}>
            <SummaryItem label="ぜんぶ" wins={winsOf(history)} total={history.length} />
            <SummaryItem label="CPU対戦" wins={winsOf(cpu)} total={cpu.length} />
            <SummaryItem label="オンライン" wins={winsOf(online)} total={online.length} />
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
    </ScreenEnter>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
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
});

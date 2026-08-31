import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { haptic } from "@/audio/haptics";
import { ScreenEnter } from "@/components/ScreenEnter";
import { SignImage } from "@/components/SignImage";
import { SIGN_BOOK, SIGN_CATEGORIES, SignCategory, SignEntry } from "@/data/signBook";
import { colors, radius, spacing } from "@/theme";

/** 標識図鑑。学科試験に出やすい主要標識を種類別に学べる */
export default function SignBookScreen() {
  const router = useRouter();
  const [cat, setCat] = useState<SignCategory | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const entries = SIGN_BOOK.filter((e) => cat === "all" || e.cat === cat);

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>🚸 標識図鑑</Text>
          <Text style={styles.note}>
            学科試験に出やすい主要{SIGN_BOOK.length}標識を集めました。
            タップすると意味と「ひっかけポイント」が見られます。
          </Text>
          <View style={styles.catRow}>
            {(["all", ...SIGN_CATEGORIES] as const).map((c) => (
              <Pressable
                key={c}
                style={[styles.catChip, cat === c && styles.catChipActive]}
                onPress={() => {
                  haptic("light");
                  setCat(c);
                }}
              >
                <Text style={[styles.catChipText, cat === c && styles.catChipTextActive]}>
                  {c === "all" ? "すべて" : c}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.legend}>
            🔴 規制＝禁止・制限　🔵 指示＝できる場所　🟡 警戒＝この先注意
          </Text>
        </View>

        {entries.map((e) => (
          <SignRow
            key={e.id}
            entry={e}
            open={openId === e.id}
            onPress={() => {
              haptic("light");
              setOpenId(openId === e.id ? null : e.id);
            }}
          />
        ))}

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>戻る</Text>
        </Pressable>
      </ScrollView>
    </ScreenEnter>
  );
}

function SignRow({
  entry,
  open,
  onPress,
}: {
  entry: SignEntry;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, open && styles.rowOpen]} onPress={onPress}>
      <View style={styles.rowTop}>
        <View style={styles.rowSign}>
          <SignImage id={entry.id} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.rowCat}>{entry.cat}</Text>
          <Text style={styles.rowName}>{entry.name}</Text>
          {!open && (
            <Text style={styles.rowHint} numberOfLines={1}>
              タップで意味を見る ▾
            </Text>
          )}
        </View>
      </View>
      {open && (
        <View style={styles.rowBody}>
          <Text style={styles.rowMeaning}>{entry.meaning}</Text>
          {!!entry.tip && (
            <Text style={styles.rowTip}>💡 {entry.tip}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#1a5fb4", textAlign: "center" },
  note: { fontSize: 13, lineHeight: 20, color: colors.text },
  legend: { fontSize: 11, color: colors.textMuted },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catChip: {
    borderWidth: 1.5,
    borderColor: "#1a5fb4",
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  catChipActive: { backgroundColor: "#1a5fb4" },
  catChipText: { fontSize: 12, fontWeight: "800", color: "#1a5fb4" },
  catChipTextActive: { color: "#fff" },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 12,
    gap: 8,
  },
  rowOpen: { borderWidth: 2, borderColor: "#1a5fb4" },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowSign: { width: 96, alignItems: "center" },
  rowCat: { fontSize: 11, fontWeight: "800", color: colors.textMuted },
  rowName: { fontSize: 15, fontWeight: "900", color: colors.text },
  rowHint: { fontSize: 11, color: colors.textMuted },
  rowBody: { gap: 6, paddingTop: 4 },
  rowMeaning: { fontSize: 14, lineHeight: 21, color: colors.text, fontWeight: "600" },
  rowTip: {
    fontSize: 13,
    lineHeight: 20,
    color: "#7a5a00",
    backgroundColor: "#fff8e1",
    borderRadius: 8,
    padding: 8,
  },
  backButton: {
    backgroundColor: colors.cancel,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
});

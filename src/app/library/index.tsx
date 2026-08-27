import { useRouter } from "expo-router";
import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { LockedCard } from "@/components/LockedCard";
import { allCards, getCard } from "@/data/cards";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";

const sections: { label: string; type: string }[] = [
  { label: "インストラクター", type: "instructor" },
  { label: "サポート", type: "support" },
  { label: "担当", type: "tantou" },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [lockedTapped, setLockedTapped] = useState(false);
  const unlockState = useUnlockStore();
  const unlocked = unlockedSet(unlockState);
  const total = allCards.length;

  return (
    <ScreenEnter style={styles.root}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.type}
        ListHeaderComponent={
          <View style={styles.headerBox}>
            <Text style={styles.progress}>
              あつめたカード {Math.min(unlocked.size, total)} / {total}
            </Text>
            <Pressable style={styles.scanButton} onPress={() => router.push("/scan")}>
              <Text style={styles.scanButtonText}>📷 QRコードでカードを登録</Text>
            </Pressable>
            <Text style={styles.scanHint}>
              実物のKDSカードのQRコードを読み込むと、そのカードが使えるようになるよ
            </Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            <View style={styles.grid}>
              {allCards
                .filter((c) => c.type === section.type)
                .map((c) =>
                  unlocked.has(c.id) ? (
                    <CardFace key={c.id} cardId={c.id} size="md" onPress={() => setSelected(c.id)} />
                  ) : (
                    <LockedCard key={c.id} size="md" onPress={() => setLockedTapped(true)} />
                  )
                )}
            </View>
          </View>
        )}
        contentContainerStyle={styles.list}
      />
      {selected && (
        <Pressable style={styles.overlayBg} onPress={() => setSelected(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>{getCard(selected).name}</Text>
            <CardDetail cardId={selected} />
            <Pressable style={styles.closeButton} onPress={() => setSelected(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
      {lockedTapped && (
        <Pressable style={styles.overlayBg} onPress={() => setLockedTapped(false)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.lockedEmoji}>🔒</Text>
            <Text style={styles.overlayTitle}>まだ開放されていないカードです</Text>
            <Text style={styles.lockedText}>
              実物のKDSカードにあるQRコードを読み込むと、カードが登録されて使えるようになります。
            </Text>
            <Pressable
              style={[styles.closeButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                setLockedTapped(false);
                router.push("/scan");
              }}
            >
              <Text style={styles.closeText}>📷 QRコードを読み込む</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={() => setLockedTapped(false)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 40 },
  headerBox: { gap: 8, alignItems: "center", marginBottom: 4 },
  progress: { fontSize: 14, fontWeight: "900", color: colors.text },
  scanButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignSelf: "stretch",
    alignItems: "center",
  },
  scanButtonText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  scanHint: { fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 18 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#000000aa",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: "100%",
    maxWidth: 420,
    gap: 12,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  lockedEmoji: { fontSize: 36 },
  lockedText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 21 },
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

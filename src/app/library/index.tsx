import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { allCards, getCard } from "@/data/cards";
import { colors } from "@/theme";

const sections: { label: string; type: string }[] = [
  { label: "インストラクター", type: "instructor" },
  { label: "サポート", type: "support" },
  { label: "担当", type: "tantou" },
];

export default function LibraryScreen() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <View style={styles.root}>
      <FlatList
        data={sections}
        keyExtractor={(s) => s.type}
        renderItem={({ item: section }) => (
          <View>
            <Text style={styles.sectionTitle}>{section.label}</Text>
            <View style={styles.grid}>
              {allCards
                .filter((c) => c.type === section.type)
                .map((c) => (
                  <CardFace key={c.id} cardId={c.id} size="md" onPress={() => setSelected(c.id)} />
                ))}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

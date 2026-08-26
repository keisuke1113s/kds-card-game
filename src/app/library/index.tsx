import React, { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { CardFace } from "@/components/CardFace";
import { placeholderCards } from "@/data/cards";
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
              {placeholderCards
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
          <View style={styles.overlayBox}>
            <CardFace cardId={selected} size="xl" />
            <Text style={styles.hint}>タップで閉じる</Text>
          </View>
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
  },
  overlayBox: { alignItems: "center", gap: 12 },
  hint: { color: "#fff" },
});

import { useRouter } from "expo-router";
import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { cardRegistry } from "@/data/cards";
import { validateDeck } from "@/engine/deckRules";
import {
  allDecks,
  builtinDeck,
  DEFAULT_DECK_ID,
  SavedDeck,
  useDeckStore,
} from "@/store/deckStore";
import { colors } from "@/theme";

export default function DeckListScreen() {
  const router = useRouter();
  const { customDecks, activeDeckId, setActiveDeck, deleteDeck } = useDeckStore();
  const decks = allDecks(customDecks);

  const newDeck = () => {
    const id = `deck-${Date.now()}`;
    router.push(`/deck/${id}`);
  };

  const confirmDelete = (deck: SavedDeck) => {
    Alert.alert(`「${deck.name}」を削除しますか？`, "", [
      { text: "キャンセル", style: "cancel" },
      { text: "削除", style: "destructive", onPress: () => deleteDeck(deck.id) },
    ]);
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.hint}>対戦で使うデッキを選んでください</Text>
      {decks.map((deck) => {
        const errors = validateDeck(cardRegistry, deck.list);
        const active = deck.id === activeDeckId;
        return (
          <Pressable
            key={deck.id}
            onPress={() => errors.length === 0 && setActiveDeck(deck.id)}
            style={[styles.deckCard, active && styles.activeDeck]}
          >
            <View style={styles.deckHeader}>
              <Text style={styles.deckName}>
                {active ? "✅ " : ""}
                {deck.name}
              </Text>
              <Text style={styles.deckCount}>{deck.list.main.length}枚</Text>
            </View>
            {errors.length > 0 && (
              <Text style={styles.error}>{errors[0]}</Text>
            )}
            {deck.id !== DEFAULT_DECK_ID && (
              <View style={styles.deckActions}>
                <SmallButton label="編集" onPress={() => router.push(`/deck/${deck.id}`)} />
                <SmallButton label="削除" danger onPress={() => confirmDelete(deck)} />
              </View>
            )}
          </Pressable>
        );
      })}
      <Pressable onPress={newDeck} style={styles.newButton}>
        <Text style={styles.newButtonText}>＋ 新しいデッキをつくる</Text>
      </Pressable>
      <Text style={styles.note}>
        スタンダードデッキ: {builtinDeck.list.main.length}枚入りの基本デッキです。
      </Text>
    </ScrollView>
  );
}

function SmallButton({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.smallButton, danger && { backgroundColor: colors.danger }]}
    >
      <Text style={styles.smallButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { color: colors.textMuted },
  deckCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.border,
    gap: 8,
  },
  activeDeck: { borderColor: colors.primary },
  deckHeader: { flexDirection: "row", justifyContent: "space-between" },
  deckName: { fontWeight: "800", fontSize: 15, color: colors.text },
  deckCount: { color: colors.textMuted },
  deckActions: { flexDirection: "row", gap: 8 },
  smallButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  smallButtonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
  newButton: {
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    borderStyle: "dashed",
    padding: 16,
    alignItems: "center",
  },
  newButtonText: { color: colors.primary, fontWeight: "700" },
  note: { color: colors.textMuted, fontSize: 12 },
});

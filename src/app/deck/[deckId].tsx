import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { CardFace } from "@/components/CardFace";
import { cardRegistry, placeholderCards } from "@/data/cards";
import { validateDeck } from "@/engine/deckRules";
import { useDeckStore } from "@/store/deckStore";
import { colors } from "@/theme";

export default function DeckEditScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const { customDecks, saveDeck } = useDeckStore();
  const existing = customDecks.find((d) => d.id === deckId);

  const [name, setName] = useState(existing?.name ?? "マイデッキ");
  const [main, setMain] = useState<string[]>(existing?.list.main ?? []);
  const [tantou, setTantou] = useState<string>(existing?.list.tantou ?? "kocho");

  const errors = useMemo(
    () => validateDeck(cardRegistry, { main, tantou }),
    [main, tantou]
  );

  const toggle = (cardId: string) => {
    setMain((cur) =>
      cur.includes(cardId) ? cur.filter((id) => id !== cardId) : [...cur, cardId]
    );
  };

  const save = () => {
    if (!deckId || errors.length > 0) return;
    saveDeck({ id: deckId, name: name.trim() || "マイデッキ", list: { main, tantou } });
    router.back();
  };

  const mainCards = placeholderCards.filter((c) => c.type !== "tantou");
  const tantouCards = placeholderCards.filter((c) => c.type === "tantou");
  const supportCount = main.filter((id) => cardRegistry[id].type === "support").length;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.nameInput}
          placeholder="デッキ名"
          maxLength={20}
        />

        <Text style={styles.counter}>
          {main.length}枚（20枚以上）・サポート {supportCount}/5
        </Text>
        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            ⚠️ {e}
          </Text>
        ))}

        <Text style={styles.sectionTitle}>担当カード（1枚）</Text>
        <View style={styles.grid}>
          {tantouCards.map((c) => (
            <View key={c.id} style={tantou === c.id ? styles.selected : undefined}>
              <CardFace cardId={c.id} size="md" onPress={() => setTantou(c.id)} />
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>メインデッキ（タップで入れる/外す）</Text>
        <View style={styles.grid}>
          {mainCards.map((c) => {
            const inDeck = main.includes(c.id);
            return (
              <View key={c.id} style={inDeck ? styles.selected : undefined}>
                <CardFace cardId={c.id} size="md" dimmed={!inDeck} onPress={() => toggle(c.id)} />
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          onPress={save}
          style={[
            styles.saveButton,
            errors.length > 0 && { backgroundColor: colors.border },
          ]}
          disabled={errors.length > 0}
        >
          <Text style={styles.saveText}>
            {errors.length > 0 ? "ルールを満たしていません" : "保存する"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 20 },
  nameInput: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  counter: { marginTop: 10, fontWeight: "700", color: colors.text },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  selected: {
    borderColor: colors.primary,
    borderWidth: 2,
    borderRadius: 8,
    padding: 1,
  },
  footer: {
    padding: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});

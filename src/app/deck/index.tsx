import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, TextInput } from "react-native";
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { cardRegistry, getCard } from "@/data/cards";
import { registryForUnlocked } from "@/data/unlock";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { decodeDeck, encodeDeck } from "@/data/deckCode";
import { randomDeckList, validateDeck } from "@/engine/deckRules";
import {
  allDecks,
  isBuiltinDeck,
  SavedDeck,
  useDeckStore,
} from "@/store/deckStore";
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";

export default function DeckListScreen() {
  const router = useRouter();
  const { customDecks, builtinOverrides, activeDeckId, setActiveDeck, deleteDeck, saveDeck } =
    useDeckStore();
  const decks = allDecks(customDecks, builtinOverrides);
  const [viewing, setViewing] = useState<SavedDeck | null>(null);
  const [viewShareMsg, setViewShareMsg] = useState<string | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedDeck | null>(null);
  const [importCode, setImportCode] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const newDeck = () => {
    const id = `deck-${Date.now()}`;
    router.push(`/deck/${id}`);
  };

  /** ルールを満たすデッキをランダムに作って保存し、そのまま使えるようにする */
  const newRandomDeck = () => {
    const seed =
      typeof globalThis.crypto?.getRandomValues === "function"
        ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] | 0
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
    // ランダム生成は開放済みのカードだけから選ぶ
    const { deck } = randomDeckList(
      registryForUnlocked(unlockedSet(useUnlockStore.getState())),
      seed
    );
    const id = `deck-${Date.now()}`;
    const count = customDecks.length + 1;
    saveDeck({ id, name: `ランダムデッキ${count}`, list: deck });
    setActiveDeck(id);
  };

  // Web では Alert.alert が動かないため、確認は自前のオーバーレイで行う
  const confirmDelete = (deck: SavedDeck) => setDeleting(deck);

  /** デッキを複製して新しいマイデッキとして保存する（元のデッキはそのまま） */
  const copyDeck = (deck: SavedDeck) => {
    const id = `deck-${Date.now()}`;
    saveDeck({
      id,
      name: `${deck.name}のコピー`.slice(0, 20),
      list: { main: [...deck.list.main], tantou: deck.list.tantou },
    });
    setActiveDeck(id);
  };

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>対戦で使うデッキを選んでください</Text>
        {decks.map((deck) => {
          const errors = validateDeck(cardRegistry, deck.list);
          const active = deck.id === activeDeckId;
          const instructors = deck.list.main.filter(
            (id) => cardRegistry[id]?.type === "instructor"
          ).length;
          const supports = deck.list.main.filter(
            (id) => cardRegistry[id]?.type === "support"
          ).length;
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
              <Text style={styles.deckSummary}>
                インストラクター {instructors}枚・サポート {supports}枚・担当「
                {getCard(deck.list.tantou).name}」
              </Text>
              {errors.length > 0 && <Text style={styles.error}>{errors[0]}</Text>}
              <View style={styles.deckActions}>
                <SmallButton label="中身を見る" onPress={() => { setViewShareMsg(null); setViewing(deck); }} />
                <SmallButton label="中身を変える" onPress={() => router.push(`/deck/${deck.id}`)} />
                <SmallButton label="コピー" onPress={() => copyDeck(deck)} />
                {!isBuiltinDeck(deck.id) && (
                  <SmallButton label="削除" danger onPress={() => confirmDelete(deck)} />
                )}
              </View>
            </Pressable>
          );
        })}
        <Pressable onPress={newDeck} style={styles.newButton}>
          <Text style={styles.newButtonText}>＋ 新しいデッキを作る</Text>
        </Pressable>
        {/* 共有コードからの取り込み */}
        <View style={styles.importBox}>
          <Text style={styles.importTitle}>🔗 共有コードから取り込む</Text>
          <TextInput
            style={styles.importInput}
            value={importCode}
            onChangeText={setImportCode}
            placeholder="KD1. から始まるコードを貼り付け"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable
            style={[styles.newButton, { marginTop: 0 }, !importCode.trim() && { opacity: 0.4 }]}
            onPress={() => {
              const parsed = decodeDeck(importCode);
              if (!parsed) {
                setImportMsg("コードを読み取れませんでした。コピーし直してみてください。");
                return;
              }
              const id = `deck-${Date.now()}`;
              saveDeck({ id, name: parsed.name, list: parsed.deck });
              setActiveDeck(id);
              setImportCode("");
              setImportMsg(`「${parsed.name}」を取り込みました！`);
            }}
          >
            <Text style={styles.newButtonText}>取り込む</Text>
          </Pressable>
          {importMsg && <Text style={styles.importMsg}>{importMsg}</Text>}
        </View>
        <Pressable onPress={newRandomDeck} style={styles.newButton}>
          <Text style={styles.newButtonText}>🎲 ランダムでデッキを作る</Text>
        </Pressable>
        <Text style={styles.note}>
          組み込みの2つのデッキも「中身を変える」から編集できます（「最初の構成に戻す」で元に戻せます）。
        </Text>
      </ScrollView>

      {viewing && (
        <Pressable style={styles.overlayBg} onPress={() => { setViewing(null); setViewShareMsg(null); }}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>{viewing.name}</Text>
            <Text style={styles.hint}>カードをタップすると拡大して確認できます</Text>
            <ScrollView style={styles.deckScroll} contentContainerStyle={styles.deckScrollContent}>
              <Text style={styles.sectionTitle}>担当カード</Text>
              <View style={styles.grid}>
                <CardFace
                  cardId={viewing.list.tantou}
                  size="md"
                  onPress={() => setDetailCardId(viewing.list.tantou)}
                />
              </View>

              {(["instructor", "support"] as const).map((type) => {
                const ids = viewing.list.main.filter((id) => cardRegistry[id]?.type === type);
                if (ids.length === 0) return null;
                return (
                  <View key={type}>
                    <Text style={styles.sectionTitle}>
                      {type === "instructor" ? "インストラクター" : "サポート"}（{ids.length}枚）
                    </Text>
                    <View style={styles.grid}>
                      {ids.map((id, i) => (
                        <CardFace
                          key={`${id}-${i}`}
                          cardId={id}
                          size="md"
                          onPress={() => setDetailCardId(id)}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {/* このデッキの共有コード（構築画面と同じもの） */}
            <Pressable
              style={styles.viewShareButton}
              onPress={async () => {
                const code = encodeDeck(viewing.name, viewing.list);
                try {
                  await navigator.clipboard.writeText(code);
                  setViewShareMsg("共有コードをコピーしました！LINEなどで送ってください。");
                } catch {
                  setViewShareMsg(code);
                }
              }}
            >
              <Text style={styles.viewShareButtonText}>🔗 共有コードをコピー</Text>
            </Pressable>
            {viewShareMsg && (
              <Text style={styles.viewShareMsg} selectable>
                {viewShareMsg}
              </Text>
            )}
            <Pressable style={styles.closeButton} onPress={() => { setViewing(null); setViewShareMsg(null); }}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {deleting && (
        <Pressable style={styles.overlayBg} onPress={() => setDeleting(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>「{deleting.name}」を削除しますか？</Text>
            <Pressable
              style={[styles.confirmButton, { backgroundColor: colors.danger }]}
              onPress={() => {
                deleteDeck(deleting.id);
                setDeleting(null);
              }}
            >
              <Text style={styles.closeText}>削除する</Text>
            </Pressable>
            <Pressable style={styles.closeButton} onPress={() => setDeleting(null)}>
              <Text style={styles.closeText}>キャンセル</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

      {/* カード詳細はデッキ一覧より上に重ねる */}
      {detailCardId && (
        <Pressable style={styles.overlayBg} onPress={() => setDetailCardId(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <Text style={styles.overlayTitle}>{getCard(detailCardId).name}</Text>
            <CardDetail cardId={detailCardId} />
            <Pressable style={styles.closeButton} onPress={() => setDetailCardId(null)}>
              <Text style={styles.closeText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}
    </ScreenEnter>
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
  importBox: { gap: 8, marginTop: 6 },
  importTitle: { fontSize: 14, fontWeight: "900", color: colors.text },
  importInput: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  importMsg: { fontSize: 13, fontWeight: "700", color: colors.primaryDark },
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { color: colors.textMuted, fontSize: 12 },
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
  deckSummary: { color: colors.textMuted, fontSize: 12 },
  deckActions: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
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
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  overlayBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    width: "100%",
    maxWidth: 460,
    maxHeight: "88%",
    gap: 10,
    alignItems: "center",
  },
  overlayTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
  deckScroll: { alignSelf: "stretch" },
  deckScrollContent: { gap: 6, paddingBottom: 4 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.primaryDark,
    marginTop: 10,
    marginBottom: 6,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 6 , justifyContent: "center" },
  viewShareButton: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  viewShareButtonText: { color: colors.primary, fontWeight: "800", fontSize: 14 },
  viewShareMsg: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  closeButton: {
    backgroundColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  confirmButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignSelf: "stretch",
    alignItems: "center",
  },
  closeText: { color: "#fff", fontWeight: "700" },
});

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
import { CardDetail } from "@/components/CardDetail";
import { CardFace } from "@/components/CardFace";
import { allCards, cardRegistry } from "@/data/cards";
import { encodeDeck } from "@/data/deckCode";
import { registryForUnlocked } from "@/data/unlock";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { randomDeckList, validateDeck } from "@/engine/deckRules";
import {
  allDecks,
  isBuiltinDeck,
  useDeckStore,
} from "@/store/deckStore";
import { colors } from "@/theme";
import { ScreenEnter } from "@/components/ScreenEnter";

export default function DeckEditScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const { customDecks, builtinOverrides, saveDeck, resetBuiltin } = useDeckStore();
  const existing = allDecks(customDecks, builtinOverrides).find((d) => d.id === deckId);
  const builtin = isBuiltinDeck(deckId ?? "");

  const unlockState = useUnlockStore();
  const unlocked = unlockedSet(unlockState);
  const [name, setName] = useState(existing?.name ?? "マイデッキ");
  const [main, setMain] = useState<string[]>(existing?.list.main ?? []);
  const [tantou, setTantou] = useState<string>(existing?.list.tantou ?? "t_kuji");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [mainFilter, setMainFilter] = useState<"all" | "instructor" | "support" | "inDeck">(
    "all"
  );
  const [sortKey, setSortKey] = useState<"default" | "name" | "combat" | "lesson">("default");
  const [query, setQuery] = useState("");
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const errors = useMemo(
    () => validateDeck(cardRegistry, { main, tantou }),
    [main, tantou]
  );

  const toggle = (cardId: string) => {
    setMain((cur) =>
      cur.includes(cardId) ? cur.filter((id) => id !== cardId) : [...cur, cardId]
    );
  };

  /** ルールを満たすデッキをランダムに組み直す */
  const randomize = () => {
    const seed =
      typeof globalThis.crypto?.getRandomValues === "function"
        ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] | 0
        : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
    // ランダム生成は開放済みのカードだけから選ぶ
    const { deck } = randomDeckList(registryForUnlocked(unlocked), seed, {
      size: Math.max(21, main.length),
    });
    setMain(deck.main);
    setTantou(deck.tantou);
  };

  const resetToDefault = () => {
    if (!deckId) return;
    resetBuiltin(deckId);
    router.back();
  };

  const save = () => {
    if (!deckId || errors.length > 0) return;
    saveDeck({ id: deckId, name: name.trim() || "マイデッキ", list: { main, tantou } });
    router.back();
  };

  // 開放されていないカードはデッキに入れられない（すでに入っている分は表示される）
  const mainCards = allCards.filter(
    (c) => c.type !== "tantou" && (unlocked.has(c.id) || main.includes(c.id))
  );
  const tantouCards = allCards.filter(
    (c) => c.type === "tantou" && (unlocked.has(c.id) || tantou === c.id)
  );
  const supportCount = main.filter((id) => cardRegistry[id].type === "support").length;
  const supportMax = cardRegistry[tantou]?.supportLimit ?? 5;

  return (
    <ScreenEnter style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <TextInput
          value={name}
          onChangeText={setName}
          style={styles.nameInput}
          placeholder="デッキ名"
          maxLength={20}
          editable={!builtin}
        />

        <View style={styles.toolRow}>
          <Pressable style={styles.toolButton} onPress={randomize}>
            <Text style={styles.toolButtonText}>🎲 ランダムに入れ替える</Text>
          </Pressable>
          {builtin && (
            <Pressable
              style={[styles.toolButton, { backgroundColor: colors.cancel }]}
              onPress={resetToDefault}
            >
              <Text style={styles.toolButtonText}>最初の構成に戻す</Text>
            </Pressable>
          )}
        </View>

        {/* デッキ内訳を色分きバーで見せる */}
        <View style={styles.breakdownBox}>
          <View style={styles.breakdownBar}>
            <View
              style={[
                styles.breakdownSeg,
                {
                  flex: Math.max(main.length - supportCount, 0.0001),
                  backgroundColor: colors.instructor,
                },
              ]}
            />
            <View
              style={[
                styles.breakdownSeg,
                { flex: Math.max(supportCount, 0.0001), backgroundColor: colors.support },
              ]}
            />
          </View>
          <Text style={styles.counter}>
            合計 {main.length}枚（20枚以上）｜
            <Text style={{ color: colors.instructor, fontWeight: "800" }}>
              インストラクター {main.length - supportCount}
            </Text>
            ｜
            <Text style={{ color: colors.support, fontWeight: "800" }}>
              サポート {supportCount}/{supportMax}
            </Text>
          </Text>
        </View>
        {errors.map((e) => (
          <Text key={e} style={styles.error}>
            ⚠️ {e}
          </Text>
        ))}

        <Text style={styles.sectionTitle}>担当カード（1枚・タップで詳細）</Text>
        <View style={styles.grid}>
          {tantouCards.map((c) => (
            <View key={c.id} style={tantou === c.id ? styles.selected : undefined}>
              <CardFace cardId={c.id} size="md" dimmed={tantou !== c.id} onPress={() => setDetailId(c.id)} />
            </View>
          ))}
        </View>

        {/* 共有コード（このデッキを友達に渡せる） */}
        <Pressable
          style={styles.shareButton}
          onPress={async () => {
            const code = encodeDeck(name, { main, tantou });
            try {
              await navigator.clipboard.writeText(code);
              setShareMsg("共有コードをコピーしました！LINEなどで送ってください。");
            } catch {
              setShareMsg(code);
            }
          }}
        >
          <Text style={styles.shareButtonText}>🔗 共有コードをコピー</Text>
        </Pressable>
        {shareMsg && (
          <Text style={styles.shareMsg} selectable>
            {shareMsg}
          </Text>
        )}

        <Text style={styles.sectionTitle}>メインデッキ（タップで詳細・追加/除外）</Text>
        {/* 一覧の絞り込み */}
        <View style={styles.filterRow}>
          {(
            [
              { key: "all", label: "すべて" },
              { key: "instructor", label: "インストラクター" },
              { key: "support", label: "サポート" },
              { key: "inDeck", label: "デッキ内" },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, mainFilter === f.key && styles.filterChipActive]}
              onPress={() => setMainFilter(f.key)}
            >
              <Text
                style={[styles.filterText, mainFilter === f.key && styles.filterTextActive]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.filterRow}>
          {(
            [
              { key: "default", label: "標準" },
              { key: "name", label: "名前順" },
              { key: "combat", label: "戦闘力順" },
              { key: "lesson", label: "教習力順" },
            ] as const
          ).map((f) => (
            <Pressable
              key={f.key}
              style={[styles.filterChip, sortKey === f.key && styles.filterChipActive]}
              onPress={() => setSortKey(f.key)}
            >
              <Text style={[styles.filterText, sortKey === f.key && styles.filterTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="🔍 名前で検索"
          autoCorrect={false}
        />
        <View style={styles.grid}>
          {mainCards
            .filter((c) =>
              mainFilter === "all"
                ? true
                : mainFilter === "inDeck"
                  ? main.includes(c.id)
                  : c.type === mainFilter
            )
            .filter((c) => (query.trim() ? c.name.includes(query.trim()) : true))
            .sort((a, b) => {
              if (sortKey === "name") return a.name.localeCompare(b.name, "ja");
              if (sortKey === "combat")
                return (b.type === "instructor" ? (b.combat ?? -1) : -1) - (a.type === "instructor" ? (a.combat ?? -1) : -1);
              if (sortKey === "lesson")
                return (b.type === "instructor" ? (b.lesson ?? -1) : -1) - (a.type === "instructor" ? (a.lesson ?? -1) : -1);
              return 0;
            })
            .map((c) => {
              const inDeck = main.includes(c.id);
              return (
                <View key={c.id} style={inDeck ? styles.selected : undefined}>
                  <CardFace cardId={c.id} size="md" dimmed={!inDeck} onPress={() => setDetailId(c.id)} />
                </View>
              );
            })}
        </View>
      </ScrollView>

      {detailId && (
        <Pressable style={styles.overlayBg} onPress={() => setDetailId(null)}>
          <Pressable style={styles.overlayBox} onPress={() => {}}>
            <CardDetail cardId={detailId} />
            {cardRegistry[detailId].type === "tantou" ? (
              <Pressable
                style={[styles.overlayButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setTantou(detailId);
                  setDetailId(null);
                }}
              >
                <Text style={styles.overlayButtonText}>
                  {tantou === detailId ? "担当カードに設定済み" : "担当カードにする"}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.overlayButton,
                  { backgroundColor: main.includes(detailId) ? colors.danger : colors.primary },
                ]}
                onPress={() => {
                  toggle(detailId);
                  setDetailId(null);
                }}
              >
                <Text style={styles.overlayButtonText}>
                  {main.includes(detailId) ? "デッキから外す" : "デッキに入れる"}
                </Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.overlayButton, { backgroundColor: colors.cancel }]}
              onPress={() => setDetailId(null)}
            >
              <Text style={styles.overlayButtonText}>閉じる</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      )}

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
    </ScreenEnter>
  );
}

const styles = StyleSheet.create({
  shareButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 6,
  },
  shareButtonText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  shareMsg: { fontSize: 12, color: colors.textMuted },
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
  toolRow: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  toolButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  toolButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  counter: { fontWeight: "700", color: colors.text, fontSize: 12 },
  breakdownBox: { marginTop: 10, gap: 5 },
  breakdownBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: colors.border,
  },
  breakdownSeg: { height: "100%" },
  filterRow: { flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" },
  searchInput: {
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.surface,
    marginTop: 6,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: "800", color: colors.text },
  filterTextActive: { color: "#fff" },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 , justifyContent: "center" },
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
  overlayBg: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#00000088",
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
    gap: 10,
    alignItems: "center",
  },
  overlayButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    alignSelf: "stretch",
  },
  overlayButtonText: { color: "#fff", fontWeight: "700" },
});

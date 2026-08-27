import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cardRegistry, cpuDeck, defaultDeck } from "@/data/cards";
import { registryForUnlocked } from "@/data/unlock";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { DeckList, randomDeckList, validateDeck } from "@/engine/deckRules";

export interface SavedDeck {
  id: string;
  name: string;
  list: DeckList;
}

export const DEFAULT_DECK_ID = "default";
export const CHALLENGER_DECK_ID = "challenger";

/** 初期構成（「最初の構成に戻す」で使う） */
export const builtinDefaults: SavedDeck[] = [
  { id: DEFAULT_DECK_ID, name: "スタンダードデッキ", list: defaultDeck },
  { id: CHALLENGER_DECK_ID, name: "チャレンジャーデッキ", list: cpuDeck },
];

export function isBuiltinDeck(id: string): boolean {
  return builtinDefaults.some((d) => d.id === id);
}

interface DeckState {
  customDecks: SavedDeck[];
  /** 組み込みデッキを編集したときの上書き内容 */
  builtinOverrides: Record<string, DeckList>;
  activeDeckId: string;
  setActiveDeck: (id: string) => void;
  saveDeck: (deck: SavedDeck) => void;
  deleteDeck: (id: string) => void;
  /** 組み込みデッキを初期構成に戻す */
  resetBuiltin: (id: string) => void;
  /** 組み込みデッキをルールを満たすランダム構成に組み直す */
  randomizeBuiltin: (id: string) => void;
}

export const useDeckStore = create<DeckState>()(
  persist(
    (set) => ({
      customDecks: [],
      builtinOverrides: {},
      activeDeckId: DEFAULT_DECK_ID,
      setActiveDeck: (activeDeckId) => set({ activeDeckId }),
      saveDeck: (deck) =>
        set((s) =>
          isBuiltinDeck(deck.id)
            ? { builtinOverrides: { ...s.builtinOverrides, [deck.id]: deck.list } }
            : { customDecks: [...s.customDecks.filter((d) => d.id !== deck.id), deck] }
        ),
      deleteDeck: (id) =>
        set((s) => ({
          customDecks: s.customDecks.filter((d) => d.id !== id),
          activeDeckId: s.activeDeckId === id ? DEFAULT_DECK_ID : s.activeDeckId,
        })),
      resetBuiltin: (id) =>
        set((s) => {
          const next = { ...s.builtinOverrides };
          delete next[id];
          return { builtinOverrides: next };
        }),
      randomizeBuiltin: (id) =>
        set((s) => {
          const seed =
            typeof globalThis.crypto?.getRandomValues === "function"
              ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] | 0
              : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
          // 入れ替えも開放済みのカードだけから選ぶ
          const { deck } = randomDeckList(
            registryForUnlocked(unlockedSet(useUnlockStore.getState())),
            seed
          );
          return { builtinOverrides: { ...s.builtinOverrides, [id]: deck } };
        }),
    }),
    {
      name: "kds-decks",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted) => {
        const s = persisted as Partial<DeckState>;
        if (!s.builtinOverrides) s.builtinOverrides = {};
        return s as DeckState;
      },
    }
  )
);

/** 組み込みデッキ（編集済みなら編集後の内容） */
export function builtinDecks(overrides: Record<string, DeckList>): SavedDeck[] {
  return builtinDefaults.map((d) => ({ ...d, list: overrides[d.id] ?? d.list }));
}

export function allDecks(
  customDecks: SavedDeck[],
  overrides: Record<string, DeckList> = {}
): SavedDeck[] {
  return [...builtinDecks(overrides), ...customDecks];
}

/** 対戦に使うデッキ。保存済みでも念のため検証し、不正ならデフォルトに戻す */
export function resolveActiveDeck(state: DeckState): SavedDeck {
  const decks = allDecks(state.customDecks, state.builtinOverrides);
  const fallback = decks[0];
  const deck = decks.find((d) => d.id === state.activeDeckId) ?? fallback;
  return validateDeck(cardRegistry, deck.list).length === 0 ? deck : fallback;
}

/**
 * CPUが使うデッキ。プレイヤーと同じ内容にならないよう、
 * チャレンジャーデッキを選んだときはCPUがスタンダードデッキを使う。
 */
/**
 * 「対戦するごとに入れ替える」設定を適用する。
 * その対戦に実際に登場するデッキだけを組み直す。
 * （使わないデッキまで書き換えると、デッキ構築での編集内容が
 * 知らないうちに消えてしまうため）
 */
export function randomizeDecksForMatch(
  randomizeStandard: boolean,
  randomizeChallenger: boolean
): void {
  const s = useDeckStore.getState();
  const player = resolveActiveDeck(s);
  const cpuId = player.id === CHALLENGER_DECK_ID ? DEFAULT_DECK_ID : CHALLENGER_DECK_ID;
  const used = new Set([player.id, cpuId]);
  if (used.has(DEFAULT_DECK_ID) && randomizeStandard) s.randomizeBuiltin(DEFAULT_DECK_ID);
  if (used.has(CHALLENGER_DECK_ID) && randomizeChallenger) {
    s.randomizeBuiltin(CHALLENGER_DECK_ID);
  }
}

export function cpuDeckFor(
  playerDeck: SavedDeck,
  overrides: Record<string, DeckList> = {}
): SavedDeck {
  const [standard, challenger] = builtinDecks(overrides);
  return playerDeck.id === CHALLENGER_DECK_ID ? standard : challenger;
}

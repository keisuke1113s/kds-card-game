import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cardRegistry, defaultDeck } from "@/data/cards";
import { DeckList, validateDeck } from "@/engine/deckRules";

export interface SavedDeck {
  id: string;
  name: string;
  list: DeckList;
}

export const DEFAULT_DECK_ID = "default";

export const builtinDeck: SavedDeck = {
  id: DEFAULT_DECK_ID,
  name: "スタンダードデッキ",
  list: defaultDeck,
};

interface DeckState {
  customDecks: SavedDeck[];
  activeDeckId: string;
  setActiveDeck: (id: string) => void;
  saveDeck: (deck: SavedDeck) => void;
  deleteDeck: (id: string) => void;
}

export const useDeckStore = create<DeckState>()(
  persist(
    (set) => ({
      customDecks: [],
      activeDeckId: DEFAULT_DECK_ID,
      setActiveDeck: (activeDeckId) => set({ activeDeckId }),
      saveDeck: (deck) =>
        set((s) => ({
          customDecks: [...s.customDecks.filter((d) => d.id !== deck.id), deck],
        })),
      deleteDeck: (id) =>
        set((s) => ({
          customDecks: s.customDecks.filter((d) => d.id !== id),
          activeDeckId: s.activeDeckId === id ? DEFAULT_DECK_ID : s.activeDeckId,
        })),
    }),
    {
      name: "kds-decks",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

export function allDecks(customDecks: SavedDeck[]): SavedDeck[] {
  return [builtinDeck, ...customDecks];
}

/** 対戦に使うデッキ。保存済みでも念のため検証し、不正ならデフォルトに戻す */
export function resolveActiveDeck(state: DeckState): SavedDeck {
  const deck =
    allDecks(state.customDecks).find((d) => d.id === state.activeDeckId) ?? builtinDeck;
  return validateDeck(cardRegistry, deck.list).length === 0 ? deck : builtinDeck;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { cardRegistry } from "@/data/cards";
import { ALL_CARDS_OPEN_FOR_TESTING, DEFAULT_OPEN_CARDS } from "@/data/unlock";
import { allCards } from "@/data/cards";
import { randomDeckList } from "@/engine/deckRules";
import { builtinDefaults, useDeckStore } from "@/store/deckStore";

/**
 * カードの開放状態（端末ごとに保存）。
 *
 * - initialSet: 初回起動時にランダムに配られる22枚（デッキ1つ分）。
 *   スタンダード／チャレンジャーデッキの中身もこの22枚になる
 * - scannedIds: QRコードの読み込みで開放したカード
 * - issued: 管理画面で発行した新規カードQRの記録（管理者のブラウザにだけ残る）
 */
interface UnlockState {
  initialSet: string[] | null;
  scannedIds: string[];
  /** QRで開放した日時（図鑑のNEWバッジ用。id→ISO日時） */
  scannedLog: Record<string, string>;
  issued: { id: string; name: string; at: string }[];
  /** テスト用: true の間は全カードが登録済みになる（設定画面で切り替え） */
  allOpenMode: boolean;
  /** 図鑑コンプリートのお祝いを表示済みか */
  celebratedComplete: boolean;
  setCelebratedComplete: () => void;
  unlock: (cardId: string) => void;
  setInitialSet: (ids: string[]) => void;
  setAllOpenMode: (v: boolean) => void;
  addIssued: (entry: { id: string; name: string; at: string }) => void;
  /** 管理画面用: QRで開放したカードをすべて未開放に戻す（動作確認用） */
  resetScanned: () => void;
  /** 動作確認用: 初回配布からやり直す（開放状態をすべて消す） */
  resetAll: () => void;
}

export const useUnlockStore = create<UnlockState>()(
  persist(
    (set) => ({
      initialSet: null,
      scannedIds: [],
      scannedLog: {},
      issued: [],
      allOpenMode: ALL_CARDS_OPEN_FOR_TESTING,
      celebratedComplete: false,
      setCelebratedComplete: () => set({ celebratedComplete: true }),
      unlock: (cardId) =>
        set((s) =>
          s.scannedIds.includes(cardId)
            ? s
            : {
                scannedIds: [...s.scannedIds, cardId],
                scannedLog: { ...s.scannedLog, [cardId]: new Date().toISOString() },
              }
        ),
      setInitialSet: (initialSet) => set({ initialSet }),
      setAllOpenMode: (allOpenMode) => set({ allOpenMode }),
      addIssued: (entry) =>
        set((s) =>
          s.issued.some((e) => e.id === entry.id) ? s : { issued: [...s.issued, entry] }
        ),
      resetScanned: () => set({ scannedIds: [], scannedLog: {} }),
      resetAll: () => set({ initialSet: null, scannedIds: [], scannedLog: {} }),
    }),
    {
      name: "kds-unlocks",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // 旧仕様（openOverride）からの移行。initialSet は次回起動時に配られる
      migrate: (persisted) => {
        const s = persisted as Partial<UnlockState> & { openOverride?: unknown };
        return {
          initialSet: s.initialSet ?? null,
          scannedIds: s.scannedIds ?? [],
          scannedLog: s.scannedLog ?? {},
          issued: s.issued ?? [],
          allOpenMode: s.allOpenMode ?? ALL_CARDS_OPEN_FOR_TESTING,
          celebratedComplete: s.celebratedComplete ?? false,
        } as UnlockState;
      },
    }
  )
);

/** いま使えるカードIDの集合（初回セットが未生成の間は標準セットで代用） */
export function unlockedSet(
  state: Pick<UnlockState, "initialSet" | "scannedIds" | "allOpenMode">
): Set<string> {
  // 全カード登録モード（テスト用。設定画面で通常配布と切り替えられる）
  if (state.allOpenMode) return new Set(allCards.map((c) => c.id));
  return new Set([...(state.initialSet ?? DEFAULT_OPEN_CARDS), ...state.scannedIds]);
}

/**
 * 初回起動時のセットアップ。
 * ルールを満たすデッキを1つランダムに作り、その22枚（メイン21＋担当1）を
 * この端末の初期開放セットにして、スタンダード／チャレンジャーデッキの
 * 中身も同じ22枚にする。2回目以降の起動では何もしない。
 */
export function ensureInitialSet(): void {
  // 保存済みデータの読み込みが終わる前に実行すると、毎回新しいセットを
  // 配り直してしまうため、両ストアの読み込み完了を待ってから判定する
  if (!useUnlockStore.persist.hasHydrated()) {
    useUnlockStore.persist.onFinishHydration(() => ensureInitialSet());
    return;
  }
  if (!useDeckStore.persist.hasHydrated()) {
    useDeckStore.persist.onFinishHydration(() => ensureInitialSet());
    return;
  }
  const st = useUnlockStore.getState();
  // 全カード登録モードの間は配布もデッキの差し替えも行わない
  if (st.allOpenMode) return;
  if (st.initialSet !== null) return;
  const seed =
    typeof globalThis.crypto?.getRandomValues === "function"
      ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0] | 0
      : (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
  const { deck } = randomDeckList(cardRegistry, seed);
  st.setInitialSet([...deck.main, deck.tantou]);
  // 内蔵2デッキをこの22枚に置き換える（名前は元のまま）
  const deckStore = useDeckStore.getState();
  for (const builtin of builtinDefaults) {
    deckStore.saveDeck({ id: builtin.id, name: builtin.name, list: deck });
  }
}

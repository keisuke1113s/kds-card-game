import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DEFAULT_OPEN_CARDS } from "@/data/unlock";

/**
 * カードの開放状態（端末ごとに保存）。
 *
 * - openOverride: 管理画面で設定した「配布時に開くカード」。null なら標準セット
 * - scannedIds: QRコードの読み込みで開放したカード
 */
interface UnlockState {
  scannedIds: string[];
  openOverride: string[] | null;
  unlock: (cardId: string) => void;
  /** 管理画面用: 配布時開示セットをこの端末で上書きする */
  setOpenOverride: (ids: string[] | null) => void;
  /** 管理画面用: QRで開放したカードをすべて未開放に戻す（動作確認用） */
  resetScanned: () => void;
}

export const useUnlockStore = create<UnlockState>()(
  persist(
    (set) => ({
      scannedIds: [],
      openOverride: null,
      unlock: (cardId) =>
        set((s) =>
          s.scannedIds.includes(cardId) ? s : { scannedIds: [...s.scannedIds, cardId] }
        ),
      setOpenOverride: (openOverride) => set({ openOverride }),
      resetScanned: () => set({ scannedIds: [] }),
    }),
    { name: "kds-unlocks", storage: createJSONStorage(() => AsyncStorage) }
  )
);

/** いま使えるカードIDの集合 */
export function unlockedSet(state: Pick<UnlockState, "scannedIds" | "openOverride">): Set<string> {
  return new Set([...(state.openOverride ?? DEFAULT_OPEN_CARDS), ...state.scannedIds]);
}

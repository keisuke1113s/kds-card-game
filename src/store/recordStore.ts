import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 対戦成績。端末に保存され、アプリを閉じても消えない。
 * 決着した対局だけを数える（途中で「対戦をやめる」は数えない）。
 */
interface RecordState {
  wins: number;
  losses: number;
  /** いまの連勝数（負けると0に戻る） */
  streak: number;
  addWin: () => void;
  addLoss: () => void;
  reset: () => void;
}

export const useRecordStore = create<RecordState>()(
  persist(
    (set) => ({
      wins: 0,
      losses: 0,
      streak: 0,
      addWin: () => set((s) => ({ wins: s.wins + 1, streak: s.streak + 1 })),
      addLoss: () => set((s) => ({ losses: s.losses + 1, streak: 0 })),
      reset: () => set({ wins: 0, losses: 0, streak: 0 }),
    }),
    {
      name: "kds-record",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

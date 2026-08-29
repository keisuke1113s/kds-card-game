import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 危険予測トレーニング（KYT）の記録 */
interface KytState {
  plays: number;
  /** 一度でも1回の挑戦（5問）を全問正解したか（実績用） */
  cleared: boolean;
  best: number;
  /** 正解したことのある場面ID（全場面制覇の判定用） */
  masteredIds: string[];
  addResult: (correct: number, total: number) => void;
  markMastered: (ids: string[]) => void;
}

export const useKytStore = create<KytState>()(
  persist(
    (set) => ({
      plays: 0,
      cleared: false,
      best: 0,
      masteredIds: [],
      addResult: (correct, total) =>
        set((s) => ({
          plays: s.plays + 1,
          cleared: s.cleared || correct >= total,
          best: Math.max(s.best, correct),
        })),
      markMastered: (ids) =>
        set((s) => ({
          masteredIds: Array.from(new Set([...s.masteredIds, ...ids])),
        })),
    }),
    { name: "kds-kyt", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

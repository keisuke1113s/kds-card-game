import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 危険予測トレーニング（KYT）の記録 */
interface KytState {
  plays: number;
  /** 一度でも全問正解でクリアしたか（実績用） */
  cleared: boolean;
  best: number;
  addResult: (correct: number, total: number) => void;
}

export const useKytStore = create<KytState>()(
  persist(
    (set) => ({
      plays: 0,
      cleared: false,
      best: 0,
      addResult: (correct, total) =>
        set((s) => ({
          plays: s.plays + 1,
          cleared: s.cleared || correct >= total,
          best: Math.max(s.best, correct),
        })),
    }),
    { name: "kds-kyt", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

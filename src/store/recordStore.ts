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
  /**
   * 今回の連戦の成績。「もう一度遊ぶ」で続けている間だけ数え、
   * 新しくCPU対戦を始めるとリセットされる（端末には保存しない）
   */
  sessionWins: number;
  sessionLosses: number;
  addWin: () => void;
  addLoss: () => void;
  resetSession: () => void;
  reset: () => void;
}

export const useRecordStore = create<RecordState>()(
  persist(
    (set) => ({
      wins: 0,
      losses: 0,
      streak: 0,
      sessionWins: 0,
      sessionLosses: 0,
      addWin: () =>
        set((s) => ({
          wins: s.wins + 1,
          streak: s.streak + 1,
          sessionWins: s.sessionWins + 1,
        })),
      addLoss: () =>
        set((s) => ({
          losses: s.losses + 1,
          streak: 0,
          sessionLosses: s.sessionLosses + 1,
        })),
      resetSession: () => set({ sessionWins: 0, sessionLosses: 0 }),
      reset: () => set({ wins: 0, losses: 0, streak: 0, sessionWins: 0, sessionLosses: 0 }),
    }),
    {
      name: "kds-record",
      storage: createJSONStorage(() => AsyncStorage),
      // 連戦の成績は保存しない（アプリを開き直したら新しい連戦）
      partialize: (s) => ({ wins: s.wins, losses: s.losses, streak: s.streak }),
    }
  )
);

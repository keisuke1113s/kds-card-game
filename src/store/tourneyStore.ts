import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** オンライントーナメントの記録と、参加中かどうかの目印 */
interface TourneyState {
  /** オンライントーナメントの優勝回数（実績「オンライン王者」の判定に使う） */
  wins: number;
  addWin: () => void;
  /** いまトーナメントの一環として対戦しているか（結果画面の戻るボタン用。保存しない） */
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useTourneyStore = create<TourneyState>()(
  persist(
    (set, get) => ({
      wins: 0,
      addWin: () => set({ wins: get().wins + 1 }),
      active: false,
      setActive: (active) => set({ active }),
    }),
    {
      name: "kds-tourney",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ wins: s.wins }),
    }
  )
);

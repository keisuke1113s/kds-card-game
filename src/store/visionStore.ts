import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 動体視力チェック（ランドルト環）の記録 */
interface VisionState {
  plays: number;
  best: number;
  addResult: (score: number) => void;
}

export const useVisionStore = create<VisionState>()(
  persist(
    (set) => ({
      plays: 0,
      best: 0,
      addResult: (score) =>
        set((s) => ({ plays: s.plays + 1, best: Math.max(s.best, score) })),
    }),
    { name: "kds-vision", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

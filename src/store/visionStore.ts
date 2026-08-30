import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 動体視力チェック（4種目）の記録 */
interface VisionState {
  plays: number;
  /** 動体視力（ランドルト環）の最高スコア */
  best: number;
  /** 反応速度の自己ベスト（平均秒。小さいほど良い。未計測はnull） */
  bestReaction: number | null;
  /** 周辺視野の最高スコア（8点満点） */
  bestPeriph: number;
  /** 選択反応の最高スコア（12点満点） */
  bestChoice: number;
  addResult: (score: number) => void;
  addReaction: (avgSec: number) => void;
  addPeriph: (score: number) => void;
  addChoice: (score: number) => void;
}

export const useVisionStore = create<VisionState>()(
  persist(
    (set) => ({
      plays: 0,
      best: 0,
      bestReaction: null,
      bestPeriph: 0,
      bestChoice: 0,
      addResult: (score) =>
        set((s) => ({ plays: s.plays + 1, best: Math.max(s.best, score) })),
      addReaction: (avgSec) =>
        set((s) => ({
          plays: s.plays + 1,
          bestReaction: s.bestReaction === null ? avgSec : Math.min(s.bestReaction, avgSec),
        })),
      addPeriph: (score) =>
        set((s) => ({ plays: s.plays + 1, bestPeriph: Math.max(s.bestPeriph, score) })),
      addChoice: (score) =>
        set((s) => ({ plays: s.plays + 1, bestChoice: Math.max(s.bestChoice, score) })),
    }),
    { name: "kds-vision", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

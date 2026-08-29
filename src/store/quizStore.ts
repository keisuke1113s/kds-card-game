import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 学科クイズの成績（端末ごとに保存。実績の判定に使う） */
interface QuizState {
  plays: number;
  bestScore: number;
  perfects: number;
  /** 分野別の最高点（"all" 含む） */
  bests: Record<string, number>;
  addResult: (score: number, total: number, category: string) => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      plays: 0,
      bestScore: 0,
      perfects: 0,
      bests: {},
      addResult: (score, total, category) =>
        set((s) => ({
          plays: s.plays + 1,
          bestScore: Math.max(s.bestScore, score),
          perfects: s.perfects + (score >= total ? 1 : 0),
          bests: { ...s.bests, [category]: Math.max(s.bests[category] ?? 0, score) },
        })),
    }),
    { name: "kds-quiz", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

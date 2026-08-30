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
  /** 効果測定（50問・90点合格）の記録 */
  kenteiPlays: number;
  kenteiPassed: number;
  kenteiBest: number;
  /** 今日の1問（ホームの豆知識から）の挑戦記録 */
  dailyDate: string;
  dailyCorrect: boolean;
  /** 弱点ノート: 間違えた問題（id → 間違い回数・最終日時・その後の連続正解数） */
  wrong: Record<string, { count: number; at: string; streak: number }>;
  /** 分野別の通算成績（正答率表示用） */
  catStats: Record<string, { asked: number; correct: number }>;
  /** 解答1問ぶんを記録する。2回連続で正解した弱点問題はノートから卒業 */
  markAnswer: (id: string, cat: string, correct: boolean) => void;
  setDaily: (date: string, correct: boolean) => void;
  addResult: (score: number, total: number, category: string) => void;
  addKentei: (score: number, passed: boolean) => void;
}

export const useQuizStore = create<QuizState>()(
  persist(
    (set) => ({
      plays: 0,
      bestScore: 0,
      perfects: 0,
      bests: {},
      kenteiPlays: 0,
      kenteiPassed: 0,
      kenteiBest: 0,
      dailyDate: "",
      dailyCorrect: false,
      wrong: {},
      catStats: {},
      markAnswer: (id, cat, correct) =>
        set((s) => {
          const wrong = { ...s.wrong };
          const w = wrong[id];
          if (!correct) {
            wrong[id] = {
              count: (w?.count ?? 0) + 1,
              at: new Date().toISOString(),
              streak: 0,
            };
          } else if (w) {
            const streak = w.streak + 1;
            if (streak >= 2) delete wrong[id]; // 2回連続正解で卒業
            else wrong[id] = { ...w, streak };
          }
          const cs = { ...s.catStats };
          const c = (cs[cat] ??= { asked: 0, correct: 0 });
          cs[cat] = { asked: c.asked + 1, correct: c.correct + (correct ? 1 : 0) };
          return { wrong, catStats: cs };
        }),
      setDaily: (dailyDate, dailyCorrect) => set({ dailyDate, dailyCorrect }),
      addResult: (score, total, category) =>
        set((s) => ({
          plays: s.plays + 1,
          bestScore: Math.max(s.bestScore, score),
          perfects: s.perfects + (score >= total ? 1 : 0),
          bests: { ...s.bests, [category]: Math.max(s.bests[category] ?? 0, score) },
        })),
      addKentei: (score, passed) =>
        set((s) => ({
          kenteiPlays: s.kenteiPlays + 1,
          kenteiPassed: s.kenteiPassed + (passed ? 1 : 0),
          kenteiBest: Math.max(s.kenteiBest, score),
        })),
    }),
    { name: "kds-quiz", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

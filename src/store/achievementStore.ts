import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { ACHIEVEMENTS, AchievementDef } from "@/data/achievements";
import { allCards } from "@/data/cards";
import { useRecordStore } from "@/store/recordStore";
import { unlockedSet, useUnlockStore } from "@/store/unlockStore";
import { useQuizStore } from "@/store/quizStore";
import { useKytStore } from "@/store/kytStore";
import { useMissionStore } from "@/store/missionStore";
import { useTournamentStore } from "@/store/tournamentStore";

/**
 * 実績の達成状況と称号。
 * evaluateAchievements() を対戦終了時・カード開放時・起動時に呼ぶと、
 * 新しく達成した実績がトースト（全画面のお知らせ）キューに積まれる。
 */

interface AchievementState {
  /** 達成済み実績: id → 達成日(ISO) */
  earned: Record<string, string>;
  /** オンライン対戦で名乗る称号（達成した実績の称号から選ぶ） */
  selectedTitle: string | null;
  /** これから表示する達成のお知らせ（保存しない） */
  toastQueue: AchievementDef[];
  earn: (ids: string[]) => void;
  shiftToast: () => void;
  setSelectedTitle: (t: string | null) => void;
}

export const useAchievementStore = create<AchievementState>()(
  persist(
    (set) => ({
      earned: {},
      selectedTitle: null,
      toastQueue: [],
      earn: (ids) =>
        set((s) => {
          const fresh = ids.filter((id) => !s.earned[id]);
          if (fresh.length === 0) return s;
          const now = new Date().toISOString();
          const earned = { ...s.earned };
          for (const id of fresh) earned[id] = now;
          const defs = fresh
            .map((id) => ACHIEVEMENTS.find((a) => a.id === id))
            .filter((a): a is AchievementDef => !!a);
          return { earned, toastQueue: [...s.toastQueue, ...defs] };
        }),
      shiftToast: () => set((s) => ({ toastQueue: s.toastQueue.slice(1) })),
      setSelectedTitle: (selectedTitle) => set({ selectedTitle }),
    }),
    {
      name: "kds-achievements",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ earned: s.earned, selectedTitle: s.selectedTitle }),
    }
  )
);

/** いまの状況で達成できる実績をすべて判定し、新規達成をトーストに積む */
export function evaluateAchievements(): void {
  const rec = useRecordStore.getState();
  const unlock = useUnlockStore.getState();
  const input = {
    wins: rec.wins,
    losses: rec.losses,
    streak: rec.streak,
    history: rec.history,
    scannedCount: unlock.scannedIds.length,
    unlockedCount: Math.min(unlockedSet(unlock).size, allCards.length),
    totalCards: allCards.length,
    quizPlays: useQuizStore.getState().plays,
    quizPerfects: useQuizStore.getState().perfects,
    kenteiPassed: useQuizStore.getState().kenteiPassed,
    kytCleared: useKytStore.getState().cleared,
    totalInstructors: allCards.filter((c) => c.type === "instructor").length,
    dailyAllDone: useMissionStore.getState().everAllDone,
    tournamentWins: useTournamentStore.getState().champions,
  };
  const got: string[] = [];
  for (const a of ACHIEVEMENTS) {
    try {
      if (a.check(input)) got.push(a.id);
    } catch {
      // 1つの判定失敗で全体を止めない
    }
  }
  if (got.length > 0) useAchievementStore.getState().earn(got);
}

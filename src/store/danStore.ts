import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * 段位（対戦の腕前）。勝つと1点、負けると1点減る（0未満にはならない）。
 * 点数がしきい値に届くと昇段、下回ると降段する。
 * CPU対戦もオンライン対戦も同じように数える（自動プレイと記録の再生は除く）。
 */

export const DAN_STEPS: { name: string; at: number }[] = [
  { name: "10級", at: 0 },
  { name: "9級", at: 2 },
  { name: "8級", at: 4 },
  { name: "7級", at: 6 },
  { name: "6級", at: 8 },
  { name: "5級", at: 10 },
  { name: "4級", at: 13 },
  { name: "3級", at: 16 },
  { name: "2級", at: 19 },
  { name: "1級", at: 22 },
  { name: "初段", at: 26 },
  { name: "二段", at: 30 },
  { name: "三段", at: 35 },
  { name: "四段", at: 40 },
  { name: "五段", at: 45 },
  { name: "師範代", at: 50 },
  { name: "師範", at: 60 },
];

/** いまの点数の段位（DAN_STEPSの添字） */
export function danIndexOf(pts: number): number {
  let idx = 0;
  for (let i = 0; i < DAN_STEPS.length; i++) {
    if (pts >= DAN_STEPS[i].at) idx = i;
  }
  return idx;
}

export function danNameOf(pts: number): string {
  return DAN_STEPS[danIndexOf(pts)].name;
}

/** 次の段位（最高位なら null） */
export function nextDanOf(pts: number): { name: string; at: number } | null {
  const idx = danIndexOf(pts);
  return idx + 1 < DAN_STEPS.length ? DAN_STEPS[idx + 1] : null;
}

/** 勝てば昇段する点数か */
export function isPromotionMatch(pts: number): boolean {
  return danIndexOf(pts + 1) > danIndexOf(pts);
}

/** 負けると降段する点数か */
export function isDemotionMatch(pts: number): boolean {
  return pts > 0 && danIndexOf(pts - 1) < danIndexOf(pts);
}

interface DanStore {
  pts: number;
  /** 対戦結果を反映する（勝ち+1 / 負け-1、0未満にはしない） */
  addResult: (won: boolean) => void;
}

export const useDanStore = create<DanStore>()(
  persist(
    (set) => ({
      pts: 0,
      addResult: (won) => set((s) => ({ pts: Math.max(0, s.pts + (won ? 1 : -1)) })),
    }),
    {
      name: "kds-dan",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);

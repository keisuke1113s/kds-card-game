import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * デイリーミッション。
 * 日付ごとに3つのお題が決まり（日付から決定的に選ぶ）、
 * 対戦・クイズなどの結果を counters に集計して達成を判定する。
 */

export interface MissionDef {
  id: string;
  label: string;
  check: (c: DayCounters) => boolean;
  /** 進捗表示（達成数/必要数） */
  progress: (c: DayCounters) => [number, number];
}

export interface DayCounters {
  wins: number;
  matches: number;
  battleWins: number;
  quizBest: number;
  kyokanWins: number;
}

const EMPTY: DayCounters = { wins: 0, matches: 0, battleWins: 0, quizBest: 0, kyokanWins: 0 };

export const MISSION_POOL: MissionDef[] = [
  { id: "win1", label: "対戦で1回勝つ", check: (c) => c.wins >= 1, progress: (c) => [Math.min(1, c.wins), 1] },
  { id: "win2", label: "対戦で2回勝つ", check: (c) => c.wins >= 2, progress: (c) => [Math.min(2, c.wins), 2] },
  { id: "play3", label: "3回対戦する", check: (c) => c.matches >= 3, progress: (c) => [Math.min(3, c.matches), 3] },
  { id: "battleWin2", label: "バトルで2回勝つ", check: (c) => c.battleWins >= 2, progress: (c) => [Math.min(2, c.battleWins), 2] },
  { id: "quiz8", label: "学科クイズで8点以上をとる", check: (c) => c.quizBest >= 8, progress: (c) => [Math.min(8, c.quizBest), 8] },
  { id: "kyokan1", label: "インストラクターを1人倒す", check: (c) => c.kyokanWins >= 1, progress: (c) => [Math.min(1, c.kyokanWins), 1] },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 日付から決定的に3つ選ぶ（毎日同じ顔ぶれにならないように） */
export function missionsFor(date: string): MissionDef[] {
  let h = 0;
  for (let i = 0; i < date.length; i++) h = (h * 31 + date.charCodeAt(i)) | 0;
  const picked: MissionDef[] = [];
  const pool = [...MISSION_POOL];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.abs(h + i * 7919) % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

interface MissionState {
  date: string;
  counters: DayCounters;
  /** 全達成のお祝いを今日表示したか */
  celebrated: boolean;
  /** 一度でも全ミッションを達成したことがあるか（実績用） */
  everAllDone: boolean;
  report: (kind: "win" | "match" | "battleWin" | "kyokanWin" | "quizScore", value?: number) => void;
  setCelebrated: () => void;
}

export const useMissionStore = create<MissionState>()(
  persist(
    (set, get) => ({
      date: todayStr(),
      counters: { ...EMPTY },
      celebrated: false,
      everAllDone: false,
      report: (kind, value = 1) => {
        const today = todayStr();
        // 日付が変わっていたらリセット
        const base =
          get().date === today
            ? get().counters
            : { ...EMPTY };
        const c: DayCounters = { ...base };
        if (kind === "win") c.wins += 1;
        else if (kind === "match") c.matches += 1;
        else if (kind === "battleWin") c.battleWins += 1;
        else if (kind === "kyokanWin") c.kyokanWins += 1;
        else if (kind === "quizScore") c.quizBest = Math.max(c.quizBest, value);
        const allDone = missionsFor(today).every((m) => m.check(c));
        set({
          date: today,
          counters: c,
          celebrated: get().date === today ? get().celebrated : false,
          everAllDone: get().everAllDone || allDone,
        });
      },
      setCelebrated: () => set({ celebrated: true }),
    }),
    { name: "kds-missions", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

/** 今日のミッションと達成状況（表示用） */
export function todayMissions(): { def: MissionDef; done: boolean; progress: [number, number] }[] {
  const st = useMissionStore.getState();
  const today = todayStr();
  const c = st.date === today ? st.counters : { ...EMPTY };
  return missionsFor(today).map((def) => ({
    def,
    done: def.check(c),
    progress: def.progress(c),
  }));
}

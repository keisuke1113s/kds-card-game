import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** S字・クランクチャレンジの記録（ベストタイムは秒） */
interface CourseState {
  plays: number;
  bestS: number | null;
  bestCrank: number | null;
  addResult: (course: "s" | "crank", seconds: number) => void;
}

export const useCourseStore = create<CourseState>()(
  persist(
    (set) => ({
      plays: 0,
      bestS: null,
      bestCrank: null,
      addResult: (course, seconds) =>
        set((s) => ({
          plays: s.plays + 1,
          bestS: course === "s" ? Math.min(s.bestS ?? Infinity, seconds) : s.bestS,
          bestCrank: course === "crank" ? Math.min(s.bestCrank ?? Infinity, seconds) : s.bestCrank,
        })),
    }),
    { name: "kds-course", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

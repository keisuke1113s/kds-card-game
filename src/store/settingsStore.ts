import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Difficulty } from "@/ai/types";

interface SettingsState {
  difficulty: Difficulty;
  aiSpeedMs: number; // CPUの1手ごとの間隔
  setDifficulty: (d: Difficulty) => void;
  setAiSpeedMs: (ms: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: "normal",
      aiSpeedMs: 600,
      setDifficulty: (difficulty) => set({ difficulty }),
      setAiSpeedMs: (aiSpeedMs) => set({ aiSpeedMs }),
    }),
    {
      name: "kds-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

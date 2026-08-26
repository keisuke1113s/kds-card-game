import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Difficulty } from "@/ai/types";

interface SettingsState {
  difficulty: Difficulty;
  aiSpeedMs: number; // CPUの1手ごとの間隔
  seEnabled: boolean;
  bgmEnabled: boolean;
  setDifficulty: (d: Difficulty) => void;
  setAiSpeedMs: (ms: number) => void;
  setSeEnabled: (v: boolean) => void;
  setBgmEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: "normal",
      aiSpeedMs: 600,
      seEnabled: true,
      bgmEnabled: true,
      setDifficulty: (difficulty) => set({ difficulty }),
      setAiSpeedMs: (aiSpeedMs) => set({ aiSpeedMs }),
      setSeEnabled: (seEnabled) => set({ seEnabled }),
      setBgmEnabled: (bgmEnabled) => set({ bgmEnabled }),
    }),
    {
      name: "kds-settings",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

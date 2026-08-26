import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { Difficulty } from "@/ai/types";

interface SettingsState {
  difficulty: Difficulty;
  aiSpeedMs: number; // CPUの1手ごとの間隔
  seEnabled: boolean;
  bgmEnabled: boolean;
  hapticsEnabled: boolean;
  setDifficulty: (d: Difficulty) => void;
  setAiSpeedMs: (ms: number) => void;
  setSeEnabled: (v: boolean) => void;
  setBgmEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: "normal",
      aiSpeedMs: 1000,
      seEnabled: true,
      bgmEnabled: true,
      hapticsEnabled: true,
      setDifficulty: (difficulty) => set({ difficulty }),
      setAiSpeedMs: (aiSpeedMs) => set({ aiSpeedMs }),
      setSeEnabled: (seEnabled) => set({ seEnabled }),
      setBgmEnabled: (bgmEnabled) => set({ bgmEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: "kds-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted) => {
        // v1→v2: 実況表示に合わせてCPUの手の間隔の既定値を引き上げ
        const s = persisted as Partial<SettingsState>;
        if (!s.aiSpeedMs || s.aiSpeedMs < 700) s.aiSpeedMs = 1000;
        if (s.hapticsEnabled === undefined) s.hapticsEnabled = true;
        return s as SettingsState;
      },
    }
  )
);

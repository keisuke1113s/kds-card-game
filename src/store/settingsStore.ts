import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { CpuPersona } from "@/ai/difficulty";
import { Difficulty } from "@/ai/types";

interface SettingsState {
  difficulty: Difficulty;
  /** CPUの個性（バランス／こうげき型／まもり型） */
  cpuPersona: CpuPersona;
  aiSpeedMs: number; // CPUの1手ごとの間隔
  seEnabled: boolean;
  bgmEnabled: boolean;
  hapticsEnabled: boolean;
  /** 対戦するごとにスタンダードデッキをランダムに入れ替える */
  randomizeStandard: boolean;
  /** 対戦するごとにチャレンジャーデッキをランダムに入れ替える */
  randomizeChallenger: boolean;
  /** 初対戦のガイド（吹き出しナビ）を最後まで見たか */
  guideDone: boolean;
  /** 演出の量（full=たっぷり / normal=標準 / light=ひかえめ） */
  fxLevel: "full" | "normal" | "light";
  setFxLevel: (v: "full" | "normal" | "light") => void;
  /** 大きめ文字モード（効果文・実況・クイズの文字を1段階大きく） */
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  /** BGMの音量（0.25〜1） */
  bgmVolume: number;
  setBgmVolume: (v: number) => void;
  setDifficulty: (d: Difficulty) => void;
  setCpuPersona: (p: CpuPersona) => void;
  setAiSpeedMs: (ms: number) => void;
  setSeEnabled: (v: boolean) => void;
  /** 実況ボイス（「リーチ！」「決着！」などの音声） */
  voiceEnabled: boolean;
  setVoiceEnabled: (v: boolean) => void;
  setBgmEnabled: (v: boolean) => void;
  setHapticsEnabled: (v: boolean) => void;
  setRandomizeStandard: (v: boolean) => void;
  setRandomizeChallenger: (v: boolean) => void;
  setGuideDone: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      difficulty: "normal",
      cpuPersona: "balanced",
      aiSpeedMs: 1000,
      seEnabled: true,
      voiceEnabled: true,
      bgmEnabled: true,
      hapticsEnabled: true,
      randomizeStandard: false,
      randomizeChallenger: false,
      guideDone: false,
      fxLevel: "full",
      setFxLevel: (fxLevel) => set({ fxLevel }),
      largeText: false,
      setLargeText: (largeText) => set({ largeText }),
      bgmVolume: 1,
      setBgmVolume: (bgmVolume) => set({ bgmVolume }),
      setDifficulty: (difficulty) => set({ difficulty }),
      setCpuPersona: (cpuPersona) => set({ cpuPersona }),
      setAiSpeedMs: (aiSpeedMs) => set({ aiSpeedMs }),
      setSeEnabled: (seEnabled) => set({ seEnabled }),
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setBgmEnabled: (bgmEnabled) => set({ bgmEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setRandomizeStandard: (randomizeStandard) => set({ randomizeStandard }),
      setRandomizeChallenger: (randomizeChallenger) => set({ randomizeChallenger }),
      setGuideDone: (guideDone) => set({ guideDone }),
    }),
    {
      name: "kds-settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persisted) => {
        // v1→v2: 実況表示に合わせてCPUの手の間隔の既定値を引き上げ
        const s = persisted as Partial<SettingsState>;
        if (!s.aiSpeedMs || s.aiSpeedMs < 700) s.aiSpeedMs = 1000;
        if (s.hapticsEnabled === undefined) s.hapticsEnabled = true;
        // v2→v3: 演出の量が3択→ひかえめON/OFFになったため「標準」は「たっぷり」へ
        if (s.fxLevel === "normal") s.fxLevel = "full";
        return s as SettingsState;
      },
    }
  )
);

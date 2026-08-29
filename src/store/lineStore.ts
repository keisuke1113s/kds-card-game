import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";

/** LINE連携の状態（任意連携。連携するとオンライン対戦などが解放される） */
interface LineState {
  linked: boolean;
  linkedAt: string;
  setLinked: () => void;
  /** 検証用: 連携を解除する（設定画面の開発メニューから） */
  unlink: () => void;
}

export const useLineStore = create<LineState>()(
  persist(
    (set) => ({
      linked: false,
      linkedAt: "",
      setLinked: () => set({ linked: true, linkedAt: new Date().toISOString().slice(0, 10) }),
      unlink: () => set({ linked: false, linkedAt: "" }),
    }),
    { name: "kds-line", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

/** この機能はLINE連携が必要か（ゲート無効時は常にfalse） */
export function lineLockActive(): boolean {
  return LINE_GATE_ENABLED && !useLineStore.getState().linked;
}

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
      // いまは全員「連携済み」から始める（ロックなしで全機能が使える）。
      // 本格運用でロックを効かせるときは false に変えて migrate を上げる
      linked: true,
      linkedAt: new Date().toISOString().slice(0, 10),
      setLinked: () => set({ linked: true, linkedAt: new Date().toISOString().slice(0, 10) }),
      unlink: () => set({ linked: false, linkedAt: "" }),
    }),
    {
      name: "kds-line",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1→v2: 既存端末（テストで未連携にした端末も含む）を連携済みに揃える
      migrate: (persisted) => {
        const s = persisted as Partial<LineState>;
        s.linked = true;
        if (!s.linkedAt) s.linkedAt = new Date().toISOString().slice(0, 10);
        return s as LineState;
      },
    }
  )
);

/** この機能はLINE連携が必要か（ゲート無効時は常にfalse） */
export function lineLockActive(): boolean {
  return LINE_GATE_ENABLED && !useLineStore.getState().linked;
}

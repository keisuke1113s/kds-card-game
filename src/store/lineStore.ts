import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { LINE_GATE_ENABLED } from "@/data/lineConfig";
import { getDeviceId } from "@/data/telemetry";

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
      // ロック有効: 未連携で始まり、LINEログイン（または連携コード）で解放する
      linked: false,
      linkedAt: "",
      setLinked: () => set({ linked: true, linkedAt: new Date().toISOString().slice(0, 10) }),
      unlink: () => set({ linked: false, linkedAt: "" }),
    }),
    {
      name: "kds-line",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      // v3: ロック有効化。全端末をいったん未連携に戻す。
      // LINEログイン済みの端末は起動時に restoreLineLinkFromServer が
      // サーバーの記録から自動で連携済みに復元する
      migrate: (persisted, version) => {
        const s = persisted as Partial<LineState>;
        if (version < 3) {
          s.linked = false;
          s.linkedAt = "";
        }
        return s as LineState;
      },
    }
  )
);

/** この機能はLINE連携が必要か（ゲート無効時は常にfalse） */
export function lineLockActive(): boolean {
  return LINE_GATE_ENABLED && !useLineStore.getState().linked;
}

/**
 * 起動時の連携復元。LINEログインで連携した端末は記録がサーバーに残っているので、
 * ロック有効化やアプリの入れ直しで端末側のフラグが消えても自動で連携済みに戻す。
 * オフラインで確認できなければ次回起動時にまた確認する
 */
export function restoreLineLinkFromServer(): void {
  if (!LINE_GATE_ENABLED) return;
  if (!useLineStore.persist.hasHydrated()) {
    useLineStore.persist.onFinishHydration(() => restoreLineLinkFromServer());
    return;
  }
  if (useLineStore.getState().linked) return;
  void (async () => {
    try {
      const id = await getDeviceId();
      const res = await fetch(`https://tcg.kds946.com/line/check?device=${id}`);
      const out = (await res.json()) as { linked?: boolean };
      if (out.linked) useLineStore.getState().setLinked();
    } catch {
      // 電波が無いときは次回起動時に確認する
    }
  })();
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { KYOKAN_LIST } from "@/data/kyokan";

/**
 * トーナメントモード。
 * よわい→ふつう→つよい→ランダムインストラクターの4連戦を
 * 1敗もせずに勝ち抜くと優勝。負けたらそこで終了（最初から）。
 */
interface TournamentState {
  active: boolean;
  /** 0〜3=次に戦うステージ / 4=優勝直後 */
  stage: number;
  /** 決勝（ステージ4）の相手インストラクターのカードID */
  kyokanId: string | null;
  /** 優勝回数（実績用） */
  champions: number;
  /** 直前の結果（敗退表示用） */
  lastResult: "win" | "lose" | null;
  start: () => void;
  reportResult: (win: boolean) => void;
  abandon: () => void;
}

export const useTournamentStore = create<TournamentState>()(
  persist(
    (set, get) => ({
      active: false,
      stage: 0,
      kyokanId: null,
      champions: 0,
      lastResult: null,
      start: () => {
        // 決勝の相手はトーナメント開始時に決める
        const k = KYOKAN_LIST[Math.floor(Math.random() * KYOKAN_LIST.length)];
        set({ active: true, stage: 0, kyokanId: k.cardId, lastResult: null });
      },
      reportResult: (win) => {
        if (!get().active) return;
        if (!win) {
          set({ active: false, lastResult: "lose" });
          return;
        }
        const next = get().stage + 1;
        if (next >= 4) {
          set({ active: false, stage: 4, champions: get().champions + 1, lastResult: "win" });
        } else {
          set({ stage: next, lastResult: "win" });
        }
      },
      abandon: () => set({ active: false, lastResult: null, stage: 0 }),
    }),
    { name: "kds-tournament", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

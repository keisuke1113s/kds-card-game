import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** 進級システムの「最後に見た段階」。上がっていたら進級演出を出す */
interface RankState {
  /** 進級演出をすでに見せた段階（RANKSのインデックス） */
  seenRankIndex: number;
  setSeenRankIndex: (i: number) => void;
  /** 免許証プロフィールの表示名（未設定なら「教習生」） */
  playerName: string;
  setPlayerName: (n: string) => void;
  /** 初回起動日（免許証の交付日として表示する） */
  since: string;
}

export const useRankStore = create<RankState>()(
  persist(
    (set) => ({
      seenRankIndex: 0,
      setSeenRankIndex: (seenRankIndex) => set({ seenRankIndex }),
      playerName: "",
      setPlayerName: (playerName) => set({ playerName: playerName.slice(0, 10) }),
      since: new Date().toISOString().slice(0, 10),
    }),
    { name: "kds-rank", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

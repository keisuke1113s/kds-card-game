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
  /** 運転適性診断の結果タイプ（例 "ALSD"） */
  shindanType: string;
  setShindanType: (t: string) => void;
  /** 診断の回答内訳（軸文字の並び。メーターの再表示に使う） */
  shindanAnswers: string;
  setShindanAnswers: (a: string) => void;
  /** セーフティチェック（6観点スコア0-100）の前回結果 */
  shindanSafety: Record<string, number> | null;
  setShindanSafety: (s: Record<string, number>) => void;
  /** 入校式（初回ガイド）を見たか */
  entranceDone: boolean;
  setEntranceDone: () => void;
  /** 免許証の顔写真に使うお気に入りカード（空なら使用デッキの担当） */
  favoriteCard: string;
  setFavoriteCard: (id: string) => void;
  /** 自分の顔写真（WebでアップロードしたdataURL）。設定中は免許証と共有画像に使う */
  playerPhoto: string;
  setPlayerPhoto: (uri: string) => void;
  /** 免許証に表示する称号（獲得済みから1つ選ぶ） */
  selectedTitle: string;
  setSelectedTitle: (t: string) => void;
}

export const useRankStore = create<RankState>()(
  persist(
    (set) => ({
      seenRankIndex: 0,
      setSeenRankIndex: (seenRankIndex) => set({ seenRankIndex }),
      playerName: "",
      setPlayerName: (playerName) => set({ playerName: playerName.slice(0, 10) }),
      since: new Date().toISOString().slice(0, 10),
      shindanType: "",
      setShindanType: (shindanType) => set({ shindanType }),
      shindanAnswers: "",
      setShindanAnswers: (shindanAnswers) => set({ shindanAnswers }),
      shindanSafety: null,
      setShindanSafety: (shindanSafety) => set({ shindanSafety }),
      entranceDone: false,
      setEntranceDone: () => set({ entranceDone: true }),
      favoriteCard: "",
      setFavoriteCard: (favoriteCard) => set({ favoriteCard }),
      playerPhoto: "",
      setPlayerPhoto: (playerPhoto) => set({ playerPhoto }),
      selectedTitle: "",
      setSelectedTitle: (selectedTitle) => set({ selectedTitle }),
    }),
    { name: "kds-rank", storage: createJSONStorage(() => AsyncStorage), version: 1 }
  )
);

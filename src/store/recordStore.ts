import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DeckList } from "@/engine/deckRules";
import { GameAction, PlayerId } from "@/engine/types";

/**
 * 対戦成績。端末に保存され、アプリを閉じても消えない。
 * 決着した対局だけを数える（途中で「対戦をやめる」は数えない）。
 */

/** 1対局ぶんの記録（練習対戦は記録しない） */
export interface MatchRecord {
  /** 対戦した日時（ISO形式） */
  at: string;
  mode: "cpu" | "online";
  /** オンライン対戦の相手名（CPU戦は null） */
  opponentName: string | null;
  /** CPU戦の強さ（easy/normal/hard。オンラインは null） */
  difficulty: string | null;
  result: "win" | "lose";
  /** 決着の理由: complete=学科技能の達成 / deckOut=山札切れ */
  reason: "complete" | "deckOut";
  /** 自分が使ったデッキ名 */
  myDeckName: string;
  /** 「インストラクターに挑戦」の相手のカードID（通常対戦は undefined） */
  kyokan?: string;
  /** 自分が先攻だったか */
  first: boolean;
  /** 何ターンで決着したか */
  turns: number;
  /** 対戦にかかった時間（秒） */
  durationSec: number;
  /** 終了時の進み具合 */
  myAcademic: number;
  mySkill: number;
  oppAcademic: number;
  oppSkill: number;
  /**
   * リプレイ用データ（CPU対戦のみ）。
   * このゲームは同じ種と同じ手順から必ず同じ展開になるため、
   * これだけで対局を完全に再現できる
   */
  replay?: ReplayData;
}

export interface ReplayData {
  seed: number;
  playerDeck: DeckList;
  cpuDeck: DeckList;
  firstPlayer: PlayerId;
  actions: GameAction[];
}

/** リプレイ付きで保存する件数（データが大きいため直近だけ残す） */
const REPLAY_LIMIT = 30;

/** 保存する対戦記録の上限（古いものから消える） */
const HISTORY_LIMIT = 1000;

interface RecordState {
  wins: number;
  losses: number;
  /** いまの連勝数（負けると0に戻る） */
  streak: number;
  /**
   * 今回の連戦の成績。「もう一度遊ぶ」で続けている間だけ数え、
   * 新しくCPU対戦を始めるとリセットされる（端末には保存しない）
   */
  sessionWins: number;
  sessionLosses: number;
  /** 対戦記録（新しい順） */
  history: MatchRecord[];
  addWin: () => void;
  addLoss: () => void;
  addMatch: (m: MatchRecord) => void;
  resetSession: () => void;
  reset: () => void;
}

export const useRecordStore = create<RecordState>()(
  persist(
    (set) => ({
      wins: 0,
      losses: 0,
      streak: 0,
      sessionWins: 0,
      sessionLosses: 0,
      history: [],
      addWin: () =>
        set((s) => ({
          wins: s.wins + 1,
          streak: s.streak + 1,
          sessionWins: s.sessionWins + 1,
        })),
      addLoss: () =>
        set((s) => ({
          losses: s.losses + 1,
          streak: 0,
          sessionLosses: s.sessionLosses + 1,
        })),
      addMatch: (m) =>
        set((s) => {
          const history = [m, ...s.history].slice(0, HISTORY_LIMIT);
          // リプレイデータは直近の分だけ残し、古い記録からは落とす
          let withReplay = 0;
          for (const r of history) {
            if (!r.replay) continue;
            withReplay++;
            if (withReplay > REPLAY_LIMIT) delete r.replay;
          }
          return { history };
        }),
      resetSession: () => set({ sessionWins: 0, sessionLosses: 0 }),
      reset: () =>
        set({ wins: 0, losses: 0, streak: 0, sessionWins: 0, sessionLosses: 0, history: [] }),
    }),
    {
      name: "kds-record",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // 連戦の成績は保存しない（アプリを開き直したら新しい連戦）
      partialize: (s) => ({ wins: s.wins, losses: s.losses, streak: s.streak, history: s.history }),
      migrate: (persisted) => {
        const s = persisted as Partial<RecordState>;
        return { ...s, history: s.history ?? [] } as RecordState;
      },
    }
  )
);

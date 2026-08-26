import { create } from "zustand";
import { DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { HeuristicAI } from "@/ai/heuristic";
import { AIController, Difficulty } from "@/ai/types";
import { cardRegistry } from "@/data/cards";
import { createGame } from "@/engine/createGame";
import { DeckList } from "@/engine/deckRules";
import { getLegalActions } from "@/engine/legalActions";
import { applyAction, playerToAct } from "@/engine/reducer";
import { viewFor } from "@/engine/view";
import {
  GameAction,
  GameContext,
  GameEvent,
  GameState,
  PlayerId,
} from "@/engine/types";

export const HUMAN: PlayerId = 0;
export const CPU: PlayerId = 1;

const ctx: GameContext = { defs: cardRegistry };

interface GameStore {
  state: GameState | null;
  /** これまでの全イベント（ログ表示用） */
  eventLog: GameEvent[];
  /** 直近のアクションで発生したイベント */
  lastEvents: GameEvent[];
  aiThinking: boolean;
  aiSpeedMs: number;

  startGame: (opts: {
    playerDeck: DeckList;
    cpuDeck: DeckList;
    difficulty: Difficulty;
    aiSpeedMs?: number;
    seed?: number;
  }) => void;
  /** 人間のアクションを適用する。不正な手は無視（UIは合法手のみ出す前提の保険） */
  dispatch: (action: GameAction) => void;
  legalActions: () => GameAction[];
  quitGame: () => void;
}

let ai: AIController | null = null;
let aiTimer: ReturnType<typeof setTimeout> | null = null;
let gameToken = 0; // 対局をまたいだ古いタイマーの発火防止

export const useGameStore = create<GameStore>()((set, get) => {
  function clearAiTimer() {
    if (aiTimer !== null) {
      clearTimeout(aiTimer);
      aiTimer = null;
    }
  }

  /** CPUの手番なら1手ずつ間隔を空けて進める */
  function scheduleAI() {
    const token = gameToken;
    const { state, aiSpeedMs } = get();
    if (!state || !ai) return;
    if (state.phase.type === "finished") {
      set({ aiThinking: false });
      return;
    }
    if (playerToAct(state) !== CPU) {
      set({ aiThinking: false });
      return;
    }
    set({ aiThinking: true });
    clearAiTimer();
    aiTimer = setTimeout(() => {
      if (token !== gameToken) return;
      const cur = get().state;
      if (!cur || !ai || playerToAct(cur) !== CPU) return;
      const legal = getLegalActions(ctx, cur, CPU);
      if (legal.length === 0) return;
      const action = ai.chooseAction(viewFor(cur, CPU), legal);
      applyAndContinue(action);
    }, aiSpeedMs);
  }

  function applyAndContinue(action: GameAction) {
    const prev = get().state;
    if (!prev) return;
    try {
      const { state, events } = applyAction(ctx, prev, action);
      set({
        state,
        lastEvents: events,
        eventLog: [...get().eventLog, ...events],
      });
      scheduleAI();
    } catch (e) {
      // UIは合法手のみを出す設計だが、万一の場合もクラッシュさせない
      console.warn("アクションを適用できませんでした:", e);
    }
  }

  return {
    state: null,
    eventLog: [],
    lastEvents: [],
    aiThinking: false,
    aiSpeedMs: 600,

    startGame: ({ playerDeck, cpuDeck, difficulty, aiSpeedMs = 600, seed }) => {
      gameToken++;
      clearAiTimer();
      const realSeed = seed ?? (Date.now() % 2147483647);
      ai = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS[difficulty], realSeed ^ 0x55aa);
      const { state, events } = createGame(ctx, {
        seed: realSeed,
        decks: [playerDeck, cpuDeck],
      });
      set({ state, eventLog: events, lastEvents: events, aiThinking: false, aiSpeedMs });
      // マリガンはCPUが後から決めても問題ないため、人間の入力を待つ
      scheduleAI();
    },

    dispatch: (action) => {
      const state = get().state;
      if (!state) return;
      if (playerToAct(state) !== action.player) return;
      applyAndContinue(action);
    },

    legalActions: () => {
      const state = get().state;
      if (!state) return [];
      return getLegalActions(ctx, state, HUMAN);
    },

    quitGame: () => {
      gameToken++;
      clearAiTimer();
      ai = null;
      set({ state: null, eventLog: [], lastEvents: [], aiThinking: false });
    },
  };
});

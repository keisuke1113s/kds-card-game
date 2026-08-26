import { create } from "zustand";
import { playSe, SeKey } from "@/audio/sound";
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
  /** 演出（カード実況）表示中はCPUの次の手を待たせる */
  presentationBusy: boolean;
  setPresentationBusy: (v: boolean) => void;

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

/**
 * 対戦ごとの乱数の種。デッキのシャッフル順はここから決まるため、
 * 毎回必ず違う値になるよう暗号学的乱数を優先して使う
 * （時刻だけだと、連続で開始したときに同じ種になりうる）。
 */
function randomSeed(): number {
  try {
    const g = globalThis as {
      crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array };
    };
    if (g.crypto?.getRandomValues) {
      const arr = new Uint32Array(1);
      g.crypto.getRandomValues(arr);
      return arr[0] | 0;
    }
  } catch {
    // 利用できない環境では下のフォールバックを使う
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) | 0;
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
      // 演出表示中は捌けるまで待つ（実況を読み飛ばさないため）
      if (get().presentationBusy) {
        scheduleAI();
        return;
      }
      const cur = get().state;
      if (!cur || !ai || playerToAct(cur) !== CPU) return;
      const legal = getLegalActions(ctx, cur, CPU);
      if (legal.length === 0) return;
      const action = ai.chooseAction(viewFor(cur, CPU), legal);
      applyAndContinue(action);
    }, get().presentationBusy ? 200 : aiSpeedMs);
  }

  /** このアクションで起きたイベントに対応する効果音（重複除去・最大3つ） */
  function playEventSounds(events: GameEvent[]) {
    const keys = new Set<SeKey>();
    for (const e of events) {
      switch (e.type) {
        case "gameEnded":
          // 勝敗音だけ鳴らす
          playSe(e.winner === HUMAN ? "win" : "lose");
          return;
        case "cardDrawn":
        case "cardSalvaged":
          keys.add("draw");
          break;
        case "instructorPlayed":
          keys.add("play");
          break;
        case "battleDeclared":
          keys.add("battle");
          break;
        case "instructorRemoved":
        case "cardDiscarded":
          keys.add("hit");
          break;
        case "trackAdvanced":
          if (e.amount > 0) keys.add("advance");
          break;
        case "supportPlayed":
        case "abilityActivated":
        case "instructorBounced":
          keys.add("support");
          break;
        case "jankenPlayed": {
          const humanWon = (e.owner === HUMAN) === e.won;
          keys.add(humanWon ? "janken_win" : "janken_lose");
          break;
        }
      }
    }
    [...keys].slice(0, 3).forEach((k) => playSe(k));
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
      playEventSounds(events);
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
    presentationBusy: false,
    setPresentationBusy: (presentationBusy) => {
      set({ presentationBusy });
      if (!presentationBusy) scheduleAI(); // 演出が終わったらすぐ再開
    },

    startGame: ({ playerDeck, cpuDeck, difficulty, aiSpeedMs = 600, seed }) => {
      gameToken++;
      clearAiTimer();
      const realSeed = seed ?? randomSeed();
      ai = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS[difficulty], realSeed ^ 0x55aa);
      const { state, events } = createGame(ctx, {
        seed: realSeed,
        decks: [playerDeck, cpuDeck],
      });
      set({
        state,
        eventLog: events,
        lastEvents: events,
        aiThinking: false,
        aiSpeedMs,
        presentationBusy: false,
      });
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
      set({
        state: null,
        eventLog: [],
        lastEvents: [],
        aiThinking: false,
        presentationBusy: false,
      });
    },
  };
});

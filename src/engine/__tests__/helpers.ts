import { cardRegistry, defaultDeck } from "@/data/cards";
import { createGame } from "../createGame";
import { applyAction, playerToAct } from "../reducer";
import {
  ApplyResult,
  GameAction,
  GameContext,
  GameState,
  InstructorOnField,
  PlayerId,
  PlayerState,
} from "../types";

export const ctx: GameContext = { defs: cardRegistry };

/** マリガンなしでゲーム開始済みの状態を作る */
export function startedGame(seed = 1, firstPlayer: PlayerId = 0): ApplyResult {
  const { state } = createGame(ctx, {
    seed,
    decks: [defaultDeck, defaultDeck],
    firstPlayer,
  });
  const a = applyAction(ctx, state, { type: "mulligan", player: 0, redraw: false });
  return applyAction(ctx, a.state, { type: "mulligan", player: 1, redraw: false });
}

let uidSeq = 100;
export function fieldInst(
  cardId: string,
  opts: Partial<InstructorOnField> = {}
): InstructorOnField {
  return {
    uid: `t${uidSeq++}`,
    cardId,
    rested: false,
    actedThisTurn: false,
    ...opts,
  };
}

function basePlayer(partial: Partial<PlayerState> = {}): PlayerState {
  return {
    deck: ["sato", "suzuki", "tanaka"],
    hand: [],
    field: [],
    tantou: "kocho",
    outOfPlay: [],
    academic: 0,
    skill: 0,
    mulliganDecided: true,
    ...partial,
  };
}

/** テスト用に任意の盤面を直接組み立てる */
export function makeState(
  p0: Partial<PlayerState>,
  p1: Partial<PlayerState> = {},
  overrides: Partial<GameState> = {}
): GameState {
  return {
    rngState: 42,
    turnPlayer: 0,
    turnNumber: 3,
    phase: { type: "main", canPlayInstructor: true },
    players: [basePlayer(p0), basePlayer(p1)],
    ...overrides,
  };
}

export function act(state: GameState, action: GameAction): ApplyResult {
  return applyAction(ctx, state, action);
}

export { playerToAct };

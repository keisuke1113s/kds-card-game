import { DeckList, validateDeck } from "./deckRules";
import { nextInt, shuffle } from "./rng";
import {
  ApplyResult,
  GameContext,
  GameEvent,
  GameState,
  INITIAL_HAND,
  PlayerId,
  PlayerState,
} from "./types";

export interface GameSetup {
  seed: number;
  decks: [DeckList, DeckList];
  /** 省略時はランダム（じゃんけんの代わり） */
  firstPlayer?: PlayerId;
}

export function createGame(ctx: GameContext, setup: GameSetup): ApplyResult {
  for (const [i, deck] of setup.decks.entries()) {
    const errors = validateDeck(ctx.defs, deck);
    if (errors.length > 0) {
      throw new Error(`プレイヤー${i}のデッキが不正です: ${errors.join(" / ")}`);
    }
  }

  let rngState = setup.seed | 0;

  let firstPlayer = setup.firstPlayer;
  if (firstPlayer === undefined) {
    const r = nextInt(rngState, 2);
    rngState = r.rngState;
    firstPlayer = r.value as PlayerId;
  }

  const players = setup.decks.map((deck) => {
    const s = shuffle(rngState, deck.main);
    rngState = s.rngState;
    const shuffled = s.value;
    const player: PlayerState = {
      deck: shuffled.slice(INITIAL_HAND),
      hand: shuffled.slice(0, INITIAL_HAND),
      field: [],
      tantou: deck.tantou,
      outOfPlay: [],
      academic: 0,
      skill: 0,
      mulliganDecided: false,
    };
    return player;
  }) as [PlayerState, PlayerState];

  const state: GameState = {
    rngState,
    turnPlayer: firstPlayer,
    turnNumber: 0, // 最初の endTurn 相当の startTurn で 1 になる
    phase: { type: "mulligan" },
    players,
  };

  const events: GameEvent[] = [{ type: "gameStarted", firstPlayer }];
  return { state, events };
}

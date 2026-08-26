import { describe, expect, it } from "vitest";
import { cardRegistry, defaultDeck } from "@/data/cards";
import { createGame } from "@/engine/createGame";
import { getLegalActions } from "@/engine/legalActions";
import { applyAction, playerToAct } from "@/engine/reducer";
import { viewFor } from "@/engine/view";
import { GameContext, PlayerId } from "@/engine/types";
import { DIFFICULTY_PARAMS } from "../difficulty";
import { HeuristicAI } from "../heuristic";
import { RandomBot } from "../randomBot";
import { AIController } from "../types";

const ctx: GameContext = { defs: cardRegistry };

/** 2つのAIを対戦させ、勝者を返す */
function playMatch(bots: [AIController, AIController], seed: number): PlayerId | null {
  let { state } = createGame(ctx, { seed, decks: [defaultDeck, defaultDeck] });
  let steps = 0;
  while (state.phase.type !== "finished") {
    if (++steps > 5000) throw new Error("対局が終わりません");
    const actor = playerToAct(state)!;
    const legal = getLegalActions(ctx, state, actor);
    const action = bots[actor].chooseAction(viewFor(state, actor), legal);
    state = applyAction(ctx, state, action).state;
  }
  return state.phase.winner;
}

describe("CPU AI", () => {
  it("ふつうAIはランダムボットに90%以上勝つ", () => {
    let wins = 0;
    const games = 40;
    for (let seed = 1; seed <= games; seed++) {
      const ai = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.normal, seed);
      const bot = new RandomBot(seed + 1000);
      // 先攻後攻の偏りを消すため交互に入れ替える
      const aiSide: PlayerId = seed % 2 === 0 ? 0 : 1;
      const winner = playMatch(aiSide === 0 ? [ai, bot] : [bot, ai], seed);
      if (winner === aiSide) wins++;
    }
    expect(wins / games).toBeGreaterThanOrEqual(0.9);
  });

  it("つよいAIはよわいAIに勝ち越す", () => {
    let hardWins = 0;
    const games = 30;
    for (let seed = 1; seed <= games; seed++) {
      const hard = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, seed);
      const easy = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.easy, seed + 500);
      const hardSide: PlayerId = seed % 2 === 0 ? 0 : 1;
      const winner = playMatch(hardSide === 0 ? [hard, easy] : [easy, hard], seed);
      if (winner === hardSide) hardWins++;
    }
    expect(hardWins / games).toBeGreaterThan(0.5);
  });

  it("AI同士の対局は常に終局する（30シード）", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const a = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.normal, seed);
      const b = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, seed + 99);
      expect(() => playMatch([a, b], seed)).not.toThrow();
    }
  });
});

import { describe, expect, it } from "vitest";
import { cpuDeck, defaultDeck } from "@/data/cards";
import { createGame } from "../createGame";
import { getLegalActions } from "../legalActions";
import { applyAction, playerToAct } from "../reducer";
import { nextInt } from "../rng";
import {
  ACADEMIC_GOAL,
  GameAction,
  GameState,
  SKILL_GOAL,
} from "../types";
import { ctx } from "./helpers";

// ランダム合法手ボット同士で対局し、不変条件と決定性を検証するファジングテスト

const TOTALS = [defaultDeck.main.length, cpuDeck.main.length]; // 21 / 21

function invariants(state: GameState) {
  // searchTop の公開カードは一時的に山札から出ている
  let revealedOwner = -1;
  let revealedCount = 0;
  if (state.phase.type === "choice") {
    const pending = state.phase.pending;
    const r = pending.resolve as { type: string; revealed?: string[] };
    if (r.type === "searchTake" && r.revealed) {
      revealedOwner = pending.owner;
      revealedCount = r.revealed.length;
    }
  }
  state.players.forEach((p, pi) => {
    expect(p.academic).toBeGreaterThanOrEqual(0);
    expect(p.academic).toBeLessThanOrEqual(ACADEMIC_GOAL);
    expect(p.skill).toBeGreaterThanOrEqual(0);
    expect(p.skill).toBeLessThanOrEqual(SKILL_GOAL);
    // カードの保存則: 山札+手札+場+場外（+公開中） = デッキ枚数
    const revealed = pi === revealedOwner ? revealedCount : 0;
    expect(
      p.deck.length + p.hand.length + p.field.length + p.outOfPlay.length + revealed
    ).toBe(TOTALS[pi]);
    // 場のUIDは一意
    const uids = p.field.map((f) => f.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });
}

function playRandomGame(seed: number): {
  finalState: GameState;
  actionLog: GameAction[];
  turns: number;
} {
  let { state } = createGame(ctx, { seed, decks: [defaultDeck, cpuDeck] });
  const actionLog: GameAction[] = [];
  let botRng = seed ^ 0x9e3779b9;
  let steps = 0;

  while (state.phase.type !== "finished") {
    steps++;
    expect(steps).toBeLessThan(5000); // 必ず終局する（山札切れがあるため）
    const actor = playerToAct(state);
    expect(actor).not.toBeNull();
    const legal = getLegalActions(ctx, state, actor!);
    expect(legal.length).toBeGreaterThan(0);
    const r = nextInt(botRng, legal.length);
    botRng = r.rngState;
    const action = legal[r.value];
    actionLog.push(action);
    const result = applyAction(ctx, state, action);
    state = result.state;
    invariants(state);
  }
  return { finalState: state, actionLog, turns: state.turnNumber };
}

describe("ファジング（ランダム対局）", () => {
  it("100対局: 常に終局し、不変条件を破らない", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { finalState } = playRandomGame(seed);
      expect(finalState.phase.type).toBe("finished");
    }
  });

  it("リプレイ決定性: 同一シード＋同一アクション列で完全に同じ最終状態", () => {
    for (const seed of [3, 17, 42]) {
      const first = playRandomGame(seed);
      // 記録したアクション列をそのまま再適用
      let { state } = createGame(ctx, { seed, decks: [defaultDeck, cpuDeck] });
      for (const action of first.actionLog) {
        state = applyAction(ctx, state, action).state;
      }
      expect(state).toEqual(first.finalState);
    }
  });
});

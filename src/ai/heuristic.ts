import { nextRandom } from "@/engine/rng";
import {
  CardRegistry,
  GameAction,
  InstructorOnField,
  PlayerView,
  TRACK_GOALS,
} from "@/engine/types";
import { AIController, AIParams } from "./types";

/**
 * ヒューリスティック採点式AI。
 * 全合法手にスコアをつけて最大を選ぶ。難易度はパラメータ（ノイズ・積極性など）で調整。
 */
export class HeuristicAI implements AIController {
  private rngState: number;

  constructor(
    private defs: CardRegistry,
    private params: AIParams,
    seed = 1
  ) {
    this.rngState = seed | 0;
  }

  chooseAction(view: PlayerView, legal: GameAction[]): GameAction {
    if (legal.length === 0) throw new Error("合法手がありません");
    let best = legal[0];
    let bestScore = -Infinity;
    for (const action of legal) {
      let score = this.score(view, action);
      if (this.params.noise > 0) {
        const r = nextRandom(this.rngState);
        this.rngState = r.rngState;
        score += (r.value - 0.5) * 2 * this.params.noise;
      }
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ 採点

  private score(view: PlayerView, action: GameAction): number {
    switch (action.type) {
      case "mulligan":
        return this.scoreMulligan(view, action.redraw);
      case "playInstructor":
        return this.scorePlayInstructor(view, action.handIndex);
      case "instructorAction":
        return this.scoreInstructorAction(view, action.uid, action.action);
      case "declareBattle":
        return this.scoreBattle(view, action.attackerUid, action.defenderUid);
      case "playSupport":
        return this.scorePlaySupport(view, action.handIndex);
      case "passSupport":
        return 0;
      case "resolveChoice":
        return this.scoreChoice(view, action.optionIndex);
      case "endTurn":
        return -2; // 他に良い手が無いときだけ選ばれる
    }
  }

  private instValue(inst: InstructorOnField): number {
    const def = this.defs[inst.cardId];
    return (def.lesson ?? 0) * 1.5 + (def.combat ?? 0) * 0.5;
  }

  private scoreMulligan(view: PlayerView, redraw: boolean): number {
    const instructors = view.self.hand.filter(
      (id) => this.defs[id].type === "instructor"
    ).length;
    // インストラクターが少なすぎる手札は引き直す
    if (instructors <= 1) return redraw ? 5 : 0;
    return redraw ? 0 : 5;
  }

  private scorePlayInstructor(view: PlayerView, handIndex: number): number {
    const def = this.defs[view.self.hand[handIndex]];
    let score = 4 + (def.lesson ?? 0) * 1.2 + (def.combat ?? 0) * 0.4;
    // 登場時効果の価値（現在の語彙のみ評価）
    for (const eff of def.effects ?? []) {
      if (eff.trigger !== "onPlay") continue;
      for (const op of eff.ops) {
        if (op.op === "modifyTrack" && op.target === "opponent" && op.amount < 0) {
          const current = view.opponent[op.track];
          score += Math.min(-op.amount, current) * 1.2; // 実際に戻せる量だけ価値
        } else if (op.op === "searchTop" || op.op === "draw") {
          score += 1.5;
        }
      }
    }
    return score;
  }

  private remaining(view: PlayerView, track: "academic" | "skill"): number {
    return TRACK_GOALS[track] - view.self[track];
  }

  private scoreInstructorAction(
    view: PlayerView,
    uid: string,
    action: "skill" | "academic" | "doNothing"
  ): number {
    const inst = view.self.field.find((f) => f.uid === uid);
    if (!inst) return -Infinity;
    const def = this.defs[inst.cardId];

    if (action === "doNothing") {
      // 高戦闘力を立たせておく抑止価値（相手の場が空なら無意味）
      const oppHasField = view.opponent.field.length > 0;
      return oppHasField ? 0.3 + (def.combat ?? 0) * 0.25 : 0.1;
    }

    const track = action === "skill" ? "skill" : "academic";
    const remaining = this.remaining(view, track);
    const gain = Math.min(def.lesson ?? 0, remaining);
    if (gain === 0) return -3; // 達成済みトラックに使うのは無駄
    let score = 2 + gain * 1.5;
    // 残りが少ないトラックを締め切りに向けて優先
    if (gain === remaining) score += 3; // このアクションでトラック完了
    // 相手にバトルで狙われるリスク: 教習すると休憩状態になる
    const threat = Math.max(
      0,
      ...view.opponent.field.map((f) => this.defs[f.cardId].combat ?? 0)
    );
    if (threat > (def.combat ?? 0)) score -= 0.5;
    return score;
  }

  private scoreBattle(
    view: PlayerView,
    attackerUid: string,
    defenderUid: string
  ): number {
    const atk = view.self.field.find((f) => f.uid === attackerUid);
    const def = view.opponent.field.find((f) => f.uid === defenderUid);
    if (!atk || !def) return -Infinity;
    const myCombat = this.defs[atk.cardId].combat ?? 0;
    let theirCombat = this.defs[def.cardId].combat ?? 0;
    if (this.params.estimateOpponentSupport && view.opponent.handCount > 0) {
      theirCombat += 1; // サポート1枚分を織り込む
    }
    const targetValue = this.instValue(def);
    const myValue = this.instValue(atk);
    const margin = myCombat - theirCombat;

    let score: number;
    if (margin > 0) {
      score = (2 + targetValue + margin * 0.3) * this.params.aggression;
    } else if (margin === 0) {
      score = (targetValue - myValue) * this.params.aggression; // 有利なトレードのみ
    } else {
      // 手持ちのバトルサポートで届くなら仕掛ける価値あり
      const maxBuff = this.maxOwnBattleBuff(view);
      score =
        maxBuff + margin >= 1
          ? (1 + targetValue - 1) * this.params.aggression * 0.7
          : -5;
    }
    return score;
  }

  private maxOwnBattleBuff(view: PlayerView): number {
    let max = 0;
    for (const id of view.self.hand) {
      const def = this.defs[id];
      if (def.type !== "support") continue;
      if (def.timing !== "battle" && def.timing !== "any") continue;
      for (const eff of def.effects ?? []) {
        for (const op of eff.ops) {
          if (op.op === "buffCombat") max = Math.max(max, op.amount);
        }
      }
    }
    return max;
  }

  private scorePlaySupport(view: PlayerView, handIndex: number): number {
    const def = this.defs[view.self.hand[handIndex]];

    if (view.phase.type === "battleSupport") {
      const battle = view.phase.battle;
      const amAttacker = battle.attackerPlayer === view.playerId;
      const myUid = amAttacker ? battle.attackerUid : battle.defenderUid;
      const oppUid = amAttacker ? battle.defenderUid : battle.attackerUid;
      const mine = view.self.field.find((f) => f.uid === myUid);
      const theirs = view.opponent.field.find((f) => f.uid === oppUid);
      if (!mine || !theirs) return -10;

      const buffFor = (pid: number) =>
        battle.buffs.filter((b) => b.player === pid).reduce((a, b) => a + b.amount, 0);
      const myTotal =
        (this.defs[mine.cardId].combat ?? 0) + buffFor(view.playerId);
      const theirTotal =
        (this.defs[theirs.cardId].combat ?? 0) + buffFor(1 - view.playerId);

      let buff = 0;
      for (const eff of def.effects ?? []) {
        for (const op of eff.ops) {
          if (op.op === "buffCombat") buff += op.amount;
        }
      }

      const losingOrTying = myTotal <= theirTotal;
      const flips = myTotal + buff > theirTotal;
      if (losingOrTying && flips) {
        // 勝敗が覆る最小のカードを好む（過剰なバフほど減点）
        return 4 + this.instValue(mine) - buff * 0.3;
      }
      return -4; // 勝っている・覆らないなら温存
    }

    // メインフェイズのサポート（ドロー系など）
    if (view.self.deckCount <= 3) return -3; // 山札切れ敗北を避ける
    return 1.2;
  }

  private scoreChoice(view: PlayerView, optionIndex: number): number {
    if (view.phase.type !== "choice") return 0;
    const cardId = view.phase.pending.revealed[optionIndex];
    if (!cardId) return 0;
    const def = this.defs[cardId];
    return (def.lesson ?? 0) * 1.5 + (def.combat ?? 0);
  }
}

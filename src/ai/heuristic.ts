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
      // じゃんけん等の同点選択がランダムになるよう、常に微小ノイズを足す
      const r = nextRandom(this.rngState);
      this.rngState = r.rngState;
      score += (r.value - 0.5) * 2 * Math.max(this.params.noise, 0.01);
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
      case "activateAbility":
        return this.scoreAbility(view, action.uid);
      case "resolveChoice":
        return this.scoreChoice(view, action.optionIndex);
      case "endTurn":
        return -2; // 他に良い手が無いときだけ選ばれる
    }
  }

  private cardValue(cardId: string): number {
    const def = this.defs[cardId];
    return (def.lesson ?? 0) * 1.5 + (def.combat ?? 0) * 0.5 + (def.effects?.length ? 1 : 0);
  }

  private instValue(inst: InstructorOnField): number {
    return this.cardValue(inst.cardId);
  }

  private effCombat(view: PlayerView, player: number, inst: InstructorOnField): number {
    const base = this.defs[inst.cardId].combat ?? 0;
    const mods = view.combatMods
      .filter((m) => m.player === player && m.uid === inst.uid)
      .reduce((a, m) => a + m.amount, 0);
    return base + mods;
  }

  private scoreMulligan(view: PlayerView, redraw: boolean): number {
    const instructors = view.self.hand.filter(
      (id) => this.defs[id].type === "instructor"
    ).length;
    if (instructors <= 1) return redraw ? 5 : 0;
    return redraw ? 0 : 5;
  }

  private scorePlayInstructor(view: PlayerView, handIndex: number): number {
    const def = this.defs[view.self.hand[handIndex]];
    let score = 4 + (def.lesson ?? 0) * 1.2 + (def.combat ?? 0) * 0.4;
    for (const eff of def.effects ?? []) {
      if (eff.trigger !== "onPlay") continue;
      for (const op of eff.ops) {
        switch (op.op) {
          case "modifyTrack":
            if (op.target === "opponent" && op.amount < 0) {
              score += Math.min(-op.amount, view.opponent[op.track]) * 1.2;
            } else if (op.target === "self" && op.amount > 0) {
              score += Math.min(op.amount, TRACK_GOALS[op.track] - view.self[op.track]) * 1.2;
            }
            break;
          case "searchTop":
          case "draw":
            score += 1.5;
            break;
          case "removeAllExceptSource": {
            // 井関: 盤面リセットは相手の場が価値で上回るときだけ
            const oppValue = view.opponent.field.reduce((a, f) => a + this.instValue(f), 0);
            const ownValue = view.self.field.reduce((a, f) => a + this.instValue(f), 0);
            score += (oppValue - ownValue) * 1.2 - 1;
            break;
          }
          case "removeTarget":
          case "discardOpponentChoice":
            score += view.opponent.field.length > 0 || op.op === "discardOpponentChoice" ? 2 : 0;
            break;
          case "bounceTarget":
            score += view.opponent.field.some((f) => f.rested) ? 1.5 : 0;
            break;
          case "salvage":
            score += view.self.outOfPlay.length > 0 ? 1.2 : 0;
            break;
          case "summonNamed":
            score += view.self.hand.some((id) => this.defs[id].name === op.name) ? 2.5 : 0;
            break;
          case "janken":
            score += 0.8; // 期待値ざっくり
            break;
          default:
            score += 0.3;
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
      const oppHasField = view.opponent.field.length > 0;
      return oppHasField ? 0.3 + (def.combat ?? 0) * 0.25 : 0.1;
    }

    const track = action === "skill" ? "skill" : "academic";
    const remaining = this.remaining(view, track);
    const lessonBuff = view.lessonMods
      .filter((m) => m.player === view.playerId && (m.uid === null || m.uid === uid))
      .reduce((a, m) => a + m.amount, 0);
    const gain = Math.min((def.lesson ?? 0) + lessonBuff, remaining);
    if (gain <= 0) return -3;
    let score = 2 + gain * 1.5;
    if (gain === remaining) score += 3; // トラック完了
    const threat = Math.max(
      0,
      ...view.opponent.field.map((f) => this.defs[f.cardId].combat ?? 0)
    );
    if (threat > (def.combat ?? 0)) score -= 0.5;
    return score;
  }

  private scoreBattle(view: PlayerView, attackerUid: string, defenderUid: string): number {
    const atk = view.self.field.find((f) => f.uid === attackerUid);
    const def = view.opponent.field.find((f) => f.uid === defenderUid);
    if (!atk || !def) return -Infinity;
    const myCombat = this.effCombat(view, view.playerId, atk);
    let theirCombat = this.effCombat(view, 1 - view.playerId, def);
    if (this.params.estimateOpponentSupport && view.opponent.handCount > 0) {
      theirCombat += 1;
    }
    const targetValue = this.instValue(def);
    const myValue = this.instValue(atk);
    const margin = myCombat - theirCombat;

    if (margin > 0) {
      return (2 + targetValue + margin * 0.3) * this.params.aggression;
    }
    if (margin === 0) {
      return (targetValue - myValue) * this.params.aggression;
    }
    const maxBuff = this.maxOwnBattleBuff(view);
    return maxBuff + margin >= 1
      ? (1 + targetValue - 1) * this.params.aggression * 0.7
      : -5;
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

  /** バトル中の現在の戦闘力合計（バフ込み） */
  private battleTotals(view: PlayerView): { mine: number; theirs: number; myInst?: InstructorOnField } | null {
    if (view.phase.type !== "battleSupport") return null;
    const battle = view.phase.battle;
    const amAttacker = battle.attackerPlayer === view.playerId;
    const myUid = amAttacker ? battle.attackerUid : battle.defenderUid;
    const oppUid = amAttacker ? battle.defenderUid : battle.attackerUid;
    const mine = view.self.field.find((f) => f.uid === myUid);
    const theirs = view.opponent.field.find((f) => f.uid === oppUid);
    if (!mine || !theirs) return null;
    const buffFor = (pid: number) =>
      battle.buffs.filter((b) => b.player === pid).reduce((a, b) => a + b.amount, 0);
    return {
      mine: this.effCombat(view, view.playerId, mine) + buffFor(view.playerId),
      theirs: this.effCombat(view, 1 - view.playerId, theirs) + buffFor(1 - view.playerId),
      myInst: mine,
    };
  }

  private scorePlaySupport(view: PlayerView, handIndex: number): number {
    const def = this.defs[view.self.hand[handIndex]];

    if (view.phase.type === "battleSupport") {
      const totals = this.battleTotals(view);
      if (!totals || !totals.myInst) return -10;

      let buff = 0;
      let nuke = false;
      for (const eff of def.effects ?? []) {
        for (const op of eff.ops) {
          if (op.op === "buffCombat") buff += op.amount;
          if (op.op === "removeBothBattlers") nuke = true;
        }
      }
      if (nuke) {
        // 本間: 自分が負けそうで、相手の方が価値が高いときだけ
        const battle = view.phase.battle;
        const oppUid = battle.attackerPlayer === view.playerId ? battle.defenderUid : battle.attackerUid;
        const theirInst = view.opponent.field.find((f) => f.uid === oppUid);
        const losing = totals.mine <= totals.theirs;
        if (losing && theirInst) {
          return 2 + this.instValue(theirInst) - this.instValue(totals.myInst) * 0.5;
        }
        return -6;
      }
      const losingOrTying = totals.mine <= totals.theirs;
      const flips = totals.mine + buff > totals.theirs;
      if (losingOrTying && flips) {
        return 4 + this.instValue(totals.myInst) - buff * 0.3;
      }
      return -4;
    }

    // メインフェイズのサポート
    let score = 1.2;
    for (const eff of def.effects ?? []) {
      for (const op of eff.ops) {
        switch (op.op) {
          case "janken": // S字・クランク・効果測定: 確実にトラックが進む
            score += 1.5;
            break;
          case "lessonMod": {
            // 永山: 教習前・場が多いほど強い
            const readyCount = view.self.field.filter((f) => !f.actedThisTurn && !f.rested).length;
            score += readyCount * 1.2 - 1;
            break;
          }
          case "untapAtTurnEndCharge": {
            const willRest = view.self.field.length;
            score += willRest > 0 ? 0.8 : -2;
            break;
          }
          case "recycleSupports": {
            const supportsOut = view.self.outOfPlay.filter(
              (id) => this.defs[id].type === "support"
            ).length;
            score += supportsOut >= 2 ? supportsOut * 0.6 : -3;
            break;
          }
        }
      }
    }
    return score;
  }

  private scoreAbility(view: PlayerView, uid: string | undefined): number {
    if (uid !== undefined) {
      const inst = view.self.field.find((f) => f.uid === uid);
      if (!inst) return -10;
      const def = this.defs[inst.cardId];
      const ability = def.ability;
      if (!ability) return -10;
      // 久慈: 相手を1人退場 — 相手の場の最高価値と、自分が休憩するコストを比較
      const bestTarget = Math.max(0, ...view.opponent.field.map((f) => this.instValue(f)));
      if (bestTarget <= 0) return -5;
      const cost = ability.costRestSelf ? (def.lesson ?? 0) * 0.8 : 0;
      return 2 + bestTarget - cost;
    }
    // 担当カードの能力
    const tantou = this.defs[view.self.tantou];
    const ability = tantou?.ability;
    if (!ability) return -10;
    if (ability.window === "battle") {
      // アタック側+1: 自分がアタッカーで、+1で勝敗が変わる/守れるときだけ
      if (view.phase.type !== "battleSupport") return -10;
      const battle = view.phase.battle;
      if (battle.attackerPlayer !== view.playerId) return -6;
      const totals = this.battleTotals(view);
      if (!totals) return -10;
      const flips = totals.mine <= totals.theirs && totals.mine + 1 > totals.theirs;
      return flips ? 5 : -2;
    }
    // 教習力+1: タダで価値が出るので、教習前のインストラクターがいるなら真っ先に使う
    const readyLessons = view.self.field.filter((f) => !f.actedThisTurn && !f.rested).length;
    return readyLessons > 0 ? 9 : -3;
  }

  private scoreChoice(view: PlayerView, optionIndex: number): number {
    if (view.phase.type !== "choice") return 0;
    const pending = view.phase.pending;
    const option = pending.options[optionIndex];
    if (!option) return 0;
    const value = option.cardId ? this.cardValue(option.cardId) : 0;

    switch (pending.purpose) {
      case "janken":
        return 0; // ノイズでランダムに
      case "removeOpp":
      case "bounceOpp":
      case "discardOpp":
      case "debuffTarget":
        return value; // 相手の高価値カードを狙う
      case "discardOwn":
      case "bottomOwn":
        return -value; // 自分の低価値カードを手放す
      case "salvage":
      case "searchTake":
      case "summonOwn":
      case "untapOwn":
      case "buffTarget":
      case "lessonTarget":
        return value;
      case "chooseTrack": {
        // option 0 = 学科, 1 = 技能: 残りが多い方（完了済みでない方）を優先
        const remA = TRACK_GOALS.academic - view.self.academic;
        const remS = TRACK_GOALS.skill - view.self.skill;
        return optionIndex === 0 ? Math.min(remA, 3) : Math.min(remS, 3);
      }
      default:
        return value;
    }
  }
}

import {
  applyChoice,
  checkWin,
  effectiveCombat,
  modifyTrack,
  opponentOf,
  putInstructorOnField,
  removeInstructor,
  runQueue,
  startTurn,
  triggerOps,
} from "./effects";
import { shuffle } from "./rng";
import {
  AbilityDef,
  ApplyResult,
  BattleContext,
  CardDef,
  GameAction,
  GameContext,
  GameEvent,
  GameState,
  InstructorOnField,
  Phase,
  PlayerId,
  QueuedOp,
  INITIAL_HAND,
} from "./types";

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

function illegal(msg: string): never {
  throw new Error(`不正なアクション: ${msg}`);
}

/** 今、入力すべきプレイヤー。finished なら null */
export function playerToAct(state: GameState): PlayerId | null {
  switch (state.phase.type) {
    case "mulligan": {
      if (!state.players[0].mulliganDecided) return 0;
      if (!state.players[1].mulliganDecided) return 1;
      return null;
    }
    case "main":
      return state.turnPlayer;
    case "battleSupport":
      return state.phase.battle.priority;
    case "choice":
      return state.phase.pending.player;
    case "finished":
      return null;
  }
}

function findInstructor(state: GameState, player: PlayerId, uid: string): InstructorOnField {
  const inst = state.players[player].field.find((f) => f.uid === uid);
  if (!inst) illegal(`インストラクター ${uid} が場にいません`);
  return inst;
}

/** phase（choice の resume 含む）の battleSupport を取り出す */
function currentBattle(phase: Phase): BattleContext | null {
  if (phase.type === "battleSupport") return phase.battle;
  if (phase.type === "choice" && phase.resume.type === "battleSupport") {
    return phase.resume.battle;
  }
  return null;
}

/** バトル参加者が効果で場を離れていたらバトルを中断して main に戻す */
function checkBattleAborted(state: GameState, events: GameEvent[]): void {
  const battle = currentBattle(state.phase);
  if (!battle) return;
  const atkAlive = state.players[battle.attackerPlayer].field.some(
    (f) => f.uid === battle.attackerUid
  );
  const defAlive = state.players[opponentOf(battle.attackerPlayer)].field.some(
    (f) => f.uid === battle.defenderUid
  );
  if (atkAlive && defAlive) return;

  state.combatMods = state.combatMods.filter((m) => m.until !== "battleEnd");
  const main: Phase = { type: "main", canPlayInstructor: false };
  if (state.phase.type === "battleSupport") {
    state.phase = main;
  } else if (state.phase.type === "choice") {
    state.phase.resume = main;
  }
  void events;
}

/** 志萱: このバトルに自分の noSupportInOwnBattle 持ちが参加しているか */
export function supportsBlockedFor(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  battle: BattleContext
): boolean {
  const myBattlerUid = battle.attackerPlayer === player ? battle.attackerUid : battle.defenderUid;
  const inst = state.players[player].field.find((f) => f.uid === myBattlerUid);
  if (!inst) return false;
  return ctx.defs[inst.cardId].keywords?.includes("noSupportInOwnBattle") ?? false;
}

/** 起動できる能力を返す（起動できなければ null） */
export function usableAbility(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  uid: string | undefined
): { def: CardDef; ability: AbilityDef; inst?: InstructorOnField } | null {
  const p = state.players[player];
  if (uid !== undefined) {
    const inst = p.field.find((f) => f.uid === uid);
    if (!inst) return null;
    const def = ctx.defs[inst.cardId];
    if (!def.ability) return null;
    if (def.ability.oncePerTurn && inst.abilityUsedThisTurn) return null;
    if (def.ability.costRestSelf && inst.rested) return null;
    if (!abilityWindowOpen(state, player, def.ability)) return null;
    return { def, ability: def.ability, inst };
  }
  const def = ctx.defs[p.tantou];
  if (!def.ability) return null;
  if (def.ability.oncePerTurn && p.tantouAbilityUsedThisTurn) return null;
  if (!abilityWindowOpen(state, player, def.ability)) return null;
  return { def, ability: def.ability };
}

function abilityWindowOpen(state: GameState, player: PlayerId, ability: AbilityDef): boolean {
  if (ability.window === "main") {
    if (state.phase.type !== "main" || state.turnPlayer !== player) return false;
  } else {
    // battle: 優先権を持っている時に使える
    if (state.phase.type !== "battleSupport" || state.phase.battle.priority !== player) {
      return false;
    }
  }
  // 対象が存在しない起動は無駄撃ちになるので不可にする
  for (const op of ability.ops) {
    if (
      (op.op === "lessonMod" && op.target !== "source") &&
      state.players[player].field.length === 0
    ) {
      return false;
    }
    if (op.op === "removeTarget" && state.players[1 - player].field.length === 0) {
      return false;
    }
  }
  return true;
}

function resolveBattle(
  ctx: GameContext,
  state: GameState,
  battle: BattleContext,
  events: GameEvent[]
): void {
  const atkP = battle.attackerPlayer;
  const defP = opponentOf(atkP);
  const attacker = state.players[atkP].field.find((f) => f.uid === battle.attackerUid);
  const defender = state.players[defP].field.find((f) => f.uid === battle.defenderUid);

  if (!attacker || !defender) {
    // 効果でどちらかが場を離れていた（通常は checkBattleAborted 済み）
    state.combatMods = state.combatMods.filter((m) => m.until !== "battleEnd");
    state.phase = { type: "main", canPlayInstructor: false };
    return;
  }

  const queue: QueuedOp[] = [];

  // 【バトル時】
  queue.push(...triggerOps(ctx, atkP, ctx.defs[attacker.cardId], "onBattle", attacker.uid));
  queue.push(...triggerOps(ctx, defP, ctx.defs[defender.cardId], "onBattle", defender.uid));

  const buffFor = (pid: PlayerId) =>
    battle.buffs.filter((b) => b.player === pid).reduce((a, b) => a + b.amount, 0);
  const attackerTotal = effectiveCombat(ctx, state, atkP, attacker) + buffFor(atkP);
  const defenderTotal = effectiveCombat(ctx, state, defP, defender) + buffFor(defP);

  const removedUids: string[] = [];
  if (attackerTotal < defenderTotal) removedUids.push(attacker.uid);
  else if (defenderTotal < attackerTotal) removedUids.push(defender.uid);
  else removedUids.push(attacker.uid, defender.uid);

  events.push({ type: "battleResolved", attackerPlayer: atkP, attackerTotal, defenderTotal, removedUids });

  // バトル終了: バトル限定の修正値をクリアし、main に戻してから退場処理
  state.combatMods = state.combatMods.filter((m) => m.until !== "battleEnd");
  state.phase = { type: "main", canPlayInstructor: false };

  for (const uid of removedUids) {
    const owner = uid === attacker.uid ? atkP : defP;
    removeInstructor(ctx, state, owner, uid, events, queue);
  }
  runQueue(ctx, state, queue, events);
}

export function applyAction(ctx: GameContext, prev: GameState, action: GameAction): ApplyResult {
  if (prev.phase.type === "finished") illegal("ゲームは終了しています");
  const state = clone(prev);
  const events: GameEvent[] = [];
  const actor = playerToAct(state);
  if (actor !== action.player) {
    illegal(`プレイヤー${action.player}の手番ではありません`);
  }

  switch (action.type) {
    case "mulligan": {
      if (state.phase.type !== "mulligan") illegal("マリガンフェイズではありません");
      const p = state.players[action.player];
      if (p.mulliganDecided) illegal("すでにマリガンを決定済みです");
      if (action.redraw) {
        const all = [...p.deck, ...p.hand];
        const s = shuffle(state.rngState, all);
        state.rngState = s.rngState;
        p.hand = s.value.slice(0, INITIAL_HAND);
        p.deck = s.value.slice(INITIAL_HAND);
      }
      p.mulliganDecided = true;
      events.push({ type: "mulliganTaken", player: action.player, redraw: action.redraw });

      if (state.players.every((pl) => pl.mulliganDecided)) {
        startTurn(ctx, state, events);
      }
      break;
    }

    case "playInstructor": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      if (!state.phase.canPlayInstructor) {
        illegal("インストラクターを出せるのはメインフェイズの最初だけです");
      }
      const cardId = state.players[action.player].hand[action.handIndex];
      if (cardId === undefined) illegal("手札の指定が不正です");
      if (ctx.defs[cardId].type !== "instructor") illegal("インストラクターカードではありません");

      state.phase.canPlayInstructor = false;
      const queue: QueuedOp[] = [];
      putInstructorOnField(ctx, state, action.player, action.handIndex, events, queue);
      runQueue(ctx, state, queue, events);
      break;
    }

    case "instructorAction": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      const inst = findInstructor(state, action.player, action.uid);
      if (inst.actedThisTurn) illegal("このインストラクターは行動済みです");
      if (inst.rested) illegal("休憩中のインストラクターは行動できません");
      inst.actedThisTurn = true;
      // 行動を始めたら、以降このターンはインストラクターを出せない
      state.phase.canPlayInstructor = false;

      events.push({
        type: "instructorActed",
        player: action.player,
        uid: action.uid,
        cardId: inst.cardId,
        action: action.action,
      });

      if (action.action === "doNothing") {
        events.push({ type: "didNothing", player: action.player, uid: action.uid });
        break;
      }

      const track = action.action === "skill" ? "skill" : "academic";
      inst.rested = true;
      events.push({ type: "instructorRested", player: action.player, uid: action.uid });

      // 教習時トリガー（梨本のじゃんけん等）→ その後に教習を進める
      const queue: QueuedOp[] = [
        ...triggerOps(ctx, action.player, ctx.defs[inst.cardId], "onLesson", inst.uid, track),
        { op: { op: "advanceSourceTrack" }, ctx: { owner: action.player, sourceUid: inst.uid, track } },
      ];
      runQueue(ctx, state, queue, events);
      break;
    }

    case "declareBattle": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      const atk = findInstructor(state, action.player, action.attackerUid);
      const def = findInstructor(state, opponentOf(action.player), action.defenderUid);
      if (atk.actedThisTurn) illegal("このインストラクターは行動済みです");
      if (atk.rested) illegal("休憩中のインストラクターはバトルできません");
      if (!def.rested) illegal("バトルの対象は休憩状態のインストラクターのみです");
      const atkDef = ctx.defs[atk.cardId];
      if (atkDef.keywords?.includes("cantAttackOnEntry") && atk.enteredThisTurn) {
        illegal("このインストラクターは登場したターンにアタックできません");
      }

      atk.actedThisTurn = true;
      atk.rested = true; // 仕掛けた側は即休憩
      events.push({
        type: "battleDeclared",
        attackerPlayer: action.player,
        attackerUid: atk.uid,
        defenderUid: def.uid,
      });
      events.push({ type: "instructorRested", player: action.player, uid: atk.uid });

      state.phase = {
        type: "battleSupport",
        battle: {
          attackerPlayer: action.player,
          attackerUid: atk.uid,
          defenderUid: def.uid,
          priority: opponentOf(action.player), // 防御側から
          consecutivePasses: 0,
          buffs: [],
        },
      };

      // 【アタック時】【相手のアタック時】
      const queue: QueuedOp[] = [
        ...triggerOps(ctx, action.player, atkDef, "onAttack", atk.uid),
        ...triggerOps(ctx, opponentOf(action.player), ctx.defs[def.cardId], "onDefendAttacked", def.uid),
      ];
      runQueue(ctx, state, queue, events);
      checkBattleAborted(state, events);
      break;
    }

    case "playSupport": {
      const p = state.players[action.player];
      const cardId = p.hand[action.handIndex];
      if (cardId === undefined) illegal("手札の指定が不正です");
      const def = ctx.defs[cardId];
      if (def.type !== "support") illegal("サポートカードではありません");

      if (state.phase.type === "battleSupport") {
        const battle = state.phase.battle;
        if (battle.priority !== action.player) illegal("優先権がありません");
        if (def.timing !== "battle" && def.timing !== "any") {
          illegal("このサポートカードはバトル中に使えません");
        }
        if (supportsBlockedFor(ctx, state, action.player, battle)) {
          illegal("このバトル中はサポートカードを使えません");
        }
        // プレイしたら連続パスをリセットし、優先権を相手へ
        battle.consecutivePasses = 0;
        battle.priority = opponentOf(action.player);
      } else if (state.phase.type === "main") {
        if (state.turnPlayer !== action.player) illegal("自分のターンではありません");
        if (def.timing !== "main" && def.timing !== "any") {
          illegal("このサポートカードはメインフェイズに使えません");
        }
      } else {
        illegal("今はサポートカードを使えません");
      }

      p.hand.splice(action.handIndex, 1);
      p.outOfPlay.push(cardId);
      events.push({ type: "supportPlayed", player: action.player, cardId });

      const queue: QueuedOp[] = triggerOps(ctx, action.player, def, "onSupport", undefined);
      runQueue(ctx, state, queue, events);
      checkBattleAborted(state, events);
      break;
    }

    case "passSupport": {
      if (state.phase.type !== "battleSupport") illegal("サポートフェイズではありません");
      const battle = state.phase.battle;
      if (battle.priority !== action.player) illegal("優先権がありません");
      events.push({ type: "supportPassed", player: action.player });
      battle.consecutivePasses++;
      if (battle.consecutivePasses >= 2) {
        resolveBattle(ctx, state, battle, events);
      } else {
        battle.priority = opponentOf(action.player);
      }
      break;
    }

    case "activateAbility": {
      const found = usableAbility(ctx, state, action.player, action.uid);
      if (!found) illegal("この能力は今使えません");
      const { def, ability, inst } = found;

      if (inst) {
        if (ability.costRestSelf) {
          inst.rested = true;
          events.push({ type: "instructorRested", player: action.player, uid: inst.uid });
        }
        if (ability.oncePerTurn) inst.abilityUsedThisTurn = true;
      } else {
        if (ability.oncePerTurn) state.players[action.player].tantouAbilityUsedThisTurn = true;
      }
      events.push({ type: "abilityActivated", player: action.player, cardId: def.id });

      // バトル中に起動したら相手に応答の機会を返す（連続パスをリセット。優先権は保持）
      if (state.phase.type === "battleSupport") {
        state.phase.battle.consecutivePasses = 0;
      }

      const queue: QueuedOp[] = ability.ops.map((op) => ({
        op,
        ctx: { owner: action.player, sourceUid: inst?.uid },
      }));
      runQueue(ctx, state, queue, events);
      checkBattleAborted(state, events);
      break;
    }

    case "resolveChoice": {
      if (state.phase.type !== "choice") illegal("選択フェイズではありません");
      const pending = state.phase.pending;
      if (pending.player !== action.player) illegal("選択権がありません");
      if (action.optionIndex < 0 || action.optionIndex >= pending.options.length) {
        illegal("その選択肢は選べません");
      }
      applyChoice(ctx, state, action.optionIndex, events);
      checkBattleAborted(state, events);
      break;
    }

    case "endTurn": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      if (state.turnPlayer !== action.player) illegal("自分のターンではありません");
      const pid = action.player;
      const p = state.players[pid];
      events.push({ type: "turnEnded", player: pid });

      const queue: QueuedOp[] = [];
      // 【自分のターン終了時】: 場のインストラクター → 担当カード
      for (const inst of p.field) {
        queue.push(...triggerOps(ctx, pid, ctx.defs[inst.cardId], "onTurnEnd", inst.uid));
      }
      queue.push(...triggerOps(ctx, pid, ctx.defs[p.tantou], "onTurnEnd", undefined));
      // 送迎サポートの元気化予約
      for (let i = 0; i < p.untapCharges; i++) {
        queue.push({ op: { op: "untapChoice" }, ctx: { owner: pid } });
      }
      queue.push({ op: { op: "endTurnFinalize" }, ctx: { owner: pid } });
      runQueue(ctx, state, queue, events);
      break;
    }
  }

  return { state, events };
}

export { modifyTrack, checkWin };

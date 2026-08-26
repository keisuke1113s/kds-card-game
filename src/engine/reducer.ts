import { modifyTrack, runCardEffects, takeFromRevealed } from "./effects";
import { shuffle } from "./rng";
import {
  ApplyResult,
  BattleContext,
  GameAction,
  GameContext,
  GameEvent,
  GameState,
  InstructorOnField,
  Phase,
  PlayerId,
  ACADEMIC_GOAL,
  SKILL_GOAL,
  INITIAL_HAND,
} from "./types";

function newUid(state: GameState): string {
  // 場＋場外の総数はカードを出すたびに単調増加するため、これだけで一意。
  // 状態のみから導出するのでリプレイしても同一UIDになる。
  const n =
    state.players[0].field.length +
    state.players[0].outOfPlay.length +
    state.players[1].field.length +
    state.players[1].outOfPlay.length;
  return `u${n}`;
}

function clone(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

function illegal(msg: string): never {
  throw new Error(`不正なアクション: ${msg}`);
}

function opponent(p: PlayerId): PlayerId {
  return (1 - p) as PlayerId;
}

/** 今、入力すべきプレイヤー。finished なら null */
export function playerToAct(state: GameState): PlayerId | null {
  switch (state.phase.type) {
    case "mulligan": {
      if (!state.players[0].mulliganDecided) return 0;
      if (!state.players[1].mulliganDecided) return 1;
      return null; // 遷移中（起こらない）
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

/** 勝利条件チェック（学科10＋技能19の両方）。達成していれば phase を finished に */
function checkWin(state: GameState, events: GameEvent[]): void {
  if (state.phase.type === "finished") return;
  for (const pid of [0, 1] as PlayerId[]) {
    const p = state.players[pid];
    if (p.academic >= ACADEMIC_GOAL && p.skill >= SKILL_GOAL) {
      state.phase = { type: "finished", winner: pid, reason: "bothTracksComplete" };
      events.push({ type: "gameEnded", winner: pid, reason: "bothTracksComplete" });
      return;
    }
  }
}

function findInstructor(
  state: GameState,
  player: PlayerId,
  uid: string
): InstructorOnField {
  const inst = state.players[player].field.find((f) => f.uid === uid);
  if (!inst) illegal(`インストラクター ${uid} が場にいません`);
  return inst;
}

/** ターン開始処理: 元気化 → 1枚ドロー（引けなければ敗北） */
function startTurn(state: GameState, events: GameEvent[]): void {
  const pid = state.turnPlayer;
  const p = state.players[pid];
  state.turnNumber++;
  events.push({ type: "turnStarted", player: pid, turnNumber: state.turnNumber });

  for (const inst of p.field) {
    if (inst.rested) {
      inst.rested = false;
      events.push({ type: "instructorUntapped", player: pid, uid: inst.uid });
    }
    inst.actedThisTurn = false;
  }

  const drawn = p.deck.shift();
  if (drawn === undefined) {
    const winner = opponent(pid);
    state.phase = { type: "finished", winner, reason: "deckOut" };
    events.push({ type: "gameEnded", winner, reason: "deckOut" });
    return;
  }
  p.hand.push(drawn);
  events.push({ type: "cardDrawn", player: pid, cardId: drawn });

  state.phase = { type: "main", canPlayInstructor: true };
}

/** バトル解決: 戦闘力比較 → 低い方（同値は両方）場外 */
function resolveBattle(
  ctx: GameContext,
  state: GameState,
  battle: BattleContext,
  events: GameEvent[]
): void {
  const atkP = battle.attackerPlayer;
  const defP = opponent(atkP);

  const attacker = findInstructor(state, atkP, battle.attackerUid);
  const defender = findInstructor(state, defP, battle.defenderUid);

  // 【バトル時】トリガー
  for (const [pid, inst] of [
    [atkP, attacker],
    [defP, defender],
  ] as const) {
    runCardEffects(ctx, state, pid, ctx.defs[inst.cardId], "onBattle", events);
  }

  const buffFor = (pid: PlayerId) =>
    battle.buffs.filter((b) => b.player === pid).reduce((a, b) => a + b.amount, 0);

  const attackerTotal = (ctx.defs[attacker.cardId].combat ?? 0) + buffFor(atkP);
  const defenderTotal = (ctx.defs[defender.cardId].combat ?? 0) + buffFor(defP);

  const removedUids: string[] = [];
  const remove = (pid: PlayerId, inst: InstructorOnField) => {
    const p = state.players[pid];
    p.field = p.field.filter((f) => f.uid !== inst.uid);
    p.outOfPlay.push(inst.cardId);
    removedUids.push(inst.uid);
    events.push({
      type: "instructorRemoved",
      player: pid,
      uid: inst.uid,
      cardId: inst.cardId,
    });
  };

  if (attackerTotal < defenderTotal) remove(atkP, attacker);
  else if (defenderTotal < attackerTotal) remove(defP, defender);
  else {
    remove(atkP, attacker);
    remove(defP, defender);
  }

  events.push({
    type: "battleResolved",
    attackerPlayer: atkP,
    attackerTotal,
    defenderTotal,
    removedUids,
  });

  state.phase = { type: "main", canPlayInstructor: false };
  checkWin(state, events); // バトル時効果でトラックが動く可能性
}

export function applyAction(
  ctx: GameContext,
  prev: GameState,
  action: GameAction
): ApplyResult {
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
        // 手札を山札に戻してシャッフルし、5枚引き直す
        const all = [...p.deck, ...p.hand];
        const s = shuffle(state.rngState, all);
        state.rngState = s.rngState;
        p.hand = s.value.slice(0, INITIAL_HAND);
        p.deck = s.value.slice(INITIAL_HAND);
      }
      p.mulliganDecided = true;
      events.push({ type: "mulliganTaken", player: action.player, redraw: action.redraw });

      if (state.players.every((pl) => pl.mulliganDecided)) {
        startTurn(state, events);
      }
      break;
    }

    case "playInstructor": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      if (!state.phase.canPlayInstructor) {
        illegal("インストラクターを出せるのはメインフェイズの最初だけです");
      }
      const p = state.players[action.player];
      const cardId = p.hand[action.handIndex];
      if (cardId === undefined) illegal("手札の指定が不正です");
      const def = ctx.defs[cardId];
      if (def.type !== "instructor") illegal("インストラクターカードではありません");

      p.hand.splice(action.handIndex, 1);
      const inst: InstructorOnField = {
        uid: newUid(state),
        cardId,
        rested: false,
        actedThisTurn: false,
      };
      p.field.push(inst);
      state.phase.canPlayInstructor = false;
      events.push({
        type: "instructorPlayed",
        player: action.player,
        uid: inst.uid,
        cardId,
      });

      // 【登場時】
      runCardEffects(ctx, state, action.player, def, "onPlay", events);
      checkWin(state, events);
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

      if (action.action === "doNothing") {
        // なにもしない: 元気なまま
        events.push({ type: "didNothing", player: action.player, uid: action.uid });
        break;
      }

      // 技能/学科を進める → 休憩状態に
      const def = ctx.defs[inst.cardId];
      inst.rested = true;
      events.push({ type: "instructorRested", player: action.player, uid: action.uid });
      modifyTrack(
        state,
        action.player,
        action.action === "skill" ? "skill" : "academic",
        def.lesson ?? 0,
        events
      );
      checkWin(state, events);
      break;
    }

    case "declareBattle": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      const atk = findInstructor(state, action.player, action.attackerUid);
      const def = findInstructor(state, opponent(action.player), action.defenderUid);
      if (atk.actedThisTurn) illegal("このインストラクターは行動済みです");
      if (atk.rested) illegal("休憩中のインストラクターはバトルできません");
      if (!def.rested) illegal("バトルの対象は休憩状態のインストラクターのみです");

      atk.actedThisTurn = true;
      // バトルも行動なので、以降このターンはインストラクターを出せない
      // （バトル解決後の main フェイズは canPlayInstructor: false で復帰する）
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
          priority: opponent(action.player), // 防御側から
          consecutivePasses: 0,
          buffs: [],
        },
      };

      // 【アタック時】【相手のアタック時】
      runCardEffects(ctx, state, action.player, ctx.defs[atk.cardId], "onAttack", events);
      if (state.phase.type === "battleSupport") {
        runCardEffects(
          ctx,
          state,
          opponent(action.player),
          ctx.defs[def.cardId],
          "onDefendAttacked",
          events
        );
      }
      checkWin(state, events);
      break;
    }

    case "playSupport": {
      const p = state.players[action.player];
      const cardId = p.hand[action.handIndex];
      if (cardId === undefined) illegal("手札の指定が不正です");
      const def = ctx.defs[cardId];
      if (def.type !== "support") illegal("サポートカードではありません");

      if (state.phase.type === "battleSupport") {
        if (state.phase.battle.priority !== action.player) illegal("優先権がありません");
        if (def.timing !== "battle" && def.timing !== "any") {
          illegal("このサポートカードはバトル中に使えません");
        }
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
      runCardEffects(ctx, state, action.player, def, "onSupport", events);

      // バトル中: プレイしたら連続パスはリセットし、優先権を相手へ
      if (state.phase.type === "battleSupport") {
        state.phase.battle.consecutivePasses = 0;
        state.phase.battle.priority = opponent(action.player);
      }
      checkWin(state, events);
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
        battle.priority = opponent(action.player);
      }
      break;
    }

    case "resolveChoice": {
      if (state.phase.type !== "choice") illegal("選択フェイズではありません");
      const pending = state.phase.pending;
      if (pending.player !== action.player) illegal("選択権がありません");
      if (!pending.selectable.includes(action.optionIndex)) {
        illegal("その選択肢は選べません");
      }
      const resume = state.phase.resume;
      state.phase = resume;
      takeFromRevealed(state, pending.player, pending.revealed, action.optionIndex, events);
      checkWin(state, events);
      break;
    }

    case "endTurn": {
      if (state.phase.type !== "main") illegal("メインフェイズではありません");
      if (state.turnPlayer !== action.player) illegal("自分のターンではありません");
      const pid = action.player;
      events.push({ type: "turnEnded", player: pid });

      // 【自分のターン終了時】: 場のインストラクター＋担当カード
      const p = state.players[pid];
      for (const inst of [...p.field]) {
        runCardEffects(ctx, state, pid, ctx.defs[inst.cardId], "onTurnEnd", events);
        if (state.phase.type !== "main") break; // choice 等に入ったら中断（現状の語彙では起こらない）
      }
      runCardEffects(ctx, state, pid, ctx.defs[p.tantou], "onTurnEnd", events);
      checkWin(state, events);
      // checkWin が phase をミューテートするため、狭められた型を戻して判定
      if ((state.phase as Phase).type === "finished") break;

      state.turnPlayer = opponent(pid);
      startTurn(state, events);
      break;
    }
  }

  return { state, events };
}

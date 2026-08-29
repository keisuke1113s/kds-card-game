import { nextInt, shuffle } from "./rng";
import {
  ACADEMIC_GOAL,
  CardDef,
  EffectContext,
  EffectOp,
  GameContext,
  GameEvent,
  GameState,
  InstructorOnField,
  PendingChoice,
  Phase,
  PlayerId,
  QueuedOp,
  ResolveSpec,
  SKILL_GOAL,
  Track,
  TRACK_GOALS,
  Trigger,
} from "./types";

// 効果は QueuedOp のキューとして逐次実行される。
// プレイヤー入力が必要な op は phase を choice にして中断し、
// resolveChoice で選択が適用されたあと残りのキューが再開される。

export function opponentOf(p: PlayerId): PlayerId {
  return (1 - p) as PlayerId;
}

export function newUid(state: GameState): string {
  // 場＋場外の総数はカードが出るたび単調増加するため一意。状態のみから導出（リプレイ決定性）
  const n =
    state.players[0].field.length +
    state.players[0].outOfPlay.length +
    state.players[1].field.length +
    state.players[1].outOfPlay.length;
  return `u${state.turnNumber}-${n}`;
}

export function cardName(ctx: GameContext, cardId: string): string {
  return ctx.defs[cardId]?.name ?? cardId;
}

/** トリガーに合致する効果を QueuedOp 列にする */
export function triggerOps(
  ctx: GameContext,
  owner: PlayerId,
  card: CardDef,
  trigger: Trigger,
  sourceUid?: string,
  track?: Track
): QueuedOp[] {
  const out: QueuedOp[] = [];
  for (const eff of card.effects ?? []) {
    if (eff.trigger !== trigger) continue;
    for (const op of eff.ops) {
      out.push({ op, ctx: { owner, sourceUid, sourceCardId: card.id, track } });
    }
  }
  return out;
}

// ---------------------------------------------------------------- 修正値

export function effectiveCombat(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  inst: InstructorOnField
): number {
  const base = ctx.defs[inst.cardId].combat ?? 0;
  const mods = state.combatMods
    .filter((m) => m.player === player && m.uid === inst.uid)
    .reduce((a, m) => a + m.amount, 0);
  return base + mods;
}

export function effectiveLesson(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  inst: InstructorOnField
): number {
  const base = ctx.defs[inst.cardId].lesson ?? 0;
  const mods = state.lessonMods
    .filter((m) => m.player === player && (m.uid === null || m.uid === inst.uid))
    .reduce((a, m) => a + m.amount, 0);
  return Math.max(0, base + mods);
}

// ---------------------------------------------------------------- 共通処理

export function checkWin(state: GameState, events: GameEvent[]): void {
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

export function modifyTrack(
  state: GameState,
  player: PlayerId,
  track: Track,
  amount: number,
  events: GameEvent[]
): void {
  const p = state.players[player];
  const goal = TRACK_GOALS[track];
  const before = p[track];
  const after = Math.max(0, Math.min(goal, before + amount));
  p[track] = after;
  events.push({ type: "trackAdvanced", player, track, amount: after - before, newValue: after });
}

/** 相手の効果から守られているか（奥村） */
function isProtected(
  ctx: GameContext,
  actor: PlayerId,
  targetPlayer: PlayerId,
  cardId: string
): boolean {
  if (actor === targetPlayer) return false;
  return ctx.defs[cardId].keywords?.includes("immuneToOpponentEffects") ?? false;
}

/** インストラクターを退場させ、【退場時】効果をキューの先頭に積む */
export function removeInstructor(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  uid: string,
  events: GameEvent[],
  queue: QueuedOp[]
): void {
  const p = state.players[player];
  const inst = p.field.find((f) => f.uid === uid);
  if (!inst) return;
  p.field = p.field.filter((f) => f.uid !== uid);
  p.outOfPlay.push(inst.cardId);
  events.push({ type: "instructorRemoved", player, uid, cardId: inst.cardId });
  // 【退場時】
  queue.unshift(...triggerOps(ctx, player, ctx.defs[inst.cardId], "onRemoved", undefined));
}

/** 手札からインストラクターを場に出す（登場時効果をキュー先頭に積む） */
export function putInstructorOnField(
  ctx: GameContext,
  state: GameState,
  player: PlayerId,
  handIndex: number,
  events: GameEvent[],
  queue: QueuedOp[]
): void {
  const p = state.players[player];
  const cardId = p.hand[handIndex];
  if (cardId === undefined) return;
  p.hand.splice(handIndex, 1);
  const inst: InstructorOnField = {
    uid: newUid(state),
    cardId,
    rested: false,
    actedThisTurn: false,
    enteredThisTurn: true,
    abilityUsedThisTurn: false,
  };
  p.field.push(inst);
  events.push({ type: "instructorPlayed", player, uid: inst.uid, cardId });
  queue.unshift(...triggerOps(ctx, player, ctx.defs[cardId], "onPlay", inst.uid));
}

/** ターン開始処理: フラグ類リセット → 元気化 → 1枚ドロー（引けなければ敗北） */
export function startTurn(ctx: GameContext, state: GameState, events: GameEvent[]): void {
  const pid = state.turnPlayer;
  const p = state.players[pid];
  state.turnNumber++;
  events.push({ type: "turnStarted", player: pid, turnNumber: state.turnNumber });

  // 【ターン1回】系はゲームターンごとにリセット
  for (const pl of state.players) {
    pl.tantouAbilityUsedThisTurn = false;
    for (const inst of pl.field) inst.abilityUsedThisTurn = false;
  }

  for (const inst of p.field) {
    if (inst.rested) {
      inst.rested = false;
      events.push({ type: "instructorUntapped", player: pid, uid: inst.uid });
    }
    inst.actedThisTurn = false;
    inst.enteredThisTurn = false;
  }

  const drawn = p.deck.shift();
  if (drawn === undefined) {
    const winner = opponentOf(pid);
    state.phase = { type: "finished", winner, reason: "deckOut" };
    events.push({ type: "gameEnded", winner, reason: "deckOut" });
    return;
  }
  p.hand.push(drawn);
  events.push({ type: "cardDrawn", player: pid, cardId: drawn });

  state.phase = { type: "main", canPlayInstructor: true };
}

// ---------------------------------------------------------------- キュー実行

function suspend(state: GameState, pending: PendingChoice, events: GameEvent[]): void {
  events.push({ type: "choiceRequired", player: pending.player });
  state.phase = { type: "choice", pending, resume: state.phase };
}

function makePending(
  player: PlayerId,
  owner: PlayerId,
  prompt: string,
  purpose: string,
  options: { label: string; cardId?: string }[],
  resolve: ResolveSpec,
  queue: QueuedOp[],
  sourceCtx: EffectContext
): PendingChoice {
  return { player, owner, prompt, purpose, options, resolve, queue, sourceCtx };
}

/**
 * キューを逐次実行する。中断（choice）または終局で戻る。
 * 呼び出し側は queue の残りを気にしなくてよい（中断時は pending.queue に保存される）。
 */
export function runQueue(
  ctx: GameContext,
  state: GameState,
  queue: QueuedOp[],
  events: GameEvent[]
): void {
  while (queue.length > 0) {
    if (state.phase.type === "finished") return;
    const item = queue.shift()!;
    applyOp(ctx, state, item.op, item.ctx, events, queue);
    checkWin(state, events);
    const after = (state.phase as Phase).type;
    if (after === "choice" || after === "finished") return;
  }
}

function applyOp(
  ctx: GameContext,
  state: GameState,
  op: EffectOp,
  ec: EffectContext,
  events: GameEvent[],
  queue: QueuedOp[]
): void {
  const owner = ec.owner;
  const opp = opponentOf(owner);
  const me = state.players[owner];
  const them = state.players[opp];

  switch (op.op) {
    case "modifyTrack": {
      const target = op.target === "self" ? owner : opp;
      modifyTrack(state, target, op.track, op.amount, events);
      break;
    }

    case "modifyTrackChoice": {
      const sign = op.amount >= 0 ? `＋${op.amount}` : `${op.amount}`;
      // 進める場合、すでに修了している教習は選ばせない（+1が無駄になるため）。
      // 片方だけ残っているなら聞かずにそちらへ進める
      if (op.amount > 0) {
        const canAcademic = me.academic < ACADEMIC_GOAL;
        const canSkill = me.skill < SKILL_GOAL;
        if (!canAcademic && canSkill) {
          modifyTrack(state, owner, "skill", op.amount, events);
          break;
        }
        if (!canSkill && canAcademic) {
          modifyTrack(state, owner, "academic", op.amount, events);
          break;
        }
        if (!canAcademic && !canSkill) break;
      }
      suspend(
        state,
        makePending(
          owner,
          owner,
          `どちらの教習を${sign}しますか？`,
          "chooseTrack",
          [{ label: `学科 ${sign}` }, { label: `技能 ${sign}` }],
          { type: "track", amount: op.amount },
          queue.splice(0),
          ec
        ),
        events
      );
      break;
    }

    case "draw": {
      for (let i = 0; i < op.count; i++) {
        const cardId = me.deck.shift();
        if (cardId === undefined) break; // 効果ドローは山札切れでも敗北しない
        me.hand.push(cardId);
        events.push({ type: "cardDrawn", player: owner, cardId });
      }
      break;
    }

    case "searchTop": {
      const revealed = me.deck.splice(0, op.count);
      if (revealed.length === 0) break;
      events.push({ type: "cardsRevealed", player: owner, count: revealed.length, cardIds: revealed });
      const matching = revealed
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => ctx.defs[id].type === op.filterType);
      if (matching.length === 0) {
        me.deck.push(...revealed);
      } else if (matching.length === 1) {
        takeFromRevealed(state, owner, revealed, matching[0].i, events);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "手札に加えるカードを選んでください",
            "searchTake",
            matching.map(({ id }) => ({ label: cardName(ctx, id), cardId: id })),
            { type: "searchTake", revealed, map: matching.map(({ i }) => i) },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "buffCombat": {
      if (state.phase.type !== "battleSupport") break;
      state.phase.battle.buffs.push({ player: owner, amount: op.amount });
      events.push({ type: "battleBuffApplied", player: owner, amount: op.amount });
      break;
    }

    case "combatMod": {
      const until = op.until;
      if (op.target === "source") {
        if (ec.sourceUid) {
          state.combatMods.push({ player: owner, uid: ec.sourceUid, amount: op.amount, until });
          events.push({ type: "combatModApplied", player: owner, uid: ec.sourceUid, amount: op.amount });
        }
        break;
      }
      if (op.target === "battleAttacker") {
        if (state.phase.type === "battleSupport") {
          const b = state.phase.battle;
          state.combatMods.push({ player: b.attackerPlayer, uid: b.attackerUid, amount: op.amount, until });
          events.push({ type: "combatModApplied", player: b.attackerPlayer, uid: b.attackerUid, amount: op.amount });
        }
        break;
      }
      // chooseOwn / chooseOpponent
      const targetPlayer = op.target === "chooseOwn" ? owner : opp;
      const candidates = state.players[targetPlayer].field.filter(
        (f) => !isProtected(ctx, owner, targetPlayer, f.cardId)
      );
      if (candidates.length === 0) break;
      const applyTo = (uid: string) => {
        state.combatMods.push({ player: targetPlayer, uid, amount: op.amount, until });
        events.push({ type: "combatModApplied", player: targetPlayer, uid, amount: op.amount });
      };
      if (candidates.length === 1) {
        applyTo(candidates[0].uid);
      } else {
        const sign = op.amount >= 0 ? `＋${op.amount}` : `${op.amount}`;
        suspend(
          state,
          makePending(
            owner,
            owner,
            `戦闘力を${sign}するインストラクターを選んでください`,
            op.amount >= 0 ? "buffTarget" : "debuffTarget",
            candidates.map((f) => ({ label: cardName(ctx, f.cardId), cardId: f.cardId })),
            { type: "targetUid", uids: candidates.map((f) => f.uid), action: "combatMod", amount: op.amount, until },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "lessonMod": {
      if (op.target === "allOwn") {
        state.lessonMods.push({ player: owner, uid: null, amount: op.amount });
        events.push({ type: "lessonModApplied", player: owner, uid: null, amount: op.amount });
        break;
      }
      if (op.target === "source") {
        if (ec.sourceUid) {
          state.lessonMods.push({ player: owner, uid: ec.sourceUid, amount: op.amount });
          events.push({ type: "lessonModApplied", player: owner, uid: ec.sourceUid, amount: op.amount });
        }
        break;
      }
      const candidates = me.field;
      if (candidates.length === 0) break;
      if (candidates.length === 1) {
        state.lessonMods.push({ player: owner, uid: candidates[0].uid, amount: op.amount });
        events.push({ type: "lessonModApplied", player: owner, uid: candidates[0].uid, amount: op.amount });
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            `教習力を＋${op.amount}するインストラクターを選んでください`,
            "lessonTarget",
            candidates.map((f) => ({ label: cardName(ctx, f.cardId), cardId: f.cardId })),
            { type: "targetUid", uids: candidates.map((f) => f.uid), action: "lessonMod", amount: op.amount },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "removeTarget": {
      const candidates = them.field.filter((f) => !isProtected(ctx, owner, opp, f.cardId));
      if (candidates.length === 0) break;
      if (candidates.length === 1) {
        removeInstructor(ctx, state, opp, candidates[0].uid, events, queue);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "退場させるインストラクターを選んでください",
            "removeOpp",
            candidates.map((f) => ({ label: cardName(ctx, f.cardId), cardId: f.cardId })),
            { type: "targetUid", uids: candidates.map((f) => f.uid), action: "remove" },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "removeSource": {
      if (ec.sourceUid) removeInstructor(ctx, state, owner, ec.sourceUid, events, queue);
      break;
    }

    case "removeAllExceptSource": {
      // 自分の場: 発生源以外すべて。相手の場: 保護されていないものすべて
      for (const inst of [...me.field]) {
        if (inst.uid !== ec.sourceUid) removeInstructor(ctx, state, owner, inst.uid, events, queue);
      }
      for (const inst of [...them.field]) {
        if (!isProtected(ctx, owner, opp, inst.cardId)) {
          removeInstructor(ctx, state, opp, inst.uid, events, queue);
        }
      }
      break;
    }

    case "removeBothBattlers": {
      if (state.phase.type !== "battleSupport") break;
      const b = state.phase.battle;
      const defPlayer = opponentOf(b.attackerPlayer);
      // 相手側のバトル参加者が保護されている場合は残る
      const atkInst = state.players[b.attackerPlayer].field.find((f) => f.uid === b.attackerUid);
      const defInst = state.players[defPlayer].field.find((f) => f.uid === b.defenderUid);
      if (atkInst && !isProtected(ctx, owner, b.attackerPlayer, atkInst.cardId)) {
        removeInstructor(ctx, state, b.attackerPlayer, b.attackerUid, events, queue);
      }
      if (defInst && !isProtected(ctx, owner, defPlayer, defInst.cardId)) {
        removeInstructor(ctx, state, defPlayer, b.defenderUid, events, queue);
      }
      break;
    }

    case "bounceTarget": {
      const candidates = them.field.filter(
        (f) => f.rested && !isProtected(ctx, owner, opp, f.cardId)
      );
      if (candidates.length === 0) break;
      const bounce = (uid: string) => {
        const inst = them.field.find((f) => f.uid === uid)!;
        them.field = them.field.filter((f) => f.uid !== uid);
        them.hand.push(inst.cardId);
        events.push({ type: "instructorBounced", player: opp, uid, cardId: inst.cardId });
      };
      if (candidates.length === 1) {
        bounce(candidates[0].uid);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "手札に戻すインストラクターを選んでください",
            "bounceOpp",
            candidates.map((f) => ({ label: cardName(ctx, f.cardId), cardId: f.cardId })),
            { type: "targetUid", uids: candidates.map((f) => f.uid), action: "bounce" },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "salvage": {
      const indices = me.outOfPlay
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => ctx.defs[id].type === op.cardType);
      if (indices.length === 0) break;
      const take = (idx: number) => {
        const cardId = me.outOfPlay[idx];
        me.outOfPlay.splice(idx, 1);
        me.hand.push(cardId);
        events.push({ type: "cardSalvaged", player: owner, cardId });
      };
      if (indices.length === 1) {
        take(indices[0].i);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "場外から手札に加えるカードを選んでください",
            "salvage",
            indices.map(({ id }) => ({ label: cardName(ctx, id), cardId: id })),
            { type: "salvage", indices: indices.map(({ i }) => i) },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "discardOpponentChoice": {
      if (them.hand.length === 0) break;
      suspend(
        state,
        makePending(
          owner,
          owner,
          "場外に置く相手の手札を選んでください",
          "discardOpp",
          them.hand.map((id) => ({ label: cardName(ctx, id), cardId: id })),
          { type: "handIndex", indices: them.hand.map((_, i) => i), action: "discardOpp", remaining: op.count },
          queue.splice(0),
          ec
        ),
        events
      );
      break;
    }

    case "discardOwnChoice": {
      if (me.hand.length === 0) break;
      if (me.hand.length === 1) {
        const cardId = me.hand.pop()!;
        me.outOfPlay.push(cardId);
        events.push({ type: "cardDiscarded", player: owner, cardId });
        break;
      }
      suspend(
        state,
        makePending(
          owner,
          owner,
          "捨てるカードを選んでください",
          "discardOwn",
          me.hand.map((id) => ({ label: cardName(ctx, id), cardId: id })),
          { type: "handIndex", indices: me.hand.map((_, i) => i), action: "discardOwn", remaining: op.count },
          queue.splice(0),
          ec
        ),
        events
      );
      break;
    }

    case "bottomOwnChoice": {
      const n = Math.min(op.count, me.hand.length);
      if (n === 0) break;
      if (me.hand.length <= n) {
        // 全部戻すしかない
        for (let i = 0; i < n; i++) {
          const cardId = me.hand.shift()!;
          me.deck.push(cardId);
        }
        break;
      }
      suspend(
        state,
        makePending(
          owner,
          owner,
          `山札の下に置くカードを選んでください（あと${n}枚）`,
          "bottomOwn",
          me.hand.map((id) => ({ label: cardName(ctx, id), cardId: id })),
          { type: "handIndex", indices: me.hand.map((_, i) => i), action: "bottomOwn", remaining: n },
          queue.splice(0),
          ec
        ),
        events
      );
      break;
    }

    case "summonNamed": {
      const idx = me.hand.findIndex((id) => ctx.defs[id].name === op.name);
      if (idx === -1) break;
      if (ctx.defs[me.hand[idx]].type !== "instructor") break;
      putInstructorOnField(ctx, state, owner, idx, events, queue);
      break;
    }

    case "summonChoice": {
      const indices = me.hand
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => ctx.defs[id].type === "instructor");
      if (indices.length === 0) break;
      if (indices.length === 1) {
        putInstructorOnField(ctx, state, owner, indices[0].i, events, queue);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "登場させるインストラクターを選んでください",
            "summonOwn",
            indices.map(({ id }) => ({ label: cardName(ctx, id), cardId: id })),
            { type: "handIndex", indices: indices.map(({ i }) => i), action: "summonOwn", remaining: 1 },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "restSelf": {
      if (!ec.sourceUid) break;
      const inst = me.field.find((f) => f.uid === ec.sourceUid);
      if (inst && !inst.rested) {
        inst.rested = true;
        events.push({ type: "instructorRested", player: owner, uid: inst.uid });
      }
      break;
    }

    case "untapSelf": {
      if (!ec.sourceUid) break;
      const inst = me.field.find((f) => f.uid === ec.sourceUid);
      if (inst && inst.rested) {
        inst.rested = false;
        events.push({ type: "instructorUntapped", player: owner, uid: inst.uid });
      }
      break;
    }

    case "untapChoice": {
      const candidates = me.field.filter((f) => f.rested);
      if (candidates.length === 0) break;
      const untap = (uid: string) => {
        const inst = me.field.find((f) => f.uid === uid)!;
        inst.rested = false;
        events.push({ type: "instructorUntapped", player: owner, uid });
      };
      if (candidates.length === 1) {
        untap(candidates[0].uid);
      } else {
        suspend(
          state,
          makePending(
            owner,
            owner,
            "元気状態にするインストラクターを選んでください",
            "untapOwn",
            candidates.map((f) => ({ label: cardName(ctx, f.cardId), cardId: f.cardId })),
            { type: "targetUid", uids: candidates.map((f) => f.uid), action: "untap" },
            queue.splice(0),
            ec
          ),
          events
        );
      }
      break;
    }

    case "untapAtTurnEndCharge": {
      me.untapCharges++;
      break;
    }

    case "revealOpponentHand": {
      events.push({ type: "handRevealed", player: opp, cardIds: [...them.hand] });
      break;
    }

    case "recycleSupports": {
      const supports = me.outOfPlay.filter((id) => ctx.defs[id].type === "support");
      // 解決中のこのカード自身（場外に置かれた直後）は戻さない
      if (ec.sourceCardId) {
        const selfIdx = supports.indexOf(ec.sourceCardId);
        if (selfIdx !== -1) supports.splice(selfIdx, 1);
      }
      if (supports.length === 0) break;
      const toRecycle = [...supports];
      me.outOfPlay = me.outOfPlay.filter((id) => {
        if (ctx.defs[id].type !== "support") return true;
        const idx = toRecycle.indexOf(id);
        if (idx !== -1) {
          toRecycle.splice(idx, 1);
          return false;
        }
        return true;
      });
      me.deck.push(...supports);
      const s = shuffle(state.rngState, me.deck);
      state.rngState = s.rngState;
      me.deck = s.value;
      events.push({ type: "supportsRecycled", player: owner, count: supports.length });
      break;
    }

    case "janken": {
      suspend(
        state,
        makePending(
          owner, // 先に効果の持ち主が出す
          owner,
          "じゃんけん！ 手を選んでください",
          "janken",
          [{ label: "グー ✊" }, { label: "チョキ ✌️" }, { label: "パー ✋" }],
          { type: "janken", win: op.win, lose: op.lose },
          queue.splice(0),
          ec
        ),
        events
      );
      break;
    }

    case "advanceSourceTrack": {
      if (!ec.sourceUid || !ec.track) break;
      const inst = me.field.find((f) => f.uid === ec.sourceUid);
      if (!inst) break;
      modifyTrack(state, owner, ec.track, effectiveLesson(ctx, state, owner, inst), events);
      break;
    }

    case "endTurnFinalize": {
      // ターン限定の修正値をクリアして交代
      state.combatMods = state.combatMods.filter((m) => m.until !== "turnEnd");
      state.lessonMods = [];
      state.players[owner].untapCharges = 0;
      state.turnPlayer = opponentOf(owner);
      startTurn(ctx, state, events);
      break;
    }
  }
}

export function takeFromRevealed(
  state: GameState,
  owner: PlayerId,
  revealed: string[],
  takeIndex: number,
  events: GameEvent[]
): void {
  const p = state.players[owner];
  const taken = revealed[takeIndex];
  p.hand.push(taken);
  events.push({ type: "cardDrawn", player: owner, cardId: taken });
  p.deck.push(...revealed.filter((_, i) => i !== takeIndex));
}

// ---------------------------------------------------------------- 選択の解決

/**
 * resolveChoice アクションの本体。選択を適用し、残りのキューを再開する。
 * 呼び出し前に phase が choice で optionIndex が有効なことは検証済みの前提。
 */
export function applyChoice(
  ctx: GameContext,
  state: GameState,
  optionIndex: number,
  events: GameEvent[]
): void {
  if (state.phase.type !== "choice") return;
  const { pending, resume } = state.phase;
  const r = pending.resolve;
  const owner = pending.owner;
  const me = state.players[owner];
  const opp = opponentOf(owner);
  const queue = pending.queue;

  switch (r.type) {
    case "searchTake": {
      state.phase = resume;
      takeFromRevealed(state, owner, r.revealed, r.map[optionIndex], events);
      break;
    }

    case "track": {
      state.phase = resume;
      modifyTrack(state, owner, optionIndex === 0 ? "academic" : "skill", r.amount, events);
      break;
    }

    case "targetUid": {
      state.phase = resume;
      const uid = r.uids[optionIndex];
      switch (r.action) {
        case "remove":
          removeInstructor(ctx, state, opp, uid, events, queue);
          break;
        case "bounce": {
          const them = state.players[opp];
          const inst = them.field.find((f) => f.uid === uid);
          if (inst) {
            them.field = them.field.filter((f) => f.uid !== uid);
            them.hand.push(inst.cardId);
            events.push({ type: "instructorBounced", player: opp, uid, cardId: inst.cardId });
          }
          break;
        }
        case "combatMod": {
          // 対象は候補生成時のプレイヤー側。uid から探す
          for (const pid of [0, 1] as PlayerId[]) {
            if (state.players[pid].field.some((f) => f.uid === uid)) {
              state.combatMods.push({ player: pid, uid, amount: r.amount ?? 0, until: r.until ?? "turnEnd" });
              events.push({ type: "combatModApplied", player: pid, uid, amount: r.amount ?? 0 });
            }
          }
          break;
        }
        case "lessonMod":
          state.lessonMods.push({ player: owner, uid, amount: r.amount ?? 0 });
          events.push({ type: "lessonModApplied", player: owner, uid, amount: r.amount ?? 0 });
          break;
        case "untap": {
          const inst = me.field.find((f) => f.uid === uid);
          if (inst) {
            inst.rested = false;
            events.push({ type: "instructorUntapped", player: owner, uid });
          }
          break;
        }
      }
      break;
    }

    case "handIndex": {
      state.phase = resume;
      const handIdx = r.indices[optionIndex];
      switch (r.action) {
        case "discardOpp": {
          const them = state.players[opp];
          const cardId = them.hand[handIdx];
          if (cardId !== undefined) {
            them.hand.splice(handIdx, 1);
            them.outOfPlay.push(cardId);
            events.push({ type: "cardDiscarded", player: opp, cardId });
          }
          break;
        }
        case "discardOwn": {
          const cardId = me.hand[handIdx];
          if (cardId !== undefined) {
            me.hand.splice(handIdx, 1);
            me.outOfPlay.push(cardId);
            events.push({ type: "cardDiscarded", player: owner, cardId });
          }
          break;
        }
        case "bottomOwn": {
          const cardId = me.hand[handIdx];
          if (cardId !== undefined) {
            me.hand.splice(handIdx, 1);
            me.deck.push(cardId);
          }
          const remaining = r.remaining - 1;
          if (remaining > 0 && me.hand.length > 0) {
            // 続けて選ばせる
            suspend(
              state,
              makePending(
                pending.player,
                owner,
                `山札の下に置くカードを選んでください（あと${remaining}枚）`,
                "bottomOwn",
                me.hand.map((id) => ({ label: cardName(ctx, id), cardId: id })),
                { type: "handIndex", indices: me.hand.map((_, i) => i), action: "bottomOwn", remaining },
                queue,
                pending.sourceCtx
              ),
              events
            );
            return; // queue は新しい pending に引き継いだ
          }
          break;
        }
        case "summonOwn":
          putInstructorOnField(ctx, state, owner, handIdx, events, queue);
          break;
      }
      break;
    }

    case "salvage": {
      state.phase = resume;
      const idx = r.indices[optionIndex];
      const cardId = me.outOfPlay[idx];
      if (cardId !== undefined) {
        me.outOfPlay.splice(idx, 1);
        me.hand.push(cardId);
        events.push({ type: "cardSalvaged", player: owner, cardId });
      }
      break;
    }

    case "janken": {
      if (r.firstPick === undefined) {
        // 1人目（効果の持ち主）が出した → 相手の番。手は秘匿される
        state.phase = {
          type: "choice",
          pending: {
            ...pending,
            player: opp,
            resolve: { ...r, firstPick: optionIndex },
          },
          resume,
        };
        return;
      }
      // 2人目が出した → 判定。0=グー 1=チョキ 2=パー（0は1に、1は2に、2は0に勝つ）
      const a = r.firstPick; // owner の手
      const b = optionIndex; // 相手の手
      if (a === b) {
        // あいこ → もう一度（ownerから）
        state.phase = {
          type: "choice",
          pending: {
            ...pending,
            player: owner,
            prompt: "あいこ！ もう一度",
            resolve: { type: "janken", win: r.win, lose: r.lose },
          },
          resume,
        };
        return;
      }
      const ownerWon = (a === 0 && b === 1) || (a === 1 && b === 2) || (a === 2 && b === 0);
      // 出した手も一緒に伝える（実況で「✊ vs ✋」のように見せるため）
      events.push({ type: "jankenPlayed", owner, won: ownerWon, ownerHand: a, otherHand: b });
      state.phase = resume;
      const ops = ownerWon ? r.win : r.lose;
      queue.unshift(...ops.map((op) => ({ op, ctx: pending.sourceCtx })));
      break;
    }
  }

  // 残りのキューを再開
  runQueue(ctx, state, queue, events);
}

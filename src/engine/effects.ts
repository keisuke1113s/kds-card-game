import {
  CardDef,
  EffectOp,
  GameContext,
  GameEvent,
  GameState,
  PlayerId,
  Trigger,
  TRACK_GOALS,
} from "./types";

// 効果プリミティブの適用。state を直接ミューテートする（reducer 内で clone 済みの前提）。
// searchTop はプレイヤー選択を要する場合があるため、効果内の最後の op に置くこと。

export function runCardEffects(
  ctx: GameContext,
  state: GameState,
  owner: PlayerId,
  card: CardDef,
  trigger: Trigger,
  events: GameEvent[]
): void {
  for (const eff of card.effects ?? []) {
    if (eff.trigger !== trigger) continue;
    for (const op of eff.ops) {
      applyOp(ctx, state, owner, op, events);
      // choice フェーズに入ったら以降の op は実行しない（searchTop は末尾に置く規約）
      if (state.phase.type === "choice") return;
    }
  }
}

export function applyOp(
  ctx: GameContext,
  state: GameState,
  owner: PlayerId,
  op: EffectOp,
  events: GameEvent[]
): void {
  switch (op.op) {
    case "modifyTrack": {
      const target: PlayerId = op.target === "self" ? owner : ((1 - owner) as PlayerId);
      modifyTrack(state, target, op.track, op.amount, events);
      break;
    }
    case "buffCombat": {
      if (state.phase.type !== "battleSupport") return; // バトル外では無効
      state.phase.battle.buffs.push({ player: owner, amount: op.amount });
      break;
    }
    case "draw": {
      const p = state.players[owner];
      for (let i = 0; i < op.count; i++) {
        const cardId = p.deck.shift();
        if (cardId === undefined) break; // 効果によるドローは山札切れでも敗北しない
        p.hand.push(cardId);
        events.push({ type: "cardDrawn", player: owner, cardId });
      }
      break;
    }
    case "searchTop": {
      const p = state.players[owner];
      const revealed = p.deck.splice(0, op.count);
      if (revealed.length === 0) break;
      events.push({ type: "cardsRevealed", player: owner, cardIds: revealed });
      const selectable = revealed
        .map((id, i) => ({ id, i }))
        .filter(({ id }) => ctx.defs[id].type === op.filterType)
        .map(({ i }) => i);
      if (selectable.length === 0) {
        // 該当カードなし → すべて山札の下へ
        p.deck.push(...revealed);
      } else if (selectable.length === 1) {
        // 選択肢が1つなら自動で手札に加える
        takeFromRevealed(state, owner, revealed, selectable[0], events);
      } else {
        events.push({ type: "choiceRequired", player: owner });
        state.phase = {
          type: "choice",
          pending: {
            kind: "searchTake",
            player: owner,
            revealed,
            selectable,
            filterType: op.filterType,
          },
          resume: state.phase,
        };
      }
      break;
    }
  }
}

/** revealed の takeIndex を手札に、残りを山札の下へ */
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
  const rest = revealed.filter((_, i) => i !== takeIndex);
  p.deck.push(...rest);
}

/** 教習時限の増減。0 未満・上限超過は切り捨て。実際に動いた量をイベントに載せる */
export function modifyTrack(
  state: GameState,
  player: PlayerId,
  track: "academic" | "skill",
  amount: number,
  events: GameEvent[]
): void {
  const p = state.players[player];
  const goal = TRACK_GOALS[track];
  const before = p[track];
  const after = Math.max(0, Math.min(goal, before + amount));
  p[track] = after;
  events.push({
    type: "trackAdvanced",
    player,
    track,
    amount: after - before,
    newValue: after,
  });
}

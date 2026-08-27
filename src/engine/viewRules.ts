import {
  AbilityDef,
  CardDef,
  GameAction,
  GameContext,
  InstructorOnField,
  PlayerId,
  PlayerView,
} from "./types";

/**
 * PlayerView（プレイヤー視点の公開情報）だけからルールを判定する実装。
 *
 * オンライン対戦ではクライアントに完全な GameState が届かないため、
 * ここが「合法手・数値のただ1つの実装」になる。
 * オフライン（state がある場合）の getLegalActions / effectiveCombat は
 * viewFor を通してこの実装を呼ぶ薄いラッパにする。
 *
 * ここでは view の中身を一切書き換えない（読み取り専用）。
 * 能力の「休憩にする」「ターン1回」の消費は reducer 側が
 * state のインストラクターを uid で引き直して行う。
 */

/** いま手番（入力待ち）のプレイヤー。誰の入力も待たないときは null */
export function playerToActFromView(view: PlayerView): PlayerId | null {
  const phase = view.phase;
  switch (phase.type) {
    case "mulligan": {
      // マリガンは player 0 → 1 の順で決める（state 版と同じ規則）
      const p0 = view.playerId === 0 ? view.self : view.opponent;
      const p1 = view.playerId === 1 ? view.self : view.opponent;
      if (!p0.mulliganDecided) return 0;
      if (!p1.mulliganDecided) return 1;
      return null;
    }
    case "main":
      return view.turnPlayer;
    case "battleSupport":
      return phase.battle.priority;
    case "choice":
      return phase.pending.player;
    case "finished":
      return null;
  }
}

/** 効果込みの戦闘力（バトル中の一時バフは含まない。バトル側で加算する） */
export function effectiveCombatFromView(
  ctx: GameContext,
  view: PlayerView,
  player: PlayerId,
  inst: InstructorOnField
): number {
  const base = ctx.defs[inst.cardId].combat ?? 0;
  const mods = view.combatMods
    .filter((m) => m.player === player && m.uid === inst.uid)
    .reduce((a, m) => a + m.amount, 0);
  return base + mods;
}

/** 効果込みの教習力（0未満にはならない） */
export function effectiveLessonFromView(
  ctx: GameContext,
  view: PlayerView,
  player: PlayerId,
  inst: InstructorOnField
): number {
  const base = ctx.defs[inst.cardId].lesson ?? 0;
  const mods = view.lessonMods
    .filter((m) => m.player === player && (m.uid === null || m.uid === inst.uid))
    .reduce((a, m) => a + m.amount, 0);
  return Math.max(0, base + mods);
}

/** 自分のバトル参加者が「自分のバトルではサポート不可」を持つか（志萱） */
export function supportsBlockedFromView(ctx: GameContext, view: PlayerView): boolean {
  const phase = view.phase;
  if (phase.type !== "battleSupport") return false;
  const b = phase.battle;
  const myBattlerUid =
    b.attackerPlayer === view.playerId ? b.attackerUid : b.defenderUid;
  const inst = view.self.field.find((f) => f.uid === myBattlerUid);
  if (!inst) return false;
  return ctx.defs[inst.cardId].keywords?.includes("noSupportInOwnBattle") ?? false;
}

function abilityWindowOpenFromView(view: PlayerView, ability: AbilityDef): boolean {
  if (ability.window === "main") {
    if (view.phase.type !== "main" || view.turnPlayer !== view.playerId) return false;
  } else {
    // battle: 優先権を持っている時に使える
    if (
      view.phase.type !== "battleSupport" ||
      view.phase.battle.priority !== view.playerId
    ) {
      return false;
    }
  }
  // 対象が存在しない起動は無駄撃ちになるので不可にする
  for (const op of ability.ops) {
    if (op.op === "lessonMod" && op.target !== "source" && view.self.field.length === 0) {
      return false;
    }
    if (op.op === "removeTarget" && view.opponent.field.length === 0) {
      return false;
    }
  }
  return true;
}

/**
 * 起動できる能力（uid=undefined は担当カード）。
 * 起動できなければ null。インスタンスへの参照ではなく定義だけを返す。
 * 実際の消費（休憩・ターン1回）は reducer が state 側で uid から引き直して行う。
 */
export function usableAbilityFromView(
  ctx: GameContext,
  view: PlayerView,
  uid: string | undefined
): { def: CardDef; ability: AbilityDef } | null {
  if (uid !== undefined) {
    const inst = view.self.field.find((f) => f.uid === uid);
    if (!inst) return null;
    const def = ctx.defs[inst.cardId];
    if (!def.ability) return null;
    if (def.ability.oncePerTurn && inst.abilityUsedThisTurn) return null;
    if (def.ability.costRestSelf && inst.rested) return null;
    if (!abilityWindowOpenFromView(view, def.ability)) return null;
    return { def, ability: def.ability };
  }
  const def = ctx.defs[view.self.tantou];
  if (!def.ability) return null;
  if (def.ability.oncePerTurn && view.self.tantouAbilityUsedThisTurn) return null;
  if (!abilityWindowOpenFromView(view, def.ability)) return null;
  return { def, ability: def.ability };
}

/**
 * この視点のプレイヤーが今とれる合法手をすべて列挙する。
 * UI のタップ可否も AI の選択肢も、オンラインのサーバー検証もここから導出する。
 */
export function getLegalActionsFromView(ctx: GameContext, view: PlayerView): GameAction[] {
  const player = view.playerId;
  if (playerToActFromView(view) !== player) return [];
  const actions: GameAction[] = [];
  const phase = view.phase;

  switch (phase.type) {
    case "mulligan": {
      actions.push({ type: "mulligan", player, redraw: false });
      actions.push({ type: "mulligan", player, redraw: true });
      break;
    }

    case "main": {
      // インストラクターの登場（メインフェイズの最初だけ）
      if (phase.canPlayInstructor) {
        view.self.hand.forEach((cardId, handIndex) => {
          if (ctx.defs[cardId].type === "instructor") {
            actions.push({ type: "playInstructor", player, handIndex });
          }
        });
      }

      // 場のインストラクターの行動
      for (const inst of view.self.field) {
        if (inst.actedThisTurn || inst.rested) continue;
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "skill" });
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "academic" });
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "doNothing" });
        const def = ctx.defs[inst.cardId];
        const cantAttack = def.keywords?.includes("cantAttackOnEntry") && inst.enteredThisTurn;
        if (!cantAttack) {
          for (const target of view.opponent.field) {
            if (target.rested) {
              actions.push({
                type: "declareBattle",
                player,
                attackerUid: inst.uid,
                defenderUid: target.uid,
              });
            }
          }
        }
      }

      // 起動型能力（インストラクター・担当）
      for (const inst of view.self.field) {
        if (usableAbilityFromView(ctx, view, inst.uid)) {
          actions.push({ type: "activateAbility", player, uid: inst.uid });
        }
      }
      if (usableAbilityFromView(ctx, view, undefined)) {
        actions.push({ type: "activateAbility", player });
      }

      // メインフェイズで使えるサポートカード
      view.self.hand.forEach((cardId, handIndex) => {
        const def = ctx.defs[cardId];
        if (def.type === "support" && (def.timing === "main" || def.timing === "any")) {
          actions.push({ type: "playSupport", player, handIndex });
        }
      });

      actions.push({ type: "endTurn", player });
      break;
    }

    case "battleSupport": {
      if (!supportsBlockedFromView(ctx, view)) {
        view.self.hand.forEach((cardId, handIndex) => {
          const def = ctx.defs[cardId];
          if (def.type === "support" && (def.timing === "battle" || def.timing === "any")) {
            actions.push({ type: "playSupport", player, handIndex });
          }
        });
      }
      // バトル中に使える起動型能力（担当カードの戦闘力バフなど）
      if (usableAbilityFromView(ctx, view, undefined)) {
        actions.push({ type: "activateAbility", player });
      }
      for (const inst of view.self.field) {
        if (usableAbilityFromView(ctx, view, inst.uid)) {
          actions.push({ type: "activateAbility", player, uid: inst.uid });
        }
      }
      actions.push({ type: "passSupport", player });
      break;
    }

    case "choice": {
      // options は選ぶ本人のビューにだけ入っている
      const n = phase.pending.options.length;
      for (let i = 0; i < n; i++) {
        actions.push({ type: "resolveChoice", player, optionIndex: i });
      }
      break;
    }

    case "finished":
      break;
  }

  return actions;
}

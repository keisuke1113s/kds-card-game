import { playerToAct } from "./reducer";
import { GameAction, GameContext, GameState, PlayerId } from "./types";

/**
 * 指定プレイヤーが今とれる合法手をすべて列挙する。
 * UI のタップ可否も AI の選択肢もすべてここから導出する（ルールの二重実装をしない）。
 */
export function getLegalActions(
  ctx: GameContext,
  state: GameState,
  player: PlayerId
): GameAction[] {
  if (playerToAct(state) !== player) return [];
  const actions: GameAction[] = [];
  const p = state.players[player];
  const opp = state.players[1 - player];

  switch (state.phase.type) {
    case "mulligan": {
      actions.push({ type: "mulligan", player, redraw: false });
      actions.push({ type: "mulligan", player, redraw: true });
      break;
    }

    case "main": {
      // インストラクターの登場（メインフェイズの最初だけ）
      if (state.phase.canPlayInstructor) {
        p.hand.forEach((cardId, handIndex) => {
          if (ctx.defs[cardId].type === "instructor") {
            actions.push({ type: "playInstructor", player, handIndex });
          }
        });
      }

      // 場のインストラクターの行動
      for (const inst of p.field) {
        if (inst.actedThisTurn || inst.rested) continue;
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "skill" });
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "academic" });
        actions.push({ type: "instructorAction", player, uid: inst.uid, action: "doNothing" });
        for (const target of opp.field) {
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

      // メインフェイズで使えるサポートカード
      p.hand.forEach((cardId, handIndex) => {
        const def = ctx.defs[cardId];
        if (def.type === "support" && (def.timing === "main" || def.timing === "any")) {
          actions.push({ type: "playSupport", player, handIndex });
        }
      });

      actions.push({ type: "endTurn", player });
      break;
    }

    case "battleSupport": {
      p.hand.forEach((cardId, handIndex) => {
        const def = ctx.defs[cardId];
        if (def.type === "support" && (def.timing === "battle" || def.timing === "any")) {
          actions.push({ type: "playSupport", player, handIndex });
        }
      });
      actions.push({ type: "passSupport", player });
      break;
    }

    case "choice": {
      for (const optionIndex of state.phase.pending.selectable) {
        actions.push({ type: "resolveChoice", player, optionIndex });
      }
      break;
    }

    case "finished":
      break;
  }

  return actions;
}

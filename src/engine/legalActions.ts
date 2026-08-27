import { viewFor } from "./view";
import { getLegalActionsFromView } from "./viewRules";
import { GameAction, GameContext, GameState, PlayerId } from "./types";

/**
 * 指定プレイヤーが今とれる合法手をすべて列挙する。
 *
 * 実装の本体は viewRules.ts の getLegalActionsFromView（プレイヤー視点の
 * 公開情報だけで判定する版）。オフラインでもオンラインでも同じ実装を通す
 * ことで、ルールの二重実装を防ぐ。
 */
export function getLegalActions(
  ctx: GameContext,
  state: GameState,
  player: PlayerId
): GameAction[] {
  return getLegalActionsFromView(ctx, viewFor(state, player));
}

import { GameAction, PlayerView } from "@/engine/types";

/**
 * CPU の思考インターフェース。
 * PlayerView（秘匿済みビュー）と合法手だけを受け取る — カンニング構造的に不可能。
 */
export interface AIController {
  chooseAction(view: PlayerView, legal: GameAction[]): GameAction;
}

export type Difficulty = "easy" | "normal" | "hard";

export interface AIParams {
  /** スコアに加えるランダムノイズの大きさ（大きいほど弱い） */
  noise: number;
  /** バトルを仕掛ける積極性の倍率 */
  aggression: number;
  /** 相手のサポートカード保持を織り込むか */
  estimateOpponentSupport: boolean;
}

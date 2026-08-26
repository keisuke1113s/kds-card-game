import { nextInt } from "@/engine/rng";
import { GameAction, PlayerView } from "@/engine/types";
import { AIController } from "./types";

/** ベンチマーク用: 合法手から一様ランダムに選ぶボット */
export class RandomBot implements AIController {
  private rngState: number;

  constructor(seed = 1) {
    this.rngState = seed | 0;
  }

  chooseAction(_view: PlayerView, legal: GameAction[]): GameAction {
    const r = nextInt(this.rngState, legal.length);
    this.rngState = r.rngState;
    return legal[r.value];
  }
}

/// <reference lib="webworker" />
import { cardRegistry } from "@/data/cards";
import { HeuristicAI } from "@/ai/heuristic";
import { applyPersona, CpuPersona, DIFFICULTY_PARAMS } from "@/ai/difficulty";
import { getLegalActionsFromView } from "@/engine/viewRules";
import type { GameAction, GameContext, PlayerId, PlayerView } from "@/engine/types";
import type { Difficulty } from "@/ai/types";

/**
 * CPUの思考を画面と別レーン（Web Worker）で実行する。
 * 思考に数百msかかっても画面のアニメーションが一切止まらなくなる。
 *
 * 設計の決まりごと（演出の順序を守るため）:
 * - 思考の「開始タイミング」「着手の適用」はこれまで通り gameStore 側が管理する。
 *   ここは「どの手を選ぶか」を計算して返すだけ
 * - AIの乱数はゲーム開始時の init で初期化し、対局中はこのWorkerが持ち続ける
 *   （従来のメインスレッド実装と同じ順序で乱数が進む）
 */

const ctx: GameContext = { defs: cardRegistry };

let cpuAi: HeuristicAI | null = null;
let autoAi: HeuristicAI | null = null;

type InMsg =
  | { type: "init"; difficulty: Difficulty; persona: CpuPersona; seed: number }
  | { type: "choose"; id: number; actor: PlayerId; cpuActor: PlayerId; view: PlayerView };

self.onmessage = (ev: MessageEvent) => {
  const msg = ev.data as InMsg;
  if (msg.type === "init") {
    // gameStore と同じシード配分（^0x55aa / ^0x1234）で従来と同じ手筋になる
    cpuAi = new HeuristicAI(
      cardRegistry,
      applyPersona(DIFFICULTY_PARAMS[msg.difficulty], msg.persona),
      msg.seed ^ 0x55aa
    );
    autoAi = new HeuristicAI(cardRegistry, DIFFICULTY_PARAMS.hard, msg.seed ^ 0x1234);
    return;
  }
  if (msg.type === "choose") {
    let action: GameAction | null = null;
    let error: string | undefined;
    try {
      const controller = msg.actor === msg.cpuActor ? cpuAi : autoAi;
      const legal = getLegalActionsFromView(ctx, msg.view);
      if (controller && legal.length > 0) {
        action = controller.chooseAction(msg.view, legal);
      }
    } catch (e) {
      error = String(e);
    }
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      id: msg.id,
      action,
      error,
    });
  }
};

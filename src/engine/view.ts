import { GameState, PhaseView, PlayerId, PlayerView } from "./types";

/**
 * プレイヤー視点のビューを生成する。
 * 相手の手札・山札の中身、選択の内部情報（じゃんけんの相手の手など）を秘匿する。
 * UI と AI はこのビューだけを見る（AI のカンニング防止）。
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView {
  const self = state.players[playerId];
  const opp = state.players[1 - playerId];

  let phase: PhaseView;
  switch (state.phase.type) {
    case "choice": {
      const pending = state.phase.pending;
      const isActor = pending.player === playerId;
      phase = {
        type: "choice",
        pending: {
          player: pending.player,
          owner: pending.owner,
          prompt: pending.prompt,
          purpose: pending.purpose,
          // 選択肢は選ぶ本人にだけ見せる（相手の手札公開等の情報を漏らさない）
          options: isActor ? pending.options.map((o) => ({ ...o })) : [],
        },
      };
      break;
    }
    default:
      phase = JSON.parse(JSON.stringify(state.phase));
  }

  return {
    playerId,
    turnPlayer: state.turnPlayer,
    turnNumber: state.turnNumber,
    phase,
    combatMods: state.combatMods.map((m) => ({ ...m })),
    lessonMods: state.lessonMods.map((m) => ({ ...m })),
    self: {
      hand: [...self.hand],
      deckCount: self.deck.length,
      field: self.field.map((f) => ({ ...f })),
      tantou: self.tantou,
      tantouAbilityUsedThisTurn: self.tantouAbilityUsedThisTurn,
      outOfPlay: [...self.outOfPlay],
      academic: self.academic,
      skill: self.skill,
      untapCharges: self.untapCharges,
    },
    opponent: {
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      field: opp.field.map((f) => ({ ...f })),
      tantou: opp.tantou,
      tantouAbilityUsedThisTurn: opp.tantouAbilityUsedThisTurn,
      outOfPlay: [...opp.outOfPlay],
      academic: opp.academic,
      skill: opp.skill,
    },
  };
}

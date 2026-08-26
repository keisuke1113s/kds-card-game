import { GameState, Phase, PlayerId, PlayerView } from "./types";

/**
 * プレイヤー視点のビューを生成する。
 * 相手の手札・山札の中身、および自分宛でない choice の公開カードを秘匿する。
 * UI と AI はこのビューだけを見る（AI のカンニング防止）。
 */
export function viewFor(state: GameState, playerId: PlayerId): PlayerView {
  const self = state.players[playerId];
  const opp = state.players[1 - playerId];

  let phase: Phase = state.phase;
  if (phase.type === "choice" && phase.pending.player !== playerId) {
    phase = {
      ...phase,
      pending: { ...phase.pending, revealed: [], selectable: [] },
    };
  }

  return {
    playerId,
    turnPlayer: state.turnPlayer,
    turnNumber: state.turnNumber,
    phase,
    self: {
      hand: [...self.hand],
      deckCount: self.deck.length,
      field: self.field.map((f) => ({ ...f })),
      tantou: self.tantou,
      outOfPlay: [...self.outOfPlay],
      academic: self.academic,
      skill: self.skill,
    },
    opponent: {
      handCount: opp.hand.length,
      deckCount: opp.deck.length,
      field: opp.field.map((f) => ({ ...f })),
      tantou: opp.tantou,
      outOfPlay: [...opp.outOfPlay],
      academic: opp.academic,
      skill: opp.skill,
    },
  };
}

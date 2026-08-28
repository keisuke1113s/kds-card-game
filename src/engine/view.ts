import { GameEvent, GameState, PhaseView, PlayerId, PlayerView } from "./types";

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
      // 純関数を保つため乱数は使わず、辞書順で並び順を伏せる
      deckContents: [...self.deck].sort(),
      mulliganDecided: self.mulliganDecided,
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
      mulliganDecided: opp.mulliganDecided,
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

/**
 * イベント列から、受け取るプレイヤーが知ってはいけない情報を落とす。
 *
 * オンライン対戦では各プレイヤーに送る前に必ずこれを通す。
 * オフライン（CPU対戦）でも同じ関数を通しておくことで、
 * 「通信に載せたら漏れる」類のバグを開発中に再現できるようにする。
 *
 * switch は全イベント型を網羅し、default の never チェックで
 * 新しいイベント型を追加した瞬間にコンパイルエラーになる。
 * （＝秘匿の分類を忘れたまま出荷できない）
 */
export function redactEventsFor(events: GameEvent[], playerId: PlayerId): GameEvent[] {
  return events.map((e): GameEvent => {
    switch (e.type) {
      case "cardDrawn":
        // 他人が何を引いたかは秘匿（引いた事実＝ドロー演出は残す）
        if (e.player !== playerId && e.cardId !== undefined) {
          return { type: "cardDrawn", player: e.player };
        }
        return e;

      case "cardsRevealed":
        // 山札の上の公開（searchTop）。中身を知る資格は効果の持ち主だけ
        if (e.player !== playerId) {
          return { type: "cardsRevealed", player: e.player, count: e.count };
        }
        return e;

      case "handRevealed":
        // 素通しでよい。中身を知る資格があるのは
        // 「手札の持ち主（player）」と「見る効果を使った側（相手）」の
        // 2人だけで、2人対戦ではそれが全員にあたるため。
        return e;

      // ---- 以下はすべて公開情報（場・場外・トラック・バトル・進行） ----
      case "gameStarted":
      case "mulliganTaken":
      case "turnStarted":
      case "instructorPlayed":
      case "instructorUntapped":
      case "instructorRested":
      case "didNothing":
      case "instructorActed":
      case "trackAdvanced":
      case "battleDeclared":
      case "supportPlayed":
      case "supportPassed":
      case "battleResolved":
      case "instructorRemoved":
      case "instructorBounced":
      case "cardDiscarded":
      case "cardSalvaged":
      case "abilityActivated":
      case "battleBuffApplied":
      case "combatModApplied":
      case "lessonModApplied":
      case "jankenPlayed":
      case "supportsRecycled":
      case "choiceRequired":
      case "turnEnded":
      case "gameEnded":
        return e;

      default: {
        // 新しいイベント型を追加すると、ここで型エラーになる
        const exhaustive: never = e;
        return exhaustive;
      }
    }
  });
}

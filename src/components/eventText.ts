import { getCard } from "@/data/cards";
import { GameEvent, PlayerId } from "@/engine/types";

const TRACK_LABEL = { academic: "学科", skill: "技能" } as const;

/** イベントをログ表示用の日本語にする。null は表示しない */
export function eventText(e: GameEvent, human: PlayerId): string | null {
  const who = (p: PlayerId) => (p === human ? "あなた" : "CPU");
  switch (e.type) {
    case "gameStarted":
      return `対戦開始！ 先攻は${who(e.firstPlayer)}`;
    case "mulliganTaken":
      return e.redraw ? `${who(e.player)}は手札を引き直した` : null;
    case "turnStarted":
      return `--- ターン${e.turnNumber}: ${who(e.player)}の番 ---`;
    case "cardDrawn":
      return e.player === human && e.cardId
        ? `「${getCard(e.cardId).name}」を引いた`
        : e.player === human
          ? null
          : null;
    case "instructorPlayed":
      return `${who(e.player)}が「${getCard(e.cardId).name}」を場に出した`;
    case "trackAdvanced":
      if (e.amount === 0) return null;
      return e.amount > 0
        ? `${who(e.player)}の${TRACK_LABEL[e.track]}が${e.amount}時限進んだ（${e.newValue}）`
        : `${who(e.player)}の${TRACK_LABEL[e.track]}が${-e.amount}時限戻された（${e.newValue}）`;
    case "didNothing":
      return null;
    case "battleDeclared":
      return `${who(e.attackerPlayer)}がバトルを仕掛けた！`;
    case "supportPlayed":
      return `${who(e.player)}がサポート「${getCard(e.cardId).name}」を使った`;
    case "supportPassed":
      return null;
    case "battleResolved":
      return `バトル解決: ${e.attackerTotal} vs ${e.defenderTotal}`;
    case "instructorRemoved":
      return `${who(e.player)}の「${getCard(e.cardId).name}」が場外へ`;
    case "cardsRevealed":
      return e.player === human ? null : `CPUが山札の上を確認した`;
    case "turnEnded":
      return null;
    case "gameEnded":
      if (e.reason === "deckOut") {
        return e.winner === human
          ? "CPUの山札が切れた！あなたの勝ち！"
          : "山札が切れた…あなたの負け…";
      }
      return e.winner === human
        ? "学科と技能を両方達成！あなたの勝ち！"
        : "CPUが両方達成…あなたの負け…";
    default:
      return null;
  }
}

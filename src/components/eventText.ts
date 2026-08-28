import { getCard } from "@/data/cards";
import { GameEvent, PlayerId } from "@/engine/types";

const TRACK_LABEL = { academic: "学科", skill: "技能" } as const;

/** イベントをログ表示用の日本語にする。null は表示しない。opp は相手の呼び名（CPU／オンラインの相手名） */
export function eventText(e: GameEvent, human: PlayerId, opp = "CPU"): string | null {
  const who = (p: PlayerId) => (p === human ? "あなた" : opp);
  switch (e.type) {
    case "gameStarted":
      return `対戦開始！ 先攻は${who(e.firstPlayer)}`;
    case "mulliganTaken":
      return e.redraw ? `${who(e.player)}は手札を引き直した` : null;
    case "turnStarted":
      return `--- ターン${e.turnNumber}: ${who(e.player)}の番 ---`;
    case "cardDrawn":
      return e.player === human && e.cardId ? `「${getCard(e.cardId).name}」を引いた` : null;
    case "instructorPlayed":
      return `${who(e.player)}が「${getCard(e.cardId).name}」を場に出した`;
    case "trackAdvanced":
      if (e.amount === 0) return null;
      return e.amount > 0
        ? `${who(e.player)}の${TRACK_LABEL[e.track]}が${e.amount}時限進んだ（${e.newValue}）`
        : `${who(e.player)}の${TRACK_LABEL[e.track]}が${-e.amount}時限戻された（${e.newValue}）`;
    case "instructorActed":
      if (e.action === "doNothing")
        return `${who(e.player)}の「${getCard(e.cardId).name}」は様子を見ている`;
      return `${who(e.player)}の「${getCard(e.cardId).name}」が${
        e.action === "skill" ? "技能" : "学科"
      }教習を行った`;
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
    case "instructorBounced":
      return `${who(e.player)}の「${getCard(e.cardId).name}」が手札に戻された`;
    case "cardDiscarded":
      return `${who(e.player)}の「${getCard(e.cardId).name}」が場外に置かれた`;
    case "cardSalvaged":
      return `${who(e.player)}が場外から「${getCard(e.cardId).name}」を回収した`;
    case "abilityActivated":
      return `${who(e.player)}が「${getCard(e.cardId).name}」の力を使った`;
    case "battleBuffApplied":
      return e.amount > 0
        ? `${who(e.player)}の戦闘力が＋${e.amount}された（バトル中）`
        : `${who(e.player)}の戦闘力が${e.amount}された（バトル中）`;
    case "combatModApplied":
      return e.amount > 0 ? `戦闘力が＋${e.amount}された` : `戦闘力が${e.amount}された`;
    case "lessonModApplied":
      return `${who(e.player)}の教習力が＋${e.amount}された`;
    case "jankenPlayed":
      return `じゃんけん！ ${who(e.owner)}の${e.won ? "勝ち" : "負け"}`;
    case "handRevealed":
      return `${who(e.player)}の手札が公開された`;
    case "supportsRecycled":
      return `${who(e.player)}が場外のサポート${e.count}枚を山札に戻した`;
    case "cardsRevealed":
      return e.player === human ? null : `${opp}が山札の上を確認した`;
    case "choiceRequired":
    case "turnEnded":
      return null;
    case "gameEnded":
      if (e.reason === "deckOut") {
        return e.winner === human
          ? `${opp}の山札が切れた！あなたの勝ち！`
          : "山札が切れた…あなたの負け…";
      }
      return e.winner === human
        ? "学科と技能を両方達成！あなたの勝ち！"
        : `${opp}が両方達成…あなたの負け…`;
    default:
      return null;
  }
}
